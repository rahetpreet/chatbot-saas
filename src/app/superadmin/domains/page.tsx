"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { SkeletonList } from "@/components/ui/Loading";
import {
  Globe,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Copy,
  Check,
  ExternalLink,
  Trash2,
  Plus,
  Clock,
  User,
  Server,
} from "lucide-react";

interface DnsRecord {
  type: string;
  name: string;
  value: string;
  note?: string;
}

interface DnsStep {
  who: "client" | "operator" | "done";
  title: string;
  detail: string;
}

interface Dns {
  domain: string;
  isApex: boolean;
  records: DnsRecord[];
  platformStep: string;
  accuracyNote?: string;
  proxyWarning?: string;
  cacheWarning?: string;
  steps?: DnsStep[];
}

interface Registration {
  known: boolean;
  verified: boolean;
  misconfigured: boolean;
  detail: string;
}

interface DomainRow {
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  tenantStatus: string;
  domain: string | null;
  live: boolean;
  detail: string;
  registration?: Registration | null;
  dns: Dns | null;
}

/**
 * Custom domains, operator-controlled.
 *
 * Connecting a domain takes two parties, and only one of them is the client:
 * they create a DNS record, but the hostname must also be registered on the
 * platform before a certificate exists. Self-service left clients with a
 * half-connected domain and a browser security warning, so the whole flow
 * lives here instead — assign, hand over the record, verify.
 */
