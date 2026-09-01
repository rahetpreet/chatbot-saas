import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireTenantRole } from "@/lib/services/auth/session";

export async function GET(req: NextRequest) {
  try {
    const { tenantId, session } = await requireTenantRole(["CLIENT_OWNER", "CLIENT_ADMIN", "CLIENT_AGENT"]);
    const { searchParams } = new URL(req.url);
    const format = searchParams.get("format") || "json";
    const status = searchParams.get("status");
    const flowId = searchParams.get("flowId");
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");

    const where: Record<string, any> = { tenantId };

    if (status && status !== "ALL") where.sessionStatus = status;
    if (flowId) where.flowId = flowId;
    if (startDate || endDate) {
      where.startedAt = {};
      if (startDate) where.startedAt.gte = new Date(startDate);
      if (endDate) where.startedAt.lte = new Date(endDate);
    }

    const conversations = await prisma.conversation.findMany({
      where,
      orderBy: { startedAt: "desc" },
      include: {
        flow: { select: { id: true, name: true } },
        campaignContact: { select: { name: true, email: true, phone: true } },
        messages: { orderBy: { timestamp: "asc" } },
      },
    });

    await prisma.auditLog.create({
      data: {
        tenantId,
        userId: session.userId,
        action: "DATA_EXPORTED",
        details: JSON.stringify({ type: "conversations", format, count: conversations.length }),
      },
    });

    if (format === "csv") {
      const headers = ["Conversation ID", "Visitor ID", "Status", "Started At", "Flow Name", "Contact Name", "Contact Email", "Messages Count"];
      const rows = conversations.map((c) => [
        c.id,
        c.visitorId,
        c.sessionStatus,
        c.startedAt.toISOString(),
        c.flow?.name || "None",
        c.campaignContact?.name || "",
        c.campaignContact?.email || "",
        c.messages.length.toString(),
      ]);

      const csvContent = [
        headers.join(","),
        ...rows.map((row) => row.map((val) => `"${(val || "").replace(/"/g, '""')}"`).join(",")),
      ].join("\n");

      return new NextResponse(csvContent, {
        headers: {
          "Content-Type": "text/csv",
          "Content-Disposition": `attachment; filename="conversations_${tenantId}_${Date.now()}.csv"`,
        },
      });
    }

    return NextResponse.json({
      success: true,
      data: { conversations },
      count: conversations.length,
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: { code: "INVALID_REQUEST", message: error.message || "Export failed" } }, { status: 500 });
  }
}
