import { NextRequest } from "next/server";
import { analyticsContext, analyticsSuccess, analyticsError } from "@/lib/services/analytics/request";
import { sourceAnalytics } from "@/lib/services/analytics/breakdowns";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Where visitors came from: direct, referral, campaign and UTM tags.
 *
 * The workspace comes from the authenticated session; a tenant id in the query
 * string is ignored.
 */
export async function GET(req: NextRequest) {
  try {
    const context = await analyticsContext(req);
    const { tenantId, range, filters } = context;
    const sources = await sourceAnalytics(tenantId, range);
    return analyticsSuccess({ sources }, context);
  } catch (error) {
    return analyticsError(error);
  }
}
