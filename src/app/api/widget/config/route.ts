import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import mockStore from "@/lib/mockStore";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const tenantSlug = searchParams.get("tenantSlug") || searchParams.get("tenantId") || "acme-corp";

    let tenant: any = null;
    try {
      tenant = await prisma.tenant.findFirst({
        where: {
          OR: [{ slug: tenantSlug }, { id: tenantSlug }],
        },
        select: {
          id: true,
          name: true,
          slug: true,
          status: true,
          widgetSettings: true,
          flows: {
            where: { status: "PUBLISHED", isDefault: true },
            take: 1,
            select: { id: true, name: true, version: true },
          },
        },
      });
    } catch (dbErr) {
      console.warn("Widget config DB notice (using mockStore):", dbErr);
    }

    if (!tenant) {
      tenant = mockStore.getTenant(tenantSlug) || mockStore.tenants[0];
    }

    let parsedSettings = {
      primaryColor: "#4f46e5",
      secondaryColor: "#6366f1",
      textColor: "#ffffff",
      botName: `${tenant.name} Bot`,
      botSubtitle: "Replies instantly",
      avatarUrl: `https://api.dicebear.com/7.x/bottts/svg?seed=${tenant.slug}`,
      launcherStyle: "bubble",
      launcherIcon: "sparkles",
      launcherPosition: "bottom-right",
      greetingBadge: "👋 How can we help?",
      showGreetingBadge: true,
      soundEnabled: true,
      allowedDomains: [],
    };

    if (tenant.widgetSettings) {
      try {
        parsedSettings = { ...parsedSettings, ...JSON.parse(tenant.widgetSettings) };
      } catch {}
    }

    // Check CORS origin whitelist
    const origin = req.headers.get("origin");
    if (origin && parsedSettings.allowedDomains && parsedSettings.allowedDomains.length > 0) {
      const originHost = new URL(origin).hostname;
      const isAllowed = parsedSettings.allowedDomains.some((d: string) => originHost.includes(d) || d === "*");
      if (!isAllowed) {
        return NextResponse.json({ error: "Unauthorized domain origin" }, { status: 403 });
      }
    }

    const response = NextResponse.json({
      success: true,
      tenant: {
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
      },
      widget: parsedSettings,
      activeFlow: tenant.flows[0] || null,
    });

    // CORS headers for embeddable widget
    response.headers.set("Access-Control-Allow-Origin", origin || "*");
    response.headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    response.headers.set("Access-Control-Allow-Headers", "Content-Type");

    return response;
  } catch (error: any) {
    console.error("Widget config error:", error);
    return NextResponse.json({ error: "Failed to load widget config" }, { status: 500 });
  }
}

export async function OPTIONS() {
  const response = new NextResponse(null, { status: 204 });
  response.headers.set("Access-Control-Allow-Origin", "*");
  response.headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  response.headers.set("Access-Control-Allow-Headers", "Content-Type");
  return response;
}