export default function SuperAdminDomainsPage() {
  const [rows, setRows] = useState<DomainRow[]>([]);
  const [summary, setSummary] = useState<{ workspaces: number; total: number; live: number; pending: number } | null>(
    null,
  );
  const [automation, setAutomation] = useState<{ enabled: boolean; detail: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async (showSpinner = true) => {
    if (showSpinner) setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/domains");
      const json = await res.json();
      if (!json.success) {
        setError(json.error?.message || "Could not load domains.");
        return;
      }
      const data = json.data || json;
      setRows(data.domains || []);
      setSummary(data.summary || null);
      setAutomation(data.automation || null);
    } catch {
      setError("Could not reach the server.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const assign = async (tenantId: string) => {
    const domain = (drafts[tenantId] || "").trim();
    if (!domain) return;
    setBusy(tenantId);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/admin/domains", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId, domain }),
      });
      const json = await res.json();
      if (!json.success) {
        setError(json.error?.message || "Could not assign that domain.");
        return;
      }
      setNotice(json.message || "Domain assigned.");
      setDrafts((current) => ({ ...current, [tenantId]: "" }));
      setExpanded(tenantId);
      await load(false);
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBusy(null);
    }
  };

  const disconnect = async (row: DomainRow) => {
    if (!confirm(`Disconnect ${row.domain} from ${row.tenantName}? Their platform link keeps working.`)) return;
    setBusy(row.tenantId);
    try {
      const res = await fetch(`/api/admin/domains?tenantId=${encodeURIComponent(row.tenantId)}`, { method: "DELETE" });
      const json = await res.json();
      if (!json.success) {
        setError(json.error?.message || "Could not disconnect that domain.");
        return;
      }
      setNotice(json.data?.message || "Domain disconnected.");
      await load(false);
    } finally {
      setBusy(null);
    }
  };

  const copy = async (value: string, key: string) => {
    await navigator.clipboard.writeText(value);
    setCopied(key);
    setTimeout(() => setCopied(null), 1500);
  };

  const copyBrief = (row: DomainRow) => {
    if (!row.dns) return;
    const record = row.dns.records[0];
    const text = [
      `Please add this DNS record for ${row.dns.domain}:`,
      "",
      `  Type:  ${record.type}`,
      `  Name:  ${record.name}`,
      `  Value: ${record.value}`,
      "",
      row.dns.proxyWarning || "",
      "",
      row.dns.cacheWarning || "",
    ]
      .filter(Boolean)
      .join("\n");
    copy(text, `brief-${row.tenantId}`);
  };

  const connected = rows.filter((row) => row.domain);
  const unconnected = rows.filter((row) => !row.domain);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">Client Domains</h1>
          <p className="text-sm text-slate-500">
            Assign a domain to a client, hand them the record, and confirm it is serving — all from here.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => load()} disabled={loading} className="gap-1.5">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          <span>{loading ? "Checking…" : "Re-check all"}</span>
        </Button>
      </div>

      {notice && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-xs font-medium text-emerald-900">
          {notice}
        </div>
      )}
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs font-medium text-red-800">
          {error}
        </div>
      )}

      {automation && !automation.enabled && (
        <div className="flex items-start gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5">
          <Server className="w-4 h-4 text-slate-500 mt-0.5 shrink-0" />
          <p className="text-xs text-slate-700">
            <span className="font-bold">Manual host registration.</span> {automation.detail}
          </p>
        </div>
      )}

      {automation?.enabled && (
        <div className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
          <p className="text-xs text-emerald-900">
            <span className="font-bold">Automatic host registration is on.</span> {automation.detail} The client only
            has to add the DNS record.
          </p>
        </div>
      )}

      {summary && summary.pending > 0 && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5">
          <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
          <p className="text-xs text-amber-900">
            <span className="font-bold">
              {summary.pending} of {summary.total} not serving yet.
            </span>{" "}
            Expand a domain below for the exact remaining step.
          </p>
        </div>
      )}

      {/* Connected domains */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Connected{summary ? ` · ${summary.live}/${summary.total} live` : ""}
          </CardTitle>
          <CardDescription>
            Each row is a live request. &ldquo;Live&rdquo; means the response came from this application, not merely
            that something answered.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading && rows.length === 0 ? (
            <SkeletonList rows={3} />
          ) : connected.length === 0 ? (
            <p className="text-sm text-slate-500 py-6 text-center">
              No client has a custom domain yet. Assign one below.
            </p>
          ) : (
            <div className="space-y-3">
              {connected.map((row) => (
                <div
                  key={row.tenantId}
                  className={`rounded-xl border ${row.live ? "border-emerald-200 bg-emerald-50/40" : "border-amber-200 bg-amber-50/40"}`}
                >
                  <div className="p-3.5 flex items-start justify-between gap-3 flex-wrap">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        {row.live ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                        ) : (
                          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                        )}
                        <a
                          href={`https://${row.domain}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-sm font-bold text-slate-900 hover:underline break-all"
                        >
                          {row.domain}
                        </a>
                        <ExternalLink className="w-3 h-3 text-slate-400" />
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            row.live ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
                          }`}
                        >
                          {row.live ? "Live" : "Not serving"}
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 mt-1">
                        <span className="font-semibold">{row.tenantName}</span> · /c/{row.tenantSlug}
                      </p>
                      <p className="text-xs text-slate-700 mt-1">{row.detail}</p>
                      {row.registration?.misconfigured && (
                        <p className="text-[11px] text-slate-500 mt-0.5">Host: {row.registration.detail}</p>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setExpanded(expanded === row.tenantId ? null : row.tenantId)}
                        className="text-xs gap-1"
                      >
                        {expanded === row.tenantId ? "Hide steps" : "Setup steps"}
                      </Button>
                      <button
                        onClick={() => disconnect(row)}
                        disabled={busy === row.tenantId}
                        className="p-1.5 rounded-lg hover:bg-white text-red-500"
                        title="Disconnect this domain"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {expanded === row.tenantId && row.dns && (
                    <div className="px-3.5 pb-3.5 border-t border-slate-200/70 pt-3 space-y-3">
                      {/* Records */}
                      <div>
                        <div className="flex items-center justify-between gap-2 mb-1.5 flex-wrap">
                          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                            DNS record for the client
                          </p>
                          <Button size="sm" variant="outline" onClick={() => copyBrief(row)} className="text-xs gap-1">
                            {copied === `brief-${row.tenantId}` ? (
                              <Check className="w-3 h-3 text-emerald-600" />
                            ) : (
                              <Copy className="w-3 h-3" />
                            )}
                            <span>Copy instructions to send</span>
                          </Button>
                        </div>
                        <div className="space-y-1.5">
                          {row.dns.records.map((record, index) => (
                            <div
                              key={record.type + record.name}
                              className="flex items-center gap-2 flex-wrap text-xs font-mono bg-white rounded-lg border border-slate-200 px-2.5 py-1.5"
                            >
                              <span className="font-bold text-slate-900">{record.type}</span>
                              <span className="text-slate-500">{record.name}</span>
                              <span className="text-slate-700 break-all">{record.value}</span>
                              {index > 0 && (
                                <span className="text-[10px] font-sans text-slate-400">(alternative)</span>
                              )}
                              <button
                                type="button"
                                onClick={() => copy(record.value, `${row.tenantId}-${record.type}`)}
                                className="ml-auto p-1 rounded hover:bg-slate-100 text-slate-500"
                              >
                                {copied === `${row.tenantId}-${record.type}` ? (
                                  <Check className="w-3 h-3 text-emerald-600" />
                                ) : (
                                  <Copy className="w-3 h-3" />
                                )}
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Ordered steps */}
                      {row.dns.steps && (
                        <div className="space-y-1.5">
                          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Steps</p>
                          {row.dns.steps.map((step, index) => (
                            <div key={step.title} className="flex items-start gap-2 text-xs">
                              <span
                                className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5 ${
                                  step.who === "done"
                                    ? "bg-emerald-100 text-emerald-700"
                                    : "bg-slate-200 text-slate-700"
                                }`}
                              >
                                {step.who === "done" ? <Check className="w-2.5 h-2.5" /> : index + 1}
                              </span>
                              <div className="min-w-0">
                                <span className="font-bold text-slate-900">{step.title}</span>
                                <span
                                  className={`ml-1.5 text-[10px] font-bold px-1.5 py-0.5 rounded ${
                                    step.who === "done"
                                      ? "bg-emerald-100 text-emerald-700"
                                      : step.who === "operator"
                                        ? "bg-indigo-100 text-indigo-700"
                                        : "bg-slate-200 text-slate-600"
                                  }`}
                                >
                                  {step.who === "done" ? (
                                    <Check className="w-2.5 h-2.5 inline mr-0.5" />
                                  ) : step.who === "operator" ? (
                                    <Server className="w-2.5 h-2.5 inline mr-0.5" />
                                  ) : (
                                    <User className="w-2.5 h-2.5 inline mr-0.5" />
                                  )}
                                  {step.who === "done" ? "done" : step.who === "operator" ? "you" : "client"}
                                </span>
                                <p className="text-slate-600 mt-0.5 break-words">{step.detail}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Warnings that cost the most time when missed */}
                      <div className="space-y-1.5">
                        {row.dns.proxyWarning && (
                          <p className="text-[11px] text-amber-800 font-semibold bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
                            {row.dns.proxyWarning}
                          </p>
                        )}
                        {row.dns.cacheWarning && (
                          <p className="flex items-start gap-1.5 text-[11px] text-sky-900 bg-sky-50 border border-sky-200 rounded-lg px-2.5 py-1.5">
                            <Clock className="w-3 h-3 mt-0.5 shrink-0" />
                            <span>{row.dns.cacheWarning}</span>
                          </p>
                        )}
                        {row.dns.accuracyNote && (
                          <p className="text-[11px] text-slate-500">{row.dns.accuracyNote}</p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Assign a domain */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Assign a domain</CardTitle>
          <CardDescription>
            Workspaces without one. Their chat is reachable at the platform link either way.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading && rows.length === 0 ? (
            <SkeletonList rows={2} />
          ) : unconnected.length === 0 ? (
            <p className="text-sm text-slate-500 py-6 text-center">Every workspace already has a custom domain.</p>
          ) : (
            <div className="space-y-2">
              {unconnected.map((row) => (
                <div
                  key={row.tenantId}
                  className="flex items-center gap-2 flex-wrap rounded-xl border border-slate-200 p-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-slate-900 truncate">{row.tenantName}</p>
                    <p className="text-[11px] text-slate-500">/c/{row.tenantSlug}</p>
                  </div>
                  <input
                    value={drafts[row.tenantId] || ""}
                    onChange={(event) => setDrafts((current) => ({ ...current, [row.tenantId]: event.target.value }))}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") assign(row.tenantId);
                    }}
                    placeholder="chat.theircompany.com"
                    className="flex-1 min-w-[200px] px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <Button
                    size="sm"
                    onClick={() => assign(row.tenantId)}
                    loading={busy === row.tenantId}
                    disabled={!(drafts[row.tenantId] || "").trim()}
                    className="gap-1.5 text-xs font-bold"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Assign</span>
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex items-start gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5">
        <Globe className="w-4 h-4 text-slate-500 mt-0.5 shrink-0" />
        <p className="text-xs text-slate-600">
          A subdomain such as <span className="font-mono">chat.theircompany.com</span> is the usual choice: it leaves
          the client&apos;s main website untouched and needs one DNS record. An apex domain takes over the whole
          hostname, so only use it when the client has no website there.
        </p>
      </div>
    </div>
  );
}
