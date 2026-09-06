import { NextRequest } from "next/server";
import { analyticsContext, analyticsSuccess, analyticsError } from "@/lib/services/analytics/request";
import { aiAnalytics } from "@/lib/services/analytics/breakdowns";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * AI usage, shown only where the workspace has the answering layer switched on.
 *
 * The workspace comes from the authenticated session; a tenant id in the query
 * string is ignored.
 */
export async function GET(req: NextRequest) {
  try {
    const context = await analyticsContext(req);
    const { tenantId, range, filters } = context;
    const ai = await aiAnalytics(tenantId, range);
    return analyticsSuccess({ ai }, context);
  } catch (error) {
    return analyticsError(error);
  }
}
