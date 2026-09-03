import { NextRequest, NextResponse } from "next/server";
import Papa from "papaparse";
import { ContactRepository } from "@/lib/repositories/contactRepository";
import { requireTenantRole } from "@/lib/services/auth/session";

export async function GET(req: NextRequest) {
  try {
    const { tenantId } = await requireTenantRole(["CLIENT_OWNER", "CLIENT_ADMIN", "CLIENT_AGENT", "CLIENT_VIEWER"]);
    const { searchParams } = new URL(req.url);
    const format = searchParams.get("format") === "json" ? "json" : "csv";
    const search = searchParams.get("search")?.trim().slice(0, 100);
    const contacts = await ContactRepository.findByTenant(tenantId, { search });

    if (format === "json") {
      return new NextResponse(JSON.stringify(contacts, null, 2), {
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Content-Disposition": `attachment; filename="contacts_${Date.now()}.json"`,
        },
      });
    }

    const csv = Papa.unparse(contacts.map((contact) => ({
      Name: contact.name || "",
      Email: contact.email || "",
      Phone: contact.phone || "",
      Company: contact.company || "",
      Source: contact.source || "",
      "Created At": contact.createdAt.toISOString(),
      "Updated At": contact.updatedAt.toISOString(),
    })));
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="contacts_${Date.now()}.csv"`,
      },
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: { code: "FORBIDDEN", message: error.message || "Unable to export contacts." } }, { status: 403 });
  }
}
