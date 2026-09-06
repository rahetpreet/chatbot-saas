import { NextRequest } from "next/server";
import { analyticsContext, analyticsSuccess, analyticsError } from "@/lib/services/analytics/request";
import { formFieldAnalytics } from "@/lib/services/analytics/breakdowns";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Per-field completion, ordered worst first, so the field costing the most leads is at the top.
 *
 * The workspace comes from the authenticated session; a tenant id in the query
 * string is ignored.
 */
export async function GET(req: NextRequest) {
  try {
    const context = await analyticsContext(req);
    const { tenantId, range, filters } = context;
    const fields = await formFieldAnalytics(tenantId, range, filters);
    return analyticsSuccess({ fields }, context);
  } catch (error) {
    return analyticsError(error);
  }
}
