import prisma from "@/lib/prisma";
import { EVENT } from "./events";
import { DateRange, rate, eachDay, dayKey, runSequential } from "./range";
import { durationByCampaign, countByDay, countByHourAndWeekday, readAll } from "./aggregate";
import type { AnalyticsFilters } from "./queries";

/**
 * Dimensional breakdowns: campaigns, links, traffic sources, devices, time,
 * forms, AI and the individual journey.
 *
 * As in `queries.ts`, `tenantId` is required on every function and is applied
 * in the database, never in JavaScript after the fact.
 */

/** Conversations carry their context as a JSON blob; read it defensively. */
function parseInfo(raw: string | null): Record<string, any> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export interface CampaignStat {
  campaignId: string;
  name: string;
  slug: string;
  linksGenerated: number;
  linksOpened: number;
  uniqueOpens: number;
  openRate: number;
  conversations: number;
  formsStarted: number;
  formsCompleted: number;
  leads: number;
  conversionRate: number;
  avgConversationSeconds: number;
}

export async function campaignAnalytics(
  tenantId: string,
  range: DateRange,
): Promise<CampaignStat[]> {
  const inRange = { gte: range.start, lte: range.end };

  const campaigns = await prisma.campaign.findMany({
    where: { tenantId, deletedAt: null },
    select: { id: true, name: true, slug: true },
    orderBy: { createdAt: "desc" },
  });
  if (!campaigns.length) return [];

  const ids = campaigns.map((c) => c.id);

  const [links, opens, uniqueOpens, convs, forms, leads, durations] = await Promise.all([
    prisma.trackingLink.groupBy({
      by: ["campaignId"],
      where: { tenantId, deletedAt: null, campaignId: { in: ids } },
      _count: { _all: true },
    }),
    prisma.analyticsEvent.groupBy({
      by: ["campaignId"],
      where: { tenantId, timestamp: inRange, eventType: EVENT.LINK_OPENED, campaignId: { in: ids } },
      _count: { _all: true },
    }),
    prisma.analyticsEvent.findMany({
      where: {
        tenantId,
        timestamp: inRange,
        eventType: EVENT.LINK_OPENED,
        campaignId: { in: ids },
        trackingLinkId: { not: null },
      },
      select: { campaignId: true, trackingLinkId: true },
      distinct: ["campaignId", "trackingLinkId"],
    }),
    prisma.conversation.groupBy({
      by: ["campaignId"],
      where: { tenantId, startedAt: inRange, campaignId: { in: ids } },
      _count: { _all: true },
    }),
    prisma.analyticsEvent.groupBy({
      by: ["campaignId", "eventType"],
      where: {
        tenantId,
        timestamp: inRange,
        campaignId: { in: ids },
        eventType: { in: [EVENT.FORM_STARTED, EVENT.FORM_COMPLETED] },
      },
      _count: { _all: true },
    }),
    prisma.lead.groupBy({
      by: ["campaignId"],
      where: { tenantId, deletedAt: null, createdAt: inRange, campaignId: { in: ids } },
      _count: { _all: true },
    }),
    durationByCampaign(tenantId, range),
  ]);

  const num = (rows: Array<{ campaignId: string | null; _count: { _all: number } }>, id: string) =>
    rows.find((r) => r.campaignId === id)?._count._all || 0;

  const uniqueByCampaign = new Map<string, number>();
  for (const row of uniqueOpens) {
    if (!row.campaignId) continue;
    uniqueByCampaign.set(row.campaignId, (uniqueByCampaign.get(row.campaignId) || 0) + 1);
  }

  return campaigns.map((campaign) => {
    const linksGenerated = num(links, campaign.id);
    const linksOpened = num(opens, campaign.id);
    const conversations = num(convs, campaign.id);
    const leadCount = num(leads, campaign.id);
    const started =
      forms.find((f) => f.campaignId === campaign.id && f.eventType === EVENT.FORM_STARTED)?._count._all || 0;
    const completed =
      forms.find((f) => f.campaignId === campaign.id && f.eventType === EVENT.FORM_COMPLETED)?._count._all || 0;
    const averageSeconds = durations.get(campaign.id) ?? 0;

    return {
      campaignId: campaign.id,
      name: campaign.name,
      slug: campaign.slug,
      linksGenerated,
      linksOpened,
      uniqueOpens: uniqueByCampaign.get(campaign.id) || 0,
      openRate: rate(linksOpened, linksGenerated),
      conversations,
      formsStarted: started,
      formsCompleted: completed,
      leads: leadCount,
      conversionRate: rate(leadCount, conversations),
      avgConversationSeconds: averageSeconds,
    };
  });
}

