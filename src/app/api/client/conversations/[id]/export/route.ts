import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireTenantAccess } from "@/lib/services/auth/session";
import { generateConversationTranscriptPDF } from "@/lib/services/export";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { tenantId } = await requireTenantAccess();
    const { id: conversationId } = await params;
    const { searchParams } = new URL(req.url);
    const format = searchParams.get("format") || "json"; // pdf or json

    const conversation = await prisma.conversation.findFirst({
      where: { id: conversationId, tenantId },
      include: {
        flow: true,
        messages: { orderBy: { timestamp: "asc" } },
        leads: true,
      },
    });

    if (!conversation) {
      return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
    }

    if (format === "pdf") {
      const pdfBuffer = generateConversationTranscriptPDF(conversation);
      return new NextResponse(new Uint8Array(pdfBuffer), {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="transcript_${conversation.id}.pdf"`,
        },
      });
    }

    return NextResponse.json({
      success: true,
      conversation,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Export failed" }, { status: 500 });
  }
}
