import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireTenantRole } from "@/lib/services/auth/session";

export async function GET(_req: NextRequest) {
  try {
    const { tenantId } = await requireTenantRole(["CLIENT_OWNER", "CLIENT_ADMIN", "CLIENT_AGENT", "CLIENT_VIEWER"]);

    const [
      totalFlows,
      publishedFlows,
      totalConversations,
      activeConversations,
      totalLeads,
      newLeads,
      totalCampaigns,
      recentConversations,
      recentLeads,
    ] = await Promise.all([
      prisma.flow.count({ where: { tenantId, deletedAt: null } }),
      prisma.flow.count({ where: { tenantId, status: "PUBLISHED", deletedAt: null } }),
      prisma.conversation.count({ where: { tenantId } }),
      prisma.conversation.count({ where: { tenantId, sessionStatus: "ACTIVE" } }),
      prisma.lead.count({ where: { tenantId, deletedAt: null } }),
      prisma.lead.count({ where: { tenantId, status: "NEW", deletedAt: null } }),
      prisma.campaign.count({ where: { tenantId, deletedAt: null } }),
      prisma.conversation.findMany({
        where: { tenantId },
        orderBy: { lastActiveAt: "desc" },
        take: 5,
        include: {
          flow: { select: { name: true } },
          messages: { take: 1, orderBy: { timestamp: "desc" } },
        },
      }),
      prisma.lead.findMany({
        where: { tenantId, deletedAt: null },
        orderBy: { createdAt: "desc" },
        take: 5,
      }),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        metrics: {
          totalFlows,
          publishedFlows,
          totalConversations,
          activeConversations,
          totalLeads,
          newLeads,
          totalCampaigns,
        },
        recentConversations,
        recentLeads,
      },
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: { code: "UNAUTHORIZED", message: error.message || "Unauthorized" } }, { status: 401 });
  }
}