export type LinkSort =
  | "mostOpened"
  | "leastOpened"
  | "mostConversations"
  | "mostLeads"
  | "highestConversion"
  | "openedNoConversation"
  | "conversationNoLead";

export interface LinkStat {
  id: string;
  token: string;
  contactName: string | null;
  contactEmail: string | null;
  campaignName: string | null;
  flowName: string | null;
  opens: number;
  uniqueOpens: number;
  firstOpenedAt: Date | null;
  lastOpenedAt: Date | null;
  conversations: number;
  leads: number;
  conversionRate: number;
}

export async function linkAnalytics(
  tenantId: string,
  range: DateRange,
  sort: LinkSort = "mostOpened",
  limit = 200,
): Promise<LinkStat[]> {
  // Every link, read in pages. A cap here meant a workspace past it saw a
  // silently truncated list with no indication anything was missing.
  const links = await readAll<any>((cursorId, take) =>
    prisma.trackingLink.findMany({
      where: { tenantId, deletedAt: null, createdAt: { lte: range.end } },
      orderBy: { id: "asc" },
      ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
      take,
    select: {
      id: true,
      token: true,
      openCount: true,
      conversationCount: true,
      leadGenerated: true,
      firstOpenedAt: true,
      lastOpenedAt: true,
      contact: { select: { name: true, email: true } },
      campaign: { select: { name: true } },
      flow: { select: { name: true } },
      },
    }),
  );
  if (!links.length) return [];

  const ids = links.map((l) => l.id);
  const [uniqueRows, leadRows] = await Promise.all([
    prisma.analyticsEvent.findMany({
      where: {
        tenantId,
        eventType: EVENT.LINK_OPENED,
        trackingLinkId: { in: ids },
        visitorId: { not: null },
      },
      select: { trackingLinkId: true, visitorId: true },
      distinct: ["trackingLinkId", "visitorId"],
    }),
    prisma.analyticsEvent.groupBy({
      by: ["trackingLinkId"],
      where: { tenantId, eventType: EVENT.LEAD_CREATED, trackingLinkId: { in: ids } },
      _count: { _all: true },
    }),
  ]);

  const uniqueBy = new Map<string, number>();
  for (const row of uniqueRows) {
    if (!row.trackingLinkId) continue;
    uniqueBy.set(row.trackingLinkId, (uniqueBy.get(row.trackingLinkId) || 0) + 1);
  }
  const leadsBy = new Map(leadRows.map((r) => [r.trackingLinkId, r._count._all]));

  const stats: LinkStat[] = links.map((link) => {
    const leads = leadsBy.get(link.id) ?? (link.leadGenerated ? 1 : 0);
    return {
      id: link.id,
      token: link.token,
      contactName: link.contact?.name ?? null,
      contactEmail: link.contact?.email ?? null,
      campaignName: link.campaign?.name ?? null,
      flowName: link.flow?.name ?? null,
      opens: link.openCount,
      uniqueOpens: uniqueBy.get(link.id) || 0,
      firstOpenedAt: link.firstOpenedAt,
      lastOpenedAt: link.lastOpenedAt,
      conversations: link.conversationCount,
      leads,
      conversionRate: rate(leads, link.conversationCount),
    };
  });

  const sorted = (() => {
    switch (sort) {
      case "leastOpened":
        return stats.sort((a, b) => a.opens - b.opens);
      case "mostConversations":
        return stats.sort((a, b) => b.conversations - a.conversations);
      case "mostLeads":
        return stats.sort((a, b) => b.leads - a.leads);
      case "highestConversion":
        return stats.sort((a, b) => b.conversionRate - a.conversionRate);
      // These two are the actionable segments: a link that was opened but
      // never started a chat, and a chat that never became a lead.
      case "openedNoConversation":
        return stats.filter((s) => s.opens > 0 && s.conversations === 0).sort((a, b) => b.opens - a.opens);
      case "conversationNoLead":
        return stats.filter((s) => s.conversations > 0 && s.leads === 0).sort((a, b) => b.conversations - a.conversations);
      default:
        return stats.sort((a, b) => b.opens - a.opens);
    }
  })();

  return sorted.slice(0, limit);
}

