import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { FlowRepository } from "@/lib/repositories/flowRepository";
import { requireTenantRole } from "@/lib/services/auth/session";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { tenantId } = await requireTenantRole(["CLIENT_OWNER", "CLIENT_ADMIN", "CLIENT_AGENT", "CLIENT_VIEWER"]);
    const { id } = await params;

    const chatbot = await FlowRepository.findById(tenantId, id);
    if (!chatbot) {
      return NextResponse.json({ success: false, error: { code: "NOT_FOUND", message: "Chatbot not found" } }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: { chatbot }, chatbot });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: { code: "FORBIDDEN", message: error.message || "Unauthorized" } }, { status: 403 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { tenantId, session } = await requireTenantRole(["CLIENT_OWNER", "CLIENT_ADMIN"]);
    const { id } = await params;
    const body = await req.json();

    const { name, description, nodes, edges } = body;

    await prisma.$transaction([
      prisma.flow.updateMany({
        where: { id, tenantId, deletedAt: null },
        data: {
          name: name || undefined,
          description: description !== undefined ? description : undefined,
          nodes: nodes ? JSON.stringify(nodes) : undefined,
          edges: edges ? JSON.stringify(edges) : undefined,
        },
      }),
      prisma.auditLog.create({
        data: {
          tenantId,
          userId: session.userId,
          action: "BOT_UPDATED",
          details: JSON.stringify({ flowId: id, name }),
        },
      }),
    ]);

    const updatedChatbot = await FlowRepository.findById(tenantId, id);
    return NextResponse.json({ success: true, data: { chatbot: updatedChatbot }, chatbot: updatedChatbot });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: { code: "INVALID_REQUEST", message: error.message || "Failed to update chatbot" } }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { tenantId, session } = await requireTenantRole(["CLIENT_OWNER", "CLIENT_ADMIN"]);
    const { id } = await params;

    await prisma.$transaction([
      prisma.flow.updateMany({
        where: { id, tenantId, deletedAt: null },
        data: { deletedAt: new Date() },
      }),
      prisma.auditLog.create({
        data: {
          tenantId,
          userId: session.userId,
          action: "BOT_DELETED",
          details: JSON.stringify({ flowId: id }),
        },
      }),
    ]);

    return NextResponse.json({ success: true, data: { message: "Chatbot deleted successfully" } });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: { code: "INVALID_REQUEST", message: error.message || "Failed to delete chatbot" } }, { status: 400 });
  }
}
