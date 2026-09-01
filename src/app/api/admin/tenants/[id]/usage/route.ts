import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/services/auth/session";
import { TenantService } from "@/lib/services/tenant/tenantService";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireSuperAdmin();
    const { id } = await params;

    const usage = await TenantService.getTenantUsage(id);

    return NextResponse.json(usage);
  } catch (error: any) {
    return NextResponse.json({ success: false, error: { code: "NOT_FOUND", message: error.message || "Failed to fetch tenant usage." } }, { status: 404 });
  }
}
