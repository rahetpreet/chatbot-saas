import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { FlowRepository } from "@/lib/repositories/flowRepository";
import { requireTenantRole } from "@/lib/services/auth/session";
import { validateRequest, createFlowSchema } from "@/lib/validation";
import { assertUsageAvailable } from "@/lib/services/subscription/planLimits";

export async function GET(req: NextRequest) {
  try {
    const { tenantId } = await requireTenantRole(["CLIENT_OWNER", "CLIENT_ADMIN", "CLIENT_VIEWER"]);
    const flows = await FlowRepository.findByTenant(tenantId);

    return NextResponse.json({ flows });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Unauthorized" }, { status: 403 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { tenantId, session } = await requireTenantRole(["CLIENT_OWNER", "CLIENT_ADMIN"]);
    const body = await req.json();
    
    const validation = await validateRequest(createFlowSchema, body);
    if (!validation.success) return NextResponse.json({ error: validation.error }, { status: 400 });
    await assertUsageAvailable(tenantId, "flows");
    
    const { name, description, nodes, edges } = validation.data;

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

    const flow = await prisma.$transaction(async (tx) => {
      const created = await tx.flow.create({
        data: {
          tenantId,
          name,
          description,
          status: "DRAFT",
          nodes: JSON.stringify(nodes || defaultNodes),
          edges: JSON.stringify(edges || defaultEdges),
        },
      });
      await tx.auditLog.create({ data: { tenantId, userId: session.userId, action: "FLOW_CREATED", details: JSON.stringify({ flowId: created.id, name: created.name }) } });
      return created;
    });

    return NextResponse.json({ success: true, flow });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to create flow" }, { status: 500 });
  }
}
