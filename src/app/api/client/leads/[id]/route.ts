import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireTenantRole } from "@/lib/services/auth/session";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { tenantId, session } = await requireTenantRole(["CLIENT_OWNER", "CLIENT_ADMIN", "CLIENT_AGENT"]);
    const { id } = await params;
    const body = await req.json();

    const data: Record<string, unknown> = {};
    if (typeof body.status === "string") data.status = body.status;
    if (body.score !== undefined && Number.isFinite(Number(body.score))) data.score = Number(body.score);
    if (body.contactInfo !== undefined) data.contactInfo = typeof body.contactInfo === "string" ? body.contactInfo : JSON.stringify(body.contactInfo);
    if (body.collectedFields !== undefined) data.collectedFields = typeof body.collectedFields === "string" ? body.collectedFields : JSON.stringify(body.collectedFields);

    const result = await prisma.$transaction(async (tx) => {
      const updated = await tx.lead.updateMany({
        where: { id, tenantId, deletedAt: null },
        data,
      });

      if (updated.count) {
        await tx.auditLog.create({
          data: {
            tenantId,
            userId: session.userId,
            action: "LEAD_UPDATED",
            details: JSON.stringify({ leadId: id, status: body.status }),
          },
        });
      }

      return updated;
    });

    if (!result.count) {
      return NextResponse.json({ success: false, error: { code: "NOT_FOUND", message: "Lead not found" } }, { status: 404 });
    }

    return NextResponse.json({ success: true, count: result.count, message: "Lead updated successfully." });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: { code: "INVALID_REQUEST", message: error.message || "Update failed" } }, { status: 400 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { tenantId, session } = await requireTenantRole(["CLIENT_OWNER", "CLIENT_ADMIN"]);
    const { id } = await params;

    const result = await prisma.$transaction(async (tx) => {
      const updated = await tx.lead.updateMany({
        where: { id, tenantId, deletedAt: null },
        data: { deletedAt: new Date() },
      });

      if (updated.count) {
        await tx.auditLog.create({
          data: {
            tenantId,
            userId: session.userId,
            action: "LEAD_ARCHIVED",
            details: JSON.stringify({ leadId: id }),
          },
        });
      }

      return updated;
    });

    if (!result.count) {
      return NextResponse.json({ success: false, error: { code: "NOT_FOUND", message: "Lead not found" } }, { status: 404 });
    }

    return NextResponse.json({ success: true, message: "Lead archived successfully." });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: { code: "INVALID_REQUEST", message: error.message || "Delete failed" } }, { status: 400 });
  }
}
