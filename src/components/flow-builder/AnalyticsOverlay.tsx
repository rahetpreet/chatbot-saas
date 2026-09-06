"use client";

import React from "react";

/**
 * Analytics Mode for the flow builder.
 *
 * Metrics are drawn as a badge over each node rather than inside it, so the ten
 * node components stay untouched and none of them has to know analytics exists.
 * Wrapping happens once, where nodeTypes is built.
 */

export type HeatMetric = "traffic" | "completion" | "dropoff" | "leads";

export const HEAT_METRICS: Array<{ value: HeatMetric; label: string }> = [
  { value: "traffic", label: "Traffic" },
  { value: "completion", label: "Completion" },
  { value: "dropoff", label: "Drop-off" },
  { value: "leads", label: "Leads" },
];

export interface NodeStat {
  nodeId: string;
  entered: number;
  uniqueUsers: number;
  completed: number;
  dropped: number;
  dropOffRate: number;
  completionRate: number;
  leadsAfter: number;
}

/** The figure and colour for the metric currently being shown. */
function reading(stat: NodeStat, metric: HeatMetric): { value: string; sub: string; tone: string } {
  switch (metric) {
    case "completion":
      return {
        value: `${stat.completionRate}%`,
        sub: `${stat.completed.toLocaleString()} completed`,
        tone:
          stat.completionRate >= 75
            ? "bg-emerald-600"
            : stat.completionRate >= 50
              ? "bg-amber-500"
              : "bg-red-600",
      };
    case "dropoff":
      return {
        value: `${stat.dropOffRate}%`,
        sub: `${stat.dropped.toLocaleString()} lost`,
        tone: stat.dropOffRate >= 40 ? "bg-red-600" : stat.dropOffRate >= 20 ? "bg-amber-500" : "bg-emerald-600",
      };
    case "leads":
      return {
        value: stat.leadsAfter.toLocaleString(),
        sub: "leads after this step",
        tone: stat.leadsAfter > 0 ? "bg-emerald-600" : "bg-slate-500",
      };
    default:
      return {
        value: stat.entered.toLocaleString(),
        sub: `${stat.uniqueUsers.toLocaleString()} unique`,
        tone: "bg-indigo-600",
      };
  }
}

function Badge({ stat, metric }: { stat: NodeStat; metric: HeatMetric }) {
  const { value, sub, tone } = reading(stat, metric);
  return (
    <div className="pointer-events-none absolute -top-3 -right-2 z-10">
      <div className={`rounded-lg px-2 py-1 text-white shadow-lg ${tone}`}>
        <p className="text-xs font-black leading-none">{value}</p>
        <p className="mt-0.5 text-[9px] font-medium leading-none opacity-90">{sub}</p>
      </div>
    </div>
  );
}

/**
 * A node that was never reached.
 *
 * Shown as an explicit "0" rather than left bare: an unreached step and a step
 * with no data recorded look identical otherwise, and the first is a real
 * finding — usually a branch nobody can get to.
 */
function EmptyBadge() {
  return (
    <div className="pointer-events-none absolute -top-3 -right-2 z-10">
      <div className="rounded-lg border border-slate-300 bg-white px-2 py-1 shadow-sm">
        <p className="text-xs font-black leading-none text-slate-400">0</p>
        <p className="mt-0.5 text-[9px] font-medium leading-none text-slate-400">never reached</p>
      </div>
    </div>
  );
}

/**
 * Wraps a node component so it can carry a metric badge.
 *
 * The wrapper is transparent when analytics mode is off, so the builder behaves
 * exactly as before.
 */
export function withAnalytics(
  Component: React.ComponentType<any>,
  getStat: (nodeId: string) => NodeStat | null,
  metric: HeatMetric,
  active: boolean,
) {
  const Wrapped = (props: any) => {
    if (!active) return <Component {...props} />;
    const stat = getStat(props.id);
    return (
      <div className="relative">
        {stat ? <Badge stat={stat} metric={metric} /> : <EmptyBadge />}
        <Component {...props} />
      </div>
    );
  };
  Wrapped.displayName = `withAnalytics(${Component.displayName || Component.name || "Node"})`;
  return Wrapped;
}

/** The metric switcher shown while analytics mode is on. */
export function HeatmapControls({
  metric,
  onMetric,
  loading,
  total,
}: {
  metric: HeatMetric;
  onMetric: (next: HeatMetric) => void;
  loading: boolean;
  total: number;
}) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-1.5">
      <span className="text-[11px] font-bold text-indigo-900">
        {loading ? "Loading…" : `${total.toLocaleString()} visits, last 30 days`}
      </span>
      <div className="flex gap-0.5">
        {HEAT_METRICS.map((option) => (
          <button
            key={option.value}
            onClick={() => onMetric(option.value)}
            className={`rounded px-1.5 py-0.5 text-[10px] font-bold transition-colors ${
              metric === option.value
                ? "bg-indigo-600 text-white"
                : "text-indigo-700 hover:bg-indigo-100"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}
