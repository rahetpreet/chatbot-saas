import { NextRequest } from "next/server";
import { analyticsContext, analyticsSuccess, analyticsError } from "@/lib/services/analytics/request";
import { versionAnalytics } from "@/lib/services/analytics/segments";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Conversion by published version.
 *
 * Reads the version frozen onto each conversation, so editing the flow never
 * rewrites what earlier versions achieved.
 *
 * The workspace comes from the authenticated session; a tenant id in the query
 * string is ignored.
 */
export async function GET(req: NextRequest) {
  try {
    const context = await analyticsContext(req);
    const { tenantId, range, filters } = context;
    const versions = await versionAnalytics(tenantId, range, filters.flowId);
    return analyticsSuccess({ versions }, context);
  } catch (error) {
    return analyticsError(error);
  }
}
