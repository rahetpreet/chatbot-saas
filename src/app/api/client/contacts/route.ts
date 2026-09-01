import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireTenantRole } from "@/lib/services/auth/session";

export async function GET(req: NextRequest) {
  try {
    const { tenantId } = await requireTenantRole(["CLIENT_OWNER", "CLIENT_ADMIN", "CLIENT_AGENT", "CLIENT_VIEWER"]);
    const { searchParams } = new URL(req.url);
    const search = searchParams.get("search")?.trim().slice(0, 100);

    const where: Record<string, any> = { tenantId, deletedAt: null };
    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
        { phone: { contains: search, mode: "insensitive" } },
        { company: { contains: search, mode: "insensitive" } },
      ];
    }

    const contacts = await prisma.contact.findMany({
      where,
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ success: true, data: { contacts }, contacts });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: { code: "FORBIDDEN", message: error.message || "Unauthorized" } }, { status: 403 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { tenantId } = await requireTenantRole(["CLIENT_OWNER", "CLIENT_ADMIN", "CLIENT_AGENT"]);
    const body = await req.json();

    const name = typeof body.name === "string" ? body.name.trim() : null;
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : null;
    const phone = typeof body.phone === "string" ? body.phone.trim() : null;
    const company = typeof body.company === "string" ? body.company.trim() : null;
    const source = typeof body.source === "string" ? body.source.trim() : "manual";

    if (!name && !email && !phone) {
      return NextResponse.json({ success: false, error: { code: "VALIDATION_ERROR", message: "At least one identifier (name, email, or phone) is required." } }, { status: 400 });
    }

    const contact = await prisma.contact.create({
      data: {
        tenantId,
        name,
        email,
        phone,
        company,
        source,
      },
    });

    return NextResponse.json({ success: true, data: { contact }, contact }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: { code: "INVALID_REQUEST", message: error.message || "Failed to create contact." } }, { status: 400 });
  }
}
