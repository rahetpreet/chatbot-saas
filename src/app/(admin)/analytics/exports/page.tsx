"use client";

import React, { useState } from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Loading";
import {
  DateRangePicker,
  defaultRange,
  rangeQuery,
  type RangeState,
} from "@/components/analytics/shared";
import { Download, FileJson, FileSpreadsheet, Check } from "lucide-react";

/**
 * One-click exports.
 *
 * Each export generates a report first and downloads that, rather than
 * streaming a live query. The file therefore matches a stored report exactly,
 * so a client can always point at the record behind a number they were sent.
 */
const EXPORTS = [
  { type: "complete", label: "Complete performance report", detail: "Everything: funnel, campaigns, links, flow, leads, conversations and insights." },
  { type: "executive", label: "Executive summary", detail: "Headline metrics, the funnel, and what the numbers mean." },
  { type: "campaign", label: "Campaign performance", detail: "Every campaign with opens, chats, leads and conversion." },
  { type: "link", label: "Link performance", detail: "Per-recipient link opens, conversations and conversions." },
  { type: "flow", label: "Flow analysis", detail: "Per-step traffic, completion, drop-off and option choices." },
  { type: "lead", label: "Lead analysis", detail: "Lead volume, pipeline status and attribution." },
  { type: "conversation", label: "Conversation analysis", detail: "Duration, message counts, devices, timing and AI usage." },
  { type: "chatbot", label: "Chatbot performance", detail: "Every chatbot, and conversion by published version." },
];

export default function ExportsPage() {
  const [range, setRange] = useState<RangeState>(defaultRange());
  const [busy, setBusy] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runExport = async (type: string, format: "csv" | "json") => {
    setBusy(`${type}:${format}`);
    setError(null);
    setDone(null);
    try {
      // Generate first so the download is backed by a stored report rather
      // than a one-off query nobody can reproduce later.
      const res = await fetch(`/api/client/reports?${rangeQuery(range)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type }),
      });
      const json = await res.json();
      if (!json.success) {
        setError(json.error?.message || "Could not prepare the export.");
        return;
      }
      window.location.href = `/api/client/reports/${json.data.report.id}/export?format=${format}`;
      setDone(`${type}:${format}`);
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-slate-900">
            <Download className="h-5 w-5 text-indigo-600" />
            Exports
          </h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Every export covers only the period selected here, and only your workspace.
          </p>
        </div>
        <DateRangePicker value={range} onChange={setRange} showCompare={false} />
      </header>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs font-medium text-red-800">
          {error}
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        {EXPORTS.map((item) => (
          <Card key={item.type}>
            <CardHeader>
              <CardTitle className="text-base">{item.label}</CardTitle>
              <CardDescription>{item.detail}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2">
                <Button
                  onClick={() => runExport(item.type, "csv")}
                  disabled={busy !== null}
                  className="flex-1 text-xs"
                >
                  {busy === `${item.type}:csv` ? (
                    <Spinner className="mr-1.5 h-3.5 w-3.5" />
                  ) : done === `${item.type}:csv` ? (
                    <Check className="mr-1.5 h-3.5 w-3.5" />
                  ) : (
                    <FileSpreadsheet className="mr-1.5 h-3.5 w-3.5" />
                  )}
                  CSV
                </Button>
                <Button
                  onClick={() => runExport(item.type, "json")}
                  disabled={busy !== null}
                  variant="secondary"
                  className="flex-1 text-xs"
                >
                  {busy === `${item.type}:json` ? (
                    <Spinner className="mr-1.5 h-3.5 w-3.5" />
                  ) : (
                    <FileJson className="mr-1.5 h-3.5 w-3.5" />
                  )}
                  JSON
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <p className="text-xs text-slate-500">
        Each export is also saved under Reports, so you can re-download the exact file you sent someone.
      </p>
    </div>
  );
}
