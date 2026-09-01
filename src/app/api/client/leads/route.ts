import { NextRequest, NextResponse } from "next/server";
import { LeadRepository } from "@/lib/repositories/leadRepository";
import { requireTenantRole } from "@/lib/services/auth/session";

export async function GET(req: NextRequest) {
  try {
    const { tenantId } = await requireTenantRole(["CLIENT_OWNER", "CLIENT_ADMIN", "CLIENT_AGENT", "CLIENT_VIEWER"]);
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");
    const search = searchParams.get("search")?.slice(0, 160);

    const leads = await LeadRepository.findByTenant(tenantId, {
      status: status || undefined,
      search: search || undefined,
    });

    return NextResponse.json({ success: true, data: { leads }, leads });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: { code: "FORBIDDEN", message: error.message || "Unauthorized" } }, { status: 403 });
  }
}
