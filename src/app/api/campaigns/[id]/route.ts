import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireTenantRole } from "@/lib/services/auth/session";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { tenantId } = await requireTenantRole(["CLIENT_OWNER", "CLIENT_ADMIN", "CLIENT_AGENT", "CLIENT_VIEWER"]);
    const { id } = await params;

    const campaign = await prisma.campaign.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: {
        contacts: {
          orderBy: { createdAt: "desc" },
          take: 100,
        },
      },
    });

    if (!campaign) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }

    return NextResponse.json({ campaign });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Unauthorized" }, { status: 403 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { tenantId, session } = await requireTenantRole(["CLIENT_OWNER", "CLIENT_ADMIN"]);
    const { id } = await params;
    const body = await req.json();

    const { name, flowId, metadata } = body;
    const updateData: Record<string, any> = {};
    if (name !== undefined) updateData.name = name;
    if (flowId !== undefined) updateData.flowId = flowId;
    if (metadata !== undefined) updateData.metadata = typeof metadata === "string" ? metadata : JSON.stringify(metadata);

    const existing = await prisma.campaign.findFirst({ where: { id, tenantId, deletedAt: null } });
    if (!existing) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    const updated = await prisma.$transaction(async (tx) => {
      const campaign = await tx.campaign.update({ where: { id }, data: updateData });
      await tx.auditLog.create({ data: { tenantId, userId: session.userId, action: "CAMPAIGN_UPDATED", details: JSON.stringify({ campaignId: id }) } });
      return campaign;
    });

    return NextResponse.json({ success: true, campaign: updated });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Update failed" }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { tenantId, session } = await requireTenantRole(["CLIENT_OWNER", "CLIENT_ADMIN"]);
    const { id } = await params;

    const result = await prisma.$transaction(async (tx) => {
      const updated = await tx.campaign.updateMany({ where: { id, tenantId, deletedAt: null }, data: { deletedAt: new Date() } });
      if (updated.count) await tx.auditLog.create({ data: { tenantId, userId: session.userId, action: "CAMPAIGN_ARCHIVED", details: JSON.stringify({ campaignId: id }) } });
      return updated;
    });
    if (!result.count) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });

    return NextResponse.json({ success: true, message: "Campaign deleted" });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Delete failed" }, { status: 400 });
  }
}
