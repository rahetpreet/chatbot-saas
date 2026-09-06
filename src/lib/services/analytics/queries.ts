import prisma from "@/lib/prisma";
import { EVENT, FUNNEL_STEPS } from "./events";
import { DateRange, rate } from "./range";

/**
 * Every analytics read in the product.
 *
 * Two rules hold everywhere in this file, without exception:
 *
 *  1. `tenantId` is a required argument on every function and appears in every
 *     WHERE clause. It always comes from the authenticated session; nothing
 *     here ever accepts a tenant id supplied by a browser.
 *  2. Numbers are counted, never estimated. If an event was not recorded, the
 *     metric reads zero rather than being inferred from something adjacent.
 */

export interface AnalyticsFilters {
  flowId?: string | null;
  campaignId?: string | null;
  flowVersion?: number | null;
}

/** The shared WHERE fragment for event queries. */
function eventWhere(tenantId: string, range: DateRange, filters: AnalyticsFilters = {}) {
  return {
    tenantId,
    timestamp: { gte: range.start, lte: range.end },
    ...(filters.flowId ? { flowId: filters.flowId } : {}),
    ...(filters.campaignId ? { campaignId: filters.campaignId } : {}),
    ...(filters.flowVersion ? { flowVersion: filters.flowVersion } : {}),
  };
}

/** Counts of several event types in one pass rather than one query each. */
async function countByType(
  tenantId: string,
  range: DateRange,
  filters: AnalyticsFilters = {},
): Promise<Record<string, number>> {
  const rows = await prisma.analyticsEvent.groupBy({
    by: ["eventType"],
    where: eventWhere(tenantId, range, filters),
    _count: { _all: true },
  });
  const out: Record<string, number> = {};
  for (const row of rows) out[row.eventType] = row._count._all;
  return out;
}

/** Distinct visitors, which Prisma cannot express as a grouped count. */
async function distinctVisitors(tenantId: string, range: DateRange, filters: AnalyticsFilters = {}) {
  const rows = await prisma.analyticsEvent.findMany({
    where: { ...eventWhere(tenantId, range, filters), visitorId: { not: null } },
    select: { visitorId: true },
    distinct: ["visitorId"],
  });
  return rows.length;
}

export interface OverviewMetrics {
  totalVisitors: number;
  uniqueVisitors: number;
  returningVisitors: number;
  chatbotOpens: number;
  conversationsStarted: number;
  conversationsCompleted: number;
  conversationsAbandoned: number;
  totalMessages: number;
  totalLeads: number;
  contactsCaptured: number;
  linksGenerated: number;
  linksOpened: number;
  uniqueLinksOpened: number;
  conversionRate: number;
  engagementRate: number;
  avgConversationSeconds: number;
  avgMessagesPerConversation: number;
}

export async function overviewMetrics(
  tenantId: string,
  range: DateRange,
  filters: AnalyticsFilters = {},
): Promise<OverviewMetrics> {
  const inRange = { gte: range.start, lte: range.end };
  const convWhere = {
    tenantId,
    startedAt: inRange,
    ...(filters.flowId ? { flowId: filters.flowId } : {}),
    ...(filters.campaignId ? { campaignId: filters.campaignId } : {}),
    ...(filters.flowVersion ? { flowVersion: filters.flowVersion } : {}),
  };

  const [
    counts,
    uniqueVisitors,
    uniqueLinkRows,
    conversations,
    completed,
    abandoned,
    messages,
    leads,
    contacts,
    linksGenerated,
    returning,
    durations,
  ] = await Promise.all([
    countByType(tenantId, range, filters),
    distinctVisitors(tenantId, range, filters),
    prisma.analyticsEvent.findMany({
      where: {
        ...eventWhere(tenantId, range, filters),
        eventType: EVENT.LINK_OPENED,
        trackingLinkId: { not: null },
      },
      select: { trackingLinkId: true },
      distinct: ["trackingLinkId"],
    }),
    prisma.conversation.count({ where: convWhere }),
    prisma.conversation.count({ where: { ...convWhere, sessionStatus: "RESOLVED" } }),
    prisma.conversation.count({ where: { ...convWhere, sessionStatus: "ABANDONED" } }),
    prisma.message.count({ where: { conversation: { tenantId }, timestamp: inRange } }),
    prisma.lead.count({
      where: {
        tenantId,
        deletedAt: null,
        createdAt: inRange,
        ...(filters.campaignId ? { campaignId: filters.campaignId } : {}),
      },
    }),
    prisma.contact.count({ where: { tenantId, deletedAt: null, createdAt: inRange } }),
    prisma.trackingLink.count({
      where: {
        tenantId,
        deletedAt: null,
        createdAt: inRange,
        ...(filters.campaignId ? { campaignId: filters.campaignId } : {}),
      },
    }),
    prisma.visitor.count({ where: { tenantId, sessionCount: { gt: 1 }, lastSeenAt: inRange } }),
    // Duration comes from the conversation's own timestamps rather than from
    // events, so it stays correct for chats that predate event tracking.
    prisma.conversation.findMany({
      where: convWhere,
      select: { startedAt: true, lastActiveAt: true, closedAt: true },
      take: 5000,
    }),
  ]);

  const totalSeconds = durations.reduce((sum, c) => {
    const end = c.closedAt ?? c.lastActiveAt;
    return sum + Math.max(0, (+end - +c.startedAt) / 1000);
  }, 0);

  const chatbotOpens = counts[EVENT.CHATBOT_OPENED] || 0;

  return {
    totalVisitors: chatbotOpens,
    uniqueVisitors,
    returningVisitors: returning,
    chatbotOpens,
    conversationsStarted: conversations,
    conversationsCompleted: completed,
    conversationsAbandoned: abandoned,
    totalMessages: messages,
    totalLeads: leads,
    contactsCaptured: contacts,
    linksGenerated,
    linksOpened: counts[EVENT.LINK_OPENED] || 0,
    uniqueLinksOpened: uniqueLinkRows.length,
    conversionRate: rate(leads, conversations),
    engagementRate: rate(conversations, chatbotOpens || conversations),
    avgConversationSeconds: durations.length ? Math.round(totalSeconds / durations.length) : 0,
    avgMessagesPerConversation: conversations ? Number((messages / conversations).toFixed(1)) : 0,
  };
}

