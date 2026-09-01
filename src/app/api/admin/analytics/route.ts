import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireSuperAdmin } from "@/lib/services/auth/session";

export async function GET(_req: NextRequest) {
  try {
    await requireSuperAdmin();

    const [
      tenantsByPlan,
      tenantsByStatus,
      recentEvents,
      monthlyConversations,
    ] = await Promise.all([
      prisma.tenant.groupBy({
        by: ["planTier"],
        _count: { id: true },
        where: { deletedAt: null },
      }),
      prisma.tenant.groupBy({
        by: ["status"],
        _count: { id: true },
        where: { deletedAt: null },
      }),
      prisma.analyticsEvent.findMany({
        take: 50,
        orderBy: { timestamp: "desc" },
        include: {
          tenant: { select: { name: true, slug: true } },
        },
      }),
      prisma.conversation.count({
        where: {
          startedAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
        },
      }),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        tenantsByPlan,
        tenantsByStatus,
        monthlyConversations,
        recentEvents,
      },
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: { code: "FORBIDDEN", message: error.message || "Super Admin access required." } }, { status: 403 });
  }
}
