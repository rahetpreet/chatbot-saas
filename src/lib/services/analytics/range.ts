/**
 * Date ranges for every analytics screen.
 *
 * One shared implementation on purpose: when the Overview and the Campaign
 * screen each compute "last 30 days" their own way, they disagree by a day and
 * the client reasonably concludes the whole module is wrong.
 */

export type RangePreset =
  | "today"
  | "yesterday"
  | "last7"
  | "last30"
  | "thisMonth"
  | "lastMonth"
  | "custom";

export interface DateRange {
  start: Date;
  end: Date;
  preset: RangePreset;
  label: string;
  days: number;
}

export const RANGE_LABELS: Record<RangePreset, string> = {
  today: "Today",
  yesterday: "Yesterday",
  last7: "Last 7 days",
  last30: "Last 30 days",
  thisMonth: "This month",
  lastMonth: "Last month",
  custom: "Custom range",
};

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
const endOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

/**
 * Builds a range from query parameters.
 *
 * Falls back to the last 30 days rather than erroring: a malformed date in a
 * URL should show a sensible dashboard, not an error page.
 */
export function resolveRange(params: {
  preset?: string | null;
  start?: string | null;
  end?: string | null;
  now?: Date;
}): DateRange {
  const now = params.now ?? new Date();
  const preset = (params.preset || "last30") as RangePreset;

  let start: Date;
  let end: Date;

  switch (preset) {
    case "today":
      start = startOfDay(now);
      end = endOfDay(now);
      break;
    case "yesterday":
      start = startOfDay(addDays(now, -1));
      end = endOfDay(addDays(now, -1));
      break;
    case "last7":
      start = startOfDay(addDays(now, -6));
      end = endOfDay(now);
      break;
    case "thisMonth":
      start = new Date(now.getFullYear(), now.getMonth(), 1);
      end = endOfDay(now);
      break;
    case "lastMonth":
      start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      end = endOfDay(new Date(now.getFullYear(), now.getMonth(), 0));
      break;
    case "custom": {
      const parsedStart = params.start ? new Date(params.start) : null;
      const parsedEnd = params.end ? new Date(params.end) : null;
      if (parsedStart && parsedEnd && !isNaN(+parsedStart) && !isNaN(+parsedEnd)) {
        // Accept the two dates in either order rather than returning nothing
        // when someone picks the end date first.
        const [a, b] = +parsedStart <= +parsedEnd ? [parsedStart, parsedEnd] : [parsedEnd, parsedStart];
        start = startOfDay(a);
        end = endOfDay(b);
        break;
      }
      start = startOfDay(addDays(now, -29));
      end = endOfDay(now);
      break;
    }
    case "last30":
    default:
      start = startOfDay(addDays(now, -29));
      end = endOfDay(now);
      break;
  }

  const days = Math.max(1, Math.round((+endOfDay(end) - +startOfDay(start)) / 86_400_000));
  const label =
    preset === "custom"
      ? `${start.toLocaleDateString()} – ${end.toLocaleDateString()}`
      : RANGE_LABELS[preset] || RANGE_LABELS.last30;

  return { start, end, preset, label, days };
}

/**
 * The equivalent window immediately before this one, for "compare with
 * previous period".
 *
 * It is the same number of days ending where the current range begins, so a
 * 7-day range compares against the 7 days before it — not against the same
 * dates a month ago, which would compare a week to a month.
 */
export function previousRange(range: DateRange): DateRange {
  const spanMs = +range.end - +range.start;
  const end = new Date(+range.start - 1);
  const start = new Date(+end - spanMs);
  return {
    start,
    end,
    preset: range.preset,
    label: `Previous ${range.days} day${range.days === 1 ? "" : "s"}`,
    days: range.days,
  };
}

/** Percentage change, guarding the divide-by-zero that reads as "+Infinity%". */
export function percentChange(current: number, previous: number): number | null {
  if (!previous) return current ? null : 0;
  return Number((((current - previous) / previous) * 100).toFixed(1));
}

/** Safe rate as a percentage, to one decimal. */
export function rate(part: number, whole: number): number {
  if (!whole) return 0;
  return Number(((part / whole) * 100).toFixed(1));
}

/** Every day in the range, so charts show gaps as zero instead of skipping. */
export function eachDay(range: DateRange): Date[] {
  const days: Date[] = [];
  for (let d = startOfDay(range.start); d <= range.end; d = addDays(d, 1)) days.push(new Date(d));
  return days;
}

export const dayKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
