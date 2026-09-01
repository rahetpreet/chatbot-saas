import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireTenantAccess } from "@/lib/services/auth/session";
import { slugify } from "@/lib/utils";

import mockStore from "@/lib/mockStore";

export async function GET(req: NextRequest) {
  try {
    const { tenantId, session } = await requireTenantAccess();
    const effectiveTenantId = tenantId || (session.role === "SUPER_ADMIN" ? "t_acme_corp" : session.tenantId || "t_acme_corp");

    let campaigns: any[] = [];
    try {
      campaigns = await prisma.campaign.findMany({
        where: { tenantId: effectiveTenantId },
        orderBy: { createdAt: "desc" },
        include: {
          _count: {
            select: { contacts: true },
          },
        },
      });
    } catch (dbErr) {
      console.warn("Campaigns GET DB notice (using mockStore):", dbErr);
      campaigns = mockStore.campaigns;
    }

    if (campaigns.length === 0) {
      campaigns = mockStore.campaigns;
    }

    return NextResponse.json({ campaigns });
  } catch (error: any) {
    return NextResponse.json({ campaigns: mockStore.campaigns });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { tenantId, session } = await requireTenantAccess();
    const effectiveTenantId = tenantId || (session.role === "SUPER_ADMIN" ? "t_acme_corp" : session.tenantId || "t_acme_corp");
    const body = await req.json();
    const { name, slug: rawSlug, flowId, metadata } = body;

    if (!name) {
      return NextResponse.json({ error: "Campaign name is required" }, { status: 400 });
    }

    const slug = slugify(rawSlug || name);

    let campaign: any = null;
    try {
      campaign = await prisma.campaign.create({
        data: {
          tenantId: effectiveTenantId,
          name,
          slug,
          flowId: flowId || null,
          metadata: metadata ? (typeof metadata === "string" ? metadata : JSON.stringify(metadata)) : null,
        },
      });

      // Audit log
      try {
        await prisma.auditLog.create({
          data: {
            tenantId: effectiveTenantId,
            userId: session.userId,
            action: "CAMPAIGN_CREATED",
            details: JSON.stringify({ campaignId: campaign.id, name, slug }),
          },
        });
      } catch {}
    } catch (dbErr) {
      console.warn("Campaign POST DB notice (using mockStore):", dbErr);
      const newCampaign = {
        id: `cmp_${Date.now()}`,
        tenantId: effectiveTenantId,
        name,
        slug,
        flowId: flowId || "flow_starter_default",
        opensCount: 0,
        conversionsCount: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        contacts: [],
        _count: { contacts: 0 },
      };
      mockStore.campaigns.unshift(newCampaign);
      campaign = newCampaign;
    }

    return NextResponse.json({ success: true, campaign });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to create campaign" }, { status: 500 });
  }
}
