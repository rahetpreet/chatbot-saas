import { NextRequest } from "next/server";
import { analyticsContext, analyticsSuccess, analyticsError } from "@/lib/services/analytics/request";
import { campaignAnalytics } from "@/lib/services/analytics/breakdowns";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Every campaign side by side, so they can be compared directly.
 *
 * The workspace comes from the authenticated session; a tenant id in the query
 * string is ignored.
 */
export async function GET(req: NextRequest) {
  try {
    const context = await analyticsContext(req);
    const { tenantId, range, filters } = context;
    const campaigns = await campaignAnalytics(tenantId, range);
    return analyticsSuccess({ campaigns }, context);
  } catch (error) {
    return analyticsError(error);
  }
}
