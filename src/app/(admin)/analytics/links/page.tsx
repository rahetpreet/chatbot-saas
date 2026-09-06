"use client";

import React, { useState } from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/Card";
import { SkeletonTable } from "@/components/ui/Loading";
import { useAnalytics } from "@/components/analytics/useAnalytics";
import {
  DateRangePicker,
  DataTable,
  defaultRange,
  type RangeState,
} from "@/components/analytics/shared";
import { Link as LinkIcon } from "lucide-react";

/**
 * Per-link performance.
 *
 * The sort options are the questions worth asking, not just orderings: the two
 * segment filters isolate links that were opened but never started a chat, and
 * chats that never became a lead. Those are where recoverable revenue sits.
 */
const SORTS = [
  { value: "mostOpened", label: "Most opened" },
  { value: "leastOpened", label: "Least opened" },
  { value: "mostConversations", label: "Most conversations" },
  { value: "mostLeads", label: "Most leads" },
  { value: "highestConversion", label: "Highest conversion" },
  { value: "openedNoConversation", label: "Opened, never chatted" },
  { value: "conversationNoLead", label: "Chatted, never converted" },
];

export default function LinkAnalyticsPage() {
  const [range, setRange] = useState<RangeState>(defaultRange());
  const [sort, setSort] = useState("mostOpened");
  const { data, loading, error } = useAnalytics("/api/client/analytics/links", range, { sort });

  const links = data?.links || [];
  const segment = sort === "openedNoConversation" || sort === "conversationNoLead";

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-slate-900">
            <LinkIcon className="h-5 w-5 text-indigo-600" />
            Link Analytics
          </h1>
          <p className="mt-0.5 text-sm text-slate-500">Every tracking link, and who opened it.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 focus:border-indigo-500 focus:outline-none"
          >
            {SORTS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <DateRangePicker value={range} onChange={setRange} showCompare={false} />
        </div>
      </header>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs font-medium text-red-800">
          {error}
        </div>
      )}

      {segment && links.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs text-amber-900">
          <span className="font-bold">{links.length} link{links.length === 1 ? "" : "s"} in this segment.</span>{" "}
          {sort === "openedNoConversation"
            ? "These recipients clicked but never started a chat — usually a landing or loading problem rather than disinterest."
            : "These recipients chatted but never left their details. Look at where they stopped in Drop-off Analysis."}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Links</CardTitle>
          <CardDescription>
            Opens are counted for the life of the link; a link created before this period still shows its full total.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading && !links.length ? (
            <SkeletonTable rows={8} columns={7} />
          ) : (
            <DataTable
              columns={["Recipient", "Campaign", "Opens", "Unique", "First opened", "Chats", "Leads"]}
              empty="No tracking links match this view."
              rows={links.map((link: any) => [
                <div key="c" className="min-w-0">
                  <p className="truncate font-semibold text-slate-900">{link.contactName || "Unnamed"}</p>
                  {link.contactEmail && <p className="truncate text-[11px] text-slate-500">{link.contactEmail}</p>}
                </div>,
                link.campaignName || "—",
                link.opens.toLocaleString(),
                link.uniqueOpens.toLocaleString(),
                link.firstOpenedAt ? new Date(link.firstOpenedAt).toLocaleDateString() : "Never",
                link.conversations.toLocaleString(),
                <span key="l" className={link.leads ? "font-bold text-emerald-600" : "text-slate-500"}>
                  {link.leads.toLocaleString()}
                </span>,
              ])}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
