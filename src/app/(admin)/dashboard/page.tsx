"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import {
  GitBranch,
  Megaphone,
  MessageSquare,
  Users,
  Palette,
  ExternalLink,
  Plus,
  ArrowRight,
  TrendingUp,
} from "lucide-react";
import { formatDate } from "@/lib/utils";

export default function DashboardOverviewPage() {
  const [flows, setFlows] = useState<any[]>([]);
  const [conversations, setConversations] = useState<any[]>([]);
  const [leads, setLeads] = useState<any[]>([]);
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch("/api/client/chatbots").then((r) => r.json()),
      fetch("/api/client/conversations").then((r) => r.json()),
      fetch("/api/client/leads").then((r) => r.json()),
      fetch("/api/client/campaigns").then((r) => r.json()),
    ])
      .then(([f, c, l, cmp]) => {
        setFlows(f.flows || []);
        setConversations(c.conversations || []);
        setLeads(l.leads || []);
        setCampaigns(cmp.campaigns || []);
      })
      .finally(() => setLoading(false));
  }, []);

  const totalSessions = conversations.length;
  const totalLeads = leads.length;
  const conversionRate = totalSessions > 0 ? Math.round((totalLeads / totalSessions) * 100) : 0;

  const statCards = [
    {
      title: "Total Conversations",
      value: totalSessions,
      desc: "Live & completed visitor chats",
      icon: MessageSquare,
      color: "text-indigo-600 bg-indigo-50",
    },
    {
      title: "Captured Leads",
      value: totalLeads,
      desc: "Visitors with email or phone submitted",
      icon: Users,
      color: "text-emerald-600 bg-emerald-50",
    },
    {
      title: "Lead Conversion Rate",
      value: `${conversionRate}%`,
      desc: "Visitors converted to qualified leads",
      icon: TrendingUp,
      color: "text-amber-600 bg-amber-50",
    },
    {
      title: "Active Campaigns",
      value: campaigns.length,
      desc: "Dynamic trackable chat links",
      icon: Megaphone,
      color: "text-sky-600 bg-sky-50",
    },
  ];

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">Workspace Overview</h1>
          <p className="text-sm text-slate-500">
            Monitor real-time chatbot conversations, lead capture metrics, and campaigns.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/flows">
            <Button size="sm" className="gap-1.5 text-xs font-bold shadow-sm">
              <GitBranch className="w-4 h-4" />
              <span>Flow Builder</span>
            </Button>
          </Link>
          <Link href="/widget-customizer">
            <Button size="sm" variant="outline" className="gap-1.5 text-xs font-semibold">
              <Palette className="w-4 h-4 text-indigo-600" />
              <span>Customize Widget</span>
            </Button>
          </Link>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {statCards.map((card, i) => {
          const Icon = card.icon;
          return (
            <Card key={i} className="hover:shadow-md transition-shadow">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  {card.title}
                </CardTitle>
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${card.color}`}>
                  <Icon className="w-4 h-4" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-black text-slate-900">{card.value}</div>
                <p className="text-xs text-slate-500 mt-1">{card.desc}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* 2-Column Split: Active Flows & Recent Conversations */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Active Flows Card */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Chatbot Flows</CardTitle>
              <CardDescription>Published & draft conversation node flows</CardDescription>
            </div>
            <Link href="/flows">
              <Button size="sm" variant="outline" className="text-xs gap-1">
                <span>View All</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent className="space-y-3">
            {flows.length === 0 ? (
              <div className="text-center py-8 text-slate-400 text-xs">
                No flows created yet. Click "Flow Builder" to design one!
              </div>
            ) : (
              flows.slice(0, 4).map((f) => (
                <div
                  key={f.id}
                  className="flex items-center justify-between p-3 rounded-xl border border-slate-200 bg-slate-50/50 hover:bg-slate-50 transition-colors"
                >
                  <div className="min-w-0 pr-3">
                    <div className="flex items-center gap-2">
                      <h4 className="text-xs font-bold text-slate-900 truncate">{f.name}</h4>
                      {f.isDefault && <Badge variant="info" className="text-[9px]">Default</Badge>}
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5">Updated {formatDate(f.updatedAt)}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={f.status === "PUBLISHED" ? "success" : "default"}>
                      {f.status} (v{f.version})
                    </Badge>
                    <Link href={`/flows/${f.id}/builder`}>
                      <Button size="sm" variant="outline" className="h-7 text-[11px] px-2.5">
                        Edit Flow
                      </Button>
                    </Link>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* Recent Conversations Card */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Recent Live Conversations</CardTitle>
              <CardDescription>Incoming visitor inquiries & live handover</CardDescription>
            </div>
            <Link href="/conversations">
              <Button size="sm" variant="outline" className="text-xs gap-1">
                <span>Open Inbox</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent className="space-y-3">
            {conversations.length === 0 ? (
              <div className="text-center py-8 text-slate-400 text-xs">
                No conversations recorded yet. Embed your widget to start collecting chats!
              </div>
            ) : (
              conversations.slice(0, 4).map((c) => (
                <Link
                  key={c.id}
                  href={`/conversations?id=${c.id}`}
                  className="flex items-center justify-between p-3 rounded-xl border border-slate-200 bg-slate-50/50 hover:bg-slate-50 transition-colors block"
                >
                  <div className="min-w-0 pr-3">
                    <div className="flex items-center gap-2">
                      <h4 className="text-xs font-bold text-slate-900 truncate">
                        {c.campaignContact?.name || c.visitorId.substring(0, 14)}
                      </h4>
                      <Badge
                        variant={
                          c.sessionStatus === "HANDOVER"
                            ? "warning"
                            : c.sessionStatus === "RESOLVED"
                            ? "success"
                            : "info"
                        }
                        className="text-[9px]"
                      >
                        {c.sessionStatus}
                      </Badge>
                    </div>
                    <p className="text-[11px] text-slate-500 truncate mt-0.5">
                      {c.messages?.[0]?.content || "Active session..."}
                    </p>
                  </div>
                  <span className="text-[11px] text-slate-400 shrink-0">{formatDate(c.lastActiveAt)}</span>
                </Link>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