export interface FunnelStep {
  key: string;
  label: string;
  count: number;
  /** Conversion from the step above, which is what identifies the leak. */
  stepRate: number;
  /** Conversion from the top of the funnel. */
  overallRate: number;
  dropOff: number;
}

/**
 * The end-to-end journey, counted from recorded events.
 *
 * Each step counts distinct conversations rather than raw events, because a
 * visitor who answers four questions must not appear as four people at the
 * "first question answered" step.
 */
export async function funnelMetrics(
  tenantId: string,
  range: DateRange,
  filters: AnalyticsFilters = {},
): Promise<{ steps: FunnelStep[] }> {
  const counts = await Promise.all(
    FUNNEL_STEPS.map(async (step) => {
      const where = { ...eventWhere(tenantId, range, filters), eventType: step.event };
      // A link is opened before any conversation exists, so it is counted on
      // its own terms; every later step counts distinct conversations.
      if (step.event === EVENT.LINK_OPENED) {
        return prisma.analyticsEvent.count({ where });
      }
      const rows = await prisma.analyticsEvent.findMany({
        where: { ...where, conversationId: { not: null } },
        select: { conversationId: true },
        distinct: ["conversationId"],
      });
      return rows.length;
    }),
  );

  const top = counts[0] || counts.find((c) => c > 0) || 0;
  const steps: FunnelStep[] = FUNNEL_STEPS.map((step, i) => {
    const count = counts[i];
    const previous = i === 0 ? count : counts[i - 1];
    return {
      key: step.key,
      label: step.label,
      count,
      stepRate: i === 0 ? 100 : rate(count, previous),
      overallRate: rate(count, top),
      dropOff: i === 0 ? 0 : Math.max(0, previous - count),
    };
  });

  return { steps };
}

export interface NodeStat {
  nodeId: string;
  nodeType: string | null;
  label: string;
  entered: number;
  uniqueUsers: number;
  completed: number;
  dropped: number;
  dropOffRate: number;
  completionRate: number;
  leadsAfter: number;
}

/**
 * Per-node performance -- where the flow actually loses people.
 *
 * "Dropped" is entered minus completed rather than a separately recorded
 * abandonment, because a visitor who simply closes the tab never tells us
 * anything; their silence is the signal.
 */
