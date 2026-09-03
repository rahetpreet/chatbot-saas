import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireTenantRole } from "@/lib/services/auth/session";
import { validateFlowGraph } from "@/lib/services/flow/validation";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { tenantId, session } = await requireTenantRole(["CLIENT_OWNER", "CLIENT_ADMIN"]);
    const { id } = await params;
    const flow = await prisma.flow.findFirst({ where: { id, tenantId, deletedAt: null } });
    if (!flow) return NextResponse.json({ error: "Flow not found" }, { status: 404 });
    const errors = validateFlowGraph(JSON.parse(flow.nodes), JSON.parse(flow.edges));
    if (errors.length) return NextResponse.json({ error: "Flow validation failed", details: errors }, { status: 400 });
    const updated = await prisma.$transaction(async (tx) => {
      const existingDefault = await tx.flow.findFirst({
        where: { tenantId, id: { not: id }, status: "PUBLISHED", isDefault: true, deletedAt: null },
        select: { id: true },
      });
      // A tenant's first published flow must be usable immediately. Existing
      // default selections remain unchanged unless this flow was selected as
      // the default while it was still a draft.
      const shouldBecomeDefault = flow.isDefault || !existingDefault;
      if (shouldBecomeDefault) {
        await tx.flow.updateMany({ where: { tenantId, id: { not: id }, isDefault: true }, data: { isDefault: false } });
      }
      const published = await tx.flow.update({ where: { id }, data: { status: "PUBLISHED", version: flow.version + 1, publishedNodes: flow.nodes, publishedEdges: flow.edges, isDefault: shouldBecomeDefault } });
      await tx.auditLog.create({ data: { tenantId, userId: session.userId, action: "FLOW_PUBLISHED", details: JSON.stringify({ flowId: id, version: published.version }) } });
      return published;
    });
    return NextResponse.json({ success: true, message: `Flow version ${updated.version} published successfully.`, flow: updated });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Publish failed" }, { status: 400 });
  }
}
