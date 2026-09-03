"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { CheckCircle2, AlertTriangle, XCircle, RefreshCw, Activity } from "lucide-react";

interface Check {
  key: string;
  label: string;
  status: "ok" | "warn" | "fail";
  detail: string;
  hint?: string;
  ms?: number;
}

const TONE = {
  ok: { icon: CheckCircle2, cls: "text-emerald-600", bg: "bg-emerald-50 border-emerald-200", word: "Working" },
  warn: { icon: AlertTriangle, cls: "text-amber-600", bg: "bg-amber-50 border-amber-200", word: "Attention" },
  fail: { icon: XCircle, cls: "text-red-600", bg: "bg-red-50 border-red-200", word: "Broken" },
} as const;

/**
 * Live system check.
 *
 * Most subsystems here degrade quietly rather than failing loudly, which keeps
 * the product usable but hides a broken integration. This page exercises each
 * one for real so the difference is visible.
 */
export default function SystemCheckPage() {
  const [checks, setChecks] = useState<Check[]>([]);
  const [summary, setSummary] = useState<{ ok: number; warn: number; fail: number } | null>(null);
  const [checkedAt, setCheckedAt] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/system-check");
      const json = await res.json();
      if (!json.success) {
        setError(json.error?.message || "Could not run the system check.");
        return;
      }
      const data = json.data || json;
      setChecks(data.checks || []);
      setSummary(data.summary || null);
      setCheckedAt(data.checkedAt || "");
    } catch {
      setError("Could not reach the server.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    run();
  }, [run]);

  const headline =
    summary && summary.fail > 0
      ? { text: `${summary.fail} thing${summary.fail > 1 ? "s" : ""} need fixing`, cls: "text-red-700" }
      : summary && summary.warn > 0
        ? { text: `Working, with ${summary.warn} suggestion${summary.warn > 1 ? "s" : ""}`, cls: "text-amber-700" }
        : { text: "Everything is working", cls: "text-emerald-700" };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">System Check</h1>
          <p className="text-sm text-slate-500">
            Tests every connected service for real — database, AI, storage and email.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={run} disabled={loading} className="gap-1.5">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          <span>{loading ? "Testing…" : "Run again"}</span>
        </Button>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs font-medium text-red-800">
          {error}
        </div>
      )}

      {summary && (
        <Card>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="w-11 h-11 rounded-xl bg-slate-100 flex items-center justify-center shrink-0">
              <Activity className="w-5 h-5 text-slate-600" />
            </div>
            <div className="min-w-0">
              <p className={`text-lg font-black ${headline.cls}`}>{headline.text}</p>
              <p className="text-xs text-slate-500 mt-0.5">
                {summary.ok} working · {summary.warn} to review · {summary.fail} broken
                {checkedAt && ` · checked ${new Date(checkedAt).toLocaleTimeString()}`}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Service status</CardTitle>
          <CardDescription>
            Each row is a live request, not a settings lookup — a service that quietly fell back to a simpler mode
            still shows here.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading && checks.length === 0 ? (
            <p className="text-sm text-slate-500 py-8 text-center">Running checks…</p>
          ) : (
            <div className="space-y-2">
              {checks.map((check) => {
                const tone = TONE[check.status];
                const Icon = tone.icon;
                return (
                  <div key={check.key} className={`flex items-start gap-3 rounded-xl border p-3 ${tone.bg}`}>
                    <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${tone.cls}`} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-slate-900 text-sm">{check.label}</span>
                        <span className={`text-[10px] font-bold uppercase tracking-wider ${tone.cls}`}>
                          {tone.word}
                        </span>
                      </div>
                      <p className="text-xs text-slate-700 mt-0.5 break-words">{check.detail}</p>
                      {check.hint && <p className="text-xs text-slate-600 mt-1.5 italic">{check.hint}</p>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
