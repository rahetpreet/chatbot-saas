import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireTenantRole } from "@/lib/services/auth/session";

export async function GET(_req: NextRequest) {
  try {
    const { tenantId } = await requireTenantRole(["CLIENT_OWNER", "CLIENT_ADMIN", "CLIENT_VIEWER"]);

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        id: true,
        name: true,
        slug: true,
        status: true,
        planTier: true,
        maxMessagesPerMonth: true,
        maxFlows: true,
        maxCampaignLinks: true,
        maxStorageMb: true,
        createdAt: true,
      },
    });

    if (!tenant) {
      return NextResponse.json({ success: false, error: { code: "NOT_FOUND", message: "Tenant not found" } }, { status: 404 });
    }

    const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const endOfMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0);

    const [
      totalConversations,
      monthlyConversations,
      totalLeads,
      newLeadsThisMonth,
      totalContacts,
      activeFlows,
      totalCampaigns,
    ] = await Promise.all([
      prisma.conversation.count({ where: { tenantId } }),
      prisma.conversation.count({
        where: {
          tenantId,
          startedAt: { gte: startOfMonth, lte: endOfMonth },
        },
      }),
      prisma.lead.count({ where: { tenantId, deletedAt: null } }),
      prisma.lead.count({
        where: {
          tenantId,
          deletedAt: null,
          createdAt: { gte: startOfMonth, lte: endOfMonth },
        },
      }),
      prisma.contact.count({ where: { tenantId, deletedAt: null } }),
      prisma.flow.count({ where: { tenantId, deletedAt: null, status: "PUBLISHED" } }),
      prisma.campaign.count({ where: { tenantId, deletedAt: null } }),
    ]);

    const attachmentBytes = await prisma.attachment.aggregate({
      where: { tenantId },
      _sum: { sizeBytes: true },
    });
    const usedStorageMb = Math.round((attachmentBytes._sum.sizeBytes || 0) / (1024 * 1024));

    const monthlyMessages = await prisma.message.count({
      where: {
        conversation: { tenantId },
        timestamp: { gte: startOfMonth, lte: endOfMonth },
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        tenant,
        stats: {
          conversations: {
            total: totalConversations,
            thisMonth: monthlyConversations,
          },
          leads: {
            total: totalLeads,
            thisMonth: newLeadsThisMonth,
          },
          contacts: totalContacts,
          flows: activeFlows,
          campaigns: totalCampaigns,
          messages: monthlyMessages,
          storage: {
            used: usedStorageMb,
            limit: tenant.maxStorageMb,
          },
        },
      },
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: { code: "FORBIDDEN", message: error.message || "Unauthorized" } }, { status: 403 });
  }
}
