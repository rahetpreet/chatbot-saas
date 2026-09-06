import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireSuperAdmin } from "@/lib/services/auth/session";
import { resolveRange } from "@/lib/services/analytics/range";
import { EVENT } from "@/lib/services/analytics/events";
import { rate } from "@/lib/services/analytics/range";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Platform-wide analytics for the operator.
 *
 * Deliberately aggregate. The operator needs to know which workspaces are
 * active and which are idle, not to read anybody's conversations — so this
 * returns counts per tenant and nothing that could identify a visitor, a lead
 * or the content of a chat.
 */
export async function GET(req: NextRequest) {
  try {
    await requireSuperAdmin();
    const params = new URL(req.url).searchParams;
    const range = resolveRange({
      preset: params.get("preset"),
      start: params.get("start"),
      end: params.get("end"),
    });
    const inRange = { gte: range.start, lte: range.end };

    const [
      tenants,
      activeTenants,
      flows,
      publishedFlows,
      conversations,
      messages,
      leads,
      campaigns,
      links,
      linkOpens,
      aiRequests,
      perTenantConversations,
      perTenantLeads,
      tenantRows,
    ] = await Promise.all([
      prisma.tenant.count({ where: { deletedAt: null } }),
      prisma.tenant.count({ where: { status: { in: ["ACTIVE", "TRIAL"] }, deletedAt: null } }),
      prisma.flow.count({ where: { deletedAt: null } }),
      prisma.flow.count({ where: { status: "PUBLISHED", deletedAt: null } }),
      prisma.conversation.count({ where: { startedAt: inRange } }),
      prisma.message.count({ where: { timestamp: inRange } }),
      prisma.lead.count({ where: { deletedAt: null, createdAt: inRange } }),
      prisma.campaign.count({ where: { deletedAt: null } }),
      prisma.trackingLink.count({ where: { deletedAt: null } }),
      prisma.analyticsEvent.count({ where: { eventType: EVENT.LINK_OPENED, timestamp: inRange } }),
      prisma.analyticsEvent.count({ where: { eventType: EVENT.AI_REQUEST, timestamp: inRange } }),
      prisma.conversation.groupBy({
        by: ["tenantId"],
        where: { startedAt: inRange },
        _count: { _all: true },
      }),
      prisma.lead.groupBy({
        by: ["tenantId"],
        where: { deletedAt: null, createdAt: inRange },
        _count: { _all: true },
      }),
      prisma.tenant.findMany({
        where: { deletedAt: null },
        select: { id: true, name: true, slug: true, status: true, createdAt: true },
        orderBy: { name: "asc" },
      }),
    ]);

    const convBy = new Map(perTenantConversations.map((row) => [row.tenantId, row._count._all]));
    const leadBy = new Map(perTenantLeads.map((row) => [row.tenantId, row._count._all]));

    const usage = tenantRows
      .map((tenant) => {
        const tenantConversations = convBy.get(tenant.id) || 0;
        const tenantLeads = leadBy.get(tenant.id) || 0;
        return {
          tenantId: tenant.id,
          name: tenant.name,
          slug: tenant.slug,
          status: tenant.status,
          conversations: tenantConversations,
          leads: tenantLeads,
          conversionRate: rate(tenantLeads, tenantConversations),
        };
      })
      .sort((a, b) => b.conversations - a.conversations);

    const data = {
      range: { preset: range.preset, label: range.label, start: range.start, end: range.end },
      totals: {
        tenants,
        activeTenants,
        // A workspace with no conversations this period is the number worth
        // acting on: it is the churn signal, and it is invisible in a total.
        idleTenants: usage.filter((entry) => entry.conversations === 0).length,
        flows,
        publishedFlows,
        conversations,
        messages,
        leads,
        campaigns,
        links,
        linkOpens,
        aiRequests,
        conversionRate: rate(leads, conversations),
      },
      usage,
    };

    return NextResponse.json({ success: true, data, ...data });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: { code: "FORBIDDEN", message: error?.message || "Super Admin access required." } },
      { status: 403 },
    );
  }
}
