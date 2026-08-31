import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireTenantAccess } from "@/lib/services/auth/session";

export async function GET(req: NextRequest) {
  try {
    const { tenantId } = await requireTenantAccess();

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        id: true,
        name: true,
        slug: true,
        widgetSettings: true,
      },
    });

    if (!tenant) {
      return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
    }

    let settings = {};
    try {
      settings = tenant.widgetSettings ? JSON.parse(tenant.widgetSettings) : {};
    } catch {}

    return NextResponse.json({
      tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug },
      settings,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Unauthorized" }, { status: 403 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const { tenantId, session } = await requireTenantAccess();
    const body = await req.json();

    const updated = await prisma.tenant.update({
      where: { id: tenantId },
      data: {
        widgetSettings: typeof body === "string" ? body : JSON.stringify(body),
      },
    });

    await prisma.auditLog.create({
      data: {
        tenantId,
        userId: session.userId,
        action: "WIDGET_SETTINGS_UPDATED",
        details: JSON.stringify(body),
      },
    });

    return NextResponse.json({
      success: true,
      settings: JSON.parse(updated.widgetSettings || "{}"),
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Update failed" }, { status: 400 });
  }
}
