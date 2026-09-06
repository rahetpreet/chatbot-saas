"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/Card";
import { SkeletonStats, SkeletonTable } from "@/components/ui/Loading";
import {
  DateRangePicker,
  StatCard,
  DataTable,
  defaultRange,
  rangeQuery,
  type RangeState,
} from "@/components/analytics/shared";
import { BarChart3 } from "lucide-react";

/**
 * Platform-wide analytics.
 *
 * Aggregate by design: this answers "which workspaces are getting value from
 * the product" without exposing anybody's conversations or leads. The idle
 * count is the number worth watching — a workspace with zero conversations
 * this period is the churn signal, and it is invisible in a platform total.
 */
export default function PlatformAnalyticsPage() {
  const [range, setRange] = useState<RangeState>(defaultRange());
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/platform-analytics?${rangeQuery(range)}`);
      const json = await res.json();
      if (!json.success) {
        setError(json.error?.message || "Could not load platform analytics.");
        return;
      }
      setData(json.data);
      setError(null);
    } catch {
      setError("Could not reach the server.");
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => {
    load();
  }, [load]);

  const totals = data?.totals;
  const usage = data?.usage || [];

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-slate-900">
            <BarChart3 className="h-5 w-5 text-indigo-600" />
            Platform Analytics
          </h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Aggregate activity across every workspace. No conversation content is shown here.
          </p>
        </div>
        <DateRangePicker value={range} onChange={setRange} showCompare={false} />
      </header>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs font-medium text-red-800">
          {error}
        </div>
      )}

      {loading && !totals ? (
        <SkeletonStats count={8} />
      ) : totals ? (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatCard label="Workspaces" value={totals.tenants} hint={`${totals.activeTenants} active`} />
            <StatCard
              label="Idle this period"
              value={totals.idleTenants}
              hint={totals.idleTenants ? "No conversations at all" : "Every workspace is in use"}
            />
            <StatCard label="Published chatbots" value={totals.publishedFlows} hint={`${totals.flows} total`} />
            <StatCard label="Conversations" value={totals.conversations} />
            <StatCard label="Messages" value={totals.messages} />
            <StatCard label="Leads" value={totals.leads} />
            <StatCard label="Link opens" value={totals.linkOpens} hint={`${totals.links} links created`} />
            <StatCard label="AI requests" value={totals.aiRequests} />
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Usage by workspace</CardTitle>
              <CardDescription>
                Ordered by conversations. Workspaces at zero are shown too — those are the ones to check on.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loading && !usage.length ? (
                <SkeletonTable rows={6} columns={5} />
              ) : (
                <DataTable
                  columns={["Workspace", "Status", "Conversations", "Leads", "Conversion"]}
                  empty="No workspaces yet."
                  rows={usage.map((entry: any) => [
                    <span key="n" className="font-semibold text-slate-900">
                      {entry.name}
                    </span>,
                    <span
                      key="s"
                      className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                        entry.status === "ACTIVE"
                          ? "bg-emerald-100 text-emerald-700"
                          : entry.status === "TRIAL"
                            ? "bg-indigo-100 text-indigo-700"
                            : "bg-slate-200 text-slate-600"
                      }`}
                    >
                      {entry.status}
                    </span>,
                    <span key="c" className={entry.conversations ? "text-slate-700" : "font-semibold text-amber-600"}>
                      {entry.conversations.toLocaleString()}
                    </span>,
                    entry.leads.toLocaleString(),
                    `${entry.conversionRate}%`,
                  ])}
                />
              )}
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}
