import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireSuperAdmin } from "@/lib/services/auth/session";
import mockStore, { withDbTimeout } from "@/lib/mockStore";
import PersistentRegistry from "@/lib/persistentRegistry";
import { TenantService } from "@/lib/services/tenant/tenantService";

export async function GET(req: NextRequest) {
  try {
    await requireSuperAdmin();

    let tenants: any[] = [];
    try {
      tenants = await withDbTimeout<any>(
        prisma.tenant.findMany({
          orderBy: { createdAt: "desc" },
          include: {
            _count: {
              select: {
                flows: true,
                conversations: true,
                leads: true,
                campaigns: true,
                users: true,
              },
            },
            users: {
              select: { id: true, email: true, name: true, role: true, status: true },
            },
          },
        }),
        null,
        600
      );
    } catch (dbErr) {
      console.warn("Tenants DB query notice:", dbErr);
    }

    if (!tenants || tenants.length === 0) {
      const regTenants = PersistentRegistry.getTenants();
      tenants = regTenants.length > 0 ? regTenants : mockStore.tenants;
    }

    return NextResponse.json({ tenants });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Unauthorized" }, { status: 403 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const superAdmin = await requireSuperAdmin();
    const body = await req.json();

    const {
      name,
      slug,
      adminEmail,
      adminName,
      planTier = "STARTER",
      maxMessagesPerMonth = 5000,
      maxFlows = 5,
      maxCampaignLinks = 50,
      maxStorageMb = 100,
    } = body;

    if (!name || !adminEmail) {
      return NextResponse.json({ error: "Company name and admin email are required" }, { status: 400 });
    }

    const ipAddress = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "127.0.0.1";

    const result = await TenantService.createTenant({
      name,
      slug,
      adminEmail,
      adminName,
      planTier,
      maxMessagesPerMonth: Number(maxMessagesPerMonth) || 5000,
      maxFlows: Number(maxFlows) || 5,
      maxCampaignLinks: Number(maxCampaignLinks) || 50,
      maxStorageMb: Number(maxStorageMb) || 100,
      operatorUserId: superAdmin.userId,
      ipAddress,
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error: any) {
    console.error("Create tenant error:", error);
    return NextResponse.json({ error: error.message || "Failed to create company" }, { status: 500 });
  }
}
