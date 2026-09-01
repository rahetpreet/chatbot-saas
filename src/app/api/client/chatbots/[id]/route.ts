import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireTenantRole } from "@/lib/services/auth/session";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { tenantId } = await requireTenantRole(["CLIENT_OWNER", "CLIENT_ADMIN", "CLIENT_AGENT", "CLIENT_VIEWER"]);
    const { id } = await params;

    const flow = await prisma.flow.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: {
        _count: {
          select: {
            conversations: true,
            analyticsEvents: true,
          },
        },
      },
    });

    if (!flow) {
      return NextResponse.json({ success: false, error: { code: "NOT_FOUND", message: "Chatbot not found" } }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: { flow }, flow });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: { code: "FORBIDDEN", message: error.message || "Unauthorized" } }, { status: 403 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { tenantId, session } = await requireTenantRole(["CLIENT_OWNER", "CLIENT_ADMIN"]);
    const { id } = await params;
    const body = await req.json();

    const updateData: Record<string, any> = {};
    if (typeof body.name === "string") updateData.name = body.name.trim();
    if (typeof body.description === "string") updateData.description = body.description.trim();
    if (body.nodes !== undefined) updateData.nodes = typeof body.nodes === "string" ? body.nodes : JSON.stringify(body.nodes);
    if (body.edges !== undefined) updateData.edges = typeof body.edges === "string" ? body.edges : JSON.stringify(body.edges);
    if (typeof body.isDefault === "boolean") updateData.isDefault = body.isDefault;

    const flow = await prisma.$transaction(async (tx) => {
      if (updateData.isDefault) {
        await tx.flow.updateMany({
          where: { tenantId, id: { not: id } },
          data: { isDefault: false },
        });
      }

      const updated = await tx.flow.updateMany({
        where: { id, tenantId, deletedAt: null },
        data: updateData,
      });

      if (updated.count) {
        await tx.auditLog.create({
          data: {
            tenantId,
            userId: session.userId,
            action: "BOT_UPDATED",
            details: JSON.stringify({ flowId: id }),
          },
        });
      }

      return updated;
    });

    if (!flow.count) {
      return NextResponse.json({ success: false, error: { code: "NOT_FOUND", message: "Chatbot not found" } }, { status: 404 });
    }

    return NextResponse.json({ success: true, message: "Chatbot updated successfully." });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: { code: "INVALID_REQUEST", message: error.message || "Update failed" } }, { status: 400 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { tenantId, session } = await requireTenantRole(["CLIENT_OWNER", "CLIENT_ADMIN"]);
    const { id } = await params;

    const flow = await prisma.$transaction(async (tx) => {
      const deleted = await tx.flow.updateMany({
        where: { id, tenantId, deletedAt: null },
        data: { deletedAt: new Date(), status: "ARCHIVED" },
      });

      if (deleted.count) {
        await tx.auditLog.create({
          data: {
            tenantId,
            userId: session.userId,
            action: "BOT_ARCHIVED",
            details: JSON.stringify({ flowId: id }),
          },
        });
      }

      return deleted;
    });

    if (!flow.count) {
      return NextResponse.json({ success: false, error: { code: "NOT_FOUND", message: "Chatbot not found" } }, { status: 404 });
    }

    return NextResponse.json({ success: true, message: "Chatbot archived successfully." });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: { code: "INVALID_REQUEST", message: error.message || "Delete failed" } }, { status: 400 });
  }
}
