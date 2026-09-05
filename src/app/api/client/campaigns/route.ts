import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireTenantRole } from "@/lib/services/auth/session";
import { slugify } from "@/lib/utils";

export async function GET() {
  try {
    const { tenantId } = await requireTenantRole(["CLIENT_OWNER", "CLIENT_ADMIN", "CLIENT_VIEWER"]);
    const campaigns = await prisma.campaign.findMany({ where: { tenantId, deletedAt: null }, orderBy: { createdAt: "desc" }, include: { contacts: { where: { deletedAt: null }, orderBy: { createdAt: "desc" } }, _count: { select: { contacts: true } } } });
    return NextResponse.json({ campaigns });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Unauthorized" }, { status: 403 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { tenantId, session } = await requireTenantRole(["CLIENT_OWNER", "CLIENT_ADMIN"]);
    const body = await req.json();
    const name = typeof body.name === "string" ? body.name.trim().slice(0, 160) : "";
    const slug = slugify(typeof body.slug === "string" ? body.slug : name);
    if (!name || !slug) return NextResponse.json({ error: "Campaign name is required" }, { status: 400 });
    if (body.flowId) {
      const flow = await prisma.flow.findFirst({ where: { id: body.flowId, tenantId, deletedAt: null } });
      if (!flow) return NextResponse.json({ error: "Flow not found" }, { status: 404 });
    }
    const campaign = await prisma.$transaction(async (tx) => {
      const created = await tx.campaign.create({ data: { tenantId, name, slug, flowId: typeof body.flowId === "string" ? body.flowId : null, metadata: body.metadata ? JSON.stringify(body.metadata) : null } });
      await tx.auditLog.create({ data: { tenantId, userId: session.userId, action: "CAMPAIGN_CREATED", details: JSON.stringify({ campaignId: created.id }) } });
      return created;
    });
    return NextResponse.json({ success: true, campaign }, { status: 201 });
  } catch (error: any) {
    const isUnique = error?.code === "P2002";
    return NextResponse.json({ error: isUnique ? "Campaign slug already exists" : error.message || "Failed to create campaign" }, { status: isUnique ? 409 : 500 });
  }
}
