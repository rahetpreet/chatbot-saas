import { NextRequest } from "next/server";
import { analyticsContext, analyticsSuccess, analyticsError } from "@/lib/services/analytics/request";
import { leadAnalytics } from "@/lib/services/analytics/segments";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Lead volume, pipeline status, and where the leads came from.
 *
 * The workspace comes from the authenticated session; a tenant id in the query
 * string is ignored.
 */
export async function GET(req: NextRequest) {
  try {
    const context = await analyticsContext(req);
    const { tenantId, range, filters } = context;
    const leads = await leadAnalytics(tenantId, range);
    return analyticsSuccess({ leads }, context);
  } catch (error) {
    return analyticsError(error);
  }
}
