import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { FlowEngine } from "@/lib/services/engine/flowEngine";
import { checkRateLimit } from "@/lib/security/rateLimit";
import { hashPublicSessionToken } from "@/lib/services/public/session";

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!checkRateLimit(`public-message:${ip}`, 60, 60_000)) {
    return NextResponse.json({ success: false, error: { code: "RATE_LIMITED", message: "Too many messages. Please slow down." } }, { status: 429 });
  }

  try {
    const { conversationId, sessionToken, userInput } = await req.json();

    if (typeof conversationId !== "string" || typeof sessionToken !== "string" || !userInput || typeof userInput !== "object") {
      return NextResponse.json({ success: false, error: { code: "VALIDATION_ERROR", message: "Invalid message request." } }, { status: 400 });
    }

    const conversation = await prisma.conversation.findFirst({
      where: { id: conversationId, publicSessionTokenHash: hashPublicSessionToken(sessionToken) },
      include: { flow: true, tenant: true, messages: { orderBy: { timestamp: "asc" } } },
    });

    if (!conversation || !conversation.flow || !conversation.tenant) {
      return NextResponse.json({ success: false, error: { code: "NOT_FOUND", message: "Chat session not found." } }, { status: 404 });
    }

    if (!["TRIAL", "ACTIVE"].includes(conversation.tenant.status)) {
      return NextResponse.json({ success: false, error: { code: "BOT_DISABLED", message: "This chatbot is currently unavailable." } }, { status: 403 });
    }

    const value = typeof userInput.value === "string" ? userInput.value.slice(0, 5000) : "";
    const type = typeof userInput.type === "string" ? userInput.type : "text";
    const nodes = JSON.parse(conversation.flow.publishedNodes || "[]");
    const edges = JSON.parse(conversation.flow.publishedEdges || "[]");
    const engine = new FlowEngine(nodes, edges, conversation.tenantId, conversation.tenant.aiConfig);

    let collectedData = {};
    try {
      collectedData = JSON.parse(conversation.collectedData || "{}");
    } catch {}

    const step = await engine.processInput(
      {
        tenantId: conversation.tenantId,
        currentNodeId: conversation.currentNodeId,
        collectedData,
        sessionStatus: conversation.sessionStatus as "ACTIVE",
        history: conversation.messages.map((message) => ({
          role: (message.senderType === "BOT" || message.senderType === "AI" ? "assistant" : "user") as "assistant" | "user",
          content: message.content,
        })),
      },
      { ...userInput, type, value }
    );

    const result = await prisma.$transaction(async (tx) => {
      const visitorMessage = await tx.message.create({
        data: {
          conversationId,
          senderType: "VISITOR",
          content: value,
        },
      });

      if (step.botMessages.length) {
        await tx.message.createMany({
          data: step.botMessages.map((message) => ({
            conversationId,
            senderType: "BOT",
            content: message.text,
            nodeId: step.currentNodeId || null,
            attachments: message.mediaUrl ? JSON.stringify([{ url: message.mediaUrl, type: message.mediaType }]) : null,
          })),
        });
      }

      await tx.conversation.update({
        where: { id: conversationId },
        data: {
          currentNodeId: step.currentNodeId,
          collectedData: JSON.stringify(step.updatedCollectedData),
          sessionStatus: step.sessionStatus,
          lastActiveAt: new Date(),
          closedAt: step.sessionStatus === "RESOLVED" ? new Date() : null,
        },
      });

      const botMessages = await tx.message.findMany({
        where: { conversationId, timestamp: { gte: visitorMessage.timestamp } },
        orderBy: { timestamp: "asc" },
      });

      return {
        visitorMessage,
        botMessages: botMessages.filter((message) => message.senderType === "BOT"),
      };
    });

    const data = {
      ...result,
      interactiveNode: step.interactiveNode,
      sessionStatus: step.sessionStatus,
    };

    return NextResponse.json({ success: true, data });
  } catch {
    return NextResponse.json({ success: false, error: { code: "INVALID_REQUEST", message: "Unable to process message." } }, { status: 400 });
  }
}
