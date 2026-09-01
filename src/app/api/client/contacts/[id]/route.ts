import { NextRequest, NextResponse } from "next/server";
import { ContactRepository } from "@/lib/repositories/contactRepository";
import { requireTenantRole } from "@/lib/services/auth/session";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { tenantId } = await requireTenantRole(["CLIENT_OWNER", "CLIENT_ADMIN", "CLIENT_AGENT", "CLIENT_VIEWER"]);
    const { id } = await params;

    const contact = await ContactRepository.findById(tenantId, id);
    if (!contact) {
      return NextResponse.json({ success: false, error: { code: "NOT_FOUND", message: "Contact not found" } }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: { contact }, contact });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: { code: "FORBIDDEN", message: error.message || "Unauthorized" } }, { status: 403 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { tenantId } = await requireTenantRole(["CLIENT_OWNER", "CLIENT_ADMIN", "CLIENT_AGENT"]);
    const { id } = await params;
    const body = await req.json();

    const { name, email, phone, company } = body;

    await ContactRepository.update(tenantId, id, {
      name: name || undefined,
      email: email || undefined,
      phone: phone || undefined,
      company: company || undefined,
    });

    const updatedContact = await ContactRepository.findById(tenantId, id);
    return NextResponse.json({ success: true, data: { contact: updatedContact }, contact: updatedContact });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: { code: "INVALID_REQUEST", message: error.message || "Failed to update contact" } }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { tenantId } = await requireTenantRole(["CLIENT_OWNER", "CLIENT_ADMIN"]);
    const { id } = await params;

    await ContactRepository.delete(tenantId, id);
    return NextResponse.json({ success: true, data: { message: "Contact deleted successfully" } });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: { code: "INVALID_REQUEST", message: error.message || "Failed to delete contact" } }, { status: 400 });
  }
}
