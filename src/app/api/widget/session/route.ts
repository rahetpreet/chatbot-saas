import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { FlowEngine } from "@/lib/services/engine/flowEngine";

import mockStore from "@/lib/mockStore";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      tenantSlug,
      visitorId,
      campaignSlug,
      contactSlug,
      referrer,
      device,
      flowId: customFlowId,
    } = body;

    if (!tenantSlug || !visitorId) {
      return NextResponse.json({ error: "Tenant and visitorId are required" }, { status: 400 });
    }

    let tenant: any = null;
    try {
      tenant = await prisma.tenant.findFirst({
        where: { OR: [{ slug: tenantSlug }, { id: tenantSlug }] },
        select: { id: true, name: true, slug: true, status: true, aiConfig: true },
      });
    } catch (dbErr) {
      console.warn("Widget session tenant DB notice:", dbErr);
    }

    if (!tenant) {
      tenant = mockStore.getTenant(tenantSlug) || mockStore.tenants[0];
    }

    // Check if campaign link was used
    let campaignContact = null;
    if (contactSlug) {
      try {
        campaignContact = await prisma.campaignContact.findUnique({
          where: { customUrlSlug: contactSlug },
          include: { campaign: true },
        });

        if (campaignContact) {
          // Track open
          await prisma.campaignContact.update({
            where: { id: campaignContact.id },
            data: {
              opensCount: { increment: 1 },
              lastOpenedAt: new Date(),
              firstOpenedAt: campaignContact.firstOpenedAt || new Date(),
              status: "OPENED",
            },
          });

          await prisma.campaign.update({
            where: { id: campaignContact.campaignId },
            data: { opensCount: { increment: 1 } },
          });
        }
      } catch (cntErr) {
        console.warn("Widget campaign contact notice:", cntErr);
      }
    }

    // Determine target flow: custom flowId > campaign flowId > tenant default published flow
    let targetFlowId = customFlowId || campaignContact?.campaign?.flowId;
    let flow: any = null;

    try {
      if (targetFlowId) {
        flow = await prisma.flow.findFirst({
          where: { id: targetFlowId, tenantId: tenant.id, status: "PUBLISHED" },
        });
      }

      if (!flow) {
        flow = await prisma.flow.findFirst({
          where: { tenantId: tenant.id, status: "PUBLISHED", isDefault: true },
        });
      }

      if (!flow) {
        flow = await prisma.flow.findFirst({
          where: { tenantId: tenant.id, status: "PUBLISHED" },
        });
      }
    } catch (flowErr) {
      console.warn("Widget flow lookup notice:", flowErr);
    }

    if (!flow) {
      flow = mockStore.getFlow(targetFlowId || "flow_starter_default", tenant.id) || mockStore.flows[0];
    }

    // Check for existing active conversation for this visitor
    let conversation = await prisma.conversation.findFirst({
      where: {
        tenantId: tenant.id,
        visitorId,
        flowId: flow.id,
        sessionStatus: { in: ["ACTIVE", "HANDOVER"] },
      },
      include: {
        messages: { orderBy: { timestamp: "asc" } },
      },
    });

    let isNewSession = false;
    let stepOutput = null;

    const parsedNodes = JSON.parse(flow.publishedNodes || flow.nodes || "[]");
    const parsedEdges = JSON.parse(flow.publishedEdges || flow.edges || "[]");
    const engine = new FlowEngine(parsedNodes, parsedEdges, tenant.id, tenant.aiConfig);

    if (!conversation) {
      isNewSession = true;

      // Start initial flow execution
      const initialCollectedData: Record<string, any> = {};
      if (campaignContact) {
        if (campaignContact.name) initialCollectedData.name = campaignContact.name;
        if (campaignContact.email) initialCollectedData.email = campaignContact.email;
        if (campaignContact.phone) initialCollectedData.phone = campaignContact.phone;
      }

      stepOutput = await engine.processInput({
        tenantId: tenant.id,
        currentNodeId: null,
        collectedData: initialCollectedData,
        sessionStatus: "ACTIVE",
        history: [],
      });

      const ip = req.headers.get("x-forwarded-for") || "127.0.0.1";
      const userAgent = req.headers.get("user-agent") || "";

      conversation = await prisma.conversation.create({
        data: {
          tenantId: tenant.id,
          flowId: flow.id,
          campaignContactId: campaignContact?.id || null,
          visitorId,
          sessionStatus: stepOutput.sessionStatus,
          currentNodeId: stepOutput.currentNodeId,
          collectedData: JSON.stringify(stepOutput.updatedCollectedData),
          visitorInfo: JSON.stringify({ ip, userAgent, referrer, device }),
        },
        include: { messages: true },
      });

      // Save initial bot messages
      for (const msg of stepOutput.botMessages) {
        await prisma.message.create({
          data: {
            conversationId: conversation.id,
            senderType: "BOT",
            content: msg.text,
            attachments: msg.mediaUrl ? JSON.stringify([{ url: msg.mediaUrl, type: msg.mediaType }]) : null,
          },
        });
      }

      // Log analytics event
      await prisma.analyticsEvent.create({
        data: {
          tenantId: tenant.id,
          flowId: flow.id,
          conversationId: conversation.id,
          eventType: "SESSION_START",
          metadata: JSON.stringify({ campaignSlug, contactSlug, referrer, device }),
        },
      });
    }

    // Refresh conversation with messages
    const fullConversation = await prisma.conversation.findUnique({
      where: { id: conversation.id },
      include: {
        messages: { orderBy: { timestamp: "asc" } },
      },
    });

    // Find active interactive node if conversation exists
    let interactiveNode = null;
    if (fullConversation?.currentNodeId) {
      interactiveNode = parsedNodes.find((n: any) => n.id === fullConversation.currentNodeId) || null;
    } else if (stepOutput?.interactiveNode) {
      interactiveNode = stepOutput.interactiveNode;
    }

    const response = NextResponse.json({
      success: true,
      isNewSession,
      conversationId: conversation.id,
      sessionStatus: fullConversation?.sessionStatus,
      messages: fullConversation?.messages || [],
      interactiveNode,
    });

    response.headers.set("Access-Control-Allow-Origin", "*");
    return response;
  } catch (error: any) {
    console.error("Widget session error:", error);
    return NextResponse.json({ error: error.message || "Failed to start session" }, { status: 500 });
  }
}

export async function OPTIONS() {
  const response = new NextResponse(null, { status: 204 });
  response.headers.set("Access-Control-Allow-Origin", "*");
  response.headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  response.headers.set("Access-Control-Allow-Headers", "Content-Type");
  return response;
}
