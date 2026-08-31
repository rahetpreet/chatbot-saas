"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import {
  Building2,
  Users,
  GitBranch,
  MessageSquare,
  HardDrive,
  Sparkles,
  ArrowUpRight,
  ShieldAlert,
  Activity,
} from "lucide-react";
import { formatDate } from "@/lib/utils";

export default function SuperAdminDashboardPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/superadmin/stats")
      .then((res) => res.json())
      .then((json) => setData(json))
      .finally(() => setLoading(false));
  }, []);

  const metrics = data?.metrics || {
    totalTenants: 0,
    activeTenants: 0,
    totalUsers: 0,
    totalFlows: 0,
    totalConversations: 0,
    totalMessages: 0,
    totalLeads: 0,
    estimatedStorageMb: 0,
  };

  const statCards = [
    {
      title: "Active Companies",
      value: `${metrics.activeTenants} / ${metrics.totalTenants}`,
      desc: "Tenants with active subscription",
      icon: Building2,
      color: "text-indigo-600 bg-indigo-50",
    },
    {
      title: "Total Bot Flows",
      value: metrics.totalFlows,
      desc: "Across all client workspaces",
      icon: GitBranch,
      color: "text-sky-600 bg-sky-50",
    },
    {
      title: "Total Messages Processed",
      value: metrics.totalMessages,
      desc: "Automated & live conversations",
      icon: MessageSquare,
      color: "text-emerald-600 bg-emerald-50",
    },
    {
      title: "Captured Client Leads",
      value: metrics.totalLeads,
      desc: "High-intent visitor submissions",
      icon: Users,
      color: "text-amber-600 bg-amber-50",
    },
    {
      title: "Local Storage Consumed",
      value: `${metrics.estimatedStorageMb} MB`,
      desc: "Attachments & conversation logs",
      icon: HardDrive,
      color: "text-purple-600 bg-purple-50",
    },
    {
      title: "Infrastructure API Cost",
      value: "₹0 / Free",
      desc: "100% Zero-cost self-hosted stack",
      icon: Sparkles,
      color: "text-emerald-700 bg-emerald-100 font-black",
    },
  ];

  return (
    <div className="space-y-6">
      {/* Top Welcome */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">Super Admin Platform Overview</h1>
          <p className="text-sm text-slate-500">
            System health, active company subscriptions, and multi-tenant resource consumption.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/superadmin/tenants">
            <Button className="gap-2 text-xs font-bold">
              <Building2 className="w-4 h-4" />
              <span>Manage Companies</span>
            </Button>
          </Link>
        </div>
      </div>

      {/* Metric Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
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

      {/* Recent System Audit Logs Table */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Recent System Audit Trail</CardTitle>
            <CardDescription>Real-time log of administrative and tenant actions</CardDescription>
          </div>
          <Link href="/superadmin/audit-logs">
            <Button size="sm" variant="outline" className="text-xs gap-1">
              <span>View All Logs</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </Button>
          </Link>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 text-slate-500 uppercase text-[10px] font-bold bg-slate-50">
                <tr>
                  <th className="p-3">Timestamp</th>
                  <th className="p-3">Action</th>
                  <th className="p-3">Company</th>
                  <th className="p-3">User</th>
                  <th className="p-3">IP Address</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(data?.recentAuditLogs || []).length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-6 text-center text-slate-400">
                      No audit events recorded yet.
                    </td>
                  </tr>
                ) : (
                  data.recentAuditLogs.map((log: any) => (
                    <tr key={log.id} className="hover:bg-slate-50">
                      <td className="p-3 text-slate-600">{formatDate(log.timestamp)}</td>
                      <td className="p-3">
                        <span className="font-mono font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded">
                          {log.action}
                        </span>
                      </td>
                      <td className="p-3 font-semibold text-slate-800">
                        {log.tenant?.name || <span className="text-slate-400">Platform</span>}
                      </td>
                      <td className="p-3 text-slate-600">{log.user?.email || "System"}</td>
                      <td className="p-3 font-mono text-slate-400">{log.ipAddress || "-"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
