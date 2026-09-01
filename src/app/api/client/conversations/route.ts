import { NextRequest, NextResponse } from "next/server";
import { ConversationRepository } from "@/lib/repositories/conversationRepository";
import { requireTenantRole } from "@/lib/services/auth/session";

export async function GET(req: NextRequest) {
  try {
    const { tenantId } = await requireTenantRole(["CLIENT_OWNER", "CLIENT_ADMIN", "CLIENT_AGENT", "CLIENT_VIEWER"]);
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status"); // ACTIVE, HANDOVER, RESOLVED, ABANDONED
    const campaignId = searchParams.get("campaignId");
    const flowId = searchParams.get("flowId");

    const conversations = await ConversationRepository.findByTenant(tenantId, {
      status: status || undefined,
      campaignId: campaignId || undefined,
      flowId: flowId || undefined,
      limit: 100,
    });

    return NextResponse.json({ success: true, data: { conversations }, conversations });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: { code: "FORBIDDEN", message: error.message || "Unauthorized" } }, { status: 403 });
  }
}
