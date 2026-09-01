import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireTenantRole } from "@/lib/services/auth/session";
import { assertUsageAvailable } from "@/lib/services/subscription/planLimits";

export async function GET(_req: NextRequest) {
  try {
    const { tenantId } = await requireTenantRole(["CLIENT_OWNER", "CLIENT_ADMIN", "CLIENT_AGENT", "CLIENT_VIEWER"]);

    const chatbots = await prisma.flow.findMany({
      where: { tenantId, deletedAt: null },
      orderBy: { updatedAt: "desc" },
      include: {
        _count: {
          select: {
            conversations: true,
            analyticsEvents: true,
          },
        },
      },
    });

    return NextResponse.json({ success: true, data: { chatbots }, chatbots });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: { code: "FORBIDDEN", message: error.message || "Unauthorized" } }, { status: 403 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { tenantId, session } = await requireTenantRole(["CLIENT_OWNER", "CLIENT_ADMIN"]);
    await assertUsageAvailable(tenantId, "flows");

    const body = await req.json();
    const name = typeof body.name === "string" ? body.name.trim() : "New Chatbot Flow";
    const description = typeof body.description === "string" ? body.description.trim() : null;

    const defaultNodes = [
      { id: "start-1", type: "start", position: { x: 250, y: 50 }, data: { label: "Trigger: Visitor Opens Widget", nodeType: "start" } },
      { id: "msg-1", type: "message", position: { x: 250, y: 180 }, data: { label: "Welcome Greeting", nodeType: "message", messageText: "Hi there! 👋 How can we help you today?" } },
    ];
    const defaultEdges = [{ id: "e-start-msg", source: "start-1", target: "msg-1" }];

    const flow = await prisma.$transaction(async (tx) => {
      const created = await tx.flow.create({
        data: {
          tenantId,
          name,
          description,
          status: "DRAFT",
          version: 1,
          nodes: JSON.stringify(body.nodes || defaultNodes),
          edges: JSON.stringify(body.edges || defaultEdges),
        },
      });

      await tx.auditLog.create({
        data: {
          tenantId,
          userId: session.userId,
          action: "BOT_CREATED",
          details: JSON.stringify({ flowId: created.id, name }),
        },
      });

      return created;
    });

    return NextResponse.json({ success: true, data: { flow }, flow }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: { code: "INVALID_REQUEST", message: error.message || "Failed to create chatbot" } }, { status: 400 });
  }
}
