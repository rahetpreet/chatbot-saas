"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/Card";
import { SkeletonStats, SkeletonList } from "@/components/ui/Loading";
import { TrendChart, CompactFunnel } from "@/components/analytics/Charts";
import {
  DateRangePicker,
  StatCard,
  EmptyState,
  defaultRange,
  rangeQuery,
  formatDuration,
  type RangeState,
} from "@/components/analytics/shared";
import {
  GitBranch,
  Megaphone,
  MessageSquare,
  Users,
  ArrowRight,
  Check,
  Circle,
  ExternalLink,
  BarChart3,
  Rocket,
} from "lucide-react";

/**
 * The workspace dashboard.
 *
 * One request, aggregated in the database. It previously fetched four list
 * endpoints and counted the rows in the browser, which meant opening this page
 * downloaded every record the workspace owned.
 *
 * A workspace with no traffic yet gets a setup checklist instead of a grid of
 * zeroes: the numbers are identical either way, but one reads as broken and the
 * other reads as a next step.
 */
export default function DashboardOverviewPage() {
  const [range, setRange] = useState<RangeState>(defaultRange());
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/client/dashboard?${rangeQuery(range)}`);
      const json = await res.json();
      if (!json.success) {
        setError(json.error?.message || "Could not load the dashboard.");
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

  const m = data?.metrics;
  const changes = data?.changes;
  const setup = data?.setup;
  const trend = data?.trend || [];

  const points = trend.map((day: any) => ({
    label: day.label,
    values: [day.conversations, day.leads],
  }));

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-slate-900">
            {data?.tenant?.name || "Workspace"}
          </h1>
          <p className="mt-0.5 flex flex-wrap items-center gap-2 text-sm text-slate-500">
            <span>{data?.range?.label || "Last 30 days"}</span>
            {data?.tenant?.planTier && (
              <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-600">
                {data.tenant.planTier}
              </span>
            )}
            {data?.tenant?.customDomain && data?.tenant?.customDomainVerifiedAt && (
              <a
                href={`https://${data.tenant.customDomain}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:underline"
              >
                {data.tenant.customDomain}
                <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </p>
        </div>
        <DateRangePicker value={range} onChange={setRange} showCompare={false} />
      </header>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs font-medium text-red-800">
          {error}
        </div>
      )}

      {/* Setup checklist, only while the workspace has never had a conversation. */}
      {setup?.isNew && (
        <Card className="border-indigo-200 bg-indigo-50/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Rocket className="h-4 w-4 text-indigo-600" />
              Finish setting up
            </CardTitle>
            <CardDescription>Your numbers appear here as soon as the first visitor chats.</CardDescription>
          </CardHeader>
          <CardContent>
            <ol className="space-y-2">
              <SetupStep done={setup.hasFlow} label="Build a chatbot flow" href="/flows" cta="Open Flow Builder" />
              <SetupStep
                done={setup.hasPublishedFlow}
                label="Publish it so visitors can use it"
                href="/flows"
                cta="Publish"
              />
              <SetupStep
                done={setup.hasCampaign}
                label="Create a campaign and share your link"
                href="/campaigns"
                cta="Create campaign"
              />
              <SetupStep done={setup.hasConversation} label="Receive your first conversation" />
              <SetupStep done={setup.hasLead} label="Capture your first lead" />
            </ol>
          </CardContent>
        </Card>
      )}

      {loading && !m ? (
        <SkeletonStats count={4} />
      ) : m ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label="Visitors" value={m.uniqueVisitors} change={changes?.uniqueVisitors} />
          <StatCard label="Conversations" value={m.conversationsStarted} change={changes?.conversationsStarted} />
          <StatCard label="Leads" value={m.totalLeads} change={changes?.totalLeads} />
          <StatCard label="Conversion" value={m.conversionRate} suffix="%" change={changes?.conversionRate} />
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-start justify-between">
            <div>
              <CardTitle className="text-base">Activity</CardTitle>
              <CardDescription>
                {data?.busiestHour ? `Busiest around ${data.busiestHour}.` : "Conversations and leads per day."}
              </CardDescription>
            </div>
            <Link href="/analytics" className="shrink-0 text-xs font-semibold text-indigo-600 hover:underline">
              Full reports
            </Link>
          </CardHeader>
          <CardContent>
            {loading && !points.length ? (
              <div className="h-[200px] animate-pulse rounded-lg bg-slate-100" />
            ) : points.length ? (
              <TrendChart points={points} seriesNames={["Conversations", "Leads"]} />
            ) : (
              <EmptyState detail="No activity in this period yet." />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-start justify-between">
            <div>
              <CardTitle className="text-base">Funnel</CardTitle>
              <CardDescription>Visitor to lead.</CardDescription>
            </div>
            <Link href="/analytics" className="shrink-0 text-xs font-semibold text-indigo-600 hover:underline">
              Detail
            </Link>
          </CardHeader>
          <CardContent>
            {data?.funnel?.some((s: any) => s.count > 0) ? (
              <CompactFunnel steps={data.funnel} />
            ) : (
              <EmptyState detail="Nothing recorded yet." />
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base">Latest leads</CardTitle>
              <CardDescription>Newest first.</CardDescription>
            </div>
            <Link href="/leads" className="shrink-0 text-xs font-semibold text-indigo-600 hover:underline">
              All leads
            </Link>
          </CardHeader>
          <CardContent>
            {loading && !data ? (
              <SkeletonList rows={3} />
            ) : data?.recent?.leads?.length ? (
              <div className="space-y-1">
                {data.recent.leads.map((lead: any) => (
                  <Link
                    key={lead.id}
                    href="/leads"
                    className="flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-slate-50"
                  >
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-[10px] font-bold text-indigo-700">
                      {(lead.name || lead.email || "?").slice(0, 2).toUpperCase()}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-semibold text-slate-900">
                        {lead.name || "Anonymous lead"}
                      </span>
                      <span className="block truncate text-[11px] text-slate-500">
                        {lead.email || lead.phone || "No contact details"}
                      </span>
                    </span>
                    <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-600">
                      {lead.status}
                    </span>
                  </Link>
                ))}
              </div>
            ) : (
              <EmptyState detail="No leads captured yet." />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base">Recent conversations</CardTitle>
              <CardDescription>Most recently active.</CardDescription>
            </div>
            <Link href="/conversations" className="shrink-0 text-xs font-semibold text-indigo-600 hover:underline">
              Inbox
            </Link>
          </CardHeader>
          <CardContent>
            {loading && !data ? (
              <SkeletonList rows={3} />
            ) : data?.recent?.conversations?.length ? (
              <div className="space-y-1">
                {data.recent.conversations.map((conversation: any) => (
                  <Link
                    key={conversation.id}
                    href="/conversations"
                    className="flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-slate-50"
                  >
                    <MessageSquare className="h-4 w-4 shrink-0 text-slate-400" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-semibold text-slate-900">
                        {conversation.flow?.name || "Conversation"}
                      </span>
                      <span className="block text-[11px] text-slate-500">
                        {conversation._count.messages} messages ·{" "}
                        {new Date(conversation.lastActiveAt).toLocaleString()}
                      </span>
                    </span>
                    <StatusDot status={conversation.sessionStatus} />
                  </Link>
                ))}
              </div>
            ) : (
              <EmptyState detail="No conversations yet." />
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">This period</CardTitle>
            <CardDescription>Volume and engagement at a glance.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3">
              <StatCard label="Messages" value={m?.totalMessages} change={changes?.totalMessages} />
              <StatCard label="Chatbot opens" value={m?.chatbotOpens} />
              <StatCard
                label="Avg conversation"
                value={m ? formatDuration(m.avgConversationSeconds) : "—"}
                hint={m ? `${m.avgMessagesPerConversation} messages each` : undefined}
              />
              <StatCard label="Returning visitors" value={m?.returningVisitors} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Quick actions</CardTitle>
            <CardDescription>The things you do most often.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-2">
              <QuickAction href="/flows" icon={GitBranch} label="Flow Builder" />
              <QuickAction href="/campaigns" icon={Megaphone} label="Campaigns" />
              <QuickAction href="/analytics" icon={BarChart3} label="Reports" />
              <QuickAction href="/conversations" icon={MessageSquare} label="Inbox" />
            </div>

            {data?.usage && data.usage.messageLimit > 0 && (
              <div className="mt-3 rounded-lg border border-slate-200 px-3 py-2">
                <div className="flex items-baseline justify-between text-[11px]">
                  <span className="font-semibold text-slate-600">Messages this period</span>
                  <span className="font-bold text-slate-900" style={{ fontVariantNumeric: "tabular-nums" }}>
                    {data.usage.messagesThisPeriod.toLocaleString()} / {data.usage.messageLimit.toLocaleString()}
                  </span>
                </div>
                <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-indigo-500"
                    style={{
                      width: `${Math.min(100, (data.usage.messagesThisPeriod / data.usage.messageLimit) * 100)}%`,
                    }}
                  />
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function SetupStep({ done, label, href, cta }: { done: boolean; label: string; href?: string; cta?: string }) {
  return (
    <li className="flex items-center gap-2.5">
      {done ? (
        <Check className="h-4 w-4 shrink-0 text-emerald-600" />
      ) : (
        <Circle className="h-4 w-4 shrink-0 text-slate-300" />
      )}
      <span className={`flex-1 text-xs ${done ? "text-slate-400 line-through" : "font-medium text-slate-800"}`}>
        {label}
      </span>
      {!done && href && cta && (
        <Link href={href} className="shrink-0 text-xs font-bold text-indigo-600 hover:underline">
          {cta} →
        </Link>
      )}
    </li>
  );
}

function StatusDot({ status }: { status: string }) {
  // Status is never colour alone — the label sits beside the dot.
  const tone =
    status === "HANDOVER"
      ? "bg-amber-500"
      : status === "RESOLVED"
        ? "bg-emerald-500"
        : status === "ABANDONED"
          ? "bg-slate-300"
          : "bg-indigo-500";
  return (
    <span className="flex shrink-0 items-center gap-1.5">
      <span className={`h-1.5 w-1.5 rounded-full ${tone}`} />
      <span className="text-[10px] font-bold text-slate-500">{status}</span>
    </span>
  );
}

function QuickAction({ href, icon: Icon, label }: { href: string; icon: any; label: string }) {
  return (
    <Link
      href={href}
      className="group flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2.5 transition-colors hover:border-indigo-300 hover:bg-indigo-50/50"
    >
      <Icon className="h-4 w-4 shrink-0 text-slate-500 group-hover:text-indigo-600" />
      <span className="flex-1 text-xs font-semibold text-slate-700 group-hover:text-indigo-700">{label}</span>
      <ArrowRight className="h-3 w-3 shrink-0 text-slate-300 group-hover:text-indigo-500" />
    </Link>
  );
}
