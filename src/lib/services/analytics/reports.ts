import prisma from "@/lib/prisma";
import { DateRange } from "./range";
import { overviewMetrics, funnelMetrics, nodeAnalytics, optionAnalytics, type AnalyticsFilters } from "./queries";
import {
  campaignAnalytics,
  linkAnalytics,
  sourceAnalytics,
  deviceAnalytics,
  timelineAnalytics,
  formFieldAnalytics,
  aiAnalytics,
} from "./breakdowns";
import { leadAnalytics, conversationAnalytics, chatbotAnalytics, versionAnalytics } from "./segments";
import { buildInsights, buildRecommendations, type Insight } from "./insights";

/**
 * Report generation and snapshots.
 *
 * A report is frozen when it is generated. Re-running the query later would
 * quietly restate history — conversations close, leads change status, late
 * events arrive — and a client who forwarded March's report to their board
 * needs it to still say in June exactly what it said in March.
 */

export const REPORT_TYPES = [
  "executive",
  "chatbot",
  "campaign",
  "link",
  "flow",
  "lead",
  "conversation",
  "complete",
] as const;

export type ReportType = (typeof REPORT_TYPES)[number];

export const REPORT_LABELS: Record<ReportType, string> = {
  executive: "Executive summary",
  chatbot: "Chatbot performance",
  campaign: "Campaign performance",
  link: "Link performance",
  flow: "Flow analysis",
  lead: "Lead analysis",
  conversation: "Conversation analysis",
  complete: "Complete performance report",
};

/** Which sections each report type contains. */
const SECTIONS: Record<ReportType, string[]> = {
  executive: ["metrics", "funnel", "insights", "recommendations"],
  chatbot: ["metrics", "chatbots", "versions", "conversations"],
  campaign: ["metrics", "campaigns", "sources"],
  link: ["metrics", "links", "campaigns"],
  flow: ["nodes", "options", "formFields", "funnel"],
  lead: ["metrics", "leads", "campaigns", "sources"],
  conversation: ["conversations", "timeline", "devices", "ai"],
  complete: [
    "metrics",
    "funnel",
    "campaigns",
    "links",
    "chatbots",
    "versions",
    "nodes",
    "options",
    "formFields",
    "leads",
    "conversations",
    "sources",
    "devices",
    "timeline",
    "ai",
    "insights",
    "recommendations",
  ],
};

export interface GeneratedReport {
  type: ReportType;
  label: string;
  range: { start: string; end: string; label: string };
  filters: AnalyticsFilters;
  sections: string[];
  metrics?: Awaited<ReturnType<typeof overviewMetrics>>;
  funnel?: Awaited<ReturnType<typeof funnelMetrics>>["steps"];
  campaigns?: Awaited<ReturnType<typeof campaignAnalytics>>;
  links?: Awaited<ReturnType<typeof linkAnalytics>>;
  chatbots?: Awaited<ReturnType<typeof chatbotAnalytics>>;
  versions?: Awaited<ReturnType<typeof versionAnalytics>>;
  nodes?: Awaited<ReturnType<typeof nodeAnalytics>>;
  options?: Awaited<ReturnType<typeof optionAnalytics>>;
  formFields?: Awaited<ReturnType<typeof formFieldAnalytics>>;
  leads?: Awaited<ReturnType<typeof leadAnalytics>>;
  conversations?: Awaited<ReturnType<typeof conversationAnalytics>>;
  sources?: Awaited<ReturnType<typeof sourceAnalytics>>;
  devices?: Awaited<ReturnType<typeof deviceAnalytics>>;
  timeline?: Awaited<ReturnType<typeof timelineAnalytics>>;
  ai?: Awaited<ReturnType<typeof aiAnalytics>>;
  insights?: Insight[];
  recommendations?: Insight[];
}

/**
 * Computes a report.
 *
 * Only the sections the report type calls for are queried — a link report has
 * no reason to pay for flow analysis.
 */
