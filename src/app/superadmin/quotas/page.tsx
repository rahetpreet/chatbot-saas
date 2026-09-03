"use client";

import React, { useEffect, useState } from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/Card";
import { Activity, MessageSquare, Users, Target, HardDrive, InfoIcon, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/Button";

interface UsageRow {
  id: string;
  name: string;
  slug: string;
  status: string;
  planTier: string;
  customDomain: string | null;
  flows: number;
  contacts: number;
  campaigns: number;
  conversations: number;
  leads: number;
  teamMembers: number;
  messagesThisMonth: number;
  storageMb: number;
}

interface UsageTotals {
  workspaces: number;
  conversations: number;
  messagesThisMonth: number;
  contacts: number;
  leads: number;
  storageMb: number;
}

/**
 * Platform usage.
 *
 * This page previously listed hard-coded plan tiers and prices that nothing
 * enforced. Quotas are disabled, so it now reports what workspaces are
 * actually consuming, which is the information an operator can act on.
 */
export default function SuperAdminUsagePage() {
  const [rows, setRows] = useState<UsageRow[]>([]);
  const [totals, setTotals] = useState<UsageTotals | null>(null);
  const [period, setPeriod] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/usage");
      const json = await res.json();
      if (!json.success) {
        setError(json.error?.message || "Could not load usage.");
        return;
      }
      const data = json.data || json;
      setRows(data.tenants || []);
      setTotals(data.totals || null);
      setPeriod(data.period || "");
    } catch {
      setError("Could not reach the server.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const statCards = [
    { label: "Workspaces", value: totals?.workspaces ?? 0, icon: Users, tone: "text-indigo-600 bg-indigo-50" },
    { label: "Conversations", value: totals?.conversations ?? 0, icon: Activity, tone: "text-sky-600 bg-sky-50" },
    { label: `Messages (${period})`, value: totals?.messagesThisMonth ?? 0, icon: MessageSquare, tone: "text-emerald-600 bg-emerald-50" },
    { label: "Leads", value: totals?.leads ?? 0, icon: Target, tone: "text-amber-600 bg-amber-50" },
    { label: "Storage (MB)", value: totals?.storageMb ?? 0, icon: HardDrive, tone: "text-violet-600 bg-violet-50" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">Platform Usage</h1>
          <p className="text-sm text-slate-500">
            What every workspace is actually consuming, for the current billing period.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading} className="gap-1.5">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          <span>{loading ? "Refreshing…" : "Refresh"}</span>
        </Button>
      </div>

      <div className="flex items-start gap-2 rounded-xl border border-sky-200 bg-sky-50 px-3.5 py-2.5">
        <InfoIcon className="w-4 h-4 text-sky-600 mt-0.5 shrink-0" />
        <p className="text-xs text-sky-900">
          <span className="font-bold">Quotas are not enforced.</span> There is no message, flow, contact or storage
          limit on any workspace. Suspending a workspace is done through its status (Pause / Expire), not through
          usage. These figures are for visibility and future billing.
        </p>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs font-medium text-red-800">
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {statCards.map((card) => (
          <Card key={card.label}>
            <CardContent className="p-4">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center mb-2 ${card.tone}`}>
                <card.icon className="w-4 h-4" />
              </div>
              <p className="text-xl font-black text-slate-900 tabular-nums">{card.value.toLocaleString()}</p>
              <p className="text-[11px] font-semibold text-slate-500 mt-0.5">{card.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Per-workspace usage</CardTitle>
          <CardDescription>Messages are for the current month; everything else is a running total.</CardDescription>
        </CardHeader>
        <CardContent>
          {loading && rows.length === 0 ? (
            <p className="text-sm text-slate-500 py-6 text-center">Loading usage…</p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-slate-500 py-6 text-center">No workspaces yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wider text-slate-400 border-b border-slate-200">
                    <th className="py-2 pr-3 font-bold">Workspace</th>
                    <th className="py-2 px-2 font-bold">Status</th>
                    <th className="py-2 px-2 font-bold text-right">Flows</th>
                    <th className="py-2 px-2 font-bold text-right">Campaigns</th>
                    <th className="py-2 px-2 font-bold text-right">Contacts</th>
                    <th className="py-2 px-2 font-bold text-right">Chats</th>
                    <th className="py-2 px-2 font-bold text-right">Msgs / mo</th>
                    <th className="py-2 px-2 font-bold text-right">Leads</th>
                    <th className="py-2 pl-2 font-bold text-right">Storage</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="py-2.5 pr-3">
                        <p className="font-bold text-slate-900">{row.name}</p>
                        <p className="text-[11px] text-slate-500">
                          {row.customDomain || `/c/${row.slug}`}
                        </p>
                      </td>
                      <td className="py-2.5 px-2">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            row.status === "ACTIVE"
                              ? "bg-emerald-100 text-emerald-700"
                              : row.status === "TRIAL"
                                ? "bg-sky-100 text-sky-700"
                                : "bg-slate-200 text-slate-600"
                          }`}
                        >
                          {row.status}
                        </span>
                      </td>
                      <td className="py-2.5 px-2 text-right tabular-nums text-slate-700">{row.flows}</td>
                      <td className="py-2.5 px-2 text-right tabular-nums text-slate-700">{row.campaigns}</td>
                      <td className="py-2.5 px-2 text-right tabular-nums text-slate-700">{row.contacts.toLocaleString()}</td>
                      <td className="py-2.5 px-2 text-right tabular-nums text-slate-700">{row.conversations.toLocaleString()}</td>
                      <td className="py-2.5 px-2 text-right tabular-nums font-semibold text-slate-900">
                        {row.messagesThisMonth.toLocaleString()}
                      </td>
                      <td className="py-2.5 px-2 text-right tabular-nums text-slate-700">{row.leads.toLocaleString()}</td>
                      <td className="py-2.5 pl-2 text-right tabular-nums text-slate-700">{row.storageMb} MB</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
