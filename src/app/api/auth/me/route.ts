import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/services/auth/session";
import prisma from "@/lib/prisma";
import mockStore, { withDbTimeout } from "@/lib/mockStore";

function resolveTenantData(tenantId: string | null | undefined, email: string) {
  if (!tenantId) return null;
  const mockTenant = mockStore.getTenant(tenantId);
  if (mockTenant) {
    return {
      id: mockTenant.id,
      name: mockTenant.name,
      slug: mockTenant.slug,
      status: mockTenant.status || "ACTIVE",
      planTier: mockTenant.planTier || "PRO",
      maxMessagesPerMonth: mockTenant.maxMessagesPerMonth || 25000,
      maxFlows: mockTenant.maxFlows || 15,
      maxCampaignLinks: mockTenant.maxCampaignLinks || 200,
      maxStorageMb: mockTenant.maxStorageMb || 500,
      widgetSettings: mockTenant.widgetSettings,
      aiConfig: mockTenant.aiConfig,
    };
  }

  const cleanSlug = tenantId.replace(/^t_/, "") || email.split("@")[1]?.split(".")[0] || "workspace";
  const name = cleanSlug.charAt(0).toUpperCase() + cleanSlug.slice(1);
  return {
    id: tenantId,
    name,
    slug: cleanSlug,
    status: "ACTIVE",
    planTier: "PRO",
    maxMessagesPerMonth: 25000,
    maxFlows: 15,
    maxCampaignLinks: 200,
    maxStorageMb: 500,
  };
}

export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ authenticated: false }, { status: 401 });
    }

    let user: any = null;
    try {
      user = await withDbTimeout(
        prisma.user.findUnique({
          where: { id: session.userId },
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            status: true,
            tenantId: true,
            tenant: {
              select: {
                id: true,
                name: true,
                slug: true,
                status: true,
                planTier: true,
                maxMessagesPerMonth: true,
                maxFlows: true,
                maxCampaignLinks: true,
                maxStorageMb: true,
                widgetSettings: true,
                aiConfig: true,
              },
            },
          },
        }),
        null,
        600
      );
    } catch (dbErr) {
      console.warn("Auth me DB lookup notice:", dbErr);
    }

    if (!user) {
      const tenantData = resolveTenantData(session.tenantId, session.email);
      const isSuper = session.role === "SUPER_ADMIN";
      const domainSlug = session.email.split("@")[1]?.split(".")[0] || "admin";
      const defaultName = isSuper ? "System Super Admin" : `${domainSlug.toUpperCase()} Admin`;

      return NextResponse.json({
        authenticated: true,
        user: {
          id: session.userId,
          name: defaultName,
          email: session.email,
          role: session.role,
          status: "ACTIVE",
          tenantId: session.tenantId,
          tenant: tenantData,
        },
        impersonating: !!session.impersonatingFrom,
      });
    }

    return NextResponse.json({
      authenticated: true,
      user,
      impersonating: !!session.impersonatingFrom,
    });
  } catch (error: any) {
    const session = await getSession();
    if (session) {
      const tenantData = resolveTenantData(session.tenantId, session.email);
      return NextResponse.json({
        authenticated: true,
        user: {
          id: session.userId,
          name: session.role === "SUPER_ADMIN" ? "System Super Admin" : "Company Admin",
          email: session.email,
          role: session.role,
          status: "ACTIVE",
          tenantId: session.tenantId,
          tenant: tenantData,
        },
        impersonating: false,
      });
    }
    return NextResponse.json({ error: "Failed to fetch session" }, { status: 500 });
  }
}
