import prisma from "@/lib/prisma";
import { EVENT } from "./events";
import { DateRange, rate } from "./range";
import {
  conversationDuration,
  durationByFlow,
  conversationsByFlowStatus,
  messagesByFlow,
} from "./aggregate";

/**
 * Lead, conversation, chatbot and version segments.
 *
 * As everywhere in this module, `tenantId` is required and applied in the
 * database.
 */

export const LEAD_STATUSES = ["NEW", "CONTACTED", "QUALIFIED", "PROPOSAL", "WON", "LOST"] as const;

export async function leadAnalytics(tenantId: string, range: DateRange) {
  const inRange = { gte: range.start, lte: range.end };
  const where = { tenantId, deletedAt: null, createdAt: inRange };

  const [byStatus, byCampaign, byFlow, total, scores, bySource] = await Promise.all([
    prisma.lead.groupBy({ by: ["status"], where, _count: { _all: true } }),
    prisma.lead.groupBy({ by: ["campaignId"], where, _count: { _all: true } }),
    prisma.analyticsEvent.groupBy({
      by: ["flowId"],
      where: { tenantId, timestamp: inRange, eventType: EVENT.LEAD_CREATED },
      _count: { _all: true },
    }),
    prisma.lead.count({ where }),
    prisma.lead.aggregate({ where, _avg: { score: true } }),
    prisma.contact.groupBy({
      by: ["source"],
      where: { tenantId, deletedAt: null, createdAt: inRange },
      _count: { _all: true },
    }),
  ]);

  const campaignIds = byCampaign.map((c) => c.campaignId).filter(Boolean) as string[];
  const flowIds = byFlow.map((f) => f.flowId).filter(Boolean) as string[];

  const [campaigns, flows] = await Promise.all([
    campaignIds.length
      ? prisma.campaign.findMany({ where: { tenantId, id: { in: campaignIds } }, select: { id: true, name: true } })
      : [],
    flowIds.length
      ? prisma.flow.findMany({ where: { tenantId, id: { in: flowIds } }, select: { id: true, name: true } })
      : [],
  ]);
  const campaignName = new Map(campaigns.map((c) => [c.id, c.name]));
  const flowName = new Map(flows.map((f) => [f.id, f.name]));

  const statusCount = (status: string) => byStatus.find((s) => s.status === status)?._count._all || 0;

  return {
    total,
    averageScore: Number((scores._avg.score || 0).toFixed(1)),
    byStatus: LEAD_STATUSES.map((status) => ({
      status,
      count: statusCount(status),
      share: rate(statusCount(status), total),
    })),
    byCampaign: byCampaign
      .map((row) => ({
        campaignId: row.campaignId,
        name: row.campaignId ? campaignName.get(row.campaignId) || "Unknown campaign" : "No campaign",
        count: row._count._all,
      }))
      .sort((a, b) => b.count - a.count),
    byChatbot: byFlow
      .map((row) => ({
        flowId: row.flowId,
        name: row.flowId ? flowName.get(row.flowId) || "Unknown chatbot" : "No chatbot",
        count: row._count._all,
      }))
      .sort((a, b) => b.count - a.count),
    bySource: bySource
      .map((row) => ({ source: row.source || "Unknown", count: row._count._all }))
      .sort((a, b) => b.count - a.count),
  };
}

export async function conversationAnalytics(tenantId: string, range: DateRange) {
  const inRange = { gte: range.start, lte: range.end };

  // Grouped and averaged in the database. Fetching 20,000 conversations to
  // count their statuses and average their length here was correct only up to
  // that many; past it every figure on this screen was quietly short.
  const byStatus = await prisma.conversation.groupBy({
    by: ["sessionStatus"],
    where: { tenantId, startedAt: inRange },
    _count: { _all: true },
  });

  const [duration, messageRows, aiConvRows, handoverRows] = await Promise.all([
    conversationDuration(tenantId, range),
    prisma.message.groupBy({
      by: ["senderType"],
      where: { conversation: { tenantId }, timestamp: inRange },
      _count: { _all: true },
    }),
    prisma.analyticsEvent.findMany({
      where: { tenantId, timestamp: inRange, eventType: EVENT.AI_RESPONSE, conversationId: { not: null } },
      select: { conversationId: true },
      distinct: ["conversationId"],
    }),
    prisma.analyticsEvent.findMany({
      where: { tenantId, timestamp: inRange, eventType: EVENT.HUMAN_HANDOFF, conversationId: { not: null } },
      select: { conversationId: true },
      distinct: ["conversationId"],
    }),
  ]);

  const total = byStatus.reduce((sum, row) => sum + row._count._all, 0);

  const messagesBy = (type: string) => messageRows.find((m) => m.senderType === type)?._count._all || 0;
  const visitorMessages = messagesBy("VISITOR") + messagesBy("USER");
  const botMessages = messagesBy("BOT");
  const totalMessages = messageRows.reduce((sum, m) => sum + m._count._all, 0);

  const statusCount = (status: string) => byStatus.find((row) => row.sessionStatus === status)?._count._all || 0;

  return {
    total,
    completed: statusCount("RESOLVED"),
    abandoned: statusCount("ABANDONED"),
    active: statusCount("ACTIVE"),
    inHandover: statusCount("HANDOVER"),
    avgDurationSeconds: duration.averageSeconds,
    avgMessages: total ? Number((totalMessages / total).toFixed(1)) : 0,
    avgVisitorMessages: total ? Number((visitorMessages / total).toFixed(1)) : 0,
    avgBotMessages: total ? Number((botMessages / total).toFixed(1)) : 0,
    aiHandled: aiConvRows.length,
    humanHandled: handoverRows.length,
  };
}

