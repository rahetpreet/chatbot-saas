import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireTenantRole } from "@/lib/services/auth/session";
import { resolveRange, previousRange, percentChange, runSequential } from "@/lib/services/analytics/range";
import { overviewMetrics, funnelMetrics, comparisonCounts } from "@/lib/services/analytics/queries";
import { timelineAnalytics } from "@/lib/services/analytics/breakdowns";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Everything the workspace dashboard needs, in one request.
 *
 * The page used to fetch four list endpoints and count the rows in the browser,
 * so opening the dashboard downloaded every conversation, lead, campaign and
 * flow the workspace had ever created. That is fine at twenty rows and
 * unusable at twenty thousand. Counting belongs in the database.
 */
export async function GET(req: NextRequest) {
  try {
    const { tenantId } = await requireTenantRole(["CLIENT_OWNER", "CLIENT_ADMIN", "CLIENT_VIEWER"]);
    const params = new URL(req.url).searchParams;
    const range = resolveRange({
      preset: params.get("preset"),
      start: params.get("start"),
      end: params.get("end"),
    });
    const previous = previousRange(range);

    // Sequential. One connection in the pool means Promise.all here does not
    // run anything in parallel — it just queues forty-odd queries and lets the
    // ones past the pool timeout fail, which is how this endpoint first
    // returned an error instead of a dashboard.
    const { tenant, metrics, priorMetrics, funnel, timeline, storage, recentLeads, recentConversations, setup } =
      await runSequential({
        tenant: () => prisma.tenant.findUnique({
          where: { id: tenantId },
          select: {
            id: true,
            name: true,
            slug: true,
            status: true,
            planTier: true,
            customDomain: true,
            customDomainVerifiedAt: true,
            maxMessagesPerMonth: true,
            maxStorageMb: true,
            createdAt: true,
          },
        }),
        metrics: () => overviewMetrics(tenantId, range),
        priorMetrics: () => comparisonCounts(tenantId, previous),
        funnel: () => funnelMetrics(tenantId, range),
        timeline: () => timelineAnalytics(tenantId, range),
        storage: () => prisma.attachment.aggregate({ where: { tenantId }, _sum: { sizeBytes: true } }),
        recentLeads: () => prisma.lead.findMany({
          where: { tenantId, deletedAt: null },
          orderBy: { createdAt: "desc" },
          take: 5,
          select: { id: true, name: true, email: true, phone: true, status: true, createdAt: true },
        }),
        recentConversations: () => prisma.conversation.findMany({
          where: { tenantId },
          orderBy: { lastActiveAt: "desc" },
          take: 5,
          select: {
            id: true,
            sessionStatus: true,
            startedAt: true,
            lastActiveAt: true,
            flow: { select: { name: true } },
            _count: { select: { messages: true } },
          },
        }),
        // The onboarding checklist. A brand-new workspace opening to a wall of
        // zeroes reads as broken; it should read as "here is what to do next".
        setup: () =>
          runSequential({
            flowCount: () => prisma.flow.count({ where: { tenantId, deletedAt: null } }),
            publishedCount: () => prisma.flow.count({ where: { tenantId, status: "PUBLISHED", deletedAt: null } }),
            campaignCount: () => prisma.campaign.count({ where: { tenantId, deletedAt: null } }),
            conversationCount: () => prisma.conversation.count({ where: { tenantId } }),
            leadCount: () => prisma.lead.count({ where: { tenantId, deletedAt: null } }),
          }),
      });

    if (!tenant) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "Workspace not found." } },
        { status: 404 },
      );
    }

    const { flowCount, publishedCount, campaignCount, conversationCount, leadCount } = setup;

    const changes = {
      conversationsStarted: percentChange(metrics.conversationsStarted, priorMetrics.conversationsStarted),
      totalLeads: percentChange(metrics.totalLeads, priorMetrics.totalLeads),
      uniqueVisitors: percentChange(metrics.uniqueVisitors, priorMetrics.uniqueVisitors),
      conversionRate: percentChange(metrics.conversionRate, priorMetrics.conversionRate),
      totalMessages: percentChange(metrics.totalMessages, priorMetrics.totalMessages),
    };

    const data = {
      tenant,
      range: { preset: range.preset, label: range.label, start: range.start, end: range.end },
      metrics,
      previous: priorMetrics,
      changes,
      funnel: funnel.steps,
      trend: timeline.daily,
      busiestHour: timeline.busiestHour,
      recent: { leads: recentLeads, conversations: recentConversations },
      usage: {
        messagesThisPeriod: metrics.totalMessages,
        messageLimit: tenant.maxMessagesPerMonth,
        storageUsedMb: Math.round((storage._sum.sizeBytes || 0) / (1024 * 1024)),
        storageLimitMb: tenant.maxStorageMb,
      },
      setup: {
        // Considered complete once the workspace has done the thing at least
        // once, not once it has done it in the selected period — a checklist
        // that un-ticks itself when you change the date filter is nonsense.
        hasFlow: flowCount > 0,
        hasPublishedFlow: publishedCount > 0,
        hasCampaign: campaignCount > 0,
        hasConversation: conversationCount > 0,
        hasLead: leadCount > 0,
        isNew: conversationCount === 0,
      },
    };

    return NextResponse.json({ success: true, data, ...data });
  } catch (error: any) {
    const forbidden = /forbidden|unauthor/i.test(error?.message || "");
    if (!forbidden) console.error("[dashboard] failed", error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: forbidden ? "FORBIDDEN" : "SERVER_ERROR",
          message: forbidden ? "You do not have access to this workspace." : "Could not load the dashboard.",
        },
      },
      { status: forbidden ? 403 : 500 },
    );
  }
}
