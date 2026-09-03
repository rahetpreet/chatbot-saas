import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { FlowEngine } from "@/lib/services/engine/flowEngine";
import { checkRateLimit } from "@/lib/security/rateLimit";
import { assertUsageAvailable, recordUsage } from "@/lib/services/subscription/planLimits";
import { isAllowedPublicOrigin, parseAllowedDomains, publicCorsPreflight, withPublicCors } from "@/lib/services/public/cors";

const hash = (value: string) => crypto.createHash("sha256").update(value).digest("hex");

const UTM_KEYS = ["utmSource", "utmMedium", "utmCampaign", "utmContent", "utmTerm"] as const;

/** Accepts only the five known UTM keys, as trimmed short strings. */
function parseUtm(value: unknown): Record<string, string> | null {
  if (!value || typeof value !== "object") return null;
  const source = value as Record<string, unknown>;
  const out: Record<string, string> = {};
  for (const key of UTM_KEYS) {
    const raw = source[key];
    if (typeof raw === "string" && raw.trim()) out[key] = raw.trim().slice(0, 256);
  }
  return Object.keys(out).length ? out : null;
}

export async function POST(req: NextRequest) {
  const origin = req.headers.get("origin");
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!(await checkRateLimit(`public-session:${ip}`, 30, 60_000))) {
    return NextResponse.json({ success: false, error: { code: "RATE_LIMITED", message: "Too many requests." } }, { status: 429 });
  }

  try {
    const body = await req.json();
    const tenantSlug = typeof body.tenantSlug === "string" ? body.tenantSlug : "";
    const visitorId = typeof body.visitorId === "string" ? body.visitorId.slice(0, 128) : "";
    const contactSlug = typeof body.contactSlug === "string" ? body.contactSlug : undefined;
    const flowId = typeof body.flowId === "string" ? body.flowId : undefined;
    const campaignSlug = typeof body.campaignSlug === "string" ? body.campaignSlug : undefined;
    const utm = parseUtm(body.utm);

    if (!tenantSlug || !visitorId) {
      return NextResponse.json({ success: false, error: { code: "VALIDATION_ERROR", message: "Valid tenant and visitor identifiers are required." } }, { status: 400 });
    }

    const tenant = await prisma.tenant.findFirst({
      where: { slug: tenantSlug, status: { in: ["TRIAL", "ACTIVE"] }, deletedAt: null },
      select: {
        id: true,
        aiConfig: true,
        widgetSettings: true,
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
      return NextResponse.json({ success: false, error: { code: "BOT_NOT_PUBLISHED", message: "This chatbot is unavailable." } }, { status: 404 });
    }
    const allowedDomains = parseAllowedDomains(tenant.widgetSettings);
    if (!isAllowedPublicOrigin(origin, allowedDomains)) {
      return NextResponse.json({ success: false, error: { code: "FORBIDDEN", message: "Origin is not allowed." } }, { status: 403 });
    }

    let campaignContactId: string | null = null;
    let campaignId: string | null = null;

    if (contactSlug) {
      const campaignContact = await prisma.campaignContact.findFirst({
        where: { customUrlSlug: contactSlug, tenantId: tenant.id, deletedAt: null },
      });
      if (campaignContact) {
        campaignContactId = campaignContact.id;
        await prisma.campaignContact.update({
          where: { id: campaignContact.id },
          data: {
            opensCount: { increment: 1 },
            firstOpenedAt: campaignContact.firstOpenedAt || new Date(),
            lastOpenedAt: new Date(),
            status: "OPENED",
          },
        });
        campaignId = campaignContact.campaignId;
      }
    }

    // Campaign-level links (/c/<slug>?campaign=X) carry no contact, so they
    // were previously dropped entirely and campaign stats never moved.
    if (!campaignId && campaignSlug) {
      const campaign = await prisma.campaign.findFirst({
        where: { slug: campaignSlug, tenantId: tenant.id, deletedAt: null },
        select: { id: true },
      });
      if (campaign) campaignId = campaign.id;
    }

    if (campaignId) {
      await prisma.campaign.update({
        where: { id: campaignId },
        data: { opensCount: { increment: 1 } },
      });
    }

    // Durable visitor identity. Conversation.visitorId is a client-supplied
    // anonymous id; recording it against a Visitor row is what lets a
    // returning visitor be recognised across sessions.
    const visitor = await prisma.visitor.upsert({
      where: { tenantId_anonymousId: { tenantId: tenant.id, anonymousId: visitorId } },
      create: {
        tenantId: tenant.id,
        anonymousId: visitorId,
        metadata: JSON.stringify({ device: body.device || null, referrer: typeof body.referrer === "string" ? body.referrer.slice(0, 2048) : null }),
      },
      update: { lastSeenAt: new Date(), sessionCount: { increment: 1 } },
    });

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
    await assertUsageAvailable(tenant.id, "messages", step.botMessages.length);

    const conversation = await prisma.$transaction(async (tx) => {
      const created = await tx.conversation.create({
        data: {
          tenantId: tenant.id,
          flowId: flow.id,
          campaignContactId,
          campaignId,
          visitorId,
          visitorRecordId: visitor.id,
          publicSessionTokenHash: hash(token),
          sessionStatus: step.sessionStatus,
          currentNodeId: step.currentNodeId,
          collectedData: JSON.stringify(step.updatedCollectedData),
          visitorInfo: JSON.stringify({
            referrer: typeof body.referrer === "string" ? body.referrer.slice(0, 2048) : null,
            device: body.device || null,
            utm,
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

    await recordUsage(tenant.id, "conversations", 1);
    await recordUsage(tenant.id, "messages", step.botMessages.length);

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

    return withPublicCors(NextResponse.json({ success: true, ...data, data }), origin, allowedDomains);
  } catch {
    return NextResponse.json({ success: false, error: { code: "INVALID_REQUEST", message: "Unable to start a chat session." } }, { status: 400 });
  }
}

export function OPTIONS(req: NextRequest) {
  return publicCorsPreflight(req.headers.get("origin"));
}