export interface SourceStat {
  source: string;
  medium: string | null;
  campaign: string | null;
  visitors: number;
  conversations: number;
  leads: number;
  conversionRate: number;
}

/**
 * Traffic sources, read from what each conversation recorded about itself.
 *
 * A conversation with no referrer and no UTM tags is "Direct" -- naming it
 * explicitly rather than leaving a blank row, since blank reads as a bug.
 */
export async function sourceAnalytics(tenantId: string, range: DateRange): Promise<SourceStat[]> {
  // Read in full, in pages. Source and device live inside a JSON blob the
  // database cannot group by, so the rows are genuinely needed — but a cap here
  // meant a busy workspace's traffic breakdown was quietly built from a slice.
  const conversations = await readAll<{
    id: string;
    visitorInfo: string | null;
    visitorId: string;
    campaignId: string | null;
  }>((cursorId, take) =>
    prisma.conversation.findMany({
      where: { tenantId, startedAt: { gte: range.start, lte: range.end } },
      select: { id: true, visitorInfo: true, visitorId: true, campaignId: true },
      orderBy: { id: "asc" },
      ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
      take,
    }),
  );
  if (!conversations.length) return [];

  const leadRows = await prisma.lead.findMany({
    where: { tenantId, deletedAt: null, createdAt: { gte: range.start, lte: range.end } },
    select: { conversationId: true },
  });
  const leadConvs = new Set(leadRows.map((l) => l.conversationId).filter(Boolean));

  const buckets = new Map<
    string,
    { source: string; medium: string | null; campaign: string | null; visitors: Set<string>; conversations: number; leads: number }
  >();

  for (const conv of conversations) {
    const info = parseInfo(conv.visitorInfo);
    const utm = (info.utm || {}) as Record<string, string>;
    const referrer = typeof info.referrer === "string" ? info.referrer : "";

    let source = utm.utmSource || "";
    if (!source) {
      if (conv.campaignId) source = "Campaign";
      else if (referrer) {
        try {
          source = new URL(referrer).hostname || "Referral";
        } catch {
          source = "Referral";
        }
      } else source = "Direct";
    }

    const key = `${source}::${utm.utmMedium || ""}::${utm.utmCampaign || ""}`;
    if (!buckets.has(key)) {
      buckets.set(key, {
        source,
        medium: utm.utmMedium || null,
        campaign: utm.utmCampaign || null,
        visitors: new Set(),
        conversations: 0,
        leads: 0,
      });
    }
    const bucket = buckets.get(key)!;
    bucket.conversations += 1;
    if (conv.visitorId) bucket.visitors.add(conv.visitorId);
    if (leadConvs.has(conv.id)) bucket.leads += 1;
  }

  return [...buckets.values()]
    .map((b) => ({
      source: b.source,
      medium: b.medium,
      campaign: b.campaign,
      visitors: b.visitors.size,
      conversations: b.conversations,
      leads: b.leads,
      conversionRate: rate(b.leads, b.conversations),
    }))
    .sort((a, b) => b.conversations - a.conversations);
}

