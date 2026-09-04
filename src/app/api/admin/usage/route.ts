import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireSuperAdmin } from "@/lib/services/auth/session";
import { getPlatformAIConfigs } from "@/lib/services/ai";

export const dynamic = "force-dynamic";

/**
 * Platform-wide usage, per workspace.
 *
 * Quotas are disabled, so this reports what is actually being consumed rather
 * than how close anyone is to a cap. It is what an operator needs to spot a
 * workspace that is growing, idle, or abusing the platform.
 */
export async function GET(req: NextRequest) {
  try {
    await requireSuperAdmin();

    const { searchParams } = new URL(req.url);
    const now = new Date();
    const period =
      searchParams.get("period") ||
      `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;

    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

    const tenants = await prisma.tenant.findMany({
      where: { deletedAt: null },
      select: {
        id: true,
        name: true,
        slug: true,
        status: true,
        planTier: true,
        createdAt: true,
        customDomain: true,
        _count: {
          select: {
            flows: { where: { deletedAt: null } },
            contacts: { where: { deletedAt: null } },
            campaigns: { where: { deletedAt: null } },
            conversations: true,
            leads: { where: { deletedAt: null } },
            users: { where: { deletedAt: null } },
            knowledgeDocs: true,
            attachments: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const tenantIds = tenants.map((tenant) => tenant.id);

    // Grouped aggregates rather than a query per workspace, so this stays a
    // handful of round-trips no matter how many workspaces exist.
    const [messagesThisMonth, storageBytes, usageRecords] = await Promise.all([
      // Message is scoped through Conversation rather than carrying its own
      // tenantId, so this joins instead of grouping directly.
      prisma
        .$queryRaw<Array<{ tenantId: string; count: bigint }>>`
          SELECT c."tenantId" AS "tenantId", COUNT(*) AS count
          FROM "Message" m
          JOIN "Conversation" c ON c."id" = m."conversationId"
          WHERE m."timestamp" >= ${monthStart}
          GROUP BY c."tenantId"
        `
        .catch(() => [] as Array<{ tenantId: string; count: bigint }>),
      prisma.attachment.groupBy({
        by: ["tenantId"],
        _sum: { sizeBytes: true },
        where: { tenantId: { in: tenantIds } },
      }).catch(() => [] as any[]),
      prisma.usageRecord.findMany({
        where: { tenantId: { in: tenantIds }, period },
        select: { tenantId: true, metric: true, quantity: true },
      }).catch(() => [] as any[]),
    ]);

    const messagesBy = new Map((messagesThisMonth as any[]).map((row) => [row.tenantId, Number(row.count ?? 0)]));
    const storageBy = new Map(storageBytes.map((row: any) => [row.tenantId, row._sum?.sizeBytes ?? 0]));
    const recordedBy = new Map<string, Record<string, number>>();
    for (const record of usageRecords as any[]) {
      const bucket = recordedBy.get(record.tenantId) || {};
      bucket[record.metric] = (bucket[record.metric] || 0) + record.quantity;
      recordedBy.set(record.tenantId, bucket);
    }

    const rows = tenants.map((tenant) => ({
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      status: tenant.status,
      planTier: tenant.planTier,
      customDomain: tenant.customDomain,
      createdAt: tenant.createdAt,
      flows: tenant._count.flows,
      contacts: tenant._count.contacts,
      campaigns: tenant._count.campaigns,
      conversations: tenant._count.conversations,
      leads: tenant._count.leads,
      teamMembers: tenant._count.users,
      knowledgeDocs: tenant._count.knowledgeDocs,
      attachments: tenant._count.attachments,
      // Provider calls this period. AI is metered because it is the one cost
      // that scales with usage and is capped by a free tier.
      aiCalls: (recordedBy.get(tenant.id) || {}).ai_messages || 0,
      messagesThisMonth: messagesBy.get(tenant.id) ?? 0,
      storageMb: Math.round(((storageBy.get(tenant.id) ?? 0) / (1024 * 1024)) * 10) / 10,
      recorded: recordedBy.get(tenant.id) || {},
    }));

    const totals = rows.reduce(
      (accumulator, row) => ({
        workspaces: accumulator.workspaces + 1,
        conversations: accumulator.conversations + row.conversations,
        messagesThisMonth: accumulator.messagesThisMonth + row.messagesThisMonth,
        contacts: accumulator.contacts + row.contacts,
        leads: accumulator.leads + row.leads,
        storageMb: Math.round((accumulator.storageMb + row.storageMb) * 10) / 10,
        aiCalls: accumulator.aiCalls + row.aiCalls,
        attachments: accumulator.attachments + row.attachments,
        knowledgeDocs: accumulator.knowledgeDocs + row.knowledgeDocs,
      }),
      {
        workspaces: 0, conversations: 0, messagesThisMonth: 0, contacts: 0, leads: 0,
        storageMb: 0, aiCalls: 0, attachments: 0, knowledgeDocs: 0,
      },
    );

    const aiProviders = getPlatformAIConfigs().map((config) => ({
      provider: config.provider,
      model: config.model,
    }));

    const data = { period, totals, tenants: rows, aiProviders, quotasEnforced: false };
    return NextResponse.json({ success: true, data, ...data });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: { code: "FORBIDDEN", message: error?.message || "Super Admin access required." } },
      { status: 403 },
    );
  }
}
