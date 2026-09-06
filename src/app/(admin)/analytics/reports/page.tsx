"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { SkeletonList, Spinner } from "@/components/ui/Loading";
import {
  DateRangePicker,
  DataTable,
  EmptyState,
  InsightList,
  FunnelChart,
  defaultRange,
  rangeQuery,
  type RangeState,
} from "@/components/analytics/shared";
import { FileBarChart, Download, Trash2, Eye, FileSpreadsheet, FileJson } from "lucide-react";

/**
 * Report generation and history.
 *
 * A generated report is stored, not recomputed. Opening one from three months
 * ago shows the numbers as they stood that day, which is the only way a report
 * a client forwarded onward stays trustworthy.
 */
export default function ReportsPage() {
  const [range, setRange] = useState<RangeState>(defaultRange());
  const [type, setType] = useState("executive");
  const [types, setTypes] = useState<Array<{ type: string; label: string }>>([]);
  const [reports, setReports] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [viewing, setViewing] = useState<any>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/client/reports?${rangeQuery(range)}`);
      const json = await res.json();
      if (!json.success) {
        setError(json.error?.message || "Could not load reports.");
        return;
      }
      setReports(json.data.reports || []);
      setTypes(json.data.types || []);
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

  const generate = async () => {
    setGenerating(true);
    setNotice(null);
    try {
      const res = await fetch(`/api/client/reports?${rangeQuery(range)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type }),
      });
      const json = await res.json();
      if (!json.success) {
        setError(json.error?.message || "Could not generate the report.");
        return;
      }
      setNotice(json.message);
      await load();
    } finally {
      setGenerating(false);
    }
  };

  /**
   * Generates a report and downloads it immediately.
   *
   * The download is always backed by a stored report rather than a one-off
   * query, so a file someone was sent can always be traced back to a record.
   */
  const generateAndDownload = async (reportType: string, format: "csv" | "json") => {
    setGenerating(true);
    setNotice(null);
    setError(null);
    try {
      const res = await fetch(`/api/client/reports?${rangeQuery(range)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: reportType }),
      });
      const json = await res.json();
      if (!json.success) {
        setError(json.error?.message || "Could not prepare the export.");
        return;
      }
      window.location.href = `/api/client/reports/${json.data.report.id}/export?format=${format}`;
      setNotice(`${json.data.report.label} downloaded and saved below.`);
      await load();
    } catch {
      setError("Could not reach the server.");
    } finally {
      setGenerating(false);
    }
  };

  const view = async (id: string) => {
    const res = await fetch(`/api/client/reports/${id}`);
    const json = await res.json();
    if (json.success) setViewing(json.data);
  };

  const remove = async (id: string) => {
    await fetch(`/api/client/reports/${id}`, { method: "DELETE" });
    if (viewing?.id === id) setViewing(null);
    await load();
  };

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-slate-900">
            <FileBarChart className="h-5 w-5 text-indigo-600" />
            Reports
          </h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Generated reports are frozen, so what you send today still reads the same next quarter.
          </p>
        </div>
      </header>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs font-medium text-red-800">
          {error}
        </div>
      )}
      {notice && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-xs font-medium text-emerald-800">
          {notice}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Generate a report</CardTitle>
          <CardDescription>
            The period you pick is stored with the report. Generate keeps it here to open later; CSV and JSON do
            the same and download the file straight away.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 focus:border-indigo-500 focus:outline-none"
            >
              {types.map((option) => (
                <option key={option.type} value={option.type}>
                  {option.label}
                </option>
              ))}
            </select>
            <DateRangePicker value={range} onChange={setRange} showCompare={false} />
            <Button onClick={generate} disabled={generating} className="text-xs">
              {generating ? <Spinner className="mr-1.5 h-3.5 w-3.5" /> : null}
              {generating ? "Working…" : "Generate"}
            </Button>
            <Button
              variant="outline"
              onClick={() => generateAndDownload(type, "csv")}
              disabled={generating}
              className="text-xs"
              title="Generate and download as CSV"
            >
              <FileSpreadsheet className="mr-1.5 h-3.5 w-3.5" />
              CSV
            </Button>
            <Button
              variant="outline"
              onClick={() => generateAndDownload(type, "json")}
              disabled={generating}
              className="text-xs"
              title="Generate and download as JSON"
            >
              <FileJson className="mr-1.5 h-3.5 w-3.5" />
              JSON
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Generated reports</CardTitle>
          <CardDescription>Newest first.</CardDescription>
        </CardHeader>
        <CardContent>
          {loading && !reports.length ? (
            <SkeletonList rows={3} />
          ) : reports.length ? (
            <DataTable
              columns={["Report", "Period", "Generated", "Actions"]}
              rows={reports.map((report) => [
                <span key="l" className="font-semibold text-slate-900">
                  {report.label}
                </span>,
                `${new Date(report.rangeStart).toLocaleDateString()} – ${new Date(report.rangeEnd).toLocaleDateString()}`,
                new Date(report.generatedAt).toLocaleString(),
                <div key="a" className="flex items-center gap-1">
                  <button
                    onClick={() => view(report.id)}
                    className="rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-indigo-600"
                    title="View"
                  >
                    <Eye className="h-3.5 w-3.5" />
                  </button>
                  <a
                    href={`/api/client/reports/${report.id}/export?format=csv`}
                    className="rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-indigo-600"
                    title="Download CSV"
                  >
                    <Download className="h-3.5 w-3.5" />
                  </a>
                  <button
                    onClick={() => remove(report.id)}
                    className="rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-red-600"
                    title="Delete"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>,
              ])}
            />
          ) : (
            <EmptyState detail="No reports generated yet. Use the panel above to create one." />
          )}
        </CardContent>
      </Card>

      {viewing && (
        <Card>
          <CardHeader className="flex-row items-start justify-between">
            <div>
              <CardTitle className="text-base">{viewing.label}</CardTitle>
              <CardDescription>
                {new Date(viewing.rangeStart).toLocaleDateString()} – {new Date(viewing.rangeEnd).toLocaleDateString()}
                {" · generated "}
                {new Date(viewing.generatedAt).toLocaleString()}
              </CardDescription>
            </div>
            <div className="flex shrink-0 gap-1.5">
              <a
                href={`/api/client/reports/${viewing.id}/export?format=csv`}
                className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                CSV
              </a>
              <a
                href={`/api/client/reports/${viewing.id}/export?format=json`}
                className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                JSON
              </a>
              <button
                onClick={() => setViewing(null)}
                className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Close
              </button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {viewing.report?.metrics && (
              <div>
                <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-500">Headline metrics</p>
                <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                  {Object.entries(viewing.report.metrics).map(([key, value]) => (
                    <div key={key} className="rounded-lg border border-slate-200 px-2.5 py-2">
                      <p className="text-[10px] uppercase tracking-wide text-slate-500">
                        {key.replace(/([A-Z])/g, " $1").trim()}
                      </p>
                      <p className="text-sm font-bold text-slate-900">{String(value)}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {viewing.report?.funnel && (
              <div>
                <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-500">Funnel</p>
                <FunnelChart steps={viewing.report.funnel} />
              </div>
            )}

            {viewing.report?.insights?.length > 0 && (
              <InsightList insights={viewing.report.insights} title="Key insights as recorded" />
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
