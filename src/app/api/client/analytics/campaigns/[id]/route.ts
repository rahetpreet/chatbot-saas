import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { analyticsContext, analyticsSuccess, analyticsError } from "@/lib/services/analytics/request";
import { campaignAnalytics, linkAnalytics, sourceAnalytics } from "@/lib/services/analytics/breakdowns";
import { funnelMetrics } from "@/lib/services/analytics/queries";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * One campaign in detail: its own funnel, and every link inside it.
 *
 * The campaign is looked up within the caller's workspace, so an id from
 * another tenant is a 404 rather than a data leak.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const context = await analyticsContext(req);
    const { tenantId, range } = context;
    const { id } = await params;

    const campaign = await prisma.campaign.findFirst({
      where: { id, tenantId, deletedAt: null },
      select: { id: true, name: true, slug: true, createdAt: true },
    });
    if (!campaign) {
      return analyticsSuccess({ campaign: null, notFound: true }, context);
    }

    const [all, funnel, links, sources] = await Promise.all([
      campaignAnalytics(tenantId, range),
      funnelMetrics(tenantId, range, { campaignId: id }),
      linkAnalytics(tenantId, range, "mostOpened"),
      sourceAnalytics(tenantId, range),
    ]);

    return analyticsSuccess(
      {
        campaign,
        stats: all.find((c) => c.campaignId === id) ?? null,
        funnel: funnel.steps,
        links: links.filter((link) => link.campaignName === campaign.name),
        sources,
      },
      context,
    );
  } catch (error) {
    return analyticsError(error);
  }
}
