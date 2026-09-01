import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/services/auth/session";
import { TenantService } from "@/lib/services/tenant/tenantService";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const superAdmin = await requireSuperAdmin();
    const { id } = await params;
    const ipAddress = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "127.0.0.1";

    const result = await TenantService.pauseTenant(id, superAdmin.userId, ipAddress);

    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json({ success: false, error: { code: "INVALID_REQUEST", message: error.message || "Failed to pause workspace" } }, { status: 400 });
  }
}
