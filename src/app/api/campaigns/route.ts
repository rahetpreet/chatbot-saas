import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireTenantAccess } from "@/lib/services/auth/session";
import { slugify } from "@/lib/utils";

export async function GET(req: NextRequest) {
  try {
    const { tenantId } = await requireTenantAccess();

    const campaigns = await prisma.campaign.findMany({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
      include: {
        _count: {
          select: { contacts: true },
        },
      },
    });

    return NextResponse.json({ campaigns });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Unauthorized" }, { status: 403 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { tenantId, session } = await requireTenantAccess();
    const body = await req.json();
    const { name, slug: rawSlug, flowId, metadata } = body;

    if (!name) {
      return NextResponse.json({ error: "Campaign name is required" }, { status: 400 });
    }

    const slug = slugify(rawSlug || name);

    // Check uniqueness within tenant
    const existing = await prisma.campaign.findFirst({
      where: { tenantId, slug },
    });

    if (existing) {
      return NextResponse.json({ error: `Campaign slug '${slug}' already exists in your workspace.` }, { status: 400 });
    }

    const campaign = await prisma.campaign.create({
      data: {
        tenantId,
        name,
        slug,
        flowId: flowId || null,
        metadata: metadata ? (typeof metadata === "string" ? metadata : JSON.stringify(metadata)) : null,
      },
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        tenantId,
        userId: session.userId,
        action: "CAMPAIGN_CREATED",
        details: JSON.stringify({ campaignId: campaign.id, name, slug }),
      },
    });

    return NextResponse.json({ success: true, campaign });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to create campaign" }, { status: 500 });
  }
}
