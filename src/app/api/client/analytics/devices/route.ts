import { NextRequest } from "next/server";
import { analyticsContext, analyticsSuccess, analyticsError } from "@/lib/services/analytics/request";
import { deviceAnalytics } from "@/lib/services/analytics/breakdowns";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Device and browser split, with conversion for each, which is where layout problems show up.
 *
 * The workspace comes from the authenticated session; a tenant id in the query
 * string is ignored.
 */
export async function GET(req: NextRequest) {
  try {
    const context = await analyticsContext(req);
    const { tenantId, range, filters } = context;
    const { devices, browsers } = await deviceAnalytics(tenantId, range);
    return analyticsSuccess({ devices, browsers }, context);
  } catch (error) {
    return analyticsError(error);
  }
}
