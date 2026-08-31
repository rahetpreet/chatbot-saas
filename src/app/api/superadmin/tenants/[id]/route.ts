import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireSuperAdmin } from "@/lib/services/auth/session";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireSuperAdmin();
    const { id } = await params;

    const tenant = await prisma.tenant.findUnique({
      where: { id },
      include: {
        users: { select: { id: true, email: true, name: true, role: true, status: true } },
        flows: { select: { id: true, name: true, status: true, version: true, isDefault: true, updatedAt: true } },
        campaigns: { select: { id: true, name: true, slug: true, opensCount: true, conversionsCount: true } },
        _count: {
          select: {
            conversations: true,
            leads: true,
            analyticsEvents: true,
          },
        },
      },
    });

    if (!tenant) {
      return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
    }

    return NextResponse.json({ tenant });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Unauthorized" }, { status: 403 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const superAdmin = await requireSuperAdmin();
    const { id } = await params;
    const body = await req.json();

    const allowedFields = [
      "name",
      "status", // ACTIVE, PAUSED, SUSPENDED, TERMINATED
      "planTier",
      "maxMessagesPerMonth",
      "maxFlows",
      "maxCampaignLinks",
      "maxStorageMb",
    ];

    const updateData: Record<string, any> = {};
    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        if (field.startsWith("max")) {
          updateData[field] = Number(body[field]);
        } else {
          updateData[field] = body[field];
        }
      }
    }

    const updated = await prisma.tenant.update({
      where: { id },
      data: updateData,
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        tenantId: id,
        userId: superAdmin.userId,
        action: "TENANT_UPDATED",
        details: JSON.stringify(updateData),
      },
    });

    return NextResponse.json({ success: true, tenant: updated });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Update failed" }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const superAdmin = await requireSuperAdmin();
    const { id } = await params;

    const tenant = await prisma.tenant.delete({
      where: { id },
    });

    await prisma.auditLog.create({
      data: {
        tenantId: null,
        userId: superAdmin.userId,
        action: "TENANT_DELETED",
        details: JSON.stringify({ tenantId: id, name: tenant.name, slug: tenant.slug }),
      },
    });

    return NextResponse.json({ success: true, message: "Tenant deleted" });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Delete failed" }, { status: 400 });
  }
}
