import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { FlowEngine } from "@/lib/services/engine/flowEngine";
import { checkRateLimit } from "@/lib/security/rateLimit";
import { hashPublicSessionToken } from "@/lib/services/public/session";
import { persistCapturedConversationData } from "@/lib/services/conversation/capture";
import { assertUsageAvailable, recordUsage } from "@/lib/services/subscription/planLimits";
import { isAllowedPublicOrigin, parseAllowedDomains, publicCorsPreflight, withPublicCors } from "@/lib/services/public/cors";
import { readTenantAiConfig } from "@/lib/security/aiSettings";
import {
  EVENT,
  recordEventsTx,
  nodeLabel,
  nodeKind,
  type EventInput,
} from "@/lib/services/analytics/events";

type PublishedNode = { id?: unknown; type?: string; data?: { label?: string; nodeType?: string } };

/** Looks up a node in the published graph so events can carry its real name. */
function findNode(nodes: PublishedNode[], id: string | null): PublishedNode | null {
  if (!id || !Array.isArray(nodes)) return null;
  return nodes.find((node) => node?.id === id) ?? null;
}

/** Node kinds that ask the visitor for something, and so can be abandoned. */
function isInputNode(node: PublishedNode | null): boolean {
  const kind = (node?.data?.nodeType || node?.type || "").toLowerCase();
  return kind.includes("input") || kind.includes("form") || kind.includes("attachment");
}

