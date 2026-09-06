"use client";

import React, { useState } from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/Card";
import { SkeletonTable } from "@/components/ui/Loading";
import { useAnalytics } from "@/components/analytics/useAnalytics";
import {
  DateRangePicker,
  DataTable,
  EmptyState,
  defaultRange,
  formatDuration,
  type RangeState,
} from "@/components/analytics/shared";
import { Bot } from "lucide-react";

/**
 * Chatbot performance, and how each published version compares.
 *
 * Version figures come from the version stamped on each conversation when it
 * started, so editing and republishing a flow never rewrites what the previous
 * version achieved.
 */
export default function ChatbotAnalyticsPage() {
  const [range, setRange] = useState<RangeState>(defaultRange());
  const [flowId, setFlowId] = useState<string>("");
  const { data, loading, error } = useAnalytics("/api/client/analytics/chatbots", range);
  const { data: versionData } = useAnalytics("/api/client/analytics/versions", range, { flowId: flowId || null });

  const chatbots = data?.chatbots || [];
  const versions = versionData?.versions || [];
  const best = versions.reduce(
    (top: any, version: any) => (!top || version.conversionRate > top.conversionRate ? version : top),
    null,
  );

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-slate-900">
            <Bot className="h-5 w-5 text-indigo-600" />
            Chatbot Analytics
          </h1>
          <p className="mt-0.5 text-sm text-slate-500">How each chatbot performs, and whether it is improving.</p>
        </div>
        <DateRangePicker value={range} onChange={setRange} showCompare={false} />
      </header>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs font-medium text-red-800">
          {error}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">All chatbots</CardTitle>
          <CardDescription>Ordered by conversations in the selected period.</CardDescription>
        </CardHeader>
        <CardContent>
          {loading && !chatbots.length ? (
            <SkeletonTable rows={4} columns={8} />
          ) : chatbots.length ? (
            <DataTable
              columns={["Chatbot", "Status", "Visitors", "Chats", "Completed", "Leads", "Conversion", "Avg duration"]}
              rows={chatbots.map((bot: any) => [
                <button
                  key="n"
                  onClick={() => setFlowId(flowId === bot.flowId ? "" : bot.flowId)}
                  className={`text-left font-semibold hover:underline ${
                    flowId === bot.flowId ? "text-indigo-600" : "text-slate-900"
                  }`}
                >
                  {bot.name}
                </button>,
                <span
                  key="s"
                  className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                    bot.status === "PUBLISHED" ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-600"
                  }`}
                >
                  {bot.status}
                </span>,
                bot.visitors.toLocaleString(),
                bot.conversations.toLocaleString(),
                bot.completed.toLocaleString(),
                bot.leads.toLocaleString(),
                <span key="c" className="font-bold text-slate-900">
                  {bot.conversionRate}%
                </span>,
                formatDuration(bot.avgDurationSeconds),
              ])}
            />
          ) : (
            <EmptyState detail="No chatbots yet. Build one in the Flow Builder." />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Version comparison{flowId ? "" : " (all chatbots)"}
          </CardTitle>
          <CardDescription>
            {flowId
              ? "Showing one chatbot. Click its name above again to see every chatbot."
              : "Click a chatbot name above to narrow this to one bot."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {versions.length ? (
            <>
              <DataTable
                columns={["Version", "Conversations", "Leads", "Conversion"]}
                rows={versions.map((version: any) => [
                  <span key="v" className="font-semibold text-slate-900">
                    Version {version.version}
                  </span>,
                  version.conversations.toLocaleString(),
                  version.leads.toLocaleString(),
                  <span
                    key="c"
                    className={
                      best && version.version === best.version && versions.length > 1
                        ? "font-bold text-emerald-600"
                        : "text-slate-700"
                    }
                  >
                    {version.conversionRate}%
                  </span>,
                ])}
              />
              {versions.length > 1 && best && (
                <p className="mt-2 text-xs text-slate-500">
                  Version {best.version} converts best at {best.conversionRate}%. Historical conversations stay tied to
                  the version that actually served them.
                </p>
              )}
            </>
          ) : (
            <EmptyState detail="No versioned conversations recorded in this period yet." />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
