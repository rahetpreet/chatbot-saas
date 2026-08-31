import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireTenantAccess } from "@/lib/services/auth/session";

export async function GET(req: NextRequest) {
  try {
    const { tenantId } = await requireTenantAccess();

    const flows = await prisma.flow.findMany({
      where: { tenantId },
      orderBy: { updatedAt: "desc" },
      include: {
        _count: {
          select: {
            conversations: true,
            analyticsEvents: true,
          },
        },
      },
    });

    return NextResponse.json({ flows });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Unauthorized" }, { status: 403 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { tenantId, session } = await requireTenantAccess();
    const body = await req.json();
    const { name, description } = body;

    if (!name) {
      return NextResponse.json({ error: "Flow name is required" }, { status: 400 });
    }

    // Check tenant flow quota
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      include: { _count: { select: { flows: true } } },
    });

    if (tenant && tenant._count.flows >= tenant.maxFlows) {
      return NextResponse.json(
        { error: `Flow limit reached (${tenant.maxFlows} max for your plan). Upgrade or contact support.` },
        { status: 403 }
      );
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

    const flow = await prisma.flow.create({
      data: {
        tenantId,
        name,
        description,
        status: "DRAFT",
        nodes: JSON.stringify(defaultNodes),
        edges: JSON.stringify(defaultEdges),
      },
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        tenantId,
        userId: session.userId,
        action: "FLOW_CREATED",
        details: JSON.stringify({ flowId: flow.id, name: flow.name }),
      },
    });

    return NextResponse.json({ success: true, flow });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to create flow" }, { status: 500 });
  }
}
