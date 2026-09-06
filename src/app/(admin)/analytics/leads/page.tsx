"use client";

import React, { useState } from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/Card";
import { SkeletonStats } from "@/components/ui/Loading";
import { useAnalytics } from "@/components/analytics/useAnalytics";
import {
  DateRangePicker,
  StatCard,
  BarList,
  defaultRange,
  type RangeState,
} from "@/components/analytics/shared";
import { Users } from "lucide-react";

/**
 * Lead volume, pipeline and origin.
 *
 * The daily trend is drawn from the timeline endpoint rather than recomputed
 * here, so this page and the Conversation screen cannot disagree about how
 * many leads a given day produced.
 */
export default function LeadAnalyticsPage() {
  const [range, setRange] = useState<RangeState>(defaultRange());
  const { data, loading, error } = useAnalytics("/api/client/analytics/leads", range);
  const { data: timeline } = useAnalytics("/api/client/analytics/timeline", range);

  const leads = data?.leads;
  const daily = timeline?.daily || [];
  const peak = Math.max(...daily.map((d: any) => d.leads), 1);

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-slate-900">
            <Users className="h-5 w-5 text-indigo-600" />
            Lead Analysis
          </h1>
          <p className="mt-0.5 text-sm text-slate-500">Where your leads came from, and where they are now.</p>
        </div>
        <DateRangePicker value={range} onChange={setRange} showCompare={false} />
      </header>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs font-medium text-red-800">
          {error}
        </div>
      )}

      {loading && !leads ? (
        <SkeletonStats count={4} />
      ) : leads ? (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatCard label="Total leads" value={leads.total} />
            <StatCard label="Average score" value={leads.averageScore} />
            <StatCard label="Campaigns producing leads" value={leads.byCampaign.filter((c: any) => c.count > 0).length} />
            <StatCard label="Chatbots producing leads" value={leads.byChatbot.filter((c: any) => c.count > 0).length} />
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Leads per day</CardTitle>
              <CardDescription>Days with no leads are shown as gaps, not skipped.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex h-32 items-end gap-0.5">
                {daily.map((day: any) => (
                  <div key={day.key} className="group relative flex-1" title={`${day.label}: ${day.leads} leads`}>
                    <div
                      className="w-full rounded-t bg-indigo-500 transition-all group-hover:bg-indigo-600"
                      style={{ height: `${(day.leads / peak) * 100}%`, minHeight: day.leads ? "3px" : "0" }}
                    />
                  </div>
                ))}
              </div>
              {daily.length > 0 && (
                <div className="mt-1 flex justify-between text-[10px] text-slate-400">
                  <span>{daily[0]?.label}</span>
                  <span>{daily[daily.length - 1]?.label}</span>
                </div>
              )}
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Pipeline</CardTitle>
                <CardDescription>Status of leads created in this period.</CardDescription>
              </CardHeader>
              <CardContent>
                <BarList
                  items={leads.byStatus.map((row: any) => ({
                    label: row.status,
                    value: row.count,
                    secondary: `${row.share}%`,
                  }))}
                  emptyLabel="No leads in this period."
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">By campaign</CardTitle>
                <CardDescription>Which campaigns actually produce leads.</CardDescription>
              </CardHeader>
              <CardContent>
                <BarList
                  items={leads.byCampaign.map((row: any) => ({ label: row.name, value: row.count }))}
                  emptyLabel="No campaign-attributed leads in this period."
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">By chatbot</CardTitle>
              </CardHeader>
              <CardContent>
                <BarList
                  items={leads.byChatbot.map((row: any) => ({ label: row.name, value: row.count }))}
                  emptyLabel="No leads attributed to a chatbot yet."
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">By source</CardTitle>
                <CardDescription>How the contact first reached you.</CardDescription>
              </CardHeader>
              <CardContent>
                <BarList
                  items={leads.bySource.map((row: any) => ({ label: row.source, value: row.count }))}
                  emptyLabel="No contacts captured in this period."
                />
              </CardContent>
            </Card>
          </div>
        </>
      ) : null}
    </div>
  );
}
