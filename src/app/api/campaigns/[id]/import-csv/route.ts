import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireTenantAccess } from "@/lib/services/auth/session";
import Papa from "papaparse";
import { slugify, generateRandomId } from "@/lib/utils";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { tenantId } = await requireTenantAccess();
    const { id: campaignId } = await params;
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const csvContent = formData.get("csvText") as string | null;

    let textToParse = "";

    if (file) {
      const buffer = await file.arrayBuffer();
      textToParse = Buffer.from(buffer).toString("utf-8");
    } else if (csvContent) {
      textToParse = csvContent;
    } else {
      return NextResponse.json({ error: "No CSV file or content provided" }, { status: 400 });
    }

    const campaign = await prisma.campaign.findFirst({
      where: { id: campaignId, tenantId },
    });

    if (!campaign) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }

    const parsed = Papa.parse(textToParse, {
      header: true,
      skipEmptyLines: true,
    });

    if (parsed.errors.length > 0 && parsed.data.length === 0) {
      return NextResponse.json({ error: "Failed to parse CSV file format" }, { status: 400 });
    }

    const rows = parsed.data as Array<Record<string, string>>;
    const createdContacts = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      // Search for common field headers (case-insensitive)
      const keys = Object.keys(row);
      const nameKey = keys.find((k) => /name/i.test(k));
      const emailKey = keys.find((k) => /email/i.test(k));
      const phoneKey = keys.find((k) => /phone|mobile/i.test(k));
      const idKey = keys.find((k) => /id|identifier|contact_id/i.test(k));

      const name = nameKey ? row[nameKey]?.trim() : undefined;
      const email = emailKey ? row[emailKey]?.trim() : undefined;
      const phone = phoneKey ? row[phoneKey]?.trim() : undefined;
      const identifier = (idKey ? row[idKey]?.trim() : null) || `contact_${Date.now()}_${i + 1}`;

      const namePart = name ? slugify(name).substring(0, 20) : "c";
      const customUrlSlug = `${namePart}-${generateRandomId(6)}`;

      const contact = await prisma.campaignContact.create({
        data: {
          campaignId,
          tenantId,
          contactIdentifier: identifier,
          name: name || null,
          email: email || null,
          phone: phone || null,
          customUrlSlug,
          metadata: JSON.stringify(row),
        },
      });

      createdContacts.push(contact);
    }

    return NextResponse.json({
      success: true,
      count: createdContacts.length,
      contacts: createdContacts,
      message: `Successfully generated ${createdContacts.length} personalized trackable chat links.`,
    });
  } catch (error: any) {
    console.error("CSV import error:", error);
    return NextResponse.json({ error: error.message || "Failed to import CSV" }, { status: 500 });
  }
}