export async function POST(req: NextRequest) {
  const origin = req.headers.get("origin");
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!(await checkRateLimit(`public-message:${ip}`, 60, 60_000))) return NextResponse.json({ success: false, error: { code: "RATE_LIMITED", message: "Too many messages." } }, { status: 429 });
  try {
    const { conversationId, sessionToken, userInput } = await req.json();
    if (typeof conversationId !== "string" || typeof sessionToken !== "string" || !userInput || typeof userInput !== "object") return NextResponse.json({ success: false, error: { code: "VALIDATION_ERROR", message: "Invalid message request." } }, { status: 400 });
    const conversation = await prisma.conversation.findFirst({ where: { id: conversationId, publicSessionTokenHash: hashPublicSessionToken(sessionToken) }, include: { flow: true, tenant: true, messages: { orderBy: { timestamp: "asc" } } } });
    if (!conversation || !conversation.flow || !conversation.tenant) return NextResponse.json({ success: false, error: { code: "NOT_FOUND", message: "Chat session not found." } }, { status: 404 });
    if (!["TRIAL", "ACTIVE"].includes(conversation.tenant.status)) return NextResponse.json({ success: false, error: { code: "BOT_DISABLED", message: "This chatbot is unavailable." } }, { status: 403 });
    const allowedDomains = parseAllowedDomains(conversation.tenant.widgetSettings);
    if (!isAllowedPublicOrigin(origin, allowedDomains)) return NextResponse.json({ success: false, error: { code: "FORBIDDEN", message: "Origin is not allowed." } }, { status: 403 });
    if (conversation.sessionStatus === "RESOLVED" || conversation.sessionStatus === "ABANDONED") return withPublicCors(NextResponse.json({ success: false, error: { code: "SESSION_CLOSED", message: "This conversation has ended." } }, { status: 409 }), origin, allowedDomains);
    const type = ["text", "button_click", "form_submit", "attachment_upload"].includes(userInput.type) ? userInput.type : "text";
    const isAttachment = type === "attachment_upload" && userInput.value && typeof userInput.value === "object";
    const value = isAttachment ? userInput.value : typeof userInput.value === "string" ? userInput.value.slice(0, 5000) : "";
    const visitorContent = typeof userInput.label === "string" ? userInput.label.slice(0, 500) : typeof value === "string" ? value : "Attachment uploaded";
    const visitorAttachments = isAttachment ? JSON.stringify([value]) : null;
    const nodes = JSON.parse(conversation.flow.publishedNodes || "[]"), edges = JSON.parse(conversation.flow.publishedEdges || "[]");
    const engine = new FlowEngine(nodes, edges, conversation.tenantId, readTenantAiConfig(conversation.tenant.aiConfig));
    let collectedData = {}; try { collectedData = JSON.parse(conversation.collectedData || "{}"); } catch { /* impossible corrupt state is treated as empty */ }
    const step = await engine.processInput({ tenantId: conversation.tenantId, currentNodeId: conversation.currentNodeId, collectedData, sessionStatus: conversation.sessionStatus as "ACTIVE", history: conversation.messages.map((message) => ({ role: (message.senderType === "BOT" || message.senderType === "AI" ? "assistant" : "user") as "assistant" | "user", content: message.content })) }, { ...userInput, type, value });
    await assertUsageAvailable(conversation.tenantId, "messages", 1 + step.botMessages.length);
    const result = await prisma.$transaction(async (tx) => {
      const visitorMessage = await tx.message.create({ data: { conversationId, senderType: "VISITOR", content: visitorContent, attachments: visitorAttachments } });
      if (isAttachment && typeof value === "object" && typeof value.id === "string") {
        await tx.attachment.updateMany({ where: { id: value.id, tenantId: conversation.tenantId, conversationId }, data: { messageId: visitorMessage.id } });
      }
      if (step.botMessages.length) await tx.message.createMany({ data: step.botMessages.map((message) => ({ conversationId, senderType: "BOT", content: message.text, nodeId: step.currentNodeId || null, attachments: message.mediaUrl ? JSON.stringify([{ url: message.mediaUrl, type: message.mediaType }]) : null })) });
      await tx.conversation.update({ where: { id: conversationId }, data: { currentNodeId: step.currentNodeId, collectedData: JSON.stringify(step.updatedCollectedData), sessionStatus: step.sessionStatus, lastActiveAt: new Date(), closedAt: step.sessionStatus === "RESOLVED" ? new Date() : null } });
      await persistCapturedConversationData(tx, conversation.tenantId, conversationId, step.updatedCollectedData);
      // One turn of the chat produces several distinct facts, and the reports
      // need each of them separately: the step that was just answered, how it
      // was answered, and the step the visitor moved on to. Recording a single
      // generic "submit" made drop-off and option analysis impossible.
      const answered = findNode(nodes, conversation.currentNodeId);
      const arrived = step.interactiveNode ?? findNode(nodes, step.currentNodeId);
      const dimensions = {
        tenantId: conversation.tenantId,
        flowId: conversation.flowId,
        flowVersion: conversation.flowVersion,
        conversationId,
        visitorId: conversation.visitorId,
        campaignId: conversation.campaignId,
        trackingLinkId: conversation.trackingLinkId,
      };

      const events: EventInput[] = [];

      if (conversation.currentNodeId) {
        events.push({
          ...dimensions,
          eventType: EVENT.NODE_COMPLETED,
          nodeId: conversation.currentNodeId,
          nodeType: nodeKind(answered),
          optionLabel: nodeLabel(answered),
        });
        events.push({
          ...dimensions,
          eventType:
            type === "button_click"
              ? EVENT.BUTTON_CLICKED
              : type === "attachment_upload"
                ? EVENT.FILE_UPLOADED
                : EVENT.INPUT_SUBMITTED,
          nodeId: conversation.currentNodeId,
          nodeType: nodeKind(answered),
          // For a button this is the option the visitor chose, which is what
          // the option-distribution report groups by. For an input it is the
          // question's own label -- never the answer, which would put personal
          // data into analytics.
          optionLabel:
            type === "button_click"
              ? typeof userInput.label === "string"
                ? userInput.label
                : typeof value === "string"
                  ? value
                  : null
              : nodeLabel(answered),
          metadata: { type },
        });
      }

      if (step.currentNodeId) {
        events.push({
          ...dimensions,
          eventType: EVENT.NODE_ENTERED,
          nodeId: step.currentNodeId,
          nodeType: nodeKind(arrived),
          optionLabel: nodeLabel(arrived),
        });

        // An input the visitor has been shown but not yet answered is what
        // makes per-field abandonment measurable.
        if (isInputNode(arrived)) {
          events.push({
            ...dimensions,
            eventType: EVENT.INPUT_STARTED,
            nodeId: step.currentNodeId,
            nodeType: nodeKind(arrived),
            optionLabel: nodeLabel(arrived),
          });

          const alreadyStarted = await tx.analyticsEvent.count({
            where: { conversationId, eventType: EVENT.FORM_STARTED },
          });
          if (!alreadyStarted) {
            events.push({ ...dimensions, eventType: EVENT.FORM_STARTED, nodeId: step.currentNodeId });
          }
        }
      }

      // AI usage, reported by the engine rather than guessed at from the
      // reply text. A handover that followed an AI question is recorded as a
      // fallback as well as a handoff, since those answer different questions:
      // how often AI is consulted, and how often it declines to guess.
      if (step.ai?.requested) {
        events.push({ ...dimensions, eventType: EVENT.AI_REQUEST, nodeId: conversation.currentNodeId });
        events.push({
          ...dimensions,
          eventType: step.ai.answered ? EVENT.AI_RESPONSE : EVENT.AI_FALLBACK,
          nodeId: conversation.currentNodeId,
        });
      }

      if (step.sessionStatus === "HANDOVER" && conversation.sessionStatus !== "HANDOVER") {
        events.push({ ...dimensions, eventType: EVENT.HUMAN_HANDOFF, nodeId: step.currentNodeId });
      }
      if (step.sessionStatus === "RESOLVED") {
        events.push({ ...dimensions, eventType: EVENT.CONVERSATION_COMPLETED, nodeId: step.currentNodeId });
      }

      await recordEventsTx(tx, events);
      const botMessages = await tx.message.findMany({ where: { conversationId, timestamp: { gte: visitorMessage.timestamp } }, orderBy: { timestamp: "asc" } });
      return { visitorMessage, botMessages: botMessages.filter((message) => message.senderType === "BOT") };
    });
    const data = { ...result, interactiveNode: step.interactiveNode, sessionStatus: step.sessionStatus };
    await recordUsage(conversation.tenantId, "messages", 1 + step.botMessages.length);

    return withPublicCors(NextResponse.json({ success: true, ...data, data }), origin, allowedDomains);
  } catch {
    return NextResponse.json({ success: false, error: { code: "INVALID_REQUEST", message: "Unable to process message." } }, { status: 400 });
  }
}

export function OPTIONS(req: NextRequest) {
  return publicCorsPreflight(req.headers.get("origin"));
}
