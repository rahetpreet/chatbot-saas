import { NextRequest } from "next/server";
import { analyticsContext, analyticsSuccess, analyticsError } from "@/lib/services/analytics/request";
import { funnelMetrics } from "@/lib/services/analytics/queries";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * The complete journey from link opened to lead created, counted from recorded events.
 *
 * The workspace comes from the authenticated session; a tenant id in the query
 * string is ignored.
 */
export async function GET(req: NextRequest) {
  try {
    const context = await analyticsContext(req);
    const { tenantId, range, filters } = context;
    const steps = (await funnelMetrics(tenantId, range, filters)).steps;
    return analyticsSuccess({ steps }, context);
  } catch (error) {
    return analyticsError(error);
  }
}
