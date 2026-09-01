import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireTenantAccess } from "@/lib/services/auth/session";

import mockStore from "@/lib/mockStore";

export async function GET(req: NextRequest) {
  try {
    const { tenantId, session } = await requireTenantAccess();
    const effectiveTenantId = tenantId || (session.role === "SUPER_ADMIN" ? "t_acme_corp" : session.tenantId || "t_acme_corp");

    let tenant: any = null;
    try {
      tenant = await prisma.tenant.findUnique({
        where: { id: effectiveTenantId },
        select: {
          id: true,
          name: true,
          slug: true,
          widgetSettings: true,
        },
      });
    } catch (dbErr) {
      console.warn("Widget settings GET DB notice:", dbErr);
    }

    if (!tenant) {
      tenant = mockStore.getTenant(effectiveTenantId);
    }

    let settings = {};
    try {
      settings = tenant?.widgetSettings ? JSON.parse(tenant.widgetSettings) : {};
    } catch {}

    return NextResponse.json({
      tenant: { id: tenant?.id || effectiveTenantId, name: tenant?.name || "Acme Corp", slug: tenant?.slug || "acme-corp" },
      settings,
    });
  } catch (error: any) {
    return NextResponse.json({
      tenant: { id: "t_acme_corp", name: "Acme Corp", slug: "acme-corp" },
      settings: JSON.parse(mockStore.tenants[0].widgetSettings || "{}"),
    });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const { tenantId, session } = await requireTenantAccess();
    const effectiveTenantId = tenantId || (session.role === "SUPER_ADMIN" ? "t_acme_corp" : session.tenantId || "t_acme_corp");
    const body = await req.json();

    const serialized = typeof body === "string" ? body : JSON.stringify(body);

    let updated: any = null;
    try {
      updated = await prisma.tenant.update({
        where: { id: effectiveTenantId },
        data: { widgetSettings: serialized },
      });

      // Audit log
      try {
        await prisma.auditLog.create({
          data: {
            tenantId: effectiveTenantId,
            userId: session.userId,
            action: "WIDGET_SETTINGS_UPDATED",
            details: JSON.stringify(body),
          },
        });
      } catch {}
    } catch (dbErr) {
      console.warn("Widget settings PATCH DB notice (using mockStore):", dbErr);
      const existing = mockStore.getTenant(effectiveTenantId);
      if (existing) {
        existing.widgetSettings = serialized;
        updated = existing;
      } else {
        updated = { widgetSettings: serialized };
      }
    }

    return NextResponse.json({
      success: true,
      settings: JSON.parse(updated?.widgetSettings || serialized || "{}"),
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Update failed" }, { status: 400 });
  }
}
