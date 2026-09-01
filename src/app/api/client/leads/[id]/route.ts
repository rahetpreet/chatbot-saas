import { NextRequest, NextResponse } from "next/server";
import { LeadRepository } from "@/lib/repositories/leadRepository";
import { requireTenantRole } from "@/lib/services/auth/session";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { tenantId } = await requireTenantRole(["CLIENT_OWNER", "CLIENT_ADMIN", "CLIENT_AGENT", "CLIENT_VIEWER"]);
    const { id } = await params;

    const lead = await LeadRepository.findById(tenantId, id);
    if (!lead) {
      return NextResponse.json({ success: false, error: { code: "NOT_FOUND", message: "Lead not found" } }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: { lead }, lead });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: { code: "FORBIDDEN", message: error.message || "Unauthorized" } }, { status: 403 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { tenantId } = await requireTenantRole(["CLIENT_OWNER", "CLIENT_ADMIN", "CLIENT_AGENT"]);
    const { id } = await params;
    const body = await req.json();

    const { status, score, notes, assignedUserId } = body;

    await LeadRepository.update(tenantId, id, {
      status: status || undefined,
      score: score !== undefined ? score : undefined,
      notes: notes || undefined,
      assignedUserId: assignedUserId || undefined,
    });

    const updatedLead = await LeadRepository.findById(tenantId, id);
    return NextResponse.json({ success: true, data: { lead: updatedLead }, lead: updatedLead });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: { code: "INVALID_REQUEST", message: error.message || "Failed to update lead" } }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { tenantId } = await requireTenantRole(["CLIENT_OWNER", "CLIENT_ADMIN"]);
    const { id } = await params;

    await LeadRepository.delete(tenantId, id);
    return NextResponse.json({ success: true, data: { message: "Lead deleted successfully" } });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: { code: "INVALID_REQUEST", message: error.message || "Failed to delete lead" } }, { status: 400 });
  }
}
