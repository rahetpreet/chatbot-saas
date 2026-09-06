"use client";

import React from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/Card";
import { TrendingUp, TrendingDown, Minus, Lightbulb, AlertTriangle, CheckCircle2 } from "lucide-react";

/**
 * Presentation pieces shared by every Data & Reports screen.
 *
 * They deliberately render nothing rather than a zero when a number is absent:
 * a metric that was never measured and a metric that measured zero mean
 * different things, and showing "0" for the first is a lie the client cannot
 * detect.
 */

export const RANGE_PRESETS = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "last7", label: "Last 7 days" },
  { value: "last30", label: "Last 30 days" },
  { value: "thisMonth", label: "This month" },
  { value: "lastMonth", label: "Last month" },
  { value: "custom", label: "Custom range" },
] as const;

export interface RangeState {
  preset: string;
  start: string;
  end: string;
  compare: boolean;
}

export const defaultRange = (): RangeState => ({ preset: "last30", start: "", end: "", compare: false });

/** Turns range state into the query string every analytics endpoint expects. */
export function rangeQuery(range: RangeState, extra: Record<string, string | null | undefined> = {}): string {
  const params = new URLSearchParams({ preset: range.preset });
  if (range.preset === "custom" && range.start && range.end) {
    params.set("start", range.start);
    params.set("end", range.end);
  }
  if (range.compare) params.set("compare", "true");
  for (const [key, value] of Object.entries(extra)) if (value) params.set(key, value);
  return params.toString();
}

export function DateRangePicker({
  value,
  onChange,
  showCompare = true,
}: {
  value: RangeState;
  onChange: (next: RangeState) => void;
  showCompare?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        value={value.preset}
        onChange={(e) => onChange({ ...value, preset: e.target.value })}
        className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 focus:border-indigo-500 focus:outline-none"
      >
        {RANGE_PRESETS.map((preset) => (
          <option key={preset.value} value={preset.value}>
            {preset.label}
          </option>
        ))}
      </select>

      {value.preset === "custom" && (
        <>
          <input
            type="date"
            value={value.start}
            onChange={(e) => onChange({ ...value, start: e.target.value })}
            className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs text-slate-700"
          />
          <span className="text-xs text-slate-400">to</span>
          <input
            type="date"
            value={value.end}
            onChange={(e) => onChange({ ...value, end: e.target.value })}
            className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs text-slate-700"
          />
        </>
      )}

      {showCompare && (
        <label className="flex items-center gap-1.5 text-xs font-medium text-slate-600">
          <input
            type="checkbox"
            checked={value.compare}
            onChange={(e) => onChange({ ...value, compare: e.target.checked })}
            className="rounded border-slate-300"
          />
          Compare with previous period
        </label>
      )}
    </div>
  );
}

export function StatCard({
  label,
  value,
  change,
  suffix,
  hint,
}: {
  label: string;
  value: number | string | null | undefined;
  change?: number | null;
  suffix?: string;
  hint?: string;
}) {
  const display =
    value === null || value === undefined
      ? "—"
      : typeof value === "number"
        ? value.toLocaleString()
        : value;

  // A change of exactly zero is meaningful ("flat"); null means there was no
  // previous period to compare against, which is not the same thing.
  const Arrow = change === null || change === undefined ? null : change > 0 ? TrendingUp : change < 0 ? TrendingDown : Minus;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3.5">
      <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-slate-900">
        {display}
        {suffix && <span className="ml-0.5 text-base font-semibold text-slate-500">{suffix}</span>}
      </p>
      {Arrow && (
        <p
          className={`mt-1 flex items-center gap-1 text-[11px] font-bold ${
            change! > 0 ? "text-emerald-600" : change! < 0 ? "text-red-600" : "text-slate-500"
          }`}
        >
          <Arrow className="h-3 w-3" />
          {change! > 0 ? "+" : ""}
          {change!.toFixed(1)}% vs previous
        </p>
      )}
      {hint && <p className="mt-1 text-[11px] text-slate-500">{hint}</p>}
    </div>
  );
}

export interface FunnelStepView {
  key: string;
  label: string;
  count: number;
  stepRate: number | null;
  overallRate: number;
  dropOff: number;
}

/**
 * The funnel.
 *
 * Bar width is scaled against the widest step rather than against the first,
 * because a funnel whose first step is zero (no campaign links yet) would
 * otherwise render every later step at zero width and look broken.
 */
