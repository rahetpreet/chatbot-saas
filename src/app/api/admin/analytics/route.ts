import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireSuperAdmin } from "@/lib/services/auth/session";

export async function GET(_req: NextRequest) {
  try {
    await requireSuperAdmin();

    const [
      totalTenants,
      activeTenants,
      totalUsers,
      totalFlows,
      totalConversations,
      totalMessages,
      totalLeads,
      recentAuditLogs,
    ] = await Promise.all([
      prisma.tenant.count({ where: { deletedAt: null } }),
      prisma.tenant.count({ where: { status: "ACTIVE", deletedAt: null } }),
      prisma.user.count({ where: { deletedAt: null } }),
      prisma.flow.count({ where: { deletedAt: null } }),
      prisma.conversation.count(),
      prisma.message.count(),
      prisma.lead.count({ where: { deletedAt: null } }),
      prisma.auditLog.findMany({
        take: 10,
        orderBy: { timestamp: "desc" },
        include: {
          tenant: { select: { name: true, slug: true } },
          user: { select: { email: true, name: true } },
        },
      }),
    ]);

    return NextResponse.json({
      success: true,
      metrics: {
        totalTenants,
        activeTenants,
        totalUsers,
        totalFlows,
        totalConversations,
        totalMessages,
        totalLeads,
        estimatedStorageMb: Math.round(totalConversations * 0.05 + totalMessages * 0.005),
      },
      recentAuditLogs,
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: { code: "FORBIDDEN", message: error.message || "Super Admin access required." } }, { status: 403 });
  }
}
