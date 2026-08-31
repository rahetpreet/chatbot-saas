import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireTenantAccess } from "@/lib/services/auth/session";
import Papa from "papaparse";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { tenantId } = await requireTenantAccess();

    const campaign = await prisma.campaign.findFirst({
      where: {
        id,
        tenantId,
      },
      include: {
        tenant: true,
        contacts: true, // Fetch all contacts
      },
    });

    if (!campaign) {
      return NextResponse.json(
        { error: "Campaign not found" },
        { status: 404 }
      );
    }

    // Build the origin from headers
    const protocol = req.headers.get("x-forwarded-proto") || "http";
    const host = req.headers.get("host") || "localhost:3000";
    const origin = `${protocol}://${host}`;

    // Map contacts to CSV format
    const csvData = campaign.contacts.map((contact) => ({
      "Name": contact.name || "",
      "Email": contact.email || "",
      "Phone": contact.phone || "",
      "Contact Identifier": contact.contactIdentifier || "",
      "Custom URL Slug": contact.customUrlSlug || "",
      "Unique Chat Link": `${origin}/c/${campaign.tenant.slug}?campaign=${campaign.slug}&contact=${contact.customUrlSlug}`,
      "Status": contact.status || "",
      "Opens Count": contact.opensCount || 0,
      "First Opened": contact.firstOpenedAt ? contact.firstOpenedAt.toISOString() : "",
      "Last Opened": contact.lastOpenedAt ? contact.lastOpenedAt.toISOString() : "",
    }));

    const csv = Papa.unparse(csvData);

    const filename = `campaign-${campaign.slug}-contacts.csv`;

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error("Failed to export campaign contacts:", error);
    return NextResponse.json(
      { error: "Failed to export contacts" },
      { status: 500 }
    );
  }
}
