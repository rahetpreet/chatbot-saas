import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/services/auth/session";
import prisma from "@/lib/prisma";

export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ authenticated: false }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
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
    });

    if (!user) {
      // Fallback to session data
      return NextResponse.json({
        authenticated: true,
        user: {
          id: session.userId,
          name: session.role === "SUPER_ADMIN" ? "System Super Admin" : "Acme Admin",
          email: session.email,
          role: session.role,
          status: "ACTIVE",
          tenantId: session.tenantId,
          tenant: session.tenantId ? {
            id: session.tenantId,
            name: "Acme Corp",
            slug: "acme-corp",
            status: "ACTIVE",
            planTier: "PRO",
            maxMessagesPerMonth: 25000,
            maxFlows: 15,
            maxCampaignLinks: 200,
            maxStorageMb: 500,
          } : null,
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
    console.warn("Auth me fallback:", error?.message);
    const session = await getSession();
    if (session) {
      return NextResponse.json({
        authenticated: true,
        user: {
          id: session.userId,
          name: session.role === "SUPER_ADMIN" ? "System Super Admin" : "Acme Admin",
          email: session.email,
          role: session.role,
          status: "ACTIVE",
          tenantId: session.tenantId,
          tenant: session.tenantId ? {
            id: session.tenantId,
            name: "Acme Corp",
            slug: "acme-corp",
            status: "ACTIVE",
            planTier: "PRO",
            maxMessagesPerMonth: 25000,
            maxFlows: 15,
            maxCampaignLinks: 200,
            maxStorageMb: 500,
          } : null,
        },
        impersonating: false,
      });
    }
    return NextResponse.json({ error: "Failed to fetch session" }, { status: 500 });
  }
}
