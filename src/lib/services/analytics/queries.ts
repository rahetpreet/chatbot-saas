import prisma from "@/lib/prisma";
import { EVENT, FUNNEL_STEPS } from "./events";
import { DateRange, rate, runSequential } from "./range";
import { conversationDuration } from "./aggregate";

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

  // Sequential, not Promise.all.
  //
  // The connection pool holds a single connection, so issuing these at once
  // cannot make them run in parallel — it only queues them, and anything still
  // waiting after ten seconds fails. The dashboard returned an error instead of
  // a number for exactly this reason.
  // One grouped query rather than three counts for total, resolved and
  // abandoned. Same answer, a third of the round trips to Singapore. Kept
  // outside runSequential because passing a Prisma groupBy through a generic
  // widens its return type.
  const byStatus = await prisma.conversation.groupBy({
    by: ["sessionStatus"],
    where: convWhere,
    _count: { _all: true },
  });

  const {
    counts,
    uniqueVisitors,
    uniqueLinkRows,
    messages,
    leads,
    contacts,
    linksGenerated,
    returning,
    duration,
  } = await runSequential({
    counts: () => countByType(tenantId, range, filters),
    uniqueVisitors: () => distinctVisitors(tenantId, range, filters),
    uniqueLinkRows: () =>
      prisma.analyticsEvent.findMany({
        where: {
          ...eventWhere(tenantId, range, filters),
          eventType: EVENT.LINK_OPENED,
          trackingLinkId: { not: null },
        },
        select: { trackingLinkId: true },
        distinct: ["trackingLinkId"],
      }),
    messages: () => prisma.message.count({ where: { conversation: { tenantId }, timestamp: inRange } }),
    leads: () =>
      prisma.lead.count({
        where: {
          tenantId,
          deletedAt: null,
          createdAt: inRange,
          ...(filters.campaignId ? { campaignId: filters.campaignId } : {}),
        },
      }),
    contacts: () => prisma.contact.count({ where: { tenantId, deletedAt: null, createdAt: inRange } }),
    linksGenerated: () =>
      prisma.trackingLink.count({
        where: {
          tenantId,
          deletedAt: null,
          createdAt: inRange,
          ...(filters.campaignId ? { campaignId: filters.campaignId } : {}),
        },
      }),
    returning: () => prisma.visitor.count({ where: { tenantId, sessionCount: { gt: 1 }, lastSeenAt: inRange } }),
    // Averaged in the database over every matching conversation. This used to
    // fetch 5,000 rows and add them up here, which was correct only until a
    // workspace had 5,001 — after that the average was quietly wrong.
    duration: () => conversationDuration(tenantId, range, filters),
  });

  const statusCount = (status: string) =>
    byStatus.find((row) => row.sessionStatus === status)?._count._all || 0;
  const conversations = byStatus.reduce((sum, row) => sum + row._count._all, 0);
  const completed = statusCount("RESOLVED");
  const abandoned = statusCount("ABANDONED");

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
    avgConversationSeconds: duration.averageSeconds,
    avgMessagesPerConversation: conversations ? Number((messages / conversations).toFixed(1)) : 0,
  };
}

export interface FunnelStep {
  key: string;
  label: string;
  count: number;
  /** Conversion from the step above, which is what identifies the leak. */
  stepRate: number | null;
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
  // Two queries for the whole funnel, not one per step.
  //
  // Grouping by (eventType, conversationId) gives one row per conversation per
  // step, so counting those rows per step IS the distinct-conversation count —
  // computed in the database rather than by pulling every event across the
  // wire, and on a single connection seven round trips to Singapore was the
  // slowest thing on the page.
  const { linkOpens, pairs } = await runSequential({
    // A link is opened before any conversation exists, so it is counted on its
    // own terms rather than as distinct conversations.
    linkOpens: () =>
      prisma.analyticsEvent.count({
        where: { ...eventWhere(tenantId, range, filters), eventType: EVENT.LINK_OPENED },
      }),
    pairs: () =>
      prisma.analyticsEvent.groupBy({
        by: ["eventType", "conversationId"],
        where: {
          ...eventWhere(tenantId, range, filters),
            eventType: {
            in: FUNNEL_STEPS.flatMap((step) => step.events).filter((e) => e !== EVENT.LINK_OPENED),
          },
          conversationId: { not: null },
        },
        _count: { _all: true },
      }),
  });

  // A step reachable by several events counts each conversation once, not
  // once per event kind — a visitor who clicks a button AND types an answer is
  // still one person who answered the first question.
  const conversationsByType = new Map<string, Set<string>>();
  for (const row of pairs) {
    if (!row.conversationId) continue;
    if (!conversationsByType.has(row.eventType)) conversationsByType.set(row.eventType, new Set());
    conversationsByType.get(row.eventType)!.add(row.conversationId);
  }

