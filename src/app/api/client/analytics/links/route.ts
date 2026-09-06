import { NextRequest } from "next/server";
import { analyticsContext, analyticsSuccess, analyticsError } from "@/lib/services/analytics/request";
import { linkAnalytics, type LinkSort } from "@/lib/services/analytics/breakdowns";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Per-link performance.
 *
 * The sort is part of the question being asked: "opened but never chatted" and
 * "chatted but never converted" are the two segments worth acting on.
 *
 * The workspace comes from the authenticated session; a tenant id in the query
 * string is ignored.
 */
export async function GET(req: NextRequest) {
  try {
    const context = await analyticsContext(req);
    const { tenantId, range, filters } = context;
    const sort = (context.searchParams.get("sort") || "mostOpened") as LinkSort;
    const links = await linkAnalytics(tenantId, range, sort);
    return analyticsSuccess({ links, sort }, context);
  } catch (error) {
    return analyticsError(error);
  }
}
