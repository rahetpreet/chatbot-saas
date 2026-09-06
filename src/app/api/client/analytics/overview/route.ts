import { NextRequest } from "next/server";
import { analyticsContext, analyticsSuccess, analyticsError } from "@/lib/services/analytics/request";
import { overviewMetrics, funnelMetrics, nodeAnalytics, optionAnalytics } from "@/lib/services/analytics/queries";
import { campaignAnalytics, formFieldAnalytics, deviceAnalytics } from "@/lib/services/analytics/breakdowns";
import { buildInsights, buildRecommendations } from "@/lib/services/analytics/insights";
import { percentChange } from "@/lib/services/analytics/range";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * The executive dashboard: headline metrics, the funnel, and what the numbers
 * mean.
 *
 * Insights are computed here rather than in the browser so that a report and
 * the screen can never disagree about what the data says.
 */
export async function GET(req: NextRequest) {
  try {
    const context = await analyticsContext(req);
    const { tenantId, range, previous, compare, filters } = context;

    const [metrics, funnel, nodes, options, campaigns, formFields, devices] = await Promise.all([
      overviewMetrics(tenantId, range, filters),
      funnelMetrics(tenantId, range, filters),
      nodeAnalytics(tenantId, range, filters),
      optionAnalytics(tenantId, range, filters),
      campaignAnalytics(tenantId, range),
      formFieldAnalytics(tenantId, range, filters),
      deviceAnalytics(tenantId, range),
    ]);

    // Only queried when asked for: it doubles the work of this endpoint, and
    // most page loads do not need it.
    const previousMetrics = compare ? await overviewMetrics(tenantId, previous, filters) : null;

    const insights = buildInsights({
      metrics,
      previous: previousMetrics,
      nodes,
      options,
      campaigns,
      formFields,
      devices: devices.devices,
    });

    const changes = previousMetrics
      ? Object.fromEntries(
          (Object.keys(metrics) as Array<keyof typeof metrics>).map((key) => [
            key,
            percentChange(metrics[key] as number, previousMetrics[key] as number),
          ]),
        )
      : null;

    return analyticsSuccess(
      {
        metrics,
        funnel: funnel.steps,
        previous: previousMetrics,
        changes,
        insights,
        recommendations: buildRecommendations(insights),
        topOptions: options.slice(0, 8),
        worstDropOff: nodes.filter((n) => n.entered > 0).sort((a, b) => b.dropOffRate - a.dropOffRate).slice(0, 5),
      },
      context,
    );
  } catch (error) {
    return analyticsError(error);
  }
}
