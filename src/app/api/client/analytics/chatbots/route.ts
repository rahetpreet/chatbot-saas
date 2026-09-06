import { NextRequest } from "next/server";
import { analyticsContext, analyticsSuccess, analyticsError } from "@/lib/services/analytics/request";
import { chatbotAnalytics } from "@/lib/services/analytics/segments";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Every chatbot side by side, for clients running more than one.
 *
 * The workspace comes from the authenticated session; a tenant id in the query
 * string is ignored.
 */
export async function GET(req: NextRequest) {
  try {
    const context = await analyticsContext(req);
    const { tenantId, range, filters } = context;
    const chatbots = await chatbotAnalytics(tenantId, range);
    return analyticsSuccess({ chatbots }, context);
  } catch (error) {
    return analyticsError(error);
  }
}
