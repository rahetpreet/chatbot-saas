import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireTenantRole } from "@/lib/services/auth/session";

export const dynamic = "force-dynamic";

/**
 * The agent queue.
 *
 * Agents see only conversations that asked for a person, and only within their
 * own workspace. The filter is applied here rather than in the page, so an
 * agent calling the API directly cannot widen it — a query parameter asking
 * for every conversation is simply ignored.
 *
 * Resolved conversations stay visible for a short window so an agent can
 * finish typing and see their own last reply, then drop off the queue.
 */
const RESOLVED_GRACE_MINUTES = 30;

export async function GET(_req: NextRequest) {
  try {
    const { tenantId } = await requireTenantRole([
      "CLIENT_OWNER",
      "CLIENT_ADMIN",
      "CLIENT_AGENT",
    ]);

    const graceCutoff = new Date(Date.now() - RESOLVED_GRACE_MINUTES * 60_000);

    const conversations = await prisma.conversation.findMany({
      where: {
        tenantId,
        OR: [
          { sessionStatus: "HANDOVER" },
          { sessionStatus: "RESOLVED", lastActiveAt: { gte: graceCutoff } },
        ],
      },
      orderBy: [{ sessionStatus: "asc" }, { lastActiveAt: "desc" }],
      take: 100,
      include: {
        flow: { select: { name: true } },
        campaign: { select: { name: true } },
        campaignContact: { select: { name: true, email: true, phone: true } },
        leads: { select: { name: true, email: true, phone: true } },
        messages: { orderBy: { timestamp: "desc" }, take: 1 },
      },
    });

    const waiting = conversations.filter((conversation) => conversation.sessionStatus === "HANDOVER");

    const data = {
      conversations: conversations.map((conversation) => ({
        id: conversation.id,
        sessionStatus: conversation.sessionStatus,
        visitorId: conversation.visitorId,
        startedAt: conversation.startedAt,
        lastActiveAt: conversation.lastActiveAt,
        flowName: conversation.flow?.name || null,
        campaignName: conversation.campaign?.name || null,
        contact:
          conversation.campaignContact || conversation.leads[0]
            ? {
                name: conversation.campaignContact?.name || conversation.leads[0]?.name || null,
                email: conversation.campaignContact?.email || conversation.leads[0]?.email || null,
                phone: conversation.campaignContact?.phone || conversation.leads[0]?.phone || null,
              }
            : null,
        lastMessage: conversation.messages[0]
          ? {
              content: conversation.messages[0].content,
              senderType: conversation.messages[0].senderType,
              timestamp: conversation.messages[0].timestamp,
            }
          : null,
        // How long this visitor has been holding, which is the number an
        // agent actually triages on.
        waitingSeconds:
          conversation.sessionStatus === "HANDOVER"
            ? Math.max(0, Math.round((Date.now() - new Date(conversation.lastActiveAt).getTime()) / 1000))
            : 0,
      })),
      waitingCount: waiting.length,
    };

    return NextResponse.json({ success: true, data, ...data });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: { code: "FORBIDDEN", message: error?.message || "Unauthorized" } },
      { status: 403 },
    );
  }
}
