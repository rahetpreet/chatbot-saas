import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireTenantAccess } from "@/lib/services/auth/session";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { tenantId, session } = await requireTenantAccess();
    const { id } = await params;

    const flow = await prisma.flow.findFirst({
      where: { id, tenantId },
    });

    if (!flow) {
      return NextResponse.json({ error: "Flow not found" }, { status: 404 });
    }

    // Snapshot current draft nodes & edges into published fields
    const updated = await prisma.flow.update({
      where: { id },
      data: {
        status: "PUBLISHED",
        version: flow.version + 1,
        publishedNodes: flow.nodes,
        publishedEdges: flow.edges,
      },
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        tenantId,
        userId: session.userId,
        action: "FLOW_PUBLISHED",
        details: JSON.stringify({ flowId: flow.id, version: updated.version }),
      },
    });

    return NextResponse.json({
      success: true,
      message: `Flow version ${updated.version} published successfully!`,
      flow: updated,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Publish failed" }, { status: 500 });
  }
}
