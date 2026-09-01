import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { FlowRepository } from "@/lib/repositories/flowRepository";
import { requireTenantRole } from "@/lib/services/auth/session";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { tenantId, session } = await requireTenantRole(["CLIENT_OWNER", "CLIENT_ADMIN"]);
    const { id } = await params;

    const flow = await FlowRepository.findById(tenantId, id);
    if (!flow) {
      return NextResponse.json({ success: false, error: { code: "NOT_FOUND", message: "Chatbot not found" } }, { status: 404 });
    }

    // Validate flow structure
    let nodes, edges;
    try {
      nodes = JSON.parse(flow.nodes);
      edges = JSON.parse(flow.edges);
    } catch {
      return NextResponse.json({ success: false, error: { code: "INVALID_FLOW", message: "Invalid flow structure" } }, { status: 400 });
    }

    // Basic validation
    if (!Array.isArray(nodes) || !Array.isArray(edges)) {
      return NextResponse.json({ success: false, error: { code: "INVALID_FLOW", message: "Flow must have valid nodes and edges" } }, { status: 400 });
    }

    const hasStartNode = nodes.some((node: any) => node.type === "start");
    if (!hasStartNode) {
      return NextResponse.json({ success: false, error: { code: "INVALID_FLOW", message: "Flow must have a start node" } }, { status: 400 });
    }

    // Publish the flow
    const updatedFlow = await prisma.$transaction(async (tx) => {
      const updated = await tx.flow.update({
        where: { id },
        data: {
          status: "PUBLISHED",
          publishedNodes: flow.nodes,
          publishedEdges: flow.edges,
        },
      });

      await tx.auditLog.create({
        data: {
          tenantId,
          userId: session.userId,
          action: "BOT_PUBLISHED",
          details: JSON.stringify({ flowId: id, name: updated.name }),
        },
      });

      return updated;
    });

    return NextResponse.json({ success: true, data: { chatbot: updatedFlow }, chatbot: updatedFlow });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: { code: "INVALID_REQUEST", message: error.message || "Failed to publish chatbot" } }, { status: 400 });
  }
}