export function FunnelChart({ steps }: { steps: FunnelStepView[] }) {
  const widest = Math.max(...steps.map((s) => s.count), 1);

  return (
    <div className="space-y-2">
      {steps.map((step, index) => (
        <div key={step.key}>
          <div className="mb-1 flex items-baseline justify-between gap-2">
            <span className="text-xs font-semibold text-slate-700">
              <span className="mr-1.5 text-slate-400">{index + 1}.</span>
              {step.label}
            </span>
            <span className="shrink-0 text-xs text-slate-500">
              <span className="font-bold text-slate-900">{step.count.toLocaleString()}</span>
              {index > 0 && step.stepRate !== null && (
                <span className="ml-1.5">{step.stepRate.toFixed(1)}% of previous</span>
              )}
            </span>
          </div>
          <div className="h-6 w-full overflow-hidden rounded-md bg-slate-100">
            <div
              className="h-full rounded-md bg-gradient-to-r from-indigo-500 to-violet-500 transition-all"
              style={{ width: `${Math.max(1.5, (step.count / widest) * 100)}%` }}
            />
          </div>
          {index > 0 && step.dropOff > 0 && (
            <p className="mt-0.5 text-[11px] text-slate-500">
              {step.dropOff.toLocaleString()} did not continue from the step above
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

/** A ranked horizontal bar list — the right shape for options, sources, devices. */
export function BarList({
  items,
  emptyLabel = "Nothing recorded in this period.",
}: {
  items: Array<{ label: string; value: number; secondary?: string }>;
  emptyLabel?: string;
}) {
  if (!items.length) return <EmptyState detail={emptyLabel} />;
  const widest = Math.max(...items.map((i) => i.value), 1);

  return (
    <div className="space-y-1.5">
      {items.map((item) => (
        <div key={item.label} className="group">
          <div className="mb-0.5 flex items-baseline justify-between gap-2">
            <span className="truncate text-xs font-medium text-slate-700">{item.label}</span>
            <span className="shrink-0 text-xs font-bold text-slate-900">
              {item.value.toLocaleString()}
              {item.secondary && <span className="ml-1.5 font-medium text-slate-500">{item.secondary}</span>}
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-indigo-500"
              style={{ width: `${Math.max(2, (item.value / widest) * 100)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

export function InsightList({
  insights,
  title = "What the numbers mean",
  description,
}: {
  insights: Array<{ id: string; tone: string; title: string; detail: string; recommendation?: string }>;
  title?: string;
  description?: string;
}) {
  const icon = (tone: string) =>
    tone === "warning" ? AlertTriangle : tone === "good" ? CheckCircle2 : Lightbulb;
  const colour = (tone: string) =>
    tone === "warning"
      ? "border-amber-200 bg-amber-50 text-amber-900"
      : tone === "good"
        ? "border-emerald-200 bg-emerald-50 text-emerald-900"
        : "border-slate-200 bg-slate-50 text-slate-800";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent className="space-y-2">
        {insights.map((insight) => {
          const Icon = icon(insight.tone);
          return (
            <div key={insight.id} className={`flex items-start gap-2 rounded-xl border px-3.5 py-2.5 ${colour(insight.tone)}`}>
              <Icon className="mt-0.5 h-4 w-4 shrink-0" />
              <div className="min-w-0">
                <p className="text-xs font-bold">{insight.title}</p>
                <p className="mt-0.5 text-xs leading-relaxed">{insight.detail}</p>
                {insight.recommendation && (
                  <p className="mt-1 text-xs font-medium opacity-90">→ {insight.recommendation}</p>
                )}
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

export function EmptyState({ detail, action }: { detail: string; action?: React.ReactNode }) {
  return (
    <div className="py-8 text-center">
      <p className="text-sm text-slate-500">{detail}</p>
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

/** Seconds rendered the way a person would say them. */
export function formatDuration(seconds: number): string {
  if (!seconds) return "0s";
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = Math.round(seconds % 60);
  if (minutes < 60) return rest ? `${minutes}m ${rest}s` : `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

/** A simple scrollable table; wide analytics tables must not break the page. */
export function DataTable({
  columns,
  rows,
  empty = "Nothing recorded in this period.",
}: {
  columns: string[];
  rows: React.ReactNode[][];
  empty?: string;
}) {
  if (!rows.length) return <EmptyState detail={empty} />;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[600px] text-left text-xs">
        <thead>
          <tr className="border-b border-slate-200">
            {columns.map((column) => (
              <th key={column} className="px-2 py-2 font-bold uppercase tracking-wider text-[10px] text-slate-500">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
              {row.map((cell, cellIndex) => (
                <td key={cellIndex} className="px-2 py-2 text-slate-700">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
