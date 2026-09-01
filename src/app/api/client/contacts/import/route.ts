import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireTenantRole } from "@/lib/services/auth/session";
import Papa from "papaparse";

export async function POST(req: NextRequest) {
  try {
    const { tenantId, session } = await requireTenantRole(["CLIENT_OWNER", "CLIENT_ADMIN"]);
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const csvContent = formData.get("csvText") as string | null;

    let textToParse = "";

    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        return NextResponse.json({ success: false, error: { code: "VALIDATION_ERROR", message: "CSV file exceeds the 5 MB limit" } }, { status: 400 });
      }
      const buffer = await file.arrayBuffer();
      textToParse = Buffer.from(buffer).toString("utf-8");
    } else if (csvContent) {
      textToParse = csvContent;
    } else {
      return NextResponse.json({ success: false, error: { code: "VALIDATION_ERROR", message: "No CSV file or content provided" } }, { status: 400 });
    }

    const parsed = Papa.parse(textToParse, {
      header: true,
      skipEmptyLines: true,
    });

    if (parsed.errors.length > 0 && parsed.data.length === 0) {
      return NextResponse.json({ success: false, error: { code: "VALIDATION_ERROR", message: "Failed to parse CSV format" } }, { status: 400 });
    }

    const rows = parsed.data as Array<Record<string, string>>;
    if (rows.length > 2000) {
      return NextResponse.json({ success: false, error: { code: "LIMIT_EXCEEDED", message: "CSV import is limited to 2,000 rows per batch" } }, { status: 400 });
    }

    let imported = 0;
    let updated = 0;
    let duplicates = 0;
    let invalid = 0;
    let failed = 0;

    for (let i = 0; i < rows.length; i++) {
      try {
        const row = rows[i];
        const keys = Object.keys(row);
        const nameKey = keys.find((k) => /name/i.test(k));
        const emailKey = keys.find((k) => /email/i.test(k));
        const phoneKey = keys.find((k) => /phone|mobile/i.test(k));
        const companyKey = keys.find((k) => /company|org/i.test(k));

        const name = nameKey ? row[nameKey]?.trim() : undefined;
        const email = emailKey ? row[emailKey]?.trim().toLowerCase() : undefined;
        const phone = phoneKey ? row[phoneKey]?.trim() : undefined;
        const company = companyKey ? row[companyKey]?.trim() : undefined;

        if (!name && !email && !phone) {
          invalid++;
          continue;
        }

        // Check if contact already exists for this tenant by email or phone
        let existing = null;
        if (email) {
          existing = await prisma.contact.findFirst({
            where: { tenantId, email, deletedAt: null },
          });
        }
        if (!existing && phone) {
          existing = await prisma.contact.findFirst({
            where: { tenantId, phone, deletedAt: null },
          });
        }

        if (existing) {
          duplicates++;
          await prisma.contact.update({
            where: { id: existing.id },
            data: {
              name: name || existing.name,
              company: company || existing.company,
            },
          });
          updated++;
        } else {
          await prisma.contact.create({
            data: {
              tenantId,
              name: name || null,
              email: email || null,
              phone: phone || null,
              company: company || null,
              source: "csv_import",
            },
          });
          imported++;
        }
      } catch {
        failed++;
      }
    }

    await prisma.auditLog.create({
      data: {
        tenantId,
        userId: session.userId,
        action: "CONTACT_IMPORTED",
        details: JSON.stringify({ total: rows.length, imported, updated, duplicates, invalid, failed }),
      },
    });

    const summary = {
      total: rows.length,
      imported,
      updated,
      duplicates,
      invalid,
      failed,
    };

    return NextResponse.json({
      success: true,
      data: summary,
      summary,
    });
  } catch (error: any) {
    console.error("Contact import error:", error);
    return NextResponse.json({ success: false, error: { code: "INVALID_REQUEST", message: error.message || "Failed to import CSV" } }, { status: 500 });
  }
}
