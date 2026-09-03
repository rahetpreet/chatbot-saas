import { NextRequest, NextResponse } from "next/server";
import { getStorageProvider, StorageNotConfiguredError } from "@/lib/services/storage";
import { getPublicConversation } from "@/lib/services/public/session";
import { checkRateLimit } from "@/lib/security/rateLimit";
import prisma from "@/lib/prisma";
import { assertUsageAvailable } from "@/lib/services/subscription/planLimits";
import { isAllowedPublicOrigin, parseAllowedDomains, publicCorsPreflight, withPublicCors } from "@/lib/services/public/cors";

const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf", "text/plain"]);

export async function POST(req: NextRequest) {
  const origin = req.headers.get("origin");
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!(await checkRateLimit(`public-upload:${ip}`, 10, 15 * 60_000))) return NextResponse.json({ error: "Too many upload requests" }, { status: 429 });
  try {
    const formData = await req.formData();
    const file = formData.get("file");
    const conversation = await getPublicConversation(formData.get("conversationId"), formData.get("sessionToken"));
    if (!(file instanceof File) || !conversation) return NextResponse.json({ error: "Invalid upload session" }, { status: 400 });
    if (file.size === 0 || file.size > 10 * 1024 * 1024) return NextResponse.json({ error: "File must be between 1 byte and 10 MB" }, { status: 400 });
    if (!ALLOWED_MIME_TYPES.has(file.type)) return NextResponse.json({ error: "File type is not permitted" }, { status: 400 });
    const tenant = await prisma.tenant.findUnique({ where: { id: conversation.tenantId }, select: { widgetSettings: true } });
    const allowedDomains = parseAllowedDomains(tenant?.widgetSettings);
    if (!isAllowedPublicOrigin(origin, allowedDomains)) return NextResponse.json({ error: "Origin is not allowed" }, { status: 403 });
    await assertUsageAvailable(conversation.tenantId, "storage", file.size);
    const storedFile = await getStorageProvider().uploadFile({ tenantId: conversation.tenantId, category: "attachments", buffer: Buffer.from(await file.arrayBuffer()), originalName: file.name, mimeType: file.type });
    const attachment = await prisma.attachment.create({ data: { tenantId: conversation.tenantId, conversationId: conversation.id, storageKey: storedFile.storedPath, originalFilename: storedFile.originalName, mimeType: storedFile.mimeType, sizeBytes: storedFile.size } });
    return withPublicCors(NextResponse.json({ success: true, file: { id: attachment.id, url: storedFile.url, name: storedFile.originalName, size: storedFile.size, type: storedFile.mimeType } }), origin, allowedDomains);
  } catch (error) {
    if (error instanceof StorageNotConfiguredError) {
      // A deployment without durable storage should say so plainly rather
      // than returning an opaque 500 on every attachment.
      return NextResponse.json(
        { success: false, error: { code: "STORAGE_NOT_CONFIGURED", message: "File uploads are not available." } },
        { status: 503 },
      );
    }
    console.error("[widget/upload] upload failed:", error);
    return NextResponse.json(
      { success: false, error: { code: "UPLOAD_FAILED", message: "Upload failed." } },
      { status: 500 },
    );
  }
}

export function OPTIONS(req: NextRequest) {
  return publicCorsPreflight(req.headers.get("origin"));
}
