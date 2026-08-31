import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireSuperAdmin } from "@/lib/services/auth/session";

export async function GET(req: NextRequest) {
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
      prisma.tenant.count(),
      prisma.tenant.count({ where: { status: "ACTIVE" } }),
      prisma.user.count(),
      prisma.flow.count(),
      prisma.conversation.count(),
      prisma.message.count(),
      prisma.lead.count(),
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
    return NextResponse.json({ error: error.message || "Unauthorized" }, { status: 403 });
  }
}
