import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireTenantAccess } from "@/lib/services/auth/session";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { tenantId, session } = await requireTenantAccess();
    const { id: conversationId } = await params;
    const body = await req.json();
    const { content, attachments } = body;

    if (!content && (!attachments || attachments.length === 0)) {
      return NextResponse.json({ error: "Message content or attachment is required" }, { status: 400 });
    }

    const conversation = await prisma.conversation.findFirst({
      where: { id: conversationId, tenantId },
    });

    if (!conversation) {
      return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
    }

    // Create Agent Message
    const user = await prisma.user.findUnique({ where: { id: session.userId } });

    const message = await prisma.message.create({
      data: {
        conversationId,
        senderType: "AGENT",
        senderName: user?.name || "Support Specialist",
        content: content || "",
        attachments: attachments ? JSON.stringify(attachments) : null,
      },
    });

    // Update conversation last active
    await prisma.conversation.update({
      where: { id: conversationId },
      data: {
        lastActiveAt: new Date(),
        sessionStatus: conversation.sessionStatus === "RESOLVED" ? "HANDOVER" : conversation.sessionStatus,
      },
    });

    return NextResponse.json({ success: true, message });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to send message" }, { status: 500 });
  }
}