export async function generateReport(
  tenantId: string,
  type: ReportType,
  range: DateRange,
  filters: AnalyticsFilters = {},
): Promise<GeneratedReport> {
  const sections = SECTIONS[type] ?? SECTIONS.executive;
  const wants = (section: string) => sections.includes(section);

  // Insights are derived from other sections, so their inputs are needed even
  // when the section itself is not shown.
  const needsMetrics = wants("metrics") || wants("insights");
  const needsNodes = wants("nodes") || wants("insights");
  const needsOptions = wants("options") || wants("insights");
  const needsCampaigns = wants("campaigns") || wants("insights");
  const needsFields = wants("formFields") || wants("insights");
  const needsDevices = wants("devices") || wants("insights");

  const [
    metrics,
    funnel,
    campaigns,
    links,
    chatbots,
    versions,
    nodes,
    options,
    formFields,
    leads,
    conversations,
    sources,
    devices,
    timeline,
    ai,
  ] = await Promise.all([
    needsMetrics ? overviewMetrics(tenantId, range, filters) : undefined,
    wants("funnel") ? funnelMetrics(tenantId, range, filters).then((f) => f.steps) : undefined,
    needsCampaigns ? campaignAnalytics(tenantId, range) : undefined,
    wants("links") ? linkAnalytics(tenantId, range, "mostOpened", 500) : undefined,
    wants("chatbots") ? chatbotAnalytics(tenantId, range) : undefined,
    wants("versions") ? versionAnalytics(tenantId, range, filters.flowId) : undefined,
    needsNodes ? nodeAnalytics(tenantId, range, filters) : undefined,
    needsOptions ? optionAnalytics(tenantId, range, filters) : undefined,
    needsFields ? formFieldAnalytics(tenantId, range, filters) : undefined,
    wants("leads") ? leadAnalytics(tenantId, range) : undefined,
    wants("conversations") ? conversationAnalytics(tenantId, range) : undefined,
    wants("sources") ? sourceAnalytics(tenantId, range) : undefined,
    needsDevices ? deviceAnalytics(tenantId, range) : undefined,
    wants("timeline") ? timelineAnalytics(tenantId, range) : undefined,
    wants("ai") ? aiAnalytics(tenantId, range) : undefined,
  ]);

  const insights =
    wants("insights") && metrics
      ? buildInsights({
          metrics,
          nodes: nodes ?? [],
          options: options ?? [],
          campaigns: campaigns ?? [],
          formFields: formFields ?? [],
          devices: devices?.devices ?? [],
        })
      : undefined;

  return {
    type,
    label: REPORT_LABELS[type],
    range: { start: range.start.toISOString(), end: range.end.toISOString(), label: range.label },
    filters,
    sections,
    ...(wants("metrics") ? { metrics } : {}),
    ...(wants("funnel") ? { funnel } : {}),
    ...(wants("campaigns") ? { campaigns } : {}),
    ...(wants("links") ? { links } : {}),
    ...(wants("chatbots") ? { chatbots } : {}),
    ...(wants("versions") ? { versions } : {}),
    ...(wants("nodes") ? { nodes } : {}),
    ...(wants("options") ? { options } : {}),
    ...(wants("formFields") ? { formFields } : {}),
    ...(wants("leads") ? { leads } : {}),
    ...(wants("conversations") ? { conversations } : {}),
    ...(wants("sources") ? { sources } : {}),
    ...(wants("devices") ? { devices } : {}),
    ...(wants("timeline") ? { timeline } : {}),
    ...(wants("ai") ? { ai } : {}),
    ...(insights ? { insights, recommendations: buildRecommendations(insights) } : {}),
  };
}

