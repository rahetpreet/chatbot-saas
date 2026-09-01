import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireSuperAdmin } from "@/lib/services/auth/session";
import { TenantService } from "@/lib/services/tenant/tenantService";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireSuperAdmin();
    const { id } = await params;

    const tenant = await prisma.tenant.findUnique({
      where: { id },
      include: {
        users: { select: { id: true, email: true, name: true, role: true, status: true, isActive: true } },
        flows: { where: { deletedAt: null }, select: { id: true, name: true, status: true, version: true, isDefault: true, updatedAt: true } },
        campaigns: { where: { deletedAt: null }, select: { id: true, name: true, slug: true, opensCount: true, conversionsCount: true } },
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
      return NextResponse.json({ success: false, error: { code: "NOT_FOUND", message: "Tenant not found" } }, { status: 404 });
    }

    return NextResponse.json({ success: true, tenant });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: { code: "FORBIDDEN", message: error.message || "Unauthorized" } }, { status: 403 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const superAdmin = await requireSuperAdmin();
    const { id } = await params;
    const body = await req.json();

    const allowedFields = [
      "name",
      "status", // TRIAL, ACTIVE, PAUSED, EXPIRED, CANCELLED
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

    const [updated] = await prisma.$transaction([
      prisma.tenant.update({
        where: { id },
        data: updateData,
      }),
      prisma.auditLog.create({
        data: {
          tenantId: id,
          userId: superAdmin.userId,
          action: "SUPERADMIN_UPDATE_TENANT",
          details: JSON.stringify(updateData),
        },
      }),
    ]);

    return NextResponse.json({ success: true, tenant: updated });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: { code: "VALIDATION_ERROR", message: error.message || "Update failed" } }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const superAdmin = await requireSuperAdmin();
    const { id } = await params;
    const ipAddress = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "127.0.0.1";

    const result = await TenantService.deleteTenant(id, superAdmin.userId, ipAddress);

    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json({ success: false, error: { code: "INVALID_REQUEST", message: error.message || "Failed to delete company workspace" } }, { status: 500 });
  }
}
