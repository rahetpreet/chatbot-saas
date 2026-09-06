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
  formatDuration,
  type RangeState,
} from "@/components/analytics/shared";
import { MessageSquare } from "lucide-react";

/**
 * Conversation shape, traffic sources, devices and time of day.
 *
 * The AI panel appears only when AI activity was actually recorded — showing a
 * row of zeroes to a workspace that has AI switched off implies something is
 * broken rather than simply unused.
 */
export default function ConversationAnalysisPage() {
  const [range, setRange] = useState<RangeState>(defaultRange());
  const { data, loading, error } = useAnalytics("/api/client/analytics/conversations", range);
  const { data: sourceData } = useAnalytics("/api/client/analytics/sources", range);
  const { data: deviceData } = useAnalytics("/api/client/analytics/devices", range);
  const { data: timeData } = useAnalytics("/api/client/analytics/timeline", range);
  const { data: aiData } = useAnalytics("/api/client/analytics/ai", range);

  const stats = data?.conversations;
  const ai = aiData?.ai;
  const aiUsed = ai && (ai.aiRequests > 0 || ai.aiConversations > 0);
  const hourly = timeData?.hourly || [];
  const busiest = Math.max(...hourly.map((h: any) => h.conversations), 1);

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-slate-900">
            <MessageSquare className="h-5 w-5 text-indigo-600" />
            Conversation Analysis
          </h1>
          <p className="mt-0.5 text-sm text-slate-500">How conversations run, and who is having them.</p>
        </div>
        <DateRangePicker value={range} onChange={setRange} showCompare={false} />
      </header>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs font-medium text-red-800">
          {error}
        </div>
      )}

      {loading && !stats ? (
        <SkeletonStats count={8} />
      ) : stats ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatCard label="Conversations" value={stats.total} />
          <StatCard label="Completed" value={stats.completed} />
          <StatCard label="Abandoned" value={stats.abandoned} />
          <StatCard label="Needed a person" value={stats.humanHandled} />
          <StatCard label="Avg duration" value={formatDuration(stats.avgDurationSeconds)} />
          <StatCard label="Avg messages" value={stats.avgMessages} />
          <StatCard label="Avg from visitor" value={stats.avgVisitorMessages} />
          <StatCard label="Avg from bot" value={stats.avgBotMessages} />
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Traffic sources</CardTitle>
            <CardDescription>Where visitors came from, with conversion for each.</CardDescription>
          </CardHeader>
          <CardContent>
            <BarList
              items={(sourceData?.sources || []).map((source: any) => ({
                label: source.medium ? `${source.source} / ${source.medium}` : source.source,
                value: source.conversations,
                secondary: `${source.conversionRate}% convert`,
              }))}
              emptyLabel="No conversations recorded in this period."
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Devices</CardTitle>
            <CardDescription>A large gap between devices is usually a layout problem.</CardDescription>
          </CardHeader>
          <CardContent>
            <BarList
              items={(deviceData?.devices || []).map((device: any) => ({
                label: device.device,
                value: device.conversations,
                secondary: `${device.conversionRate}% convert`,
              }))}
              emptyLabel="No device information recorded yet."
            />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">By hour of day</CardTitle>
          <CardDescription>
            {timeData?.busiestHour
              ? `Busiest at ${timeData.busiestHour}${
                  timeData.highestConvertingHour ? `, converts best at ${timeData.highestConvertingHour}` : ""
                }.`
              : "Not enough activity to identify a pattern yet."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex h-24 items-end gap-0.5">
            {hourly.map((hour: any) => (
              <div key={hour.hour} className="flex-1" title={`${hour.label}: ${hour.conversations} conversations`}>
                <div
                  className="w-full rounded-t bg-indigo-500"
                  style={{
                    height: `${(hour.conversations / busiest) * 100}%`,
                    minHeight: hour.conversations ? "3px" : "0",
                  }}
                />
              </div>
            ))}
          </div>
          <div className="mt-1 flex justify-between text-[10px] text-slate-400">
            <span>00:00</span>
            <span>12:00</span>
            <span>23:00</span>
          </div>
        </CardContent>
      </Card>

      {aiUsed && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">AI answering</CardTitle>
            <CardDescription>
              A fallback is the AI declining to guess and handing over — that is the layer working, not failing.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <StatCard label="AI conversations" value={ai.aiConversations} />
              <StatCard label="AI answers" value={ai.aiResponses} />
              <StatCard label="Handed over" value={ai.aiFallbacks} />
              <StatCard label="Leads from AI chats" value={ai.aiLeads} suffix={ai.aiConversationRate ? undefined : ""} />
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