  const counts = FUNNEL_STEPS.map((step) => {
    if (step.events.includes(EVENT.LINK_OPENED)) return linkOpens;
    const reached = new Set<string>();
    for (const event of step.events) {
      for (const id of conversationsByType.get(event) ?? []) reached.add(id);
    }
    return reached.size;
  });

  const top = counts[0] || counts.find((c) => c > 0) || 0;
  const steps: FunnelStep[] = FUNNEL_STEPS.map((step, i) => {
    const count = counts[i];
    const previous = i === 0 ? count : counts[i - 1];
    return {
      key: step.key,
      label: step.label,
      count,
      // Null, not zero, when there is nothing above to convert from. A funnel
      // whose first step is unused (no campaign links) otherwise reported the
      // next step as "0% of previous", which reads as total failure.
      stepRate: i === 0 ? 100 : previous > 0 ? rate(count, previous) : null,
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

  // Kept outside runSequential: a Prisma groupBy loses its precise return type
  // when passed through a generic, and this one's _count is read.
  const rows = await prisma.analyticsEvent.groupBy({
    by: ["nodeId", "optionLabel"],
    where: optionWhere,
    _count: { _all: true },
  });

  const { leadConvs, uniquePairs, leadPairs } = await runSequential({
    leadConvs: () =>
      prisma.analyticsEvent.findMany({
        where: { ...base, eventType: EVENT.LEAD_CREATED },
        select: { conversationId: true },
      }),
    // Grouped by (node, option, visitor): the number of rows per option IS its
    // unique-visitor count, computed in the database. Fetching every click row
    // to count them here was capped at 20,000 and silently wrong beyond it.
    uniquePairs: () =>
      prisma.analyticsEvent.findMany({
        where: optionWhere,
        select: { nodeId: true, optionLabel: true, visitorId: true },
        distinct: ["nodeId", "optionLabel", "visitorId"],
      }),
    leadPairs: () =>
      prisma.analyticsEvent.findMany({
        where: optionWhere,
        select: { nodeId: true, optionLabel: true, conversationId: true },
        distinct: ["nodeId", "optionLabel", "conversationId"],
      }),
  });

  const leadConvIds = new Set(leadConvs.map((r) => r.conversationId).filter(Boolean));
  const leadsByOption = new Map<string, number>();
  const uniqueByOption = new Map<string, number>();

  for (const row of uniquePairs) {
    if (!row.visitorId) continue;
    const key = `${row.nodeId}::${row.optionLabel}`;
    uniqueByOption.set(key, (uniqueByOption.get(key) || 0) + 1);
  }
  for (const row of leadPairs) {
    if (!row.conversationId || !leadConvIds.has(row.conversationId)) continue;
    const key = `${row.nodeId}::${row.optionLabel}`;
    leadsByOption.set(key, (leadsByOption.get(key) || 0) + 1);
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
        uniqueUsers: uniqueByOption.get(key) || 0,
        share: rate(clicks, total),
        leadsAfter,
        conversionAfter: rate(leadsAfter, clicks),
      };
    })
    .sort((a, b) => b.clicks - a.clicks);
}

export interface ComparisonCounts {
  conversationsStarted: number;
  totalLeads: number;
  uniqueVisitors: number;
  totalMessages: number;
  conversionRate: number;
}

/**
 * The previous period, cheaply.
 *
 * The dashboard only needs the handful of figures its trend arrows point at.
 * Running the full `overviewMetrics` for the comparison doubled the work of the
 * whole endpoint — twelve extra queries on a single connection — to produce
 * four percentages.
 */
export async function comparisonCounts(
  tenantId: string,
  range: DateRange,
  filters: AnalyticsFilters = {},
): Promise<ComparisonCounts> {
  const inRange = { gte: range.start, lte: range.end };

  const { conversations, leads, messages, visitors } = await runSequential({
    conversations: () =>
      prisma.conversation.count({
        where: {
          tenantId,
          startedAt: inRange,
          ...(filters.flowId ? { flowId: filters.flowId } : {}),
          ...(filters.campaignId ? { campaignId: filters.campaignId } : {}),
        },
      }),
    leads: () => prisma.lead.count({ where: { tenantId, deletedAt: null, createdAt: inRange } }),
    messages: () => prisma.message.count({ where: { conversation: { tenantId }, timestamp: inRange } }),
    visitors: () => distinctVisitors(tenantId, range, filters),
  });

  return {
    conversationsStarted: conversations,
    totalLeads: leads,
    uniqueVisitors: visitors,
    totalMessages: messages,
    conversionRate: rate(leads, conversations),
  };
}
