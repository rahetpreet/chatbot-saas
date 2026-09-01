import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireTenantRole } from "@/lib/services/auth/session";
import { validateFlowGraph } from "@/lib/services/flow/validation";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { tenantId } = await requireTenantRole(["CLIENT_OWNER", "CLIENT_ADMIN", "CLIENT_AGENT", "CLIENT_VIEWER"]);
    const { id } = await params;
    const flow = await prisma.flow.findFirst({ where: { id, tenantId, deletedAt: null }, include: { _count: { select: { conversations: true, analyticsEvents: true } } } });
    if (!flow) return NextResponse.json({ error: "Flow not found" }, { status: 404 });
    return NextResponse.json({ flow });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Unauthorized" }, { status: 403 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { tenantId, session } = await requireTenantRole(["CLIENT_OWNER", "CLIENT_ADMIN"]);
    const { id } = await params;
    const existing = await prisma.flow.findFirst({ where: { id, tenantId, deletedAt: null } });
    if (!existing) return NextResponse.json({ error: "Flow not found" }, { status: 404 });
    const body = await req.json();
    const updateData: Record<string, unknown> = {};
    if (typeof body.name === "string" && body.name.trim()) updateData.name = body.name.trim().slice(0, 160);
    if (typeof body.description === "string") updateData.description = body.description.slice(0, 2_000);
    const nodes = body.nodes === undefined ? undefined : typeof body.nodes === "string" ? JSON.parse(body.nodes) : body.nodes;
    const edges = body.edges === undefined ? undefined : typeof body.edges === "string" ? JSON.parse(body.edges) : body.edges;
    if (nodes !== undefined || edges !== undefined) {
      const graphErrors = validateFlowGraph(nodes ?? JSON.parse(existing.nodes), edges ?? JSON.parse(existing.edges));
      if (graphErrors.length) return NextResponse.json({ error: "Flow validation failed", details: graphErrors }, { status: 400 });
      if (nodes !== undefined) updateData.nodes = JSON.stringify(nodes);
      if (edges !== undefined) updateData.edges = JSON.stringify(edges);
    }
    if (body.isDefault === true) updateData.isDefault = true;
    const flow = await prisma.$transaction(async (tx) => {
      if (body.isDefault === true) await tx.flow.updateMany({ where: { tenantId, id: { not: id } }, data: { isDefault: false } });
      const updated = await tx.flow.update({ where: { id }, data: updateData });
      await tx.auditLog.create({ data: { tenantId, userId: session.userId, action: "FLOW_UPDATED", details: JSON.stringify({ flowId: id }) } });
      return updated;
    });
    return NextResponse.json({ success: true, flow });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Update failed" }, { status: 400 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { tenantId, session } = await requireTenantRole(["CLIENT_OWNER", "CLIENT_ADMIN"]);
    const { id } = await params;
    const result = await prisma.$transaction(async (tx) => {
      const updated = await tx.flow.updateMany({ where: { id, tenantId, deletedAt: null }, data: { deletedAt: new Date(), status: "ARCHIVED", isDefault: false } });
      if (updated.count) await tx.auditLog.create({ data: { tenantId, userId: session.userId, action: "FLOW_ARCHIVED", details: JSON.stringify({ flowId: id }) } });
      return updated;
    });
    if (!result.count) return NextResponse.json({ error: "Flow not found" }, { status: 404 });
    return NextResponse.json({ success: true, message: "Flow archived" });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Delete failed" }, { status: 400 });
  }
}
