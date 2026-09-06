import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { analyticsContext, analyticsSuccess, analyticsError } from "@/lib/services/analytics/request";
import { journeyFor } from "@/lib/services/analytics/breakdowns";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * One person's complete history, in order.
 *
 * Accepts a lead, contact, conversation or visitor id, because the same
 * journey is opened from four different screens. Whichever is supplied, the
 * lookup is scoped to the caller's own workspace first, so an id belonging to
 * another tenant returns nothing rather than someone else's history.
 */
export async function GET(req: NextRequest) {
  try {
    const context = await analyticsContext(req);
    const { tenantId, searchParams } = context;

    const leadId = searchParams.get("leadId") || undefined;
    const contactId = searchParams.get("contactId") || undefined;
    const conversationId = searchParams.get("conversationId") || undefined;
    const visitorId = searchParams.get("visitorId") || undefined;

    if (!leadId && !contactId && !conversationId && !visitorId) {
      return analyticsSuccess({ entries: [], subject: null }, context);
    }

    // Prove the subject belongs to this workspace before reading anything
    // about it. Without this the event query alone would still be
    // tenant-scoped, but an empty result would be indistinguishable from a
    // valid subject with no activity.
    const [lead, contact, conversation] = await Promise.all([
      leadId
        ? prisma.lead.findFirst({
            where: { id: leadId, tenantId, deletedAt: null },
            select: { id: true, name: true, email: true, phone: true, status: true, score: true, createdAt: true },
          })
        : null,
      contactId
        ? prisma.contact.findFirst({
            where: { id: contactId, tenantId, deletedAt: null },
            select: { id: true, name: true, email: true, phone: true, source: true, createdAt: true },
          })
        : null,
      conversationId
        ? prisma.conversation.findFirst({
            where: { id: conversationId, tenantId },
            select: { id: true, startedAt: true, sessionStatus: true, visitorId: true },
          })
        : null,
    ]);

    if ((leadId && !lead) || (contactId && !contact) || (conversationId && !conversation)) {
      return analyticsSuccess({ entries: [], subject: null, notFound: true }, context);
    }

    const journey = await journeyFor(tenantId, {
      leadId: lead?.id,
      contactId: contact?.id,
      conversationId: conversation?.id,
      visitorId: visitorId || undefined,
    });

    return analyticsSuccess(
      {
        subject: { lead, contact, conversation, visitorId: visitorId || conversation?.visitorId || null },
        entries: journey.entries,
        conversationIds: journey.conversationIds,
      },
      context,
    );
  } catch (error) {
    return analyticsError(error);
  }
}
