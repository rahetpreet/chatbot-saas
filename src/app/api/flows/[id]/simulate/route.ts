import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireTenantAccess } from "@/lib/services/auth/session";
import { FlowEngine } from "@/lib/services/engine/flowEngine";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { tenantId } = await requireTenantAccess();
    const { id } = await params;
    const body = await req.json();

    const { nodes, edges, state, userInput } = body;

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { aiConfig: true },
    });

    const parsedNodes = Array.isArray(nodes) ? nodes : JSON.parse(nodes || "[]");
    const parsedEdges = Array.isArray(edges) ? edges : JSON.parse(edges || "[]");

    const engine = new FlowEngine(parsedNodes, parsedEdges, tenantId, tenant?.aiConfig);

    const currentState = state || {
      tenantId,
      currentNodeId: null,
      collectedData: {},
      sessionStatus: "ACTIVE",
      history: [],
    };

    const stepResult = await engine.processInput(currentState, userInput);

    return NextResponse.json({
      success: true,
      result: stepResult,
    });
  } catch (error: any) {
    console.error("Simulation error:", error);
    return NextResponse.json({ error: error.message || "Simulation failed" }, { status: 500 });
  }
}
