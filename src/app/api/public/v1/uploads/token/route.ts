import { NextRequest, NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import prisma from "@/lib/prisma";
import { getPublicConversation } from "@/lib/services/public/session";
import { checkRateLimit } from "@/lib/security/rateLimit";
import { isAllowedPublicOrigin, parseAllowedDomains, publicCorsPreflight, withPublicCors } from "@/lib/services/public/cors";
import { MAX_UPLOAD_BYTES } from "@/lib/services/storage";

export const dynamic = "force-dynamic";

/**
 * Direct-to-storage uploads.
 *
 * Vercel caps a serverless request body at roughly 4.5 MB, so anything larger
 * cannot pass through a route handler at all. This endpoint instead issues a
 * short-lived, scoped token that lets the browser upload straight to Blob
 * storage, then receives a callback once the file has landed.
 *
 * Authorisation still happens here: the visitor must present a valid public
 * session token for a live conversation, and the allowed content types and
 * size ceiling are decided server-side, not by the client.
 */

const ALLOWED_CONTENT_TYPES = [
  "image/jpeg", "image/png", "image/webp", "image/gif", "image/heic", "image/heif",
  "application/pdf",
  "text/plain", "text/csv",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/zip", "application/x-zip-compressed",
  "audio/mpeg", "audio/wav", "audio/ogg", "audio/webm", "audio/mp4",
  "video/mp4", "video/webm", "video/quicktime",
];

export async function POST(req: NextRequest) {
  const origin = req.headers.get("origin");
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";

  if (!(await checkRateLimit(`public-upload-token:${ip}`, 20, 15 * 60_000))) {
    return NextResponse.json(
      { success: false, error: { code: "RATE_LIMITED", message: "Too many upload requests." } },
      { status: 429 },
    );
  }

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json(
      { success: false, error: { code: "STORAGE_NOT_CONFIGURED", message: "File uploads are not available." } },
      { status: 503 },
    );
  }

  try {
    const body = (await req.json()) as HandleUploadBody;

    const result = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        // clientPayload is attacker-controlled, so nothing from it is trusted
        // beyond identifying a session that is then verified against the
        // database.
        let parsed: { conversationId?: string; sessionToken?: string } = {};
        try {
          parsed = clientPayload ? JSON.parse(clientPayload) : {};
        } catch {
          throw new Error("Invalid upload session.");
        }

        const conversation = await getPublicConversation(parsed.conversationId, parsed.sessionToken);
        if (!conversation) throw new Error("Invalid upload session.");

        const tenant = await prisma.tenant.findUnique({
          where: { id: conversation.tenantId },
          select: { widgetSettings: true },
        });
        if (!isAllowedPublicOrigin(origin, parseAllowedDomains(tenant?.widgetSettings))) {
          throw new Error("Origin is not allowed.");
        }

        return {
          allowedContentTypes: ALLOWED_CONTENT_TYPES,
          maximumSizeInBytes: MAX_UPLOAD_BYTES,
          addRandomSuffix: true,
          // Echoed back to onUploadCompleted so the attachment can be
          // recorded against the right conversation and workspace.
          tokenPayload: JSON.stringify({
            tenantId: conversation.tenantId,
            conversationId: conversation.id,
            pathname,
          }),
        };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        // Called by Vercel after the browser finishes uploading. This is the
        // only place the attachment row can be written, because the server
        // never sees the file itself.
        try {
          const payload = JSON.parse(tokenPayload || "{}");
          if (!payload.tenantId) return;

          await prisma.attachment.create({
            data: {
              tenantId: payload.tenantId,
              conversationId: payload.conversationId || null,
              storageKey: blob.url,
              originalFilename: blob.pathname.split("/").pop() || "upload",
              mimeType: (blob as any).contentType || "application/octet-stream",
              sizeBytes: Number((blob as any).size ?? 0),
            },
          });
        } catch (error) {
          // Never throw here: the file is already stored, and failing this
          // callback would make Vercel retry an upload that succeeded.
          console.error("[uploads/token] could not record attachment:", error);
        }
      },
    });

    return withPublicCors(NextResponse.json(result), origin, []);
  } catch (error: any) {
    const message = error?.message || "Upload could not be authorised.";
    const denied = message === "Invalid upload session." || message === "Origin is not allowed.";
    if (!denied) console.error("[uploads/token] failed:", error);
    return NextResponse.json(
      { success: false, error: { code: denied ? "FORBIDDEN" : "UPLOAD_FAILED", message } },
      { status: denied ? 403 : 400 },
    );
  }
}

export function OPTIONS(req: NextRequest) {
  return publicCorsPreflight(req.headers.get("origin"));
}
