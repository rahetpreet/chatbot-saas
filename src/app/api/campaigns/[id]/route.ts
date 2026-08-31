import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireTenantAccess } from "@/lib/services/auth/session";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { tenantId } = await requireTenantAccess();
    const { id } = await params;

    const campaign = await prisma.campaign.findFirst({
      where: { id, tenantId },
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
    const { tenantId } = await requireTenantAccess();
    const { id } = await params;
    const body = await req.json();

    const { name, flowId, metadata } = body;
    const updateData: Record<string, any> = {};
    if (name !== undefined) updateData.name = name;
    if (flowId !== undefined) updateData.flowId = flowId;
    if (metadata !== undefined) updateData.metadata = typeof metadata === "string" ? metadata : JSON.stringify(metadata);

    const updated = await prisma.campaign.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json({ success: true, campaign: updated });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Update failed" }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { tenantId } = await requireTenantAccess();
    const { id } = await params;

    await prisma.campaign.deleteMany({
      where: { id, tenantId },
    });

    return NextResponse.json({ success: true, message: "Campaign deleted" });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Delete failed" }, { status: 400 });
  }
}
