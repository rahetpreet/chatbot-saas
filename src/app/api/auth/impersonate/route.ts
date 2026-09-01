import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireSuperAdmin } from "@/lib/services/auth/session";
import { signToken } from "@/lib/services/auth/jwt";
import { IMPERSONATION_COOKIE_NAME } from "@/lib/services/auth/session";
import mockStore from "@/lib/mockStore";

export async function POST(req: NextRequest) {
  try {
    const superAdmin = await requireSuperAdmin();
    const { tenantId, action } = await req.json();

    // If stopping impersonation
    if (action === "stop") {
      const response = NextResponse.json({ success: true, message: "Impersonation ended" });
      response.cookies.delete(IMPERSONATION_COOKIE_NAME);
      return response;
    }

    if (!tenantId) {
      return NextResponse.json({ error: "Tenant ID is required" }, { status: 400 });
    }

    let tenant: any = null;
    try {
      tenant = await prisma.tenant.findUnique({
        where: { id: tenantId },
        include: {
          users: {
            where: { role: "CLIENT_ADMIN" },
            take: 1,
          },
        },
      });
    } catch (dbErr) {
      console.warn("Impersonate tenant find DB notice:", dbErr);
    }

    if (!tenant) {
      tenant = mockStore.getTenant(tenantId) || mockStore.tenants[0];
    }

    if (!tenant) {
      return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
    }

    const targetUser = (tenant.users && tenant.users[0]) || {
      id: `impersonated_${tenant.id}`,
      email: `admin@${tenant.slug}.local`,
      role: "CLIENT_ADMIN",
    };

    const impersonationPayload = {
      userId: targetUser.id,
      email: targetUser.email,
      role: "CLIENT_ADMIN" as any,
      tenantId: tenant.id,
      impersonatingFrom: superAdmin.userId,
    };

    const token = await signToken(impersonationPayload, "4h");

    // Audit log
    try {
      await prisma.auditLog.create({
        data: {
          tenantId: tenant.id,
          userId: superAdmin.userId,
          action: "SUPERADMIN_IMPERSONATE_TENANT",
          ipAddress: req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "127.0.0.1",
          details: JSON.stringify({ tenantName: tenant.name, tenantSlug: tenant.slug }),
        },
      });
    } catch {}

    const response = NextResponse.json({
      success: true,
      message: `Impersonating ${tenant.name}`,
      tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug },
    });

    response.cookies.set(IMPERSONATION_COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 4, // 4 hours
    });

    return response;
  } catch (error: any) {
    console.error("Impersonate error:", error);
    return NextResponse.json({ error: error.message || "Failed to impersonate" }, { status: 403 });
  }
}
