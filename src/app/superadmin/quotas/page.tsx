"use client";

import React from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/Card";
import { Sliders, CheckCircle2, ShieldAlert } from "lucide-react";

export default function SuperAdminQuotasPage() {
  const planTiers = [
    {
      tier: "Starter Tier",
      price: "₹0 / Free Initial",
      messages: "5,000 / mo",
      flows: "5 Flows",
      links: "50 Links",
      storage: "100 MB",
      ai: "Local Ollama / Rule-based",
      support: "Community / Self-hosted",
    },
    {
      tier: "Pro Tier",
      price: "$29 / mo",
      messages: "25,000 / mo",
      flows: "15 Flows",
      links: "200 Links",
      storage: "500 MB",
      ai: "Ollama + External API Keys",
      support: "Live Handover + Priority",
    },
    {
      tier: "Enterprise Tier",
      price: "$99 / mo",
      messages: "Unlimited / Custom",
      flows: "Unlimited",
      links: "Unlimited",
      storage: "5,000 MB",
      ai: "Dedicated LLM + Custom RAG",
      support: "24/7 Dedicated SLA",
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-slate-900 tracking-tight">Resource Quotas & Plan Tiers</h1>
        <p className="text-sm text-slate-500">
          Global resource quotas per plan tier. These limits can be overridden per company in the Companies tab.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {planTiers.map((p, idx) => (
          <Card key={idx} className="relative overflow-hidden border-2 hover:border-indigo-500 transition-colors">
            <div className="h-2 bg-indigo-600 w-full" />
            <CardHeader>
              <CardTitle className="text-xl font-bold">{p.tier}</CardTitle>
              <div className="text-2xl font-black text-indigo-600 mt-1">{p.price}</div>
              <CardDescription>Default resource allocations</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-xs">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <span className="text-slate-500">Monthly Messages</span>
                <span className="font-bold text-slate-900">{p.messages}</span>
              </div>
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <span className="text-slate-500">Max Bot Flows</span>
                <span className="font-bold text-slate-900">{p.flows}</span>
              </div>
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <span className="text-slate-500">Campaign Links</span>
                <span className="font-bold text-slate-900">{p.links}</span>
              </div>
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <span className="text-slate-500">Storage Limit</span>
                <span className="font-bold text-slate-900">{p.storage}</span>
              </div>
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <span className="text-slate-500">AI Integration</span>
                <span className="font-bold text-slate-900">{p.ai}</span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