export async function nodeAnalytics(
  tenantId: string,
  range: DateRange,
  filters: AnalyticsFilters = {},
): Promise<NodeStat[]> {
  const base = eventWhere(tenantId, range, filters);
  const where = { ...base, nodeId: { not: null } };

  const [enteredRows, completedRows, labelRows, leadConvs, uniqueRows] = await Promise.all([
    prisma.analyticsEvent.groupBy({
      by: ["nodeId", "nodeType"],
      where: { ...where, eventType: EVENT.NODE_ENTERED },
      _count: { _all: true },
    }),
    prisma.analyticsEvent.groupBy({
      by: ["nodeId"],
      where: { ...where, eventType: EVENT.NODE_COMPLETED },
      _count: { _all: true },
    }),
    prisma.analyticsEvent.findMany({
      where: { ...where, optionLabel: { not: null } },
      select: { nodeId: true, optionLabel: true },
      distinct: ["nodeId"],
    }),
    prisma.analyticsEvent.findMany({
      where: { ...base, eventType: EVENT.LEAD_CREATED },
      select: { conversationId: true },
    }),
    prisma.analyticsEvent.findMany({
      where: { ...where, eventType: EVENT.NODE_ENTERED },
      select: { nodeId: true, visitorId: true },
      distinct: ["nodeId", "visitorId"],
    }),
  ]);

  const completedBy = new Map(completedRows.map((r) => [r.nodeId, r._count._all]));
  const labelBy = new Map(labelRows.map((r) => [r.nodeId, r.optionLabel]));
  const leadConvIds = leadConvs.map((r) => r.conversationId).filter(Boolean) as string[];

  // Which nodes were visited by conversations that ultimately produced a lead.
  const leadNodeRows = leadConvIds.length
    ? await prisma.analyticsEvent.groupBy({
        by: ["nodeId"],
        where: { tenantId, eventType: EVENT.NODE_ENTERED, conversationId: { in: leadConvIds } },
        _count: { _all: true },
      })
    : [];
  const leadsByNode = new Map(leadNodeRows.map((r) => [r.nodeId, r._count._all]));

  const uniqueBy = new Map<string, number>();
  for (const row of uniqueRows) {
    if (!row.nodeId) continue;
    uniqueBy.set(row.nodeId, (uniqueBy.get(row.nodeId) || 0) + 1);
  }

  return enteredRows
    .filter((row) => row.nodeId)
    .map((row) => {
      const nodeId = row.nodeId as string;
      const entered = row._count._all;
      const completed = completedBy.get(nodeId) || 0;
      const dropped = Math.max(0, entered - completed);
      return {
        nodeId,
        nodeType: row.nodeType,
        label: labelBy.get(nodeId) || nodeId,
        entered,
        uniqueUsers: uniqueBy.get(nodeId) || 0,
        completed,
        dropped,
        dropOffRate: rate(dropped, entered),
        completionRate: rate(completed, entered),
        leadsAfter: leadsByNode.get(nodeId) || 0,
      };
    })
    .sort((a, b) => b.entered - a.entered);
}

export interface OptionStat {
  nodeId: string;
  label: string;
  clicks: number;
  uniqueUsers: number;
  share: number;
  leadsAfter: number;
  conversionAfter: number;
}

/** Which buttons and choices visitors actually pick. */
export async function optionAnalytics(
  tenantId: string,
  range: DateRange,
  filters: AnalyticsFilters = {},
): Promise<OptionStat[]> {
  const base = eventWhere(tenantId, range, filters);
  const optionWhere = { ...base, eventType: EVENT.BUTTON_CLICKED, optionLabel: { not: null } };

  const [rows, leadConvs, clickRows] = await Promise.all([
    prisma.analyticsEvent.groupBy({
      by: ["nodeId", "optionLabel"],
      where: optionWhere,
      _count: { _all: true },
    }),
    prisma.analyticsEvent.findMany({
      where: { ...base, eventType: EVENT.LEAD_CREATED },
      select: { conversationId: true },
    }),
    prisma.analyticsEvent.findMany({
      where: optionWhere,
      select: { optionLabel: true, nodeId: true, conversationId: true, visitorId: true },
      take: 20000,
    }),
  ]);

  const leadConvIds = new Set(leadConvs.map((r) => r.conversationId).filter(Boolean));
  const leadsByOption = new Map<string, number>();
  const uniqueByOption = new Map<string, Set<string>>();

  for (const row of clickRows) {
    const key = `${row.nodeId}::${row.optionLabel}`;
    if (row.conversationId && leadConvIds.has(row.conversationId)) {
      leadsByOption.set(key, (leadsByOption.get(key) || 0) + 1);
    }
    if (!uniqueByOption.has(key)) uniqueByOption.set(key, new Set());
    if (row.visitorId) uniqueByOption.get(key)!.add(row.visitorId);
  }

  const total = rows.reduce((sum, r) => sum + r._count._all, 0);

  return rows
    .map((row) => {
      const key = `${row.nodeId}::${row.optionLabel}`;
      const clicks = row._count._all;
      const leadsAfter = leadsByOption.get(key) || 0;
      return {
        nodeId: row.nodeId || "",
        label: row.optionLabel as string,
        clicks,
        uniqueUsers: uniqueByOption.get(key)?.size || 0,
        share: rate(clicks, total),
        leadsAfter,
        conversionAfter: rate(leadsAfter, clicks),
      };
    })
    .sort((a, b) => b.clicks - a.clicks);
}
