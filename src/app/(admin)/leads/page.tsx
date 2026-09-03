"use client";

import React, { useState, useEffect } from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Download, Search, RefreshCw, Trash2, Mail, Phone, ExternalLink } from "lucide-react";
import { formatDate } from "@/lib/utils";

export default function LeadsPage() {
  const [leads, setLeads] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [search, setSearch] = useState("");

  const fetchLeads = async () => {
    setLoading(true);
    try {
      let url = "/api/client/leads";
      if (statusFilter !== "ALL") url += `?status=${statusFilter}`;
      const res = await fetch(url);
      const data = await res.json();
      setLeads(data.leads || []);
    } catch {
      setLeads([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLeads();
  }, [statusFilter]);

  const handleUpdateStatus = async (id: string, status: string) => {
    try {
      await fetch("/api/client/leads", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status }),
      });
      fetchLeads();
    } catch {
      alert("Failed to update status");
    }
  };

  const handleDeleteLead = async (id: string) => {
    if (!confirm("Delete this lead record?")) return;
    try {
      await fetch(`/api/client/leads?id=${id}`, { method: "DELETE" });
      fetchLeads();
    } catch {
      alert("Failed to delete lead");
    }
  };

  const filtered = leads.filter((l) => {
    const term = search.toLowerCase();
    return (
      (l.name && l.name.toLowerCase().includes(term)) ||
      (l.email && l.email.toLowerCase().includes(term)) ||
      (l.phone && l.phone.toLowerCase().includes(term))
    );
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">Captured Leads & Contacts</h1>
          <p className="text-sm text-slate-500">
            Prospects captured through bot conversational forms, qualification branches, and demo requests.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* CSV Export */}
          <a
            href="/api/client/leads/export?format=csv"
            download={`leads_${Date.now()}.csv`}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition-colors shadow-sm"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export CSV</span>
          </a>

          {/* JSON Export */}
          <a
            href="/api/client/leads/export?format=json"
            download={`leads_${Date.now()}.json`}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 transition-colors shadow-xs"
          >
            <Download className="w-3.5 h-3.5" />
            <span>JSON</span>
          </a>
        </div>
      </div>

      {/* Leads Table Card */}
      <Card>
        <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="relative w-64">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search leads..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-slate-300 bg-white"
              />
            </div>
            <div className="flex items-center gap-1">
              {["ALL", "NEW", "QUALIFIED", "CONVERTED", "CONTACTED"].map((tab) => (
                <button
                  key={tab}
                  onClick={() => setStatusFilter(tab)}
                  className={`text-[11px] font-bold px-2 py-1 rounded-md transition-colors ${
                    statusFilter === tab
                      ? "bg-slate-900 text-white"
                      : "text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>
          </div>
          <span className="text-xs font-semibold text-slate-500">{filtered.length} Leads Total</span>
        </CardHeader>

        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 text-slate-500 uppercase text-[10px] font-bold bg-slate-50">
                <tr>
                  <th className="p-3">Lead / Contact</th>
                  <th className="p-3">Email & Phone</th>
                  <th className="p-3">Collected Answers</th>
                  <th className="p-3">Lead Score</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Captured Date</th>
                  <th className="p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-slate-400">
                      No leads found. When visitors complete your bot forms, entries will be recorded here automatically!
                    </td>
                  </tr>
                ) : (
                  filtered.map((lead) => {
                    let customAnswers: Record<string, any> = {};
                    try {
                      if (lead.collectedFields) {
                        customAnswers = typeof lead.collectedFields === "string" ? JSON.parse(lead.collectedFields) : lead.collectedFields;
                      }
                    } catch {}

                    return (
                      <tr key={lead.id} className="hover:bg-slate-50">
                        <td className="p-3 font-bold text-slate-900">{lead.name || "Anonymous Lead"}</td>
                        <td className="p-3 space-y-0.5">
                          {lead.email ? (
                            <div className="flex items-center gap-1 text-slate-700">
                              <Mail className="w-3 h-3 text-slate-400" />
                              <span>{lead.email}</span>
                            </div>
                          ) : null}
                          {lead.phone ? (
                            <div className="flex items-center gap-1 text-slate-600">
                              <Phone className="w-3 h-3 text-slate-400" />
                              <span>{lead.phone}</span>
                            </div>
                          ) : null}
                          {!lead.email && !lead.phone && <span className="text-slate-400 italic">No contact info</span>}
                        </td>
                        <td className="p-3">
                          <div className="flex flex-wrap gap-1 max-w-xs">
                            {Object.entries(customAnswers).map(([k, v]) => {
                              if (k === "name" || k === "email" || k === "phone") return null;
                              return (
                                <span
                                  key={k}
                                  className="text-[10px] bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded font-medium truncate"
                                >
                                  <strong>{k}:</strong> {String(v)}
                                </span>
                              );
                            })}
                          </div>
                        </td>
                        <td className="p-3">
                          <span className="font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-full text-[11px]">
                            {lead.score || 70} / 100
                          </span>
                        </td>
                        <td className="p-3">
                          <select
                            value={lead.status}
                            onChange={(e) => handleUpdateStatus(lead.id, e.target.value)}
                            className="text-[11px] font-bold rounded-lg border border-slate-300 bg-white p-1 cursor-pointer"
                          >
                            <option value="NEW">NEW</option>
                            <option value="CONTACTED">CONTACTED</option>
                            <option value="QUALIFIED">QUALIFIED</option>
                            <option value="CONVERTED">CONVERTED</option>
                            <option value="ARCHIVED">ARCHIVED</option>
                          </select>
                        </td>
                        <td className="p-3 text-slate-500 whitespace-nowrap">{formatDate(lead.createdAt)}</td>
                        <td className="p-3 text-right">
                          <button
                            onClick={() => handleDeleteLead(lead.id)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 rounded hover:bg-slate-100"
                            title="Delete"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
