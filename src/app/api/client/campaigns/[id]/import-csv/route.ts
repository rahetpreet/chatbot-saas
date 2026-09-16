import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireTenantRole } from "@/lib/services/auth/session";
import Papa from "papaparse";
import { slugify, generateRandomId } from "@/lib/utils";
import { normalizeEmail, normalizeName, normalizePhone } from "@/lib/services/contact/normalize";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Contact import.
 *
 * Accepts either a whole small CSV, or one batch of already-parsed rows from a
 * browser that is streaming a large file. The batch form is what makes a
 * million-row import possible at all:
 *
 *  - A serverless request body is capped around 4.5 MB, so a 100 MB CSV can
 *    never be posted in one piece. The browser parses it locally and sends
 *    batches instead, each a few hundred kilobytes.
 *  - A function is killed at 60 seconds. Ten lakh rows cannot be inserted
 *    inside one request whatever the body limit, so the work is spread across
 *    many short requests that the browser drives.
 *  - The previous version inserted one row per round trip. At a million rows
 *    and one database connection that is hours of serial work; `createMany`
 *    turns each batch into a single insert.
 */

/** Rows per insert. Large enough to be fast, small enough to stay well under the body cap. */
const MAX_ROWS_PER_BATCH = 2_000;

/**
 * Slug length.
 *
 * Six characters of a 36-character alphabet is 2.2 billion combinations, which
 * sounds ample until you insert a million rows: by the birthday bound that is
 * around 229 expected collisions, and since the column is unique each one
 * silently costs a contact. Twelve characters makes a collision vanishingly
 * unlikely at any volume this product will see.
 */
const SLUG_LENGTH = 12;

interface PreparedContact {
  campaignId: string;
  tenantId: string;
  contactIdentifier: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  customUrlSlug: string;
  metadata: string | null;
}

/** Finds the column holding a given field, whatever the author called it. */
function columnFor(keys: string[], pattern: RegExp): string | undefined {
  return keys.find((key) => pattern.test(key));
}

