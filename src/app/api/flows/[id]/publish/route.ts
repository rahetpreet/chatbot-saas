import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireTenantAccess } from "@/lib/services/auth/session";

import mockStore from "@/lib/mockStore";
import PersistentRegistry from "@/lib/persistentRegistry";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { tenantId, session } = await requireTenantAccess();
    const { id } = await params;
    const effectiveTenantId = tenantId || (session.role === "SUPER_ADMIN" ? "SUPER_ADMIN" : "t_acme_corp");

    let flow: any = null;
    try {
      flow = await prisma.flow.findFirst({
        where: effectiveTenantId === "SUPER_ADMIN" ? { id } : { id, tenantId: effectiveTenantId },
      });
    } catch (dbErr) {
      console.warn("Publish flow find DB notice:", dbErr);
    }

    if (!flow) {
      flow = PersistentRegistry.getFlow(id, effectiveTenantId) || mockStore.getFlow(id, effectiveTenantId);
    }

    if (!flow) {
      return NextResponse.json({ error: "Flow not found" }, { status: 404 });
    }

    let updated: any = null;
    try {
      // Snapshot current draft nodes & edges into published fields
      updated = await prisma.flow.update({
        where: { id },
        data: {
          status: "PUBLISHED",
          version: (flow.version || 1) + 1,
          publishedNodes: flow.nodes,
          publishedEdges: flow.edges,
        },
      });

      // Audit log
      try {
        await prisma.auditLog.create({
          data: {
            tenantId: effectiveTenantId,
            userId: session.userId,
            action: "FLOW_PUBLISHED",
            details: JSON.stringify({ flowId: flow.id, version: updated.version }),
          },
        });
      } catch {}
    } catch (dbErr) {
      console.warn("Publish flow update DB notice (using mockStore):", dbErr);
      flow.status = "PUBLISHED";
      flow.version = (flow.version || 1) + 1;
      flow.publishedNodes = flow.nodes;
      flow.publishedEdges = flow.edges;
      flow.updatedAt = new Date().toISOString();
      updated = flow;
    }

    try {
      if (updated) {
        PersistentRegistry.saveFlow(updated);
      }
    } catch (e) {
      console.warn("PersistentRegistry publish flow error:", e);
    }

    return NextResponse.json({
      success: true,
      message: `Flow version ${updated.version} published successfully!`,
      flow: updated,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Publish failed" }, { status: 500 });
  }
}
