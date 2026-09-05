"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { SkeletonList } from "@/components/ui/Loading";
import { Globe, CheckCircle2, AlertTriangle, RefreshCw, Copy, Check, ExternalLink } from "lucide-react";

interface DnsRecord {
  type: string;
  name: string;
  value: string;
  note?: string;
}

interface DomainRow {
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  domain: string;
  live: boolean;
  detail: string;
  dns: { domain: string; isApex: boolean; records: DnsRecord[]; platformStep: string; accuracyNote?: string; proxyWarning?: string };
}

/**
 * Every client custom domain, checked live.
 *
 * Connecting a domain needs two parties: the client creates a DNS record, and
 * the operator adds the hostname in Vercel so a certificate is issued. Only
 * the second half is invisible to the client, who just sees a browser security
 * warning and reports the product as broken. This page is where that half gets
 * tracked.
 */
export default function SuperAdminDomainsPage() {
  const [rows, setRows] = useState<DomainRow[]>([]);
  const [summary, setSummary] = useState<{ total: number; live: number; pending: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
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
    } catch {
      setError("Could not reach the server.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const copy = async (value: string, key: string) => {
    await navigator.clipboard.writeText(value);
    setCopied(key);
    setTimeout(() => setCopied(null), 1500);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">Client Domains</h1>
          <p className="text-sm text-slate-500">
            Every connected custom domain, checked live rather than from a stored flag.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading} className="gap-1.5">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          <span>{loading ? "Checking…" : "Re-check all"}</span>
        </Button>
      </div>

      {summary && summary.pending > 0 && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5">
          <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
          <p className="text-xs text-amber-900">
            <span className="font-bold">
              {summary.pending} of {summary.total} not serving yet.
            </span>{" "}
            A domain whose DNS is correct but which still fails usually needs adding under{" "}
            <span className="font-semibold">Vercel → Project → Settings → Domains</span> so a certificate is issued.
            Until then the visitor sees a browser security warning.
          </p>
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs font-medium text-red-800">
          {error}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Connected domains{summary ? ` · ${summary.live}/${summary.total} live` : ""}
          </CardTitle>
          <CardDescription>
            Each row is a live request to that hostname. "Live" means it answered and it was this application, not
            merely that something responded.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading && rows.length === 0 ? (
            <SkeletonList rows={3} />
          ) : rows.length === 0 ? (
            <p className="text-sm text-slate-500 py-8 text-center">
              No client has connected a custom domain yet.
            </p>
          ) : (
            <div className="space-y-3">
              {rows.map((row) => (
                <div
                  key={row.tenantId}
                  className={`rounded-xl border p-3.5 ${
                    row.live ? "border-emerald-200 bg-emerald-50/50" : "border-amber-200 bg-amber-50/50"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3 flex-wrap">
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
                    </div>
                  </div>

                  {!row.live && (
                    <div className="mt-3 pt-3 border-t border-amber-200/70">
                      <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                        DNS the client must create
                      </p>
                      <div className="space-y-1.5">
                        {row.dns.records.map((record) => (
                          <div
                            key={record.type + record.name}
                            className="flex items-center gap-2 flex-wrap text-xs font-mono bg-white rounded-lg border border-slate-200 px-2.5 py-1.5"
                          >
                            <span className="font-bold text-slate-900">{record.type}</span>
                            <span className="text-slate-500">{record.name}</span>
                            <span className="text-slate-700 break-all">{record.value}</span>
                            <button
                              type="button"
                              onClick={() => copy(record.value, row.tenantId + record.type)}
                              className="ml-auto p-1 rounded hover:bg-slate-100 text-slate-500"
                              title="Copy value"
                            >
                              {copied === row.tenantId + record.type ? (
                                <Check className="w-3 h-3 text-emerald-600" />
                              ) : (
                                <Copy className="w-3 h-3" />
                              )}
                            </button>
                          </div>
                        ))}
                      </div>
                      <p className="text-[11px] text-slate-600 mt-2">{row.dns.platformStep}</p>
                      {row.dns.proxyWarning && (
                        <p className="text-[11px] text-amber-700 font-semibold mt-1">{row.dns.proxyWarning}</p>
                      )}
                      {row.dns.accuracyNote && (
                        <p className="text-[11px] text-slate-500 mt-1">{row.dns.accuracyNote}</p>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Globe className="w-4 h-4 text-indigo-600" />
            <span>What clients can and cannot have</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="text-xs text-slate-700 space-y-2">
          <p>
            <span className="font-bold">A subdomain works with DNS alone.</span> chat.theircompany.com points at us
            with one CNAME record, and the chat is served with no path and no iframe.
          </p>
          <p>
            <span className="font-bold">A path on their own site cannot be done with DNS.</span> A DNS record points a
            whole hostname; it has no concept of a path, so nothing can send only theircompany.com/chat-bot to us while
            the rest of their site stays where it is. Their Settings page offers the two approaches that do work: an
            embed on a page of their own site, or a reverse-proxy rule on their server, with copy-paste configuration
            for Nginx, Apache, Cloudflare and Vercel.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