function prepare(
  rows: Array<Record<string, string>>,
  campaignId: string,
  tenantId: string,
  startIndex: number,
): PreparedContact[] {
  const prepared: PreparedContact[] = [];
  // Guards against two rows in the same batch drawing the same slug, which the
  // database would reject for the whole insert rather than just that row.
  const used = new Set<string>();

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row || typeof row !== "object") continue;

    const keys = Object.keys(row);
    const nameKey = columnFor(keys, /name/i);
    const emailKey = columnFor(keys, /email/i);
    const phoneKey = columnFor(keys, /phone|mobile|contact.?number|whatsapp/i);
    const idKey = columnFor(keys, /^(id|identifier|contact_?id)$/i);

    // Normalised on the way in, so an imported contact and one captured by the
    // widget de-duplicate against each other instead of both existing.
    const name = nameKey ? normalizeName(row[nameKey]) : null;
    const email = emailKey ? normalizeEmail(row[emailKey]) : null;
    const phone = phoneKey ? normalizePhone(row[phoneKey]) : null;

    // A row with no way to reach anybody is noise, not a contact.
    if (!name && !email && !phone) continue;

    const identifier =
      (idKey ? String(row[idKey] ?? "").trim() : "") || `c_${startIndex + i + 1}_${generateRandomId(6)}`;

    const namePart = name ? slugify(name).substring(0, 20) : "c";
    let slug = `${namePart}-${generateRandomId(SLUG_LENGTH)}`;
    while (used.has(slug)) slug = `${namePart}-${generateRandomId(SLUG_LENGTH)}`;
    used.add(slug);

    prepared.push({
      campaignId,
      tenantId,
      contactIdentifier: identifier.slice(0, 190),
      name: name || null,
      email: email || null,
      phone: phone || null,
      customUrlSlug: slug,
      // Capped: a spreadsheet with ninety columns would otherwise store the
      // entire sheet again for every single contact.
      metadata: JSON.stringify(row).slice(0, 2000),
    });
  }

  return prepared;
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { tenantId, session } = await requireTenantRole(["CLIENT_OWNER", "CLIENT_ADMIN"]);
    const { id: campaignId } = await params;

    const campaign = await prisma.campaign.findFirst({
      where: { id: campaignId, tenantId, deletedAt: null },
      select: { id: true },
    });
    if (!campaign) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "Campaign not found." } },
        { status: 404 },
      );
    }

    const contentType = req.headers.get("content-type") || "";
    let rows: Array<Record<string, string>> = [];
    let startIndex = 0;
    let isFinalBatch = true;

    if (contentType.includes("application/json")) {
      // The batch path: a browser streaming a large file sends parsed rows.
      const body = await req.json();
      rows = Array.isArray(body.rows) ? body.rows : [];
      startIndex = Number.isFinite(body.startIndex) ? Number(body.startIndex) : 0;
      isFinalBatch = body.final !== false;

      if (rows.length > MAX_ROWS_PER_BATCH) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: "BATCH_TOO_LARGE",
              message: `Send at most ${MAX_ROWS_PER_BATCH.toLocaleString()} rows per batch.`,
            },
          },
          { status: 413 },
        );
      }
    } else {
      // The whole-file path, kept for small imports and pasted text.
      const formData = await req.formData();
      const file = formData.get("file") as File | null;
      const csvContent = formData.get("csvText") as string | null;

      let text = "";
      if (file) {
        if (file.size > 4 * 1024 * 1024) {
          return NextResponse.json(
            {
              success: false,
              error: {
                code: "FILE_TOO_LARGE",
                message:
                  "This file is too large to send in one piece. Import it from the campaign screen, which streams large files automatically.",
              },
            },
            { status: 413 },
          );
        }
        text = Buffer.from(await file.arrayBuffer()).toString("utf-8");
      } else if (csvContent) {
        text = csvContent;
      } else {
        return NextResponse.json(
          { success: false, error: { code: "VALIDATION_ERROR", message: "No CSV file or content provided." } },
          { status: 400 },
        );
      }

      const parsed = Papa.parse(text, { header: true, skipEmptyLines: true });
      if (parsed.errors.length > 0 && parsed.data.length === 0) {
        return NextResponse.json(
          { success: false, error: { code: "VALIDATION_ERROR", message: "Could not read that CSV." } },
          { status: 400 },
        );
      }
      rows = parsed.data as Array<Record<string, string>>;
    }

    if (!rows.length) {
      return NextResponse.json({ success: true, data: { imported: 0, skipped: 0, message: "Nothing to import." } });
    }

    const prepared = prepare(rows, campaignId, tenantId, startIndex);

    // One insert for the whole batch. skipDuplicates means a slug that somehow
    // repeats costs that single row rather than failing the entire import.
    const result = prepared.length
      ? await prisma.campaignContact.createMany({ data: prepared, skipDuplicates: true })
      : { count: 0 };

    // Audited once, when the import finishes, rather than five hundred times
    // for a five-hundred-batch upload.
    if (isFinalBatch) {
      const total = await prisma.campaignContact.count({
        where: { campaignId, tenantId, deletedAt: null },
      });
      await prisma.auditLog.create({
        data: {
          tenantId,
          userId: session.userId,
          action: "CONTACT_IMPORTED",
          details: JSON.stringify({ campaignId, batchImported: result.count, campaignTotal: total }),
        },
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        imported: result.count,
        // Rows that carried no name, email or phone at all.
        skipped: rows.length - prepared.length,
        message: `Imported ${result.count.toLocaleString()} contact${result.count === 1 ? "" : "s"}.`,
      },
      // Kept flat as well: the existing campaign screen reads `count`.
      count: result.count,
    });
  } catch (error: any) {
    console.error("[import-csv] failed", error);
    return NextResponse.json(
      { success: false, error: { code: "IMPORT_FAILED", message: error?.message || "Could not import contacts." } },
      { status: 500 },
    );
  }
}
