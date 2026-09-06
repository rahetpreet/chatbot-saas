"use client";

import React, { useState } from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/Card";
import { SkeletonTable } from "@/components/ui/Loading";
import { useAnalytics } from "@/components/analytics/useAnalytics";
import {
  DateRangePicker,
  DataTable,
  BarList,
  defaultRange,
  type RangeState,
} from "@/components/analytics/shared";
import { GitBranch } from "lucide-react";

/**
 * Per-step flow performance and the option distribution behind each choice.
 *
 * Options are grouped by the question that asked them, because "Pricing"
 * appearing under two different questions is two different facts.
 */
export default function FlowAnalysisPage() {
  const [range, setRange] = useState<RangeState>(defaultRange());
  const { data, loading, error } = useAnalytics("/api/client/analytics/flow", range);

  const nodes = data?.nodes || [];
  const options = data?.options || [];

  // Group options under their node so each block reads as one question.
  const byNode = new Map<string, any[]>();
  for (const option of options) {
    if (!byNode.has(option.nodeId)) byNode.set(option.nodeId, []);
    byNode.get(option.nodeId)!.push(option);
  }
  const labelFor = (nodeId: string) =>
    nodes.find((n: any) => n.nodeId === nodeId)?.label || "Question";

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-slate-900">
            <GitBranch className="h-5 w-5 text-indigo-600" />
            Flow Analysis
          </h1>
          <p className="mt-0.5 text-sm text-slate-500">How each step of your chatbot performs.</p>
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
          <CardTitle className="text-base">Every step</CardTitle>
          <CardDescription>Ordered by traffic, so the steps most people see come first.</CardDescription>
        </CardHeader>
        <CardContent>
          {loading && !nodes.length ? (
            <SkeletonTable rows={6} columns={7} />
          ) : (
            <DataTable
              columns={["Step", "Entered", "Unique", "Completed", "Completion", "Drop-off", "Leads after"]}
              empty="No flow activity recorded in this period."
              rows={nodes.map((node: any) => [
                <span key="l" className="font-semibold text-slate-900">
                  {node.label}
                </span>,
                node.entered.toLocaleString(),
                node.uniqueUsers.toLocaleString(),
                node.completed.toLocaleString(),
                `${node.completionRate}%`,
                <span key="d" className={node.dropOffRate >= 40 ? "font-bold text-red-600" : "text-slate-600"}>
                  {node.dropOffRate}%
                </span>,
                node.leadsAfter.toLocaleString(),
              ])}
            />
          )}
        </CardContent>
      </Card>

      {[...byNode.entries()].map(([nodeId, nodeOptions]) => {
        const total = nodeOptions.reduce((sum, o) => sum + o.clicks, 0);
        return (
          <Card key={nodeId}>
            <CardHeader>
              <CardTitle className="text-base">{labelFor(nodeId)}</CardTitle>
              <CardDescription>
                {total.toLocaleString()} choices recorded. Percentages are of this question, not of all clicks.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <BarList
                items={nodeOptions.map((option: any) => ({
                  label: option.label,
                  value: option.clicks,
                  secondary: `${total ? ((option.clicks / total) * 100).toFixed(1) : 0}%${
                    option.leadsAfter ? ` · ${option.leadsAfter} leads` : ""
                  }`,
                }))}
              />
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
