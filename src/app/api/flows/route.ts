import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireTenantAccess } from "@/lib/services/auth/session";

import mockStore, { withDbTimeout } from "@/lib/mockStore";
import PersistentRegistry from "@/lib/persistentRegistry";

export async function GET(req: NextRequest) {
  try {
    const { tenantId, session } = await requireTenantAccess();
    const effectiveTenantId = tenantId || (session.role === "SUPER_ADMIN" ? "SUPER_ADMIN" : "t_acme_corp");

    let flows: any[] = [];
    try {
      flows = await withDbTimeout<any>(
        prisma.flow.findMany({
          where: effectiveTenantId === "SUPER_ADMIN" ? {} : { tenantId: effectiveTenantId },
          orderBy: { updatedAt: "desc" },
          include: {
            _count: {
              select: {
                conversations: true,
                analyticsEvents: true,
              },
            },
          },
        }),
        null,
        600
      );
    } catch (dbErr) {
      console.warn("Flows GET DB notice:", dbErr);
    }

    if (!flows || flows.length === 0) {
      const regFlows = PersistentRegistry.getFlows(effectiveTenantId);
      flows = regFlows.length > 0 ? regFlows : mockStore.getFlows(effectiveTenantId);
    }

    return NextResponse.json({ flows });
  } catch (error: any) {
    console.warn("Flows GET fallback:", error?.message);
    const regFlows = PersistentRegistry.getFlows("SUPER_ADMIN");
    return NextResponse.json({ flows: regFlows.length > 0 ? regFlows : mockStore.flows });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { tenantId, session } = await requireTenantAccess();
    const effectiveTenantId = tenantId || (session.role === "SUPER_ADMIN" ? "t_acme_corp" : session.tenantId || "t_acme_corp");
    const body = await req.json();
    const { name, description } = body;

    if (!name) {
      return NextResponse.json({ error: "Flow name is required" }, { status: 400 });
    }

    const defaultNodes = [
      {
        id: "start-1",
        type: "start",
        position: { x: 300, y: 100 },
        data: { label: "Trigger: Widget Open", nodeType: "start" },
      },
      {
        id: "msg-1",
        type: "message",
        position: { x: 300, y: 240 },
        data: {
          label: "Greeting Message",
          nodeType: "message",
          messageText: "Hello! Welcome to our website. How can I help you today?",
        },
      },
    ];

    const defaultEdges = [{ id: "e1", source: "start-1", target: "msg-1" }];

    let flow: any = null;
    try {
      flow = await prisma.flow.create({
        data: {
          tenantId: effectiveTenantId,
          name,
          description,
          status: "DRAFT",
          nodes: JSON.stringify(defaultNodes),
          edges: JSON.stringify(defaultEdges),
        },
      });

      // Audit log
      try {
        await prisma.auditLog.create({
          data: {
            tenantId: effectiveTenantId,
            userId: session.userId,
            action: "FLOW_CREATED",
            details: JSON.stringify({ flowId: flow.id, name: flow.name }),
          },
        });
      } catch {}
    } catch (dbErr) {
      console.warn("Flows POST DB notice (using mockStore):", dbErr);
      const newFlow = {
        id: `flow_${Date.now()}`,
        tenantId: effectiveTenantId,
        name,
        description: description || "",
        version: 1,
        status: "DRAFT",
        isDefault: false,
        nodes: JSON.stringify(defaultNodes),
        edges: JSON.stringify(defaultEdges),
        publishedNodes: JSON.stringify(defaultNodes),
        publishedEdges: JSON.stringify(defaultEdges),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        _count: { conversations: 0, analyticsEvents: 0 },
      };
      mockStore.flows.unshift(newFlow);
      flow = newFlow;
    }

    try {
      if (flow) {
        PersistentRegistry.saveFlow(flow);
      }
    } catch (e) {
      console.warn("PersistentRegistry save flow notice:", e);
    }

    return NextResponse.json({ success: true, flow });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to create flow" }, { status: 500 });
  }
}
