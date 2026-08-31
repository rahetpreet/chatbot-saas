import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireTenantAccess } from "@/lib/services/auth/session";

export async function GET(req: NextRequest) {
  try {
    const { tenantId } = await requireTenantAccess();
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status"); // ACTIVE, HANDOVER, RESOLVED, ABANDONED
    const campaignId = searchParams.get("campaignId");
    const flowId = searchParams.get("flowId");
    const search = searchParams.get("search");

    const where: Record<string, any> = { tenantId };

    if (status && status !== "ALL") {
      where.sessionStatus = status;
    }
    if (campaignId) {
      where.campaignContact = { campaignId };
    }
    if (flowId) {
      where.flowId = flowId;
    }

    const conversations = await prisma.conversation.findMany({
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
    });

    return NextResponse.json({ conversations });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Unauthorized" }, { status: 403 });
  }
}