/** Generates a report and stores it, so it can be reopened unchanged. */
export async function saveReport(
  tenantId: string,
  userId: string | null,
  type: ReportType,
  range: DateRange,
  filters: AnalyticsFilters,
) {
  const report = await generateReport(tenantId, type, range, filters);
  return prisma.reportSnapshot.create({
    data: {
      tenantId,
      reportType: type,
      rangeStart: range.start,
      rangeEnd: range.end,
      filters: JSON.stringify(filters),
      metrics: JSON.stringify(report),
      insights: report.insights ? JSON.stringify(report.insights) : null,
      generatedById: userId,
    },
    select: { id: true, reportType: true, rangeStart: true, rangeEnd: true, generatedAt: true },
  });
}

/** Escapes one CSV cell. */
function cell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const text = value instanceof Date ? value.toISOString() : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function tableToCsv(title: string, rows: Array<Record<string, unknown>>): string[] {
  if (!rows.length) return [title, "(no data)", ""];
  const headers = Object.keys(rows[0]);
  return [
    title,
    headers.join(","),
    ...rows.map((row) => headers.map((header) => cell(row[header])).join(",")),
    "",
  ];
}

/**
 * Renders a stored report as CSV.
 *
 * One file with titled blocks rather than a zip of many: a client opening this
 * in a spreadsheet wants the whole picture in front of them, and a single
 * download is far easier to email onward.
 */
export function reportToCsv(report: GeneratedReport): string {
  const lines: string[] = [
    `${report.label}`,
    `Period,${cell(report.range.label)}`,
    `From,${cell(report.range.start)}`,
    `To,${cell(report.range.end)}`,
    "",
  ];

  if (report.metrics) {
    lines.push("Headline metrics", "Metric,Value");
    for (const [key, value] of Object.entries(report.metrics)) {
      lines.push(`${cell(key)},${cell(value)}`);
    }
    lines.push("");
  }

  if (report.funnel) lines.push(...tableToCsv("Conversion funnel", report.funnel as any));
  if (report.campaigns) lines.push(...tableToCsv("Campaigns", report.campaigns as any));
  if (report.links) lines.push(...tableToCsv("Links", report.links as any));
  if (report.chatbots) lines.push(...tableToCsv("Chatbots", report.chatbots as any));
  if (report.versions) lines.push(...tableToCsv("Versions", report.versions as any));
  if (report.nodes) lines.push(...tableToCsv("Flow steps", report.nodes as any));
  if (report.options) lines.push(...tableToCsv("Options selected", report.options as any));
  if (report.formFields) lines.push(...tableToCsv("Form fields", report.formFields as any));
  if (report.sources) lines.push(...tableToCsv("Traffic sources", report.sources as any));
  if (report.devices) {
    lines.push(...tableToCsv("Devices", report.devices.devices as any));
    lines.push(...tableToCsv("Browsers", report.devices.browsers as any));
  }
  if (report.timeline) lines.push(...tableToCsv("Daily trend", report.timeline.daily as any));
  if (report.leads) {
    lines.push(...tableToCsv("Leads by status", report.leads.byStatus as any));
    lines.push(...tableToCsv("Leads by campaign", report.leads.byCampaign as any));
    lines.push(...tableToCsv("Leads by chatbot", report.leads.byChatbot as any));
  }
  if (report.conversations) {
    lines.push("Conversations", "Metric,Value");
    for (const [key, value] of Object.entries(report.conversations)) lines.push(`${cell(key)},${cell(value)}`);
    lines.push("");
  }
  if (report.ai) {
    lines.push("AI", "Metric,Value");
    for (const [key, value] of Object.entries(report.ai)) lines.push(`${cell(key)},${cell(value)}`);
    lines.push("");
  }
  if (report.insights?.length) {
    lines.push(...tableToCsv("Key insights", report.insights.map((i) => ({ title: i.title, detail: i.detail })) as any));
  }
  if (report.recommendations?.length) {
    lines.push(
      ...tableToCsv(
        "Recommendations",
        report.recommendations.map((i) => ({ title: i.title, recommendation: i.recommendation })) as any,
      ),
    );
  }

  return lines.join("\n");
}
