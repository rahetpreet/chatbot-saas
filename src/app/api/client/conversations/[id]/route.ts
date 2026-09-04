import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireTenantRole } from "@/lib/services/auth/session";
import { assertAgentMayAccess } from "@/lib/services/auth/agentScope";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { tenantId, session } = await requireTenantRole(["CLIENT_OWNER", "CLIENT_ADMIN", "CLIENT_AGENT", "CLIENT_VIEWER"]);
    await assertAgentMayAccess(session, (await params).id);
    const { id } = await params;

    const conversation = await prisma.conversation.findFirst({
      where: { id, tenantId },
      include: {
        flow: { select: { id: true, name: true } },
        campaignContact: {
          include: { campaign: { select: { id: true, name: true, slug: true } } },
        },
        messages: {
          orderBy: { timestamp: "asc" },
        },
        leads: true,
      },
    });

    if (!conversation) {
      return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
    }

    return NextResponse.json({ conversation });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Unauthorized" }, { status: 403 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { tenantId, session } = await requireTenantRole(["CLIENT_OWNER", "CLIENT_ADMIN", "CLIENT_AGENT"]);
    await assertAgentMayAccess(session, (await params).id);
    const { id } = await params;
    const body = await req.json();

    const { sessionStatus } = body;
    if (!new Set(["ACTIVE", "HANDOVER", "RESOLVED", "ABANDONED"]).has(sessionStatus)) return NextResponse.json({ error: "Invalid conversation status" }, { status: 400 });

    const updateData: Record<string, any> = {};
    if (sessionStatus) {
      updateData.sessionStatus = sessionStatus;
      if (sessionStatus === "RESOLVED") {
        updateData.closedAt = new Date();
      }
    }

    const existing = await prisma.conversation.findFirst({ where: { id, tenantId } });
    if (!existing) return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
    const updated = await prisma.$transaction(async (tx) => {
      const conversation = await tx.conversation.update({ where: { id }, data: updateData });
      await tx.auditLog.create({ data: { tenantId, userId: session.userId, action: "CONVERSATION_UPDATED", details: JSON.stringify({ conversationId: id, sessionStatus }) } });
      return conversation;
    });

    return NextResponse.json({ success: true, conversation: updated });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Update failed" }, { status: 400 });
  }
}
