import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireSuperAdmin } from "@/lib/services/auth/session";
import mockStore, { withDbTimeout } from "@/lib/mockStore";
import { TenantService } from "@/lib/services/tenant/tenantService";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireSuperAdmin();
    const { id } = await params;

    let tenant: any = null;
    try {
      tenant = await withDbTimeout<any>(
        prisma.tenant.findUnique({
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
        }),
        null,
        600
      );
    } catch (dbErr) {
      console.warn("Single tenant DB GET notice:", dbErr);
    }

    if (!tenant) {
      tenant = mockStore.getTenant(id);
    }

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

    let updated: any = null;
    try {
      updated = await prisma.tenant.update({
        where: { id },
        data: updateData,
      });

      // Audit log
      try {
        await prisma.auditLog.create({
          data: {
            tenantId: id,
            userId: superAdmin.userId,
            action: "SUPERADMIN_UPDATE_TENANT",
            details: JSON.stringify(updateData),
          },
        });
      } catch {}
    } catch (dbErr) {
      console.warn("Single tenant DB PATCH notice:", dbErr);
      const existing = mockStore.getTenant(id);
      if (existing) {
        Object.assign(existing, updateData);
        updated = existing;
      } else {
        updated = { id, ...updateData };
      }
    }

    return NextResponse.json({ success: true, tenant: updated });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Update failed" }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const superAdmin = await requireSuperAdmin();
    const { id } = await params;
    const ipAddress = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "127.0.0.1";

    const result = await TenantService.deleteTenant(id, superAdmin.userId, ipAddress);

    return NextResponse.json(result);
  } catch (error: any) {
    console.error("Delete tenant error:", error);
    return NextResponse.json({ error: error.message || "Failed to delete company workspace" }, { status: 500 });
  }
}
