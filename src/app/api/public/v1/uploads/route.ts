import { NextRequest, NextResponse } from "next/server";
import { getStorageProvider } from "@/lib/services/storage";
import { getPublicConversation } from "@/lib/services/public/session";
import { checkRateLimit } from "@/lib/security/rateLimit";
import prisma from "@/lib/prisma";

const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf", "text/plain"]);

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!(await checkRateLimit(`public-upload:${ip}`, 10, 15 * 60_000))) {
    return NextResponse.json({ success: false, error: { code: "RATE_LIMITED", message: "Too many upload requests" } }, { status: 429 });
  }

  try {
    const formData = await req.formData();
    const file = formData.get("file");
    const conversationId = formData.get("conversationId");
    const sessionToken = formData.get("sessionToken");

    const conversation = await getPublicConversation(conversationId, sessionToken);
    if (!(file instanceof File) || !conversation) {
      return NextResponse.json({ success: false, error: { code: "VALIDATION_ERROR", message: "Invalid upload session" } }, { status: 400 });
    }

    if (file.size === 0 || file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ success: false, error: { code: "VALIDATION_ERROR", message: "File must be between 1 byte and 10 MB" } }, { status: 400 });
    }

    if (!ALLOWED_MIME_TYPES.has(file.type)) {
      return NextResponse.json({ success: false, error: { code: "VALIDATION_ERROR", message: "File type is not permitted" } }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const storedFile = await getStorageProvider().uploadFile({
      tenantId: conversation.tenantId,
      category: "attachments",
      buffer,
      originalName: file.name,
      mimeType: file.type,
    });

    // Record Attachment in database
    await prisma.attachment.create({
      data: {
        tenantId: conversation.tenantId,
        conversationId: conversation.id,
        storageKey: storedFile.filename,
        originalFilename: storedFile.originalName,
        mimeType: storedFile.mimeType,
        sizeBytes: storedFile.size,
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        url: storedFile.url,
        name: storedFile.originalName,
        size: storedFile.size,
        type: storedFile.mimeType,
      },
    });
  } catch {
    return NextResponse.json({ success: false, error: { code: "INVALID_REQUEST", message: "Upload failed" } }, { status: 500 });
  }
}
