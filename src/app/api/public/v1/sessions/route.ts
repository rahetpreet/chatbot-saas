import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { FlowEngine } from "@/lib/services/engine/flowEngine";
import { checkRateLimit } from "@/lib/security/rateLimit";
import { validateRequest, publicSessionSchema } from "@/lib/validation";

const hash = (value: string) => crypto.createHash("sha256").update(value).digest("hex");

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!checkRateLimit(`public-session:${ip}`, 30, 60_000)) {
    return NextResponse.json({ success: false, error: { code: "RATE_LIMITED", message: "Too many requests. Please slow down." } }, { status: 429 });
  }

  try {
    const body = await req.json();
    const validation = await validateRequest(publicSessionSchema, body);
    if (!validation.success) return NextResponse.json({ success: false, error: { code: "VALIDATION_ERROR", message: validation.error } }, { status: 400 });
    
    const { tenantSlug, visitorId, flowId, campaignContactId, referrer } = validation.data;

    const tenant = await prisma.tenant.findFirst({
      where: { slug: tenantSlug, status: { in: ["TRIAL", "ACTIVE"] }, deletedAt: null },
      select: {
        id: true,
        aiConfig: true,
        flows: {
          where: flowId
            ? { id: flowId, status: "PUBLISHED", deletedAt: null }
            : { status: "PUBLISHED", isDefault: true, deletedAt: null },
          take: 1,
        },
      },
    });

    const flow = tenant?.flows[0];
    if (!tenant || !flow) {
      return NextResponse.json({ success: false, error: { code: "BOT_NOT_PUBLISHED", message: "This chatbot is currently unavailable." } }, { status: 404 });
    }

    const token = crypto.randomBytes(32).toString("base64url");
    const nodes = JSON.parse(flow.publishedNodes || "[]");
    const edges = JSON.parse(flow.publishedEdges || "[]");
    const engine = new FlowEngine(nodes, edges, tenant.id, tenant.aiConfig);
    const step = await engine.processInput({
      tenantId: tenant.id,
      currentNodeId: null,
      collectedData: {},
      sessionStatus: "ACTIVE",
      history: [],
    });

    const conversation = await prisma.$transaction(async (tx) => {
      const created = await tx.conversation.create({
        data: {
          tenantId: tenant.id,
          flowId: flow.id,
          campaignContactId: campaignContactId || null,
          visitorId,
          publicSessionTokenHash: hash(token),
          sessionStatus: step.sessionStatus,
          currentNodeId: step.currentNodeId,
          collectedData: JSON.stringify(step.updatedCollectedData),
          visitorInfo: JSON.stringify({
            referrer: referrer || null,
            ip,
            userAgent: req.headers.get("user-agent") || null,
          }),
        },
      });

      if (step.botMessages.length) {
        await tx.message.createMany({
          data: step.botMessages.map((message) => ({
            conversationId: created.id,
            senderType: "BOT",
            content: message.text,
            nodeId: step.currentNodeId || null,
            attachments: message.mediaUrl ? JSON.stringify([{ url: message.mediaUrl, type: message.mediaType }]) : null,
          })),
        });
      }

      await tx.analyticsEvent.create({
        data: {
          tenantId: tenant.id,
          flowId: flow.id,
          conversationId: created.id,
          eventType: "SESSION_START",
        },
      });

      return created;
    });

    const messages = await prisma.message.findMany({
      where: { conversationId: conversation.id },
      orderBy: { timestamp: "asc" },
    });

    const data = {
      conversationId: conversation.id,
      sessionToken: token,
      sessionStatus: conversation.sessionStatus,
      messages,
      interactiveNode: step.interactiveNode,
    };

    return NextResponse.json({ success: true, data });
  } catch {
    return NextResponse.json({ success: false, error: { code: "INVALID_REQUEST", message: "Unable to start a chat session." } }, { status: 400 });
  }
}