export interface DeviceStat {
  device: string;
  conversations: number;
  leads: number;
  conversionRate: number;
}

export async function deviceAnalytics(
  tenantId: string,
  range: DateRange,
): Promise<{ devices: DeviceStat[]; browsers: DeviceStat[] }> {
  const conversations = await readAll<{ id: string; visitorInfo: string | null }>((cursorId, take) =>
    prisma.conversation.findMany({
      where: { tenantId, startedAt: { gte: range.start, lte: range.end } },
      select: { id: true, visitorInfo: true },
      orderBy: { id: "asc" },
      ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
      take,
    }),
  );

  const leadRows = await prisma.lead.findMany({
    where: { tenantId, deletedAt: null, createdAt: { gte: range.start, lte: range.end } },
    select: { conversationId: true },
  });
  const leadConvs = new Set(leadRows.map((l) => l.conversationId).filter(Boolean));

  const tally = (pick: (info: Record<string, any>) => string) => {
    const map = new Map<string, { conversations: number; leads: number }>();
    for (const conv of conversations) {
      const key = pick(parseInfo(conv.visitorInfo)) || "Unknown";
      const entry = map.get(key) || { conversations: 0, leads: 0 };
      entry.conversations += 1;
      if (leadConvs.has(conv.id)) entry.leads += 1;
      map.set(key, entry);
    }
    return [...map.entries()]
      .map(([device, v]) => ({
        device,
        conversations: v.conversations,
        leads: v.leads,
        conversionRate: rate(v.leads, v.conversations),
      }))
      .sort((a, b) => b.conversations - a.conversations);
  };

  return {
    devices: tally((info) => {
      const d = info.device;
      if (typeof d === "string") return d;
      if (d && typeof d === "object" && typeof d.type === "string") return d.type;
      return "Unknown";
    }),
    browsers: tally((info) => {
      const d = info.device;
      if (d && typeof d === "object" && typeof d.browser === "string") return d.browser;
      return "Unknown";
    }),
  };
}

export interface TimelinePoint {
  key: string;
  label: string;
  conversations: number;
  leads: number;
  messages: number;
}

/** Daily trend plus hour-of-day distribution. */
export async function timelineAnalytics(tenantId: string, range: DateRange) {
  // Grouped in the database rather than by pulling every conversation and lead
  // into memory to bucket them by date here. That approach was capped at 50,000
  // of each, so a busy workspace's chart silently flattened out.
  const { convDays, leadDays, convClock, leadClock } = await runSequential({
    convDays: () => countByDay("Conversation", tenantId, range),
    leadDays: () => countByDay("Lead", tenantId, range),
    convClock: () => countByHourAndWeekday("Conversation", tenantId, range),
    leadClock: () => countByHourAndWeekday("Lead", tenantId, range),
  });

  const daily = new Map<string, TimelinePoint>();
  for (const day of eachDay(range)) {
    daily.set(dayKey(day), {
      key: dayKey(day),
      label: day.toLocaleDateString(undefined, { day: "numeric", month: "short" }),
      conversations: 0,
      leads: 0,
      messages: 0,
    });
  }
  for (const row of convDays) {
    const point = daily.get(row.day);
    if (point) point.conversations = row.count;
  }
  for (const row of leadDays) {
    const point = daily.get(row.day);
    if (point) point.leads = row.count;
  }

  const hourly = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    label: `${String(hour).padStart(2, "0")}:00`,
    conversations: convClock.hourly[hour],
    leads: leadClock.hourly[hour],
  }));

  const weekdayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const weekday = weekdayNames.map((label, index) => ({
    label,
    conversations: convClock.weekday[index],
    leads: leadClock.weekday[index],
  }));

  const busiestHour = [...hourly].sort((a, b) => b.conversations - a.conversations)[0] || null;
  const bestHour = [...hourly].sort((a, b) => b.leads - a.leads)[0] || null;
  const bestDay = [...weekday].sort((a, b) => b.leads - a.leads)[0] || null;

  return {
    daily: [...daily.values()],
    hourly,
    weekday,
    busiestHour: busiestHour && busiestHour.conversations ? busiestHour.label : null,
    highestConvertingHour: bestHour && bestHour.leads ? bestHour.label : null,
    bestLeadDay: bestDay && bestDay.leads ? bestDay.label : null,
  };
}

