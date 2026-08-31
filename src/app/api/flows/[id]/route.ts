import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireTenantAccess } from "@/lib/services/auth/session";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { tenantId } = await requireTenantAccess();
    const { id } = await params;

    const flow = await prisma.flow.findFirst({
      where: { id, tenantId },
      include: {
        _count: {
          select: {
            conversations: true,
            analyticsEvents: true,
          },
        },
      },
    });

    if (!flow) {
      return NextResponse.json({ error: "Flow not found" }, { status: 404 });
    }

    return NextResponse.json({ flow });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Unauthorized" }, { status: 403 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { tenantId, session } = await requireTenantAccess();
    const { id } = await params;
    const body = await req.json();

    const { name, description, nodes, edges, isDefault } = body;

    const updateData: Record<string, any> = {};
    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (nodes !== undefined) updateData.nodes = typeof nodes === "string" ? nodes : JSON.stringify(nodes);
    if (edges !== undefined) updateData.edges = typeof edges === "string" ? edges : JSON.stringify(edges);

    if (isDefault) {
      // Unset other default flows for this tenant
      await prisma.flow.updateMany({
        where: { tenantId, id: { not: id } },
        data: { isDefault: false },
      });
      updateData.isDefault = true;
    }

    const updated = await prisma.flow.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json({ success: true, flow: updated });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Update failed" }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { tenantId } = await requireTenantAccess();
    const { id } = await params;

    await prisma.flow.deleteMany({
      where: { id, tenantId },
    });

    return NextResponse.json({ success: true, message: "Flow deleted" });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Delete failed" }, { status: 400 });
  }
}
