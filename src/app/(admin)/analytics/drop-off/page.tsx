"use client";

import React, { useState } from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/Card";
import { SkeletonTable } from "@/components/ui/Loading";
import { useAnalytics } from "@/components/analytics/useAnalytics";
import {
  DateRangePicker,
  DataTable,
  EmptyState,
  defaultRange,
  type RangeState,
} from "@/components/analytics/shared";
import { TrendingDown } from "lucide-react";

/**
 * Where the flow loses people, worst first.
 *
 * Steps with almost no traffic are shown but visually de-emphasised: a 100%
 * drop-off across three visitors is three people, not a problem, and sorting
 * it to the top would send clients rewriting a flow that works.
 */
export default function DropOffPage() {
  const [range, setRange] = useState<RangeState>(defaultRange());
  const { data, loading, error } = useAnalytics("/api/client/analytics/flow", range);
  const { data: formData } = useAnalytics("/api/client/analytics/forms", range);

  const nodes = [...(data?.nodes || [])].sort((a: any, b: any) => b.dropOffRate - a.dropOffRate);
  const THIN = 25;

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-slate-900">
            <TrendingDown className="h-5 w-5 text-indigo-600" />
            Drop-off Analysis
          </h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Every step, ordered by the share of people who reach it and do not finish it.
          </p>
        </div>
        <DateRangePicker value={range} onChange={setRange} showCompare={false} />
      </header>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs font-medium text-red-800">
          {error}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Flow steps</CardTitle>
          <CardDescription>
            Dropped means entered but never completed — usually someone closing the tab, which is the signal.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading && !nodes.length ? (
            <SkeletonTable rows={6} columns={6} />
          ) : (
            <DataTable
              columns={["Step", "Entered", "Completed", "Dropped", "Drop-off", "Leads after"]}
              empty="No flow activity recorded in this period."
              rows={nodes.map((node: any) => {
                const thin = node.entered < THIN;
                return [
                  <span key="l" className={thin ? "text-slate-400" : "font-semibold text-slate-900"}>
                    {node.label}
                    {thin && <span className="ml-1.5 text-[10px] font-normal">(too few to judge)</span>}
                  </span>,
                  node.entered.toLocaleString(),
                  node.completed.toLocaleString(),
                  node.dropped.toLocaleString(),
                  <span
                    key="d"
                    className={
                      thin
                        ? "text-slate-400"
                        : node.dropOffRate >= 40
                          ? "font-bold text-red-600"
                          : node.dropOffRate >= 20
                            ? "font-bold text-amber-600"
                            : "text-slate-600"
                    }
                  >
                    {node.dropOffRate}%
                  </span>,
                  node.leadsAfter.toLocaleString(),
                ];
              })}
            />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Form fields</CardTitle>
          <CardDescription>
            Which question people abandon. Ordered by completion rate, weakest first.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {formData?.fields?.length ? (
            <DataTable
              columns={["Field", "Reached", "Completed", "Abandoned", "Completion"]}
              rows={formData.fields.map((field: any) => [
                <span key="l" className="font-semibold text-slate-900">
                  {field.label}
                </span>,
                field.reached.toLocaleString(),
                field.completed.toLocaleString(),
                field.abandoned.toLocaleString(),
                <span
                  key="c"
                  className={field.completionRate < 60 ? "font-bold text-red-600" : "text-slate-600"}
                >
                  {field.completionRate}%
                </span>,
              ])}
            />
          ) : (
            <EmptyState detail="No form fields have been reached in this period." />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