export interface ChatbotStat {
  flowId: string;
  name: string;
  status: string;
  version: number;
  visitors: number;
  conversations: number;
  completed: number;
  abandoned: number;
  leads: number;
  conversionRate: number;
  avgDurationSeconds: number;
  avgMessages: number;
}

export async function chatbotAnalytics(tenantId: string, range: DateRange): Promise<ChatbotStat[]> {
  const inRange = { gte: range.start, lte: range.end };

  const flows = await prisma.flow.findMany({
    where: { tenantId, deletedAt: null },
    select: { id: true, name: true, status: true, version: true },
  });
  if (!flows.length) return [];

  const ids = flows.map((f) => f.id);
  // Per-flow counts, durations and message totals all computed in the database
  // rather than by pulling every conversation into memory.
  const [byFlow, durations, flowMessages, leadRows, visitorRows] = await Promise.all([
    conversationsByFlowStatus(tenantId, range),
    durationByFlow(tenantId, range),
    messagesByFlow(tenantId, range),
    prisma.analyticsEvent.groupBy({
      by: ["flowId"],
      where: { tenantId, timestamp: inRange, eventType: EVENT.LEAD_CREATED, flowId: { in: ids } },
      _count: { _all: true },
    }),
    prisma.analyticsEvent.findMany({
      where: { tenantId, timestamp: inRange, flowId: { in: ids }, visitorId: { not: null } },
      select: { flowId: true, visitorId: true },
      distinct: ["flowId", "visitorId"],
    }),
  ]);

  const leadsBy = new Map(leadRows.map((r) => [r.flowId, r._count._all]));
  const visitorsBy = new Map<string, number>();
  for (const row of visitorRows) {
    if (!row.flowId) continue;
    visitorsBy.set(row.flowId, (visitorsBy.get(row.flowId) || 0) + 1);
  }
  return flows
    .map((flow) => {
      const stats = byFlow.get(flow.id);
      const conversations = stats?.total ?? 0;
      const messages = flowMessages.get(flow.id) ?? 0;
      const leads = leadsBy.get(flow.id) || 0;

      return {
        flowId: flow.id,
        name: flow.name,
        status: flow.status,
        version: flow.version,
        visitors: visitorsBy.get(flow.id) || 0,
        conversations,
        completed: stats?.byStatus.get("RESOLVED") ?? 0,
        abandoned: stats?.byStatus.get("ABANDONED") ?? 0,
        leads,
        conversionRate: rate(leads, conversations),
        avgDurationSeconds: durations.get(flow.id) ?? 0,
        avgMessages: conversations ? Number((messages / conversations).toFixed(1)) : 0,
      };
    })
    .sort((a, b) => b.conversations - a.conversations);
}

/**
 * Conversion by published version.
 *
 * Reads the version frozen onto each conversation, never the flow's current
 * version -- otherwise every past conversation would be reattributed to
 * whatever is published today and version comparison would be meaningless.
 */
export async function versionAnalytics(tenantId: string, range: DateRange, flowId?: string | null) {
  const inRange = { gte: range.start, lte: range.end };
  const where = {
    tenantId,
    startedAt: inRange,
    flowVersion: { not: null },
    ...(flowId ? { flowId } : {}),
  };

  const [conversations, leadRows] = await Promise.all([
    prisma.conversation.groupBy({ by: ["flowVersion"], where, _count: { _all: true } }),
    prisma.analyticsEvent.groupBy({
      by: ["flowVersion"],
      where: {
        tenantId,
        timestamp: inRange,
        eventType: EVENT.LEAD_CREATED,
        flowVersion: { not: null },
        ...(flowId ? { flowId } : {}),
      },
      _count: { _all: true },
    }),
  ]);

  const leadsBy = new Map(leadRows.map((r) => [r.flowVersion, r._count._all]));

  return conversations
    .map((row) => {
      const leads = leadsBy.get(row.flowVersion) || 0;
      return {
        version: row.flowVersion as number,
        conversations: row._count._all,
        leads,
        conversionRate: rate(leads, row._count._all),
      };
    })
    .sort((a, b) => a.version - b.version);
}