export interface FormFieldStat {
  nodeId: string;
  label: string;
  reached: number;
  completed: number;
  abandoned: number;
  completionRate: number;
}

/**
 * Which lead-form field people give up on.
 *
 * Reached is INPUT_STARTED and completed is INPUT_SUBMITTED for the same node,
 * so a field only counts as abandoned when the visitor actually saw it.
 */
export async function formFieldAnalytics(
  tenantId: string,
  range: DateRange,
  filters: AnalyticsFilters = {},
): Promise<FormFieldStat[]> {
  const where = {
    tenantId,
    timestamp: { gte: range.start, lte: range.end },
    ...(filters.flowId ? { flowId: filters.flowId } : {}),
    // Honoured here too, or narrowing the drop-off screen to one campaign
    // would filter the step table while leaving the form table unfiltered --
    // two tables on one page disagreeing about what they are showing.
    ...(filters.campaignId ? { campaignId: filters.campaignId } : {}),
    nodeId: { not: null },
  };

  const [startedRows, submittedRows, labelRows] = await Promise.all([
    prisma.analyticsEvent.groupBy({
      by: ["nodeId"],
      where: { ...where, eventType: EVENT.INPUT_STARTED },
      _count: { _all: true },
    }),
    prisma.analyticsEvent.groupBy({
      by: ["nodeId"],
      where: { ...where, eventType: EVENT.INPUT_SUBMITTED },
      _count: { _all: true },
    }),
    prisma.analyticsEvent.findMany({
      where: { ...where, eventType: EVENT.INPUT_STARTED, optionLabel: { not: null } },
      select: { nodeId: true, optionLabel: true },
      distinct: ["nodeId"],
    }),
  ]);

  const submittedBy = new Map(submittedRows.map((r) => [r.nodeId, r._count._all]));
  const labelBy = new Map(labelRows.map((r) => [r.nodeId, r.optionLabel]));

  return startedRows
    .filter((r) => r.nodeId)
    .map((row) => {
      const nodeId = row.nodeId as string;
      const reached = row._count._all;
      const completed = submittedBy.get(nodeId) || 0;
      return {
        nodeId,
        label: labelBy.get(nodeId) || nodeId,
        reached,
        completed,
        abandoned: Math.max(0, reached - completed),
        completionRate: rate(completed, reached),
      };
    })
    .sort((a, b) => a.completionRate - b.completionRate);
}

/** AI usage, shown only when the tenant has AI switched on. */
export async function aiAnalytics(tenantId: string, range: DateRange) {
  const inRange = { gte: range.start, lte: range.end };
  const rows = await prisma.analyticsEvent.groupBy({
    by: ["eventType"],
    where: {
      tenantId,
      timestamp: inRange,
      eventType: {
        in: [EVENT.AI_REQUEST, EVENT.AI_RESPONSE, EVENT.AI_FALLBACK, EVENT.AI_ERROR, EVENT.HUMAN_HANDOFF],
      },
    },
    _count: { _all: true },
  });
  const count = (type: string) => rows.find((r) => r.eventType === type)?._count._all || 0;

  const aiConvRows = await prisma.analyticsEvent.findMany({
    where: { tenantId, timestamp: inRange, eventType: EVENT.AI_RESPONSE, conversationId: { not: null } },
    select: { conversationId: true },
    distinct: ["conversationId"],
  });
  const aiConvIds = aiConvRows.map((r) => r.conversationId).filter(Boolean) as string[];

  const aiLeads = aiConvIds.length
    ? await prisma.lead.count({
        where: { tenantId, deletedAt: null, conversationId: { in: aiConvIds } },
      })
    : 0;

  return {
    aiConversations: aiConvIds.length,
    aiRequests: count(EVENT.AI_REQUEST),
    aiResponses: count(EVENT.AI_RESPONSE),
    aiFallbacks: count(EVENT.AI_FALLBACK),
    aiErrors: count(EVENT.AI_ERROR),
    handoffs: count(EVENT.HUMAN_HANDOFF),
    aiLeads,
    aiConversionRate: rate(aiLeads, aiConvIds.length),
  };
}

