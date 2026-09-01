import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireTenantAccess } from "@/lib/services/auth/session";

export async function GET(_req: NextRequest) {
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
      return NextResponse.json({ success: false, error: { code: "NOT_FOUND", message: "Tenant not found." } }, { status: 404 });
    }

    let settings = {};
    try {
      settings = tenant.widgetSettings ? JSON.parse(tenant.widgetSettings) : {};
    } catch {}

    return NextResponse.json({
      success: true,
      tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug },
      settings,
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: { code: "UNAUTHORIZED", message: error.message || "Failed to get widget settings" } }, { status: 401 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const { tenantId, session } = await requireTenantAccess();
    const body = await req.json();

    const serialized = typeof body === "string" ? body : JSON.stringify(body);

    const [updated] = await prisma.$transaction([
      prisma.tenant.update({
        where: { id: tenantId },
        data: { widgetSettings: serialized },
        select: { widgetSettings: true },
      }),
      prisma.auditLog.create({
        data: {
          tenantId,
          userId: session.userId,
          action: "WIDGET_SETTINGS_UPDATED",
          details: JSON.stringify(body),
        },
      }),
    ]);

    let parsedSettings = {};
    try {
      parsedSettings = updated.widgetSettings ? JSON.parse(updated.widgetSettings) : {};
    } catch {}

    return NextResponse.json({
      success: true,
      settings: parsedSettings,
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: { code: "INVALID_REQUEST", message: error.message || "Update failed" } }, { status: 400 });
  }
}
