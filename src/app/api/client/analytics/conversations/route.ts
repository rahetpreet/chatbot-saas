import { NextRequest } from "next/server";
import { analyticsContext, analyticsSuccess, analyticsError } from "@/lib/services/analytics/request";
import { conversationAnalytics } from "@/lib/services/analytics/segments";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Conversation shape: duration, message counts, and how many needed a person.
 *
 * The workspace comes from the authenticated session; a tenant id in the query
 * string is ignored.
 */
export async function GET(req: NextRequest) {
  try {
    const context = await analyticsContext(req);
    const { tenantId, range, filters } = context;
    const conversations = await conversationAnalytics(tenantId, range);
    return analyticsSuccess({ conversations }, context);
  } catch (error) {
    return analyticsError(error);
  }
}
