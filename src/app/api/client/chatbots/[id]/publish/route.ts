import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireTenantRole } from "@/lib/services/auth/session";
import { validateFlowGraph } from "@/lib/services/flow/validation";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { tenantId, session } = await requireTenantRole(["CLIENT_OWNER", "CLIENT_ADMIN"]);
    const { id } = await params;

    const flow = await prisma.flow.findFirst({
      where: { id, tenantId, deletedAt: null },
    });

    if (!flow) {
      return NextResponse.json({ success: false, error: { code: "NOT_FOUND", message: "Chatbot not found" } }, { status: 404 });
    }

    let nodes = [];
    let edges = [];
    try {
      nodes = JSON.parse(flow.nodes);
      edges = JSON.parse(flow.edges);
    } catch {
      return NextResponse.json({ success: false, error: { code: "VALIDATION_ERROR", message: "Invalid flow data format." } }, { status: 400 });
    }

    const errors = validateFlowGraph(nodes, edges);
    if (errors.length > 0) {
      return NextResponse.json({ success: false, error: { code: "VALIDATION_ERROR", message: errors[0], details: errors } }, { status: 400 });
    }

    const updated = await prisma.$transaction(async (tx) => {
      const published = await tx.flow.update({
        where: { id },
        data: {
          status: "PUBLISHED",
          version: flow.version + 1,
          publishedNodes: flow.nodes,
          publishedEdges: flow.edges,
        },
      });

      await tx.auditLog.create({
        data: {
          tenantId,
          userId: session.userId,
          action: "BOT_PUBLISHED",
          details: JSON.stringify({ flowId: id, version: published.version }),
        },
      });

      return published;
    });

    return NextResponse.json({
      success: true,
      data: { flow: updated },
      flow: updated,
      message: `Chatbot version ${updated.version} published successfully.`,
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: { code: "INVALID_REQUEST", message: error.message || "Publish failed" } }, { status: 400 });
  }
}
