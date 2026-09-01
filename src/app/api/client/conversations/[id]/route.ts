import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireTenantRole } from "@/lib/services/auth/session";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { tenantId } = await requireTenantRole(["CLIENT_OWNER", "CLIENT_ADMIN", "CLIENT_AGENT", "CLIENT_VIEWER"]);
    const { id } = await params;

    const conversation = await prisma.conversation.findFirst({
      where: { id, tenantId },
      include: {
        flow: { select: { id: true, name: true } },
        campaignContact: true,
        messages: {
          orderBy: { timestamp: "asc" },
        },
        leads: true,
      },
    });

    if (!conversation) {
      return NextResponse.json({ success: false, error: { code: "NOT_FOUND", message: "Conversation not found" } }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: { conversation }, conversation });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: { code: "FORBIDDEN", message: error.message || "Unauthorized" } }, { status: 403 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { tenantId, session } = await requireTenantRole(["CLIENT_OWNER", "CLIENT_ADMIN", "CLIENT_AGENT"]);
    const { id } = await params;
    const body = await req.json();

    const allowedStatuses = ["ACTIVE", "HANDOVER", "RESOLVED", "ABANDONED"];
    if (body.sessionStatus && !allowedStatuses.includes(body.sessionStatus)) {
      return NextResponse.json({ success: false, error: { code: "VALIDATION_ERROR", message: "Invalid session status" } }, { status: 400 });
    }

    const updateData: Record<string, any> = {};
    if (body.sessionStatus) {
      updateData.sessionStatus = body.sessionStatus;
      if (body.sessionStatus === "RESOLVED") {
        updateData.closedAt = new Date();
      }
    }

    const updated = await prisma.conversation.updateMany({
      where: { id, tenantId },
      data: updateData,
    });

    if (!updated.count) {
      return NextResponse.json({ success: false, error: { code: "NOT_FOUND", message: "Conversation not found" } }, { status: 404 });
    }

    await prisma.auditLog.create({
      data: {
        tenantId,
        userId: session.userId,
        action: "CONVERSATION_UPDATED",
        details: JSON.stringify({ conversationId: id, status: body.sessionStatus }),
      },
    });

    return NextResponse.json({ success: true, message: "Conversation updated successfully." });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: { code: "INVALID_REQUEST", message: error.message || "Update failed" } }, { status: 400 });
  }
}
