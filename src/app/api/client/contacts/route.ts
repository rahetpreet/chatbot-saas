import { NextRequest, NextResponse } from "next/server";
import { ContactRepository } from "@/lib/repositories/contactRepository";
import { requireTenantRole } from "@/lib/services/auth/session";
import { validateRequest, createContactSchema } from "@/lib/validation";

export async function GET(req: NextRequest) {
  try {
    const { tenantId } = await requireTenantRole(["CLIENT_OWNER", "CLIENT_ADMIN", "CLIENT_VIEWER"]);
    const { searchParams } = new URL(req.url);
    const search = searchParams.get("search")?.trim().slice(0, 100);

    const contacts = await ContactRepository.findByTenant(tenantId, { search });

    return NextResponse.json({ success: true, data: { contacts }, contacts });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: { code: "FORBIDDEN", message: error.message || "Unauthorized" } }, { status: 403 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { tenantId } = await requireTenantRole(["CLIENT_OWNER", "CLIENT_ADMIN"]);
    const body = await req.json();
    
    const validation = await validateRequest(createContactSchema, body);
    if (!validation.success) {
      return NextResponse.json({ success: false, error: { code: "VALIDATION_ERROR", message: validation.error } }, { status: 400 });
    }

    const contact = await ContactRepository.create(tenantId, validation.data);

    return NextResponse.json({ success: true, data: { contact }, contact }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: { code: "INVALID_REQUEST", message: error.message || "Failed to create contact." } }, { status: 400 });
  }
}
