import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireTenantRole } from "@/lib/services/auth/session";

export async function GET(req: NextRequest) {
  try {
    const { tenantId } = await requireTenantRole(["CLIENT_OWNER", "CLIENT_ADMIN", "CLIENT_VIEWER"]);
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status"); // ACTIVE, HANDOVER, RESOLVED, ABANDONED
    const campaignId = searchParams.get("campaignId");
    const flowId = searchParams.get("flowId");

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
          // A workspace past this simply stopped seeing its older conversations,
          // with nothing on screen to say any were missing. Raised well beyond
          // what an inbox is browsed to; the search box is the real answer for
          // finding something old.
          take: 1000,
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
            // A conversation that produced a lead should show that person's
            // name in the inbox, even when the flow captured nothing into
            // collectedData -- a lead form submitted straight to the API is
            // still a named human.
            leads: {
              where: { deletedAt: null },
              select: { name: true, email: true, phone: true },
              orderBy: { createdAt: "desc" },
              take: 1,
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
