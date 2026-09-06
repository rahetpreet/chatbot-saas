import prisma from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { DateRange } from "./range";
import type { AnalyticsFilters } from "./queries";

/**
 * Aggregations the query builder cannot express.
 *
 * These exist to remove row caps. Averaging conversation length by fetching
 * 5,000 conversations and adding them up in JavaScript is correct only until a
 * workspace has 5,001 — after that the figure is quietly wrong, with nothing on
 * screen to say so. A silently incorrect number is worse than a slow one, so
 * the database does the arithmetic over every matching row instead.
 *
 * Every statement is a parameterised tagged template. Values are never
 * interpolated into SQL text, and `tenantId` is always the first condition.
 */

/** Optional filters as SQL fragments, so the caller cannot forget the tenant. */
function conditions(tenantId: string, range: DateRange, filters: AnalyticsFilters, column: string) {
  const parts = [
    Prisma.sql`"tenantId" = ${tenantId}`,
    Prisma.sql`${Prisma.raw(`"${column}"`)} >= ${range.start}`,
    Prisma.sql`${Prisma.raw(`"${column}"`)} <= ${range.end}`,
  ];
  if (filters.flowId) parts.push(Prisma.sql`"flowId" = ${filters.flowId}`);
  if (filters.campaignId) parts.push(Prisma.sql`"campaignId" = ${filters.campaignId}`);
  if (filters.flowVersion) parts.push(Prisma.sql`"flowVersion" = ${filters.flowVersion}`);
  return Prisma.join(parts, " AND ");
}

export interface DurationSummary {
  averageSeconds: number;
  conversations: number;
}

/** Mean conversation length across every matching conversation, uncapped. */
export async function conversationDuration(
  tenantId: string,
  range: DateRange,
  filters: AnalyticsFilters = {},
): Promise<DurationSummary> {
  const rows = await prisma.$queryRaw<Array<{ avg_seconds: number | null; total: bigint }>>`
    SELECT
      AVG(EXTRACT(EPOCH FROM (COALESCE("closedAt", "lastActiveAt") - "startedAt")))::float AS avg_seconds,
      COUNT(*)::bigint AS total
    FROM "Conversation"
    WHERE ${conditions(tenantId, range, filters, "startedAt")}
  `;
  const row = rows[0];
  return {
    averageSeconds: Math.max(0, Math.round(row?.avg_seconds ?? 0)),
    conversations: Number(row?.total ?? 0),
  };
}

/** Mean conversation length per campaign, uncapped. */
export async function durationByCampaign(
  tenantId: string,
  range: DateRange,
): Promise<Map<string, number>> {
  const rows = await prisma.$queryRaw<Array<{ campaignId: string | null; avg_seconds: number | null }>>`
    SELECT "campaignId",
           AVG(EXTRACT(EPOCH FROM (COALESCE("closedAt", "lastActiveAt") - "startedAt")))::float AS avg_seconds
    FROM "Conversation"
    WHERE "tenantId" = ${tenantId}
      AND "startedAt" >= ${range.start}
      AND "startedAt" <= ${range.end}
      AND "campaignId" IS NOT NULL
    GROUP BY "campaignId"
  `;
  const out = new Map<string, number>();
  for (const row of rows) {
    if (row.campaignId) out.set(row.campaignId, Math.max(0, Math.round(row.avg_seconds ?? 0)));
  }
  return out;
}

export interface DayCount {
  day: string;
  count: number;
}

/**
 * Rows per day, grouped in the database.
 *
 * Replaces pulling every conversation and every lead into memory to bucket them
 * by date in JavaScript, which was capped at 50,000 of each.
 */
export async function countByDay(
  table: "Conversation" | "Lead",
  tenantId: string,
  range: DateRange,
): Promise<DayCount[]> {
  const column = table === "Conversation" ? "startedAt" : "createdAt";
  // Lead is soft-deleted; Conversation is not.
  const notDeleted = table === "Lead" ? Prisma.sql` AND "deletedAt" IS NULL` : Prisma.empty;

  const rows = await prisma.$queryRaw<Array<{ day: Date; total: bigint }>>`
    SELECT date_trunc('day', ${Prisma.raw(`"${column}"`)}) AS day, COUNT(*)::bigint AS total
    FROM ${Prisma.raw(`"${table}"`)}
    WHERE "tenantId" = ${tenantId}
      AND ${Prisma.raw(`"${column}"`)} >= ${range.start}
      AND ${Prisma.raw(`"${column}"`)} <= ${range.end}${notDeleted}
    GROUP BY 1
    ORDER BY 1
  `;

  return rows.map((row) => ({
    day: `${row.day.getFullYear()}-${String(row.day.getMonth() + 1).padStart(2, "0")}-${String(
      row.day.getDate(),
    ).padStart(2, "0")}`,
    count: Number(row.total),
  }));
}

