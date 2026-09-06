import { NextRequest, NextResponse } from "next/server";
import { requireTenantRole } from "@/lib/services/auth/session";
import { resolveRange, previousRange, DateRange } from "./range";
import type { AnalyticsFilters } from "./queries";

/**
 * Shared plumbing for every analytics endpoint.
 *
 * Having one place that resolves the tenant is the point: the tenant id comes
 * from the authenticated session and nowhere else. A `tenantId` in the query
 * string or body is ignored entirely rather than validated, because there is no
 * legitimate reason for a browser to send one.
 */

/** Roles allowed to read analytics. Agents see conversations, not reports. */
const ANALYTICS_ROLES = ["CLIENT_ADMIN", "CLIENT_USER"] as const;

export interface AnalyticsContext {
  tenantId: string;
  range: DateRange;
  previous: DateRange;
  compare: boolean;
  filters: AnalyticsFilters;
  searchParams: URLSearchParams;
}

export async function analyticsContext(req: NextRequest): Promise<AnalyticsContext> {
  const { tenantId } = await requireTenantRole([...ANALYTICS_ROLES] as any);
  const params = new URL(req.url).searchParams;

  const range = resolveRange({
    preset: params.get("preset"),
    start: params.get("start"),
    end: params.get("end"),
  });

  const versionParam = Number(params.get("flowVersion"));

  return {
    tenantId,
    range,
    previous: previousRange(range),
    compare: params.get("compare") === "true",
    filters: {
      flowId: params.get("flowId") || null,
      campaignId: params.get("campaignId") || null,
      flowVersion: Number.isFinite(versionParam) && versionParam > 0 ? versionParam : null,
    },
    searchParams: params,
  };
}

/** Serialises a range for the client without leaking internals. */
export const describeRange = (range: DateRange) => ({
  preset: range.preset,
  label: range.label,
  start: range.start.toISOString(),
  end: range.end.toISOString(),
  days: range.days,
});

export function analyticsSuccess(data: Record<string, unknown>, context: AnalyticsContext) {
  return NextResponse.json({
    success: true,
    data: { ...data, range: describeRange(context.range) },
  });
}

/**
 * Turns a thrown error into the right status.
 *
 * Authorisation failures are 403 and everything else is 500, so a genuine bug
 * is never disguised as a permission problem — which would send someone
 * checking roles when the real fault is a broken query.
 */
export function analyticsError(error: unknown) {
  const message = error instanceof Error ? error.message : "Analytics request failed.";
  const forbidden = /forbidden|unauthor/i.test(message);
  if (!forbidden) console.error("[analytics] request failed", error);
  return NextResponse.json(
    {
      success: false,
      error: {
        code: forbidden ? "FORBIDDEN" : "SERVER_ERROR",
        message: forbidden ? "You do not have access to analytics." : "Could not load analytics.",
      },
    },
    { status: forbidden ? 403 : 500 },
  );
}
