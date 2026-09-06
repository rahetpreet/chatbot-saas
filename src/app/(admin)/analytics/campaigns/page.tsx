"use client";

import React, { useState } from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/Card";
import { SkeletonTable } from "@/components/ui/Loading";
import { useAnalytics } from "@/components/analytics/useAnalytics";
import {
  DateRangePicker,
  DataTable,
  StatCard,
  EmptyState,
  defaultRange,
  formatDuration,
  type RangeState,
} from "@/components/analytics/shared";
import { Megaphone } from "lucide-react";

/**
 * Campaigns side by side.
 *
 * Selecting rows compares them directly, which is the question clients
 * actually have — not "how did this campaign do" but "which of these worked".
 */
export default function CampaignAnalyticsPage() {
  const [range, setRange] = useState<RangeState>(defaultRange());
  const [selected, setSelected] = useState<string[]>([]);
  const { data, loading, error } = useAnalytics("/api/client/analytics/campaigns", range);

  const campaigns = data?.campaigns || [];
  const compared = campaigns.filter((c: any) => selected.includes(c.campaignId));

  const toggle = (id: string) =>
    setSelected((current) =>
      current.includes(id) ? current.filter((x) => x !== id) : [...current, id].slice(-4),
    );

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-slate-900">
            <Megaphone className="h-5 w-5 text-indigo-600" />
            Campaign Analytics
          </h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Tick up to four campaigns to compare them directly.
          </p>
        </div>
        <DateRangePicker value={range} onChange={setRange} showCompare={false} />
      </header>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs font-medium text-red-800">
          {error}
        </div>
      )}

      {compared.length >= 2 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Comparison</CardTitle>
            <CardDescription>{compared.map((c: any) => c.name).join(" vs ")}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
              {compared.map((campaign: any) => (
                <div key={campaign.campaignId} className="rounded-xl border border-slate-200 p-3">
                  <p className="truncate text-xs font-bold text-slate-900">{campaign.name}</p>
                  <dl className="mt-2 space-y-1 text-xs">
                    <Row label="Links opened" value={campaign.linksOpened.toLocaleString()} />
                    <Row label="Open rate" value={`${campaign.openRate}%`} />
                    <Row label="Conversations" value={campaign.conversations.toLocaleString()} />
                    <Row label="Leads" value={campaign.leads.toLocaleString()} />
                    <Row label="Conversion" value={`${campaign.conversionRate}%`} highlight />
                    <Row label="Avg chat" value={formatDuration(campaign.avgConversationSeconds)} />
                  </dl>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">All campaigns</CardTitle>
          <CardDescription>
            Links generated is a lifetime figure; everything else is for the selected period.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading && !campaigns.length ? (
            <SkeletonTable rows={5} columns={8} />
          ) : campaigns.length ? (
            <DataTable
              columns={["", "Campaign", "Links", "Opened", "Unique", "Chats", "Leads", "Conversion"]}
              rows={campaigns.map((campaign: any) => [
                <input
                  key="c"
                  type="checkbox"
                  checked={selected.includes(campaign.campaignId)}
                  onChange={() => toggle(campaign.campaignId)}
                  className="rounded border-slate-300"
                />,
                <span key="n" className="font-semibold text-slate-900">
                  {campaign.name}
                </span>,
                campaign.linksGenerated.toLocaleString(),
                campaign.linksOpened.toLocaleString(),
                campaign.uniqueOpens.toLocaleString(),
                campaign.conversations.toLocaleString(),
                campaign.leads.toLocaleString(),
                <span key="r" className="font-bold text-slate-900">
                  {campaign.conversionRate}%
                </span>,
              ])}
            />
          ) : (
            <EmptyState detail="No campaigns yet. Create one under Campaigns & Links." />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Row({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-slate-500">{label}</dt>
      <dd className={highlight ? "font-bold text-indigo-600" : "font-semibold text-slate-800"}>{value}</dd>
    </div>
  );
}
