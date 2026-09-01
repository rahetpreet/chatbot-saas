import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireTenantRole } from "@/lib/services/auth/session";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { tenantId } = await requireTenantRole(["CLIENT_OWNER", "CLIENT_ADMIN"]);
    const { id } = await params;

    const exportJob = await prisma.exportJob.findFirst({
      where: { id, tenantId, status: "COMPLETED" },
    });

    if (!exportJob) {
      return NextResponse.json({ success: false, error: { code: "NOT_FOUND", message: "Export not found or not completed" } }, { status: 404 });
    }

    // Re-generate the export data (in production, this would be stored)
    const filters = JSON.parse(exportJob.filters || "{}");
    const where: Record<string, any> = { tenantId };
    if (filters.startDate) where.startedAt = { ...where.startedAt, gte: new Date(filters.startDate) };
    if (filters.endDate) where.startedAt = { ...where.startedAt, lte: new Date(filters.endDate) };
    if (filters.status && filters.status !== "ALL") where.sessionStatus = filters.status;
    if (filters.campaignId) where.campaignContact = { campaignId: filters.campaignId };
    if (filters.flowId) where.flowId = filters.flowId;

    const conversations = await prisma.conversation.findMany({
      where,
      include: {
        flow: { select: { name: true } },
        campaignContact: {
          select: {
            name: true,
            email: true,
            phone: true,
            campaign: { select: { name: true } },
          },
        },
        messages: { orderBy: { timestamp: "asc" } },
      },
      orderBy: { startedAt: "desc" },
    });

    // Convert to CSV format
    const csvHeaders = ["ID", "Status", "Started At", "Ended At", "Flow", "Campaign", "Contact Name", "Contact Email", "Contact Phone", "Message Count"];
    const csvRows = conversations.map(conv => [
      conv.id,
      conv.sessionStatus,
      conv.startedAt.toISOString(),
      conv.closedAt?.toISOString() || "",
      conv.flow?.name || "",
      conv.campaignContact?.campaign?.name || "",
      conv.campaignContact?.name || "",
      conv.campaignContact?.email || "",
      conv.campaignContact?.phone || "",
      conv.messages.length.toString(),
    ]);

    const csvContent = [csvHeaders.join(","), ...csvRows.map(row => row.join(","))].join("\n");

    return new NextResponse(csvContent, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="conversations-export-${id}.csv"`,
      },
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: { code: "INVALID_REQUEST", message: error.message || "Failed to download export" } }, { status: 400 });
  }
}
