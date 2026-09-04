import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireTenantRole } from "@/lib/services/auth/session";
import { chunkText, extractUploadedText, fetchWebsiteContent } from "@/lib/services/knowledge/ingest";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Imports knowledge from a web page or an uploaded document.
 *
 * Sources are stored as chunks rather than one large row, because retrieval
 * ranks passages and a whole page buries the relevant sentence.
 *
 * Re-importing the same URL replaces its previous chunks instead of
 * accumulating duplicates, so refreshing a page after the site changes is
 * safe to do repeatedly.
 */
export async function POST(req: NextRequest) {
  try {
    const { tenantId, session } = await requireTenantRole(["CLIENT_OWNER", "CLIENT_ADMIN"]);
    const contentType = req.headers.get("content-type") || "";

    let title: string;
    let text: string;
    let sourceUrl: string | null = null;
    let sourceType: "website" | "file";
    let category: string;

    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      const file = form.get("file");
      if (!(file instanceof File)) {
        return NextResponse.json(
          { success: false, error: { code: "VALIDATION_ERROR", message: "No file was provided." } },
          { status: 400 },
        );
      }
      if (file.size > 4 * 1024 * 1024) {
        return NextResponse.json(
          { success: false, error: { code: "FILE_TOO_LARGE", message: "Files must be under 4 MB." } },
          { status: 413 },
        );
      }

      const extracted = await extractUploadedText(file);
      title = String(form.get("title") || extracted.title);
      text = extracted.text;
      sourceType = "file";
      category = String(form.get("category") || "Document");
    } else {
      const body = await req.json().catch(() => ({}));
      const url = String(body.url || "").trim();
      if (!url) {
        return NextResponse.json(
          { success: false, error: { code: "VALIDATION_ERROR", message: "Enter a web address to import." } },
          { status: 400 },
        );
      }

      const extracted = await fetchWebsiteContent(url);
      title = String(body.title || extracted.title);
      text = extracted.text;
      sourceUrl = extracted.url || url;
      sourceType = "website";
      category = String(body.category || "Website");
    }

    const chunks = chunkText(text);
    if (chunks.length === 0) {
      return NextResponse.json(
        { success: false, error: { code: "EMPTY_SOURCE", message: "No usable text was found in that source." } },
        { status: 400 },
      );
    }

    const created = await prisma.$transaction(async (tx) => {
      if (sourceUrl) {
        // Replace rather than append, so re-importing a page after the site
        // changes does not leave the old wording behind to be retrieved.
        await tx.knowledgeDoc.deleteMany({ where: { tenantId, sourceUrl } });
      }

      await tx.knowledgeDoc.createMany({
        data: chunks.map((chunk, index) => ({
          tenantId,
          title: chunks.length > 1 ? `${title} (${index + 1}/${chunks.length})` : title,
          category,
          content: chunk,
          sourceType,
          sourceUrl,
          chunkIndex: index,
        })),
      });

      await tx.auditLog.create({
        data: {
          tenantId,
          userId: session.userId,
          action: "KNOWLEDGE_IMPORTED",
          details: JSON.stringify({ sourceType, sourceUrl, title, chunks: chunks.length }),
        },
      });

      return chunks.length;
    });

    const data = {
      imported: created,
      title,
      sourceType,
      sourceUrl,
      message: `Imported ${created} passage${created === 1 ? "" : "s"} from ${title}.`,
    };
    return NextResponse.json({ success: true, data, ...data });
  } catch (error: any) {
    // These messages are written for the person pasting the URL, so they are
    // surfaced rather than replaced with a generic failure.
    return NextResponse.json(
      { success: false, error: { code: "IMPORT_FAILED", message: error?.message || "Could not import that source." } },
      { status: 400 },
    );
  }
}
