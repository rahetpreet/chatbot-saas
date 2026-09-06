import { NextRequest } from "next/server";
import { analyticsContext, analyticsSuccess, analyticsError } from "@/lib/services/analytics/request";
import { nodeAnalytics, optionAnalytics } from "@/lib/services/analytics/queries";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Per-node flow performance, ordered by traffic, plus the option distribution behind each choice.
 *
 * The workspace comes from the authenticated session; a tenant id in the query
 * string is ignored.
 */
export async function GET(req: NextRequest) {
  try {
    const context = await analyticsContext(req);
    const { tenantId, range, filters } = context;
    const [nodes, options] = await Promise.all([
      nodeAnalytics(tenantId, range, filters),
      optionAnalytics(tenantId, range, filters),
    ]);
    return analyticsSuccess({ nodes, options }, context);
  } catch (error) {
    return analyticsError(error);
  }
}
