import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { FlowEngine } from "@/lib/services/engine/flowEngine";
import { checkRateLimit } from "@/lib/security/rateLimit";
import { hashPublicSessionToken } from "@/lib/services/public/session";
import { persistCapturedConversationData } from "@/lib/services/conversation/capture";
import { assertUsageAvailable } from "@/lib/services/subscription/planLimits";
import { isAllowedPublicOrigin, parseAllowedDomains, publicCorsPreflight, withPublicCors } from "@/lib/services/public/cors";


export async function POST(req: NextRequest) {
  const origin = req.headers.get("origin");
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!checkRateLimit(`public-message:${ip}`, 60, 60_000)) return NextResponse.json({ success: false, error: { code: "RATE_LIMITED", message: "Too many messages." } }, { status: 429 });
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
    const engine = new FlowEngine(nodes, edges, conversation.tenantId, conversation.tenant.aiConfig);
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
      await tx.analyticsEvent.create({ data: { tenantId: conversation.tenantId, flowId: conversation.flowId, conversationId, eventType: "NODE_SUBMIT", nodeId: conversation.currentNodeId, metadata: JSON.stringify({ type }) } });
      const botMessages = await tx.message.findMany({ where: { conversationId, timestamp: { gte: visitorMessage.timestamp } }, orderBy: { timestamp: "asc" } });
      return { visitorMessage, botMessages: botMessages.filter((message) => message.senderType === "BOT") };
    });
    const data = { ...result, interactiveNode: step.interactiveNode, sessionStatus: step.sessionStatus };
    return withPublicCors(NextResponse.json({ success: true, ...data, data }), origin, allowedDomains);
  } catch {
    return NextResponse.json({ success: false, error: { code: "INVALID_REQUEST", message: "Unable to process message." } }, { status: 400 });
  }
}

export function OPTIONS(req: NextRequest) {
  return publicCorsPreflight(req.headers.get("origin"));
}