/** Rows per hour of day and per weekday, grouped in the database. */
export async function countByHourAndWeekday(
  table: "Conversation" | "Lead",
  tenantId: string,
  range: DateRange,
): Promise<{ hourly: number[]; weekday: number[] }> {
  const column = table === "Conversation" ? "startedAt" : "createdAt";
  const notDeleted = table === "Lead" ? Prisma.sql` AND "deletedAt" IS NULL` : Prisma.empty;

  const rows = await prisma.$queryRaw<Array<{ hour: number; dow: number; total: bigint }>>`
    SELECT EXTRACT(HOUR FROM ${Prisma.raw(`"${column}"`)})::int AS hour,
           EXTRACT(DOW FROM ${Prisma.raw(`"${column}"`)})::int AS dow,
           COUNT(*)::bigint AS total
    FROM ${Prisma.raw(`"${table}"`)}
    WHERE "tenantId" = ${tenantId}
      AND ${Prisma.raw(`"${column}"`)} >= ${range.start}
      AND ${Prisma.raw(`"${column}"`)} <= ${range.end}${notDeleted}
    GROUP BY 1, 2
  `;

  const hourly = Array(24).fill(0);
  const weekday = Array(7).fill(0);
  for (const row of rows) {
    hourly[row.hour] += Number(row.total);
    weekday[row.dow] += Number(row.total);
  }
  return { hourly, weekday };
}

/**
 * Reads every matching row in batches.
 *
 * For the two breakdowns that genuinely need the rows — traffic source and
 * device both live inside a JSON blob the database cannot group by — this walks
 * the whole result set instead of stopping at an arbitrary cap.
 */
export async function readAll<T extends { id: string }>(
  fetchPage: (cursorId: string | null, take: number) => Promise<T[]>,
  pageSize = 5000,
): Promise<T[]> {
  const out: T[] = [];
  let cursor: string | null = null;
  // A ceiling on iterations, not on rows: a page that returns nothing new would
  // otherwise loop forever if a caller's query were ever non-deterministic.
  for (let page = 0; page < 1000; page++) {
    const rows: T[] = await fetchPage(cursor, pageSize);
    if (!rows.length) break;
    out.push(...rows);
    if (rows.length < pageSize) break;
    cursor = rows[rows.length - 1].id;
  }
  return out;
}

/** Mean conversation length per flow, uncapped. */
export async function durationByFlow(tenantId: string, range: DateRange): Promise<Map<string, number>> {
  const rows = await prisma.$queryRaw<Array<{ flowId: string | null; avg_seconds: number | null }>>`
    SELECT "flowId",
           AVG(EXTRACT(EPOCH FROM (COALESCE("closedAt", "lastActiveAt") - "startedAt")))::float AS avg_seconds
    FROM "Conversation"
    WHERE "tenantId" = ${tenantId}
      AND "startedAt" >= ${range.start}
      AND "startedAt" <= ${range.end}
      AND "flowId" IS NOT NULL
    GROUP BY "flowId"
  `;
  const out = new Map<string, number>();
  for (const row of rows) {
    if (row.flowId) out.set(row.flowId, Math.max(0, Math.round(row.avg_seconds ?? 0)));
  }
  return out;
}

/** Conversation counts per flow and status, grouped in the database. */
export async function conversationsByFlowStatus(
  tenantId: string,
  range: DateRange,
): Promise<Map<string, { total: number; byStatus: Map<string, number> }>> {
  const rows = await prisma.$queryRaw<Array<{ flowId: string | null; sessionStatus: string; total: bigint }>>`
    SELECT "flowId", "sessionStatus", COUNT(*)::bigint AS total
    FROM "Conversation"
    WHERE "tenantId" = ${tenantId}
      AND "startedAt" >= ${range.start}
      AND "startedAt" <= ${range.end}
      AND "flowId" IS NOT NULL
    GROUP BY "flowId", "sessionStatus"
  `;

  const out = new Map<string, { total: number; byStatus: Map<string, number> }>();
  for (const row of rows) {
    if (!row.flowId) continue;
    if (!out.has(row.flowId)) out.set(row.flowId, { total: 0, byStatus: new Map() });
    const entry = out.get(row.flowId)!;
    const count = Number(row.total);
    entry.total += count;
    entry.byStatus.set(row.sessionStatus, count);
  }
  return out;
}

/** Total messages per flow, grouped in the database. */
export async function messagesByFlow(tenantId: string, range: DateRange): Promise<Map<string, number>> {
  const rows = await prisma.$queryRaw<Array<{ flowId: string | null; total: bigint }>>`
    SELECT c."flowId", COUNT(m.*)::bigint AS total
    FROM "Message" m
    JOIN "Conversation" c ON c."id" = m."conversationId"
    WHERE c."tenantId" = ${tenantId}
      AND m."timestamp" >= ${range.start}
      AND m."timestamp" <= ${range.end}
      AND c."flowId" IS NOT NULL
    GROUP BY c."flowId"
  `;
  const out = new Map<string, number>();
  for (const row of rows) {
    if (row.flowId) out.set(row.flowId, Number(row.total));
  }
  return out;
}
