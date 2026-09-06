"use client";

import React, { useState } from "react";
import Link from "next/link";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/Card";
import { SkeletonStats, SkeletonList } from "@/components/ui/Loading";
import { useAnalytics } from "@/components/analytics/useAnalytics";
import {
  DateRangePicker,
  StatCard,
  FunnelChart,
  BarList,
  InsightList,
  EmptyState,
  defaultRange,
  formatDuration,
  type RangeState,
} from "@/components/analytics/shared";
import { BarChart3, ArrowRight } from "lucide-react";

/**
 * The executive view: what happened, how the funnel performed, and what the
 * numbers mean.
 *
 * Every figure on this page is counted from recorded events. Where there is
 * not enough data for a percentage to be meaningful, the insight engine says
 * so rather than presenting a number that would mislead.
 */
export default function AnalyticsOverviewPage() {
  const [range, setRange] = useState<RangeState>(defaultRange());
  const { data, loading, error } = useAnalytics("/api/client/analytics/overview", range);

  const metrics = data?.metrics;
  const changes = data?.changes;

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-slate-900">
            <BarChart3 className="h-5 w-5 text-indigo-600" />
            Data &amp; Reports
          </h1>
          <p className="mt-0.5 text-sm text-slate-500">
            {data?.range?.label ? `${data.range.label} · ` : ""}
            Everything below is counted from recorded activity, not estimated.
          </p>
        </div>
        <DateRangePicker value={range} onChange={setRange} />
      </header>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs font-medium text-red-800">
          {error}
        </div>
      )}

      {loading && !metrics ? (
        <SkeletonStats count={8} />
      ) : metrics ? (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatCard label="Unique visitors" value={metrics.uniqueVisitors} change={changes?.uniqueVisitors} />
            <StatCard label="Chatbot opens" value={metrics.chatbotOpens} change={changes?.chatbotOpens} />
            <StatCard label="Conversations" value={metrics.conversationsStarted} change={changes?.conversationsStarted} />
            <StatCard label="Leads" value={metrics.totalLeads} change={changes?.totalLeads} />
            <StatCard label="Conversion rate" value={metrics.conversionRate} suffix="%" change={changes?.conversionRate} />
            <StatCard label="Links opened" value={metrics.linksOpened} change={changes?.linksOpened} />
            <StatCard
              label="Avg conversation"
              value={formatDuration(metrics.avgConversationSeconds)}
              hint={`${metrics.avgMessagesPerConversation} messages on average`}
            />
            <StatCard label="Returning visitors" value={metrics.returningVisitors} change={changes?.returningVisitors} />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Conversion funnel</CardTitle>
                <CardDescription>
                  Where people arrive, and where they stop. Each step counts distinct conversations.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {data.funnel?.some((step: any) => step.count > 0) ? (
                  <FunnelChart steps={data.funnel} />
                ) : (
                  <EmptyState detail="No activity recorded in this period yet." />
                )}
              </CardContent>
            </Card>

            <div className="space-y-4">
              <Card>
                <CardHeader className="flex-row items-center justify-between">
                  <div>
                    <CardTitle className="text-base">Most selected options</CardTitle>
                    <CardDescription>What visitors actually ask for.</CardDescription>
                  </div>
                  <Link href="/analytics/flow" className="shrink-0 text-xs font-semibold text-indigo-600 hover:underline">
                    Flow analysis
                  </Link>
                </CardHeader>
                <CardContent>
                  <BarList
                    items={(data.topOptions || []).map((option: any) => ({
                      label: option.label,
                      value: option.clicks,
                      secondary: `${option.share}%`,
                    }))}
                    emptyLabel="No button choices recorded yet."
                  />
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex-row items-center justify-between">
                  <div>
                    <CardTitle className="text-base">Biggest drop-offs</CardTitle>
                    <CardDescription>The steps losing the most people.</CardDescription>
                  </div>
                  <Link href="/analytics/drop-off" className="shrink-0 text-xs font-semibold text-indigo-600 hover:underline">
                    Full analysis
                  </Link>
                </CardHeader>
                <CardContent>
                  <BarList
                    items={(data.worstDropOff || []).map((node: any) => ({
                      label: node.label,
                      value: node.dropped,
                      secondary: `${node.dropOffRate}% lost`,
                    }))}
                    emptyLabel="No flow steps recorded yet."
                  />
                </CardContent>
              </Card>
            </div>
          </div>

          {data.insights?.length > 0 && (
            <InsightList
              insights={data.insights}
              description="Written from the figures above. Nothing here is estimated or inferred."
            />
          )}

          {data.recommendations?.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">What should you improve?</CardTitle>
                <CardDescription>Ordered by what is costing you the most right now.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {data.recommendations.map((item: any) => (
                  <div key={item.id} className="flex items-start gap-2 rounded-lg border border-slate-200 px-3 py-2">
                    <ArrowRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-indigo-600" />
                    <div>
                      <p className="text-xs font-bold text-slate-900">{item.title}</p>
                      <p className="mt-0.5 text-xs text-slate-600">{item.recommendation}</p>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </>
      ) : (
        !error && <SkeletonList rows={4} />
      )}
    </div>
  );
}
