import { NextRequest } from "next/server";
import { analyticsContext, analyticsSuccess, analyticsError } from "@/lib/services/analytics/request";
import { optionAnalytics } from "@/lib/services/analytics/queries";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * What visitors actually choose, and whether choosing it leads anywhere.
 *
 * The workspace comes from the authenticated session; a tenant id in the query
 * string is ignored.
 */
export async function GET(req: NextRequest) {
  try {
    const context = await analyticsContext(req);
    const { tenantId, range, filters } = context;
    const options = await optionAnalytics(tenantId, range, filters);
    return analyticsSuccess({ options }, context);
  } catch (error) {
    return analyticsError(error);
  }
}
