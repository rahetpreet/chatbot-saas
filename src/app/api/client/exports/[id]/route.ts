import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireTenantRole } from "@/lib/services/auth/session";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { tenantId } = await requireTenantRole(["CLIENT_OWNER", "CLIENT_ADMIN"]);
    const { id } = await params;

    const exportJob = await prisma.exportJob.findFirst({
      where: { id, tenantId },
    });

    if (!exportJob) {
      return NextResponse.json({ success: false, error: { code: "NOT_FOUND", message: "Export job not found" } }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      data: {
        id: exportJob.id,
        type: exportJob.type,
        status: exportJob.status,
        downloadUrl: exportJob.downloadUrl,
        createdAt: exportJob.createdAt,
        updatedAt: exportJob.updatedAt,
      },
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: { code: "FORBIDDEN", message: error.message || "Unauthorized" } }, { status: 403 });
  }
}
