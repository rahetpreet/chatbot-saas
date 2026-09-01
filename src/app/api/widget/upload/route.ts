import { NextRequest, NextResponse } from "next/server";
import { getStorageProvider } from "@/lib/services/storage";
import { getPublicConversation } from "@/lib/services/public/session";
import { checkRateLimit } from "@/lib/security/rateLimit";

const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf", "text/plain"]);

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!checkRateLimit(`public-upload:${ip}`, 10, 15 * 60_000)) return NextResponse.json({ error: "Too many upload requests" }, { status: 429 });
  try {
    const formData = await req.formData();
    const file = formData.get("file");
    const conversation = await getPublicConversation(formData.get("conversationId"), formData.get("sessionToken"));
    if (!(file instanceof File) || !conversation) return NextResponse.json({ error: "Invalid upload session" }, { status: 400 });
    if (file.size === 0 || file.size > 10 * 1024 * 1024) return NextResponse.json({ error: "File must be between 1 byte and 10 MB" }, { status: 400 });
    if (!ALLOWED_MIME_TYPES.has(file.type)) return NextResponse.json({ error: "File type is not permitted" }, { status: 400 });
    const storedFile = await getStorageProvider().uploadFile({ tenantId: conversation.tenantId, category: "attachments", buffer: Buffer.from(await file.arrayBuffer()), originalName: file.name, mimeType: file.type });
    return NextResponse.json({ success: true, file: { url: storedFile.url, name: storedFile.originalName, size: storedFile.size, type: storedFile.mimeType } });
  } catch {
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
