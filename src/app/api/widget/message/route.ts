import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { FlowEngine } from "@/lib/services/engine/flowEngine";

import mockStore from "@/lib/mockStore";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { conversationId, userInput } = body;

    if (!conversationId || !userInput) {
      return NextResponse.json({ error: "conversationId and userInput are required" }, { status: 400 });
    }

    let conversation: any = null;
    try {
      conversation = await prisma.conversation.findUnique({
        where: { id: conversationId },
        include: {
          flow: true,
          tenant: true,
          messages: { orderBy: { timestamp: "asc" } },
        },
      });
    } catch (dbErr) {
      console.warn("Widget message conversation find DB notice:", dbErr);
    }

    if (!conversation) {
      conversation = mockStore.conversations.find((c) => c.id === conversationId) || {
        id: conversationId,
        tenantId: "t_acme_corp",
        flow: mockStore.flows[0],
        tenant: mockStore.tenants[0],
        messages: [],
        sessionStatus: "ACTIVE",
        collectedData: "{}",
        currentNodeId: null,
      };
    }

    // Save visitor message
    let visitorContent = "";
    if (userInput.type === "button_click") {
      visitorContent = userInput.label || userInput.value;
    } else if (userInput.type === "attachment_upload") {
      visitorContent = `Uploaded: ${userInput.value?.name || "attachment"}`;
    } else {
      visitorContent = String(userInput.value || "");
    }

    let visitorMsg: any = {
      id: `msg_vis_${Date.now()}`,
      conversationId,
      senderType: "VISITOR",
      content: visitorContent,
      attachments: userInput.type === "attachment_upload" && userInput.value ? JSON.stringify([userInput.value]) : null,
      timestamp: new Date().toISOString(),
    };

    try {
      visitorMsg = await prisma.message.create({
        data: {
          conversationId,
          senderType: "VISITOR",
          content: visitorContent,
          attachments: userInput.type === "attachment_upload" && userInput.value ? JSON.stringify([userInput.value]) : null,
        },
      });
    } catch (msgErr) {
      console.warn("Save visitor message notice:", msgErr);
    }

    // If conversation is in live handover mode and human agent is connected, don't auto-run bot
    if (conversation.sessionStatus === "HANDOVER") {
      await prisma.conversation.update({
        where: { id: conversationId },
        data: { lastActiveAt: new Date() },
      });

      const response = NextResponse.json({
        success: true,
        visitorMessage: visitorMsg,
        botMessages: [],
        interactiveNode: null,
        sessionStatus: "HANDOVER",
      });
      response.headers.set("Access-Control-Allow-Origin", "*");
      return response;
    }

    // Parse flow nodes and edges
    const flow = conversation.flow;
    const parsedNodes = flow ? JSON.parse(flow.publishedNodes || flow.nodes || "[]") : [];
    const parsedEdges = flow ? JSON.parse(flow.publishedEdges || flow.edges || "[]") : [];

    const engine = new FlowEngine(parsedNodes, parsedEdges, conversation.tenantId, conversation.tenant.aiConfig);

    let collectedData = {};
    try {
      collectedData = JSON.parse(conversation.collectedData || "{}");
    } catch {}

    const history = (conversation.messages || []).map((m: any) => ({
      role: (m.senderType === "BOT" || m.senderType === "AI" ? "assistant" : "user") as "assistant" | "user",
      content: m.content,
    }));

    const stepResult = await engine.processInput(
      {
        tenantId: conversation.tenantId,
        currentNodeId: conversation.currentNodeId,
        collectedData,
        sessionStatus: conversation.sessionStatus as any,
        history,
      },
      userInput
    );

    // Save newly generated bot messages
    const createdBotMessages = [];
    for (const msg of stepResult.botMessages) {
      let bMsg: any = {
        id: `msg_bot_${Date.now()}_${Math.random().toString(36).substring(7)}`,
        conversationId,
        senderType: "BOT",
        content: msg.text,
        attachments: msg.mediaUrl ? JSON.stringify([{ url: msg.mediaUrl, type: msg.mediaType }]) : null,
        timestamp: new Date().toISOString(),
      };
      try {
        bMsg = await prisma.message.create({
          data: {
            conversationId,
            senderType: "BOT",
            content: msg.text,
            attachments: msg.mediaUrl ? JSON.stringify([{ url: msg.mediaUrl, type: msg.mediaType }]) : null,
          },
        });
      } catch (botMsgErr) {
        console.warn("Save bot message notice:", botMsgErr);
      }
      createdBotMessages.push(bMsg);
    }

    // Update conversation state in DB
    try {
      await prisma.conversation.update({
        where: { id: conversationId },
        data: {
          currentNodeId: stepResult.currentNodeId,
          collectedData: JSON.stringify(stepResult.updatedCollectedData),
          sessionStatus: stepResult.sessionStatus,
          lastActiveAt: new Date(),
          closedAt: stepResult.sessionStatus === "RESOLVED" ? new Date() : null,
        },
      });
    } catch (convUpErr) {
      console.warn("Update conversation notice:", convUpErr);
    }

    // Check if lead data is present to capture or update Lead record
    const data = stepResult.updatedCollectedData;
    if (data && (data.email || data.phone || data.name)) {
      try {
        const existingLead = await prisma.lead.findFirst({
          where: { conversationId },
        });

        if (existingLead) {
          await prisma.lead.update({
            where: { id: existingLead.id },
            data: {
              name: data.name || existingLead.name,
              email: data.email || existingLead.email,
              phone: data.phone || existingLead.phone,
              collectedFields: JSON.stringify(data),
              score: Math.min(100, (existingLead.score || 50) + 15),
            },
          });
        } else {
          await prisma.lead.create({
            data: {
              tenantId: conversation.tenantId,
              conversationId,
              name: data.name || null,
              email: data.email || null,
              phone: data.phone || null,
              collectedFields: JSON.stringify(data),
              score: 70,
              status: "NEW",
            },
          });
        }
      } catch (leadErr) {
        console.warn("Save lead notice:", leadErr);
      }
    }

    // Log node submit analytics
    if (conversation.currentNodeId) {
      await prisma.analyticsEvent.create({
        data: {
          tenantId: conversation.tenantId,
          flowId: conversation.flowId,
          conversationId,
          eventType: "NODE_SUBMIT",
          nodeId: conversation.currentNodeId,
          metadata: JSON.stringify({ inputType: userInput.type }),
        },
      });
    }

    const response = NextResponse.json({
      success: true,
      error: stepResult.error,
      visitorMessage: visitorMsg,
      botMessages: createdBotMessages,
      interactiveNode: stepResult.interactiveNode,
      sessionStatus: stepResult.sessionStatus,
    });

    response.headers.set("Access-Control-Allow-Origin", "*");
    return response;
  } catch (error: any) {
    console.error("Widget message handling error:", error);
    return NextResponse.json({ error: error.message || "Failed to process message" }, { status: 500 });
  }
}

export async function OPTIONS() {
  const response = new NextResponse(null, { status: 204 });
  response.headers.set("Access-Control-Allow-Origin", "*");
  response.headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  response.headers.set("Access-Control-Allow-Headers", "Content-Type");
  return response;
}
