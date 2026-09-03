import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireTenantRole } from "@/lib/services/auth/session";
import Papa from "papaparse";
import { slugify, generateRandomId } from "@/lib/utils";
import { assertUsageAvailable } from "@/lib/services/subscription/planLimits";
import { normalizeEmail, normalizeName, normalizePhone } from "@/lib/services/contact/normalize";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { tenantId, session } = await requireTenantRole(["CLIENT_OWNER", "CLIENT_ADMIN"]);
    const { id: campaignId } = await params;
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const csvContent = formData.get("csvText") as string | null;

    let textToParse = "";

    if (file) {
      // Vercel caps a serverless request body at ~4.5 MB, so this is the
      // platform ceiling rather than a product limit. Roughly 60,000 contact
      // rows fit inside it.
      if (file.size > 4 * 1024 * 1024) return NextResponse.json({ success: false, error: { code: "FILE_TOO_LARGE", message: "CSV must be under 4 MB per upload. Split larger files and import them in batches." } }, { status: 413 });
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
    await assertUsageAvailable(tenantId, "campaigns", rows.length);
    const createdContacts = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      // Search for common field headers (case-insensitive)
      const keys = Object.keys(row);
      const nameKey = keys.find((k) => /name/i.test(k));
      const emailKey = keys.find((k) => /email/i.test(k));
      const phoneKey = keys.find((k) => /phone|mobile/i.test(k));
      const idKey = keys.find((k) => /id|identifier|contact_id/i.test(k));

      // Normalised on the way in, so an imported contact and one captured by
      // the widget de-duplicate against each other instead of both existing.
      const name = nameKey ? normalizeName(row[nameKey]) : undefined;
      const email = emailKey ? normalizeEmail(row[emailKey]) : undefined;
      const phone = phoneKey ? normalizePhone(row[phoneKey]) : undefined;
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

    await prisma.auditLog.create({ data: { tenantId, userId: session.userId, action: "CONTACT_IMPORTED", details: JSON.stringify({ campaignId, imported: createdContacts.length }) } });
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