export interface JourneyEntry {
  at: Date;
  event: string;
  nodeId: string | null;
  label: string | null;
  detail: string | null;
  conversationId: string | null;
  campaignId: string | null;
}

/**
 * One person's complete history, in order.
 *
 * Accepts whichever identifier the caller has -- a lead, a contact, a
 * conversation or a raw visitor id -- because the same journey is reached from
 * four different screens.
 */
export async function journeyFor(
  tenantId: string,
  key: { leadId?: string; contactId?: string; conversationId?: string; visitorId?: string },
): Promise<{ entries: JourneyEntry[]; conversationIds: string[]; truncated: boolean }> {
  const or: any[] = [];
  if (key.leadId) or.push({ leadId: key.leadId });
  if (key.contactId) or.push({ contactId: key.contactId });
  if (key.conversationId) or.push({ conversationId: key.conversationId });
  if (key.visitorId) or.push({ visitorId: key.visitorId });

  // Widen from the identifier we were given to every conversation that person
  // had, otherwise a lead's journey starts at the moment the lead was created
  // and hides everything that led to it.
  const seedWhere: any = { tenantId, deletedAt: null };
  if (key.leadId) seedWhere.id = key.leadId;
  else if (key.contactId) seedWhere.contactId = key.contactId;

  let conversationIds: string[] = [];
  if (key.conversationId) conversationIds = [key.conversationId];
  if (key.leadId || key.contactId) {
    const leads = await prisma.lead.findMany({ where: seedWhere, select: { conversationId: true, contactId: true } });
    conversationIds.push(...(leads.map((l) => l.conversationId).filter(Boolean) as string[]));
  }
  if (key.visitorId) {
    const convs = await prisma.conversation.findMany({
      where: { tenantId, visitorId: key.visitorId },
      select: { id: true },
    });
    conversationIds.push(...convs.map((c) => c.id));
  }
  conversationIds = [...new Set(conversationIds)];
  if (conversationIds.length) or.push({ conversationId: { in: conversationIds } });

  if (!or.length) return { entries: [], conversationIds: [], truncated: false };

  // The only bound left in this module, and it is a rendering one: a browser
  // cannot usefully draw an unbounded timeline. Asking for one more row than we
  // will show is what lets the caller say so honestly instead of quietly
  // presenting a partial history as complete.
  const events = await prisma.analyticsEvent.findMany({
    where: { tenantId, OR: or },
    orderBy: { timestamp: "asc" },
    take: 5000 + 1,
    select: {
      timestamp: true,
      eventType: true,
      nodeId: true,
      optionLabel: true,
      metadata: true,
      conversationId: true,
      campaignId: true,
    },
  });

  const truncated = events.length > 5000;

  return {
    truncated,
    entries: events.slice(0, 5000).map((e) => ({
      at: e.timestamp,
      event: e.eventType,
      nodeId: e.nodeId,
      label: e.optionLabel,
      detail: e.metadata,
      conversationId: e.conversationId,
      campaignId: e.campaignId,
    })),
    conversationIds,
  };
}
