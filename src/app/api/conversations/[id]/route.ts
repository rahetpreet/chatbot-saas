import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireTenantAccess } from "@/lib/services/auth/session";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { tenantId } = await requireTenantAccess();
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
    const { tenantId } = await requireTenantAccess();
    const { id } = await params;
    const body = await req.json();

    const { sessionStatus } = body;

    const updateData: Record<string, any> = {};
    if (sessionStatus) {
      updateData.sessionStatus = sessionStatus;
      if (sessionStatus === "RESOLVED") {
        updateData.closedAt = new Date();
      }
    }

    const updated = await prisma.conversation.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json({ success: true, conversation: updated });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Update failed" }, { status: 400 });
  }
}
