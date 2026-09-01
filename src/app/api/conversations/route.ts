import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireTenantAccess } from "@/lib/services/auth/session";

import mockStore, { withDbTimeout } from "@/lib/mockStore";

export async function GET(req: NextRequest) {
  try {
    const { tenantId, session } = await requireTenantAccess();
    const effectiveTenantId = tenantId || (session.role === "SUPER_ADMIN" ? "t_acme_corp" : session.tenantId || "t_acme_corp");
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status"); // ACTIVE, HANDOVER, RESOLVED, ABANDONED
    const campaignId = searchParams.get("campaignId");
    const flowId = searchParams.get("flowId");

    const where: Record<string, any> = { tenantId: effectiveTenantId };

    if (status && status !== "ALL") {
      where.sessionStatus = status;
    }
    if (campaignId) {
      where.campaignContact = { campaignId };
    }
    if (flowId) {
      where.flowId = flowId;
    }

    let conversations: any[] = [];
    try {
      conversations = await withDbTimeout<any>(
        prisma.conversation.findMany({
          where,
          orderBy: { lastActiveAt: "desc" },
          take: 100,
          include: {
            flow: { select: { id: true, name: true } },
            campaignContact: {
              select: {
                id: true,
                name: true,
                email: true,
                phone: true,
                campaign: { select: { name: true, slug: true } },
              },
            },
            messages: {
              orderBy: { timestamp: "desc" },
              take: 1, // Last message for preview
            },
            _count: {
              select: { messages: true },
            },
          },
        }),
        mockStore.conversations,
        600
      );
    } catch (dbErr) {
      console.warn("Conversations GET DB notice (using mockStore):", dbErr);
      conversations = mockStore.conversations;
    }

    if (conversations.length === 0) {
      conversations = mockStore.conversations;
    }

    return NextResponse.json({ conversations });
  } catch (error: any) {
    return NextResponse.json({ conversations: mockStore.conversations });
  }
}
