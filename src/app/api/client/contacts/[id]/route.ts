import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireTenantRole } from "@/lib/services/auth/session";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { tenantId } = await requireTenantRole(["CLIENT_OWNER", "CLIENT_ADMIN", "CLIENT_AGENT"]);
    const { id } = await params;
    const body = await req.json();

    const updateData: Record<string, any> = {};
    if (typeof body.name === "string") updateData.name = body.name.trim();
    if (typeof body.email === "string") updateData.email = body.email.trim().toLowerCase();
    if (typeof body.phone === "string") updateData.phone = body.phone.trim();
    if (typeof body.company === "string") updateData.company = body.company.trim();
    if (typeof body.source === "string") updateData.source = body.source.trim();

    const contact = await prisma.contact.updateMany({
      where: { id, tenantId, deletedAt: null },
      data: updateData,
    });

    if (!contact.count) {
      return NextResponse.json({ success: false, error: { code: "NOT_FOUND", message: "Contact not found" } }, { status: 404 });
    }

    return NextResponse.json({ success: true, message: "Contact updated successfully." });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: { code: "INVALID_REQUEST", message: error.message || "Failed to update contact." } }, { status: 400 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { tenantId } = await requireTenantRole(["CLIENT_OWNER", "CLIENT_ADMIN"]);
    const { id } = await params;

    const contact = await prisma.contact.updateMany({
      where: { id, tenantId, deletedAt: null },
      data: { deletedAt: new Date() },
    });

    if (!contact.count) {
      return NextResponse.json({ success: false, error: { code: "NOT_FOUND", message: "Contact not found" } }, { status: 404 });
    }

    return NextResponse.json({ success: true, message: "Contact deleted successfully." });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: { code: "INVALID_REQUEST", message: error.message || "Failed to delete contact." } }, { status: 400 });
  }
}
