import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { checkRateLimit } from "@/lib/security/rateLimit";
import { hashPublicSessionToken } from "@/lib/services/public/session";

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!(await checkRateLimit(`public-event:${ip}`, 60, 60_000))) {
    return NextResponse.json({ success: false, error: { code: "RATE_LIMITED", message: "Too many requests." } }, { status: 429 });
  }

  try {
    const { conversationId, sessionToken, eventType, nodeId, metadata } = await req.json();

    if (typeof conversationId !== "string" || typeof sessionToken !== "string" || typeof eventType !== "string") {
      return NextResponse.json({ success: false, error: { code: "VALIDATION_ERROR", message: "Invalid event parameters." } }, { status: 400 });
    }

    const conversation = await prisma.conversation.findFirst({
      where: { id: conversationId, publicSessionTokenHash: hashPublicSessionToken(sessionToken) },
    });

    if (!conversation) {
      return NextResponse.json({ success: false, error: { code: "NOT_FOUND", message: "Conversation not found." } }, { status: 404 });
    }

    await prisma.analyticsEvent.create({
      data: {
        tenantId: conversation.tenantId,
        flowId: conversation.flowId,
        conversationId: conversation.id,
        eventType,
        nodeId: typeof nodeId === "string" ? nodeId : null,
        metadata: metadata ? JSON.stringify(metadata) : null,
      },
    });

    return NextResponse.json({ success: true, message: "Event recorded." });
  } catch {
    return NextResponse.json({ success: false, error: { code: "INVALID_REQUEST", message: "Failed to record event." } }, { status: 400 });
  }
}
