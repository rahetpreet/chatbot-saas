import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/services/auth/session";
import { TenantService } from "@/lib/services/tenant/tenantService";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const superAdmin = await requireSuperAdmin();
    const { id } = await params;
    const ipAddress = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "127.0.0.1";

    const result = await TenantService.resetClientPassword(id, superAdmin.userId, ipAddress);

    return NextResponse.json({
      success: true,
      message: "Password reset successfully.",
      credentials: result,
    });
  } catch (error: any) {
    console.error("Super Admin reset password error:", error);
    return NextResponse.json({ error: error.message || "Failed to reset client password" }, { status: 500 });
  }
}
