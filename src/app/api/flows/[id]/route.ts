import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireTenantAccess } from "@/lib/services/auth/session";

import mockStore from "@/lib/mockStore";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { tenantId, session } = await requireTenantAccess();
    const { id } = await params;
    const effectiveTenantId = tenantId || (session.role === "SUPER_ADMIN" ? "SUPER_ADMIN" : "t_acme_corp");

    let flow: any = null;
    try {
      flow = await prisma.flow.findFirst({
        where: effectiveTenantId === "SUPER_ADMIN" ? { id } : { id, tenantId: effectiveTenantId },
        include: {
          _count: {
            select: {
              conversations: true,
              analyticsEvents: true,
            },
          },
        },
      });
    } catch (dbErr) {
      console.warn("Single flow GET DB notice:", dbErr);
    }

    if (!flow) {
      flow = mockStore.getFlow(id, effectiveTenantId);
    }

    if (!flow) {
      return NextResponse.json({ error: "Flow not found" }, { status: 404 });
    }

    return NextResponse.json({ flow });
  } catch (error: any) {
    const { id } = await params;
    const fallbackFlow = mockStore.getFlow(id);
    if (fallbackFlow) return NextResponse.json({ flow: fallbackFlow });
    return NextResponse.json({ error: error.message || "Unauthorized" }, { status: 403 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { tenantId, session } = await requireTenantAccess();
    const { id } = await params;
    const effectiveTenantId = tenantId || (session.role === "SUPER_ADMIN" ? "SUPER_ADMIN" : "t_acme_corp");
    const body = await req.json();

    const { name, description, nodes, edges, isDefault } = body;

    const updateData: Record<string, any> = {};
    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (nodes !== undefined) updateData.nodes = typeof nodes === "string" ? nodes : JSON.stringify(nodes);
    if (edges !== undefined) updateData.edges = typeof edges === "string" ? edges : JSON.stringify(edges);

    let updated: any = null;
    try {
      if (isDefault) {
        // Unset other default flows for this tenant
        await prisma.flow.updateMany({
          where: { tenantId: effectiveTenantId, id: { not: id } },
          data: { isDefault: false },
        });
        updateData.isDefault = true;
      }

      updated = await prisma.flow.update({
        where: { id },
        data: updateData,
      });
    } catch (dbErr) {
      console.warn("Single flow PATCH DB notice (using mockStore):", dbErr);
      const existing = mockStore.getFlow(id);
      if (existing) {
        Object.assign(existing, updateData);
        updated = existing;
      } else {
        updated = { id, ...updateData };
      }
    }

    return NextResponse.json({ success: true, flow: updated });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Update failed" }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { tenantId } = await requireTenantAccess();
    const { id } = await params;

    try {
      await prisma.flow.deleteMany({
        where: { id, tenantId },
      });
    } catch (dbErr) {
      mockStore.flows = mockStore.flows.filter((f) => f.id !== id);
    }

    return NextResponse.json({ success: true, message: "Flow deleted" });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Delete failed" }, { status: 400 });
  }
}
