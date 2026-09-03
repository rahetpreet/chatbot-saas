import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireTenantRole } from "@/lib/services/auth/session";

export async function GET(req: NextRequest) {
  try {
    const { tenantId } = await requireTenantRole(["CLIENT_OWNER", "CLIENT_ADMIN", "CLIENT_AGENT", "CLIENT_VIEWER"]);
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");
    const search = searchParams.get("search")?.slice(0, 160);
    const where: Record<string, unknown> = { tenantId, deletedAt: null };
    if (status && status !== "ALL") where.status = status;
    if (search) where.OR = [{ name: { contains: search, mode: "insensitive" } }, { email: { contains: search, mode: "insensitive" } }, { phone: { contains: search, mode: "insensitive" } }];
    const leads = await prisma.lead.findMany({ where, orderBy: { createdAt: "desc" }, include: { conversation: { select: { id: true, sessionStatus: true, startedAt: true, flow: { select: { name: true } } } } } });
    return NextResponse.json({ leads });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Unauthorized" }, { status: 403 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const { tenantId, session } = await requireTenantRole(["CLIENT_OWNER", "CLIENT_ADMIN", "CLIENT_AGENT"]);
    const { id, status, score, contactInfo, collectedFields } = await req.json();
    if (typeof id !== "string") return NextResponse.json({ error: "Lead ID is required" }, { status: 400 });
    const data: Record<string, unknown> = {};
    if (typeof status === "string") data.status = status;
    if (score !== undefined && Number.isFinite(Number(score))) data.score = Number(score);
    if (contactInfo !== undefined) data.contactInfo = typeof contactInfo === "string" ? contactInfo : JSON.stringify(contactInfo);
    if (collectedFields !== undefined) data.collectedFields = typeof collectedFields === "string" ? collectedFields : JSON.stringify(collectedFields);
    const result = await prisma.$transaction(async (tx) => {
      const updated = await tx.lead.updateMany({ where: { id, tenantId, deletedAt: null }, data });
      if (updated.count) await tx.auditLog.create({ data: { tenantId, userId: session.userId, action: "LEAD_UPDATED", details: JSON.stringify({ leadId: id }) } });
      return updated;
    });
    if (!result.count) return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    return NextResponse.json({ success: true, count: result.count });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Update failed" }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { tenantId, session } = await requireTenantRole(["CLIENT_OWNER", "CLIENT_ADMIN"]);
    const id = new URL(req.url).searchParams.get("id");
    if (!id) return NextResponse.json({ error: "Lead ID is required" }, { status: 400 });
    const result = await prisma.$transaction(async (tx) => {
      const updated = await tx.lead.updateMany({ where: { id, tenantId, deletedAt: null }, data: { deletedAt: new Date() } });
      if (updated.count) await tx.auditLog.create({ data: { tenantId, userId: session.userId, action: "LEAD_ARCHIVED", details: JSON.stringify({ leadId: id }) } });
      return updated;
    });
    if (!result.count) return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    return NextResponse.json({ success: true, message: "Lead archived" });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Delete failed" }, { status: 400 });
  }
}
