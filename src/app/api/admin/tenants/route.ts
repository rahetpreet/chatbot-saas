import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireSuperAdmin } from "@/lib/services/auth/session";
import { TenantService } from "@/lib/services/tenant/tenantService";
import { validateRequest, createTenantSchema } from "@/lib/validation";

export async function GET(_req: NextRequest) {
  try {
    await requireSuperAdmin();

    const tenants = await prisma.tenant.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        _count: {
          select: {
            flows: { where: { deletedAt: null } },
            conversations: true,
            leads: { where: { deletedAt: null } },
            campaigns: { where: { deletedAt: null } },
            users: { where: { deletedAt: null } },
          },
        },
        users: {
          where: { deletedAt: null },
          select: { id: true, email: true, name: true, role: true, status: true, isActive: true },
        },
      },
    });

    return NextResponse.json({ success: true, tenants, data: { tenants } });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: { code: "FORBIDDEN", message: error.message || "Super Admin access required." } }, { status: 403 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const superAdmin = await requireSuperAdmin();
    const body = await req.json();
    
    const validation = await validateRequest(createTenantSchema, body);
    if (!validation.success) {
      return NextResponse.json({ success: false, error: { code: "VALIDATION_ERROR", message: validation.error } }, { status: 400 });
    }

    const ipAddress = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "127.0.0.1";

    const result = await TenantService.createTenant({
      ...validation.data,
      operatorUserId: superAdmin.userId,
      ipAddress,
    });

    // Return the result with credentials prominently displayed
    return NextResponse.json({
      success: true,
      message: "Company workspace created successfully",
      tenant: result.tenant,
      // IMPORTANT: Credentials are only shown once - save them now
      credentials: {
        email: result.credentials.email,
        temporaryPassword: result.credentials.temporaryPassword,
        slug: result.credentials.slug,
        loginUrl: result.credentials.loginUrl,
      },
      warning: "IMPORTANT: Save this password now. It will not be shown again."
    }, { status: 201 });
  } catch (error: any) {
    console.error("Admin create tenant error:", error);
    return NextResponse.json({ success: false, error: { code: "INVALID_REQUEST", message: error.message || "Failed to create company workspace" } }, { status: 400 });
  }
}
