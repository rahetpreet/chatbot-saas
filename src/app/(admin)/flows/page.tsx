"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Input, Textarea } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import {
  GitBranch,
  Plus,
  Play,
  Copy,
  Trash2,
  CheckCircle2,
  RefreshCw,
  ExternalLink,
  Sparkles,
  MessageSquare,
  Code
} from "lucide-react";
import { formatDate } from "@/lib/utils";
import { Skeleton, SkeletonText } from "@/components/ui/Loading";

export default function FlowsListingPage() {
  const [flows, setFlows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newFlowName, setNewFlowName] = useState("");
  const [newFlowDesc, setNewFlowDesc] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [tenantSlug, setTenantSlug] = useState("");
  
  const [isAiModalOpen, setIsAiModalOpen] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [generating, setGenerating] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const [embedModalFlow, setEmbedModalFlow] = useState<any | null>(null);
  const [copiedState, setCopiedState] = useState<string | null>(null);

  const fetchFlows = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/client/chatbots");
      const data = await res.json();
      setFlows(data.flows || []);
    } catch {
      setFlows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFlows();
    const fetchAuth = async () => {
      try {
        const res = await fetch("/api/auth/me");
        const data = await res.json();
        const user = data.user || data.data?.user;
        if (user?.tenant?.slug) {
          setTenantSlug(user.tenant.slug);
        }
      } catch {}
    };
    fetchAuth();
  }, []);

  const handleCreateFlow = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setCreating(true);

    try {
      const res = await fetch("/api/client/chatbots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newFlowName, description: newFlowDesc }),
      });

      const data = await res.json();
      if (!res.ok || data.error) {
        setError(data.error || "Failed to create flow");
        setCreating(false);
        return;
      }

      setIsCreateModalOpen(false);
      setNewFlowName("");
      setNewFlowDesc("");
      window.location.href = `/flows/${data.flow.id}/builder`;
    } catch {
      setError("Network error");
    } finally {
      setCreating(false);
    }
  };

  const handleSetDefault = async (flowId: string) => {
    try {
      await fetch(`/api/client/chatbots/${flowId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isDefault: true }),
      });
      fetchFlows();
    } catch {
      alert("Failed to set default flow");
    }
  };

  const handleDeleteFlow = async (flowId: string) => {
    if (!confirm("Are you sure you want to delete this flow?")) return;
    try {
      await fetch(`/api/client/chatbots/${flowId}`, { method: "DELETE" });
      fetchFlows();
    } catch {
      alert("Failed to delete flow");
    }
  };

  const handleGenerateAiFlow = async (e: React.FormEvent) => {
    e.preventDefault();
    setAiError(null);
    setGenerating(true);

    try {
      const res = await fetch("/api/client/chatbots/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: aiPrompt }),
      });

      const data = await res.json();
      if (!res.ok || data.error) {
        setAiError(
          typeof data.error === "string" ? data.error : data.error?.message || "Failed to generate AI flow",
        );
        setGenerating(false);
        return;
      }

      // The API always returns a flow: if the model was unreachable it falls
      // back to a keyword-based template. Saying so matters, because that
      // fallback produces confident but generic copy, and users reasonably
      // assumed the AI had written it and judged the AI on it.
      if (data.generatedBy !== "ai") {
        setAiError(
          `The AI service did not respond${data.aiError ? ` (${data.aiError})` : ""}, so a basic starter flow was created instead. ` +
            `Your Gemini free tier is often busy at peak times — deleting this flow and generating again usually works.`,
        );
        setGenerating(false);
        // The flow still exists, so let them read the notice before leaving.
        setTimeout(() => {
          window.location.href = `/flows/${data.flow.id}/builder`;
        }, 6000);
        return;
      }

      setIsAiModalOpen(false);
      setAiPrompt("");
      window.location.href = `/flows/${data.flow.id}/builder`;
    } catch {
      setAiError("Network error");
    } finally {
      setGenerating(false);
    }
  };

  const copyToClipboard = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedState(id);
      setTimeout(() => setCopiedState(null), 2000);
    } catch (err) {
      console.error("Failed to copy", err);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">Conversational Bot Flows</h1>
          <p className="text-sm text-slate-500">
            Build and publish visual node-based decision trees, lead forms, and AI fallback branches.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button onClick={() => setIsAiModalOpen(true)} variant="outline" className="gap-1.5 text-xs font-bold shadow-sm border-indigo-200 text-indigo-700 hover:bg-indigo-50 hover:text-indigo-800">
            <Sparkles className="w-4 h-4" />
            <span>Generate with AI</span>
            <span className="ml-0.5 px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider bg-indigo-600 text-white">
              Beta
            </span>
          </Button>
          <Button onClick={() => setIsCreateModalOpen(true)} className="gap-1.5 text-xs font-bold shadow-sm">
            <Plus className="w-4 h-4" />
            <span>Create New Flow</span>
          </Button>
        </div>
      </div>

      {/* Flows Grid */}
      {loading && flows.length === 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[0, 1, 2].map((index) => (
            <div key={index} className="rounded-2xl border-2 border-slate-200/80 bg-white p-5 space-y-3">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-5 w-3/4" />
              <SkeletonText lines={2} />
              <Skeleton className="h-8 w-full mt-4" />
            </div>
          ))}
        </div>
      ) : (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {flows.map((flow) => (
          <Card key={flow.id} className="hover:shadow-lg transition-all flex flex-col justify-between border-2 border-slate-200/80">
            <div>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <Badge variant={flow.status === "PUBLISHED" ? "success" : "default"}>
                    {flow.status} (v{flow.version})
                  </Badge>
                  {flow.isDefault ? (
                    <span className="text-[10px] bg-indigo-50 text-indigo-700 font-bold px-2 py-0.5 rounded-full border border-indigo-200 flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" />
                      <span>Default Live Bot</span>
                    </span>
                  ) : (
                    <button
                      onClick={() => handleSetDefault(flow.id)}
                      className="text-[10px] text-slate-400 hover:text-indigo-600 font-semibold underline"
                    >
                      Set as Default
                    </button>
                  )}
                </div>
                <CardTitle className="text-base font-bold text-slate-900">{flow.name}</CardTitle>
                <CardDescription className="text-xs text-slate-500 line-clamp-2">
                  {flow.description || "Interactive conversation flow with branching decisions."}
                </CardDescription>
              </CardHeader>

              <CardContent className="text-xs text-slate-500 space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-[11px] pt-2 border-t border-slate-100">
                    <span>Last Modified:</span>
                    <span className="font-semibold text-slate-700">{formatDate(flow.updatedAt)}</span>
                  </div>
                  <div className="flex items-center justify-between text-[11px]">
                    <span>Total Sessions:</span>
                    <span className="font-semibold text-slate-700">{flow._count?.conversations || 0}</span>
                  </div>
                </div>

                <div className="bg-slate-50 rounded-md p-2.5 border border-slate-100 space-y-2">
                  <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Direct Bot Link</div>
                  <div className="flex items-center gap-2">
                    <Input 
                      readOnly 
                      value={typeof window !== 'undefined' ? `${window.location.origin}/c/${tenantSlug}?flowId=${flow.id}` : ''} 
                      className="h-7 text-[11px] bg-white" 
                    />
                    <Button 
                      size="sm" 
                      variant="outline" 
                      className="h-7 w-7 p-0 shrink-0" 
                      onClick={() => {
                        const link = typeof window !== 'undefined' ? `${window.location.origin}/c/${tenantSlug}?flowId=${flow.id}` : '';
                        copyToClipboard(link, `link-${flow.id}`);
                      }}
                      title="Copy Link"
                    >
                      {copiedState === `link-${flow.id}` ? <CheckCircle2 className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5 text-slate-500" />}
                    </Button>
                    <a 
                      href={typeof window !== 'undefined' ? `${window.location.origin}/c/${tenantSlug}?flowId=${flow.id}` : '#'} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      title="Open Chat"
                    >
                      <Button size="sm" variant="outline" className="h-7 w-7 p-0 shrink-0">
                        <ExternalLink className="w-3.5 h-3.5 text-slate-500" />
                      </Button>
                    </a>
                  </div>
                  <Button 
                    size="sm" 
                    variant="outline" 
                    className="w-full h-7 text-[11px] gap-1.5"
                    onClick={() => setEmbedModalFlow(flow)}
                  >
                    <Code className="w-3.5 h-3.5" />
                    <span>Embed Bot</span>
                  </Button>
                </div>
              </CardContent>
            </div>

            <CardFooter className="p-4 pt-0 flex items-center justify-between gap-2 border-t border-slate-100 mt-2">
              <button
                onClick={() => handleDeleteFlow(flow.id)}
                className="p-2 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-slate-100 transition-colors"
                title="Delete flow"
              >
                <Trash2 className="w-4 h-4" />
              </button>

              <Link href={`/flows/${flow.id}/builder`} className="flex-1">
                <Button className="w-full text-xs font-bold gap-1.5 shadow-sm">
                  <GitBranch className="w-3.5 h-3.5" />
                  <span>Open Flow Builder</span>
                </Button>
              </Link>
            </CardFooter>
          </Card>
        ))}
      </div>
      )}

      {/* Create Flow Modal */}
      <Modal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        title="Create New Flow"
        description="Design a new visual conversation flow from scratch."
      >
        <form onSubmit={handleCreateFlow} className="space-y-4 text-xs">
          {error && (
            <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium">
              {error}
            </div>
          )}

          <Input
            label="Flow Name"
            required
            value={newFlowName}
            onChange={(e) => setNewFlowName(e.target.value)}
            placeholder="e.g. Sales Qualification & Demo Booking"
          />

          <Textarea
            label="Description (Optional)"
            value={newFlowDesc}
            onChange={(e) => setNewFlowDesc(e.target.value)}
            placeholder="Brief description of the goal of this chatbot flow..."
            rows={3}
          />

          <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-100">
            <Button type="button" variant="outline" onClick={() => setIsCreateModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={creating} className="font-bold">
              Create & Launch Builder
            </Button>
          </div>
        </form>
      </Modal>

      {/* AI Generate Modal */}
      <Modal
        isOpen={isAiModalOpen}
        onClose={() => setIsAiModalOpen(false)}
        title="Generate Flow with AI  ·  BETA"
        description="Describe what kind of bot you want, and AI will build the entire flow for you."
      >
        <form onSubmit={handleGenerateAiFlow} className="space-y-4 text-xs">
          {aiError && (
            <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium">
              {aiError}
            </div>
          )}

          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-700">Quick Presets</label>
            <div className="flex flex-wrap gap-2">
              {[
                { label: "🚀 Digital Agency & Marketing", text: "Create a digital marketing agency chatbot for Adinmark with services menu (SEO, Google & Meta Ads, Web Development, UI/UX), client name and work email capture, monthly budget selection, and custom proposal confirmation." },
                { label: "💼 B2B Lead Qualification", text: "Create a B2B SaaS lead qualification bot with product demo booking, pricing inquiry, company size, name, and email collection." },
                { label: "🛍️ E-Commerce & Order Tracker", text: "Create an online store chatbot with order status tracking, VIP 15% discount coupon claim, and customer support." },
                { label: "🏡 Real Estate Property Finder", text: "Create a real estate property finder bot with buying/selling options, target city/location, budget range, and phone number collection." },
                { label: "🩺 Clinic & Appointment Booking", text: "Create a medical clinic appointment booking bot with doctor consultation selection, patient name, phone, and preferred date time." },
                { label: "🛠️ 24/7 Customer Support", text: "Create a 24/7 customer support bot with ticket categories (Billing, Tech, Account), screenshot upload, and live agent handover." },
              ].map(preset => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => setAiPrompt(preset.text)}
                  className="px-2.5 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-slate-700 hover:bg-indigo-50 hover:border-indigo-300 hover:text-indigo-700 font-medium transition-colors text-left"
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          <Textarea
            label="Describe what bot you want to create"
            required
            value={aiPrompt}
            onChange={(e) => setAiPrompt(e.target.value)}
            placeholder="e.g. Create a website chatbot for Adinmark offering digital marketing, web dev, and SEO services. Collect visitor name, work email, and project requirements..."
            rows={4}
          />

          <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-100">
            <Button type="button" variant="outline" onClick={() => setIsAiModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={generating} className="font-bold bg-indigo-600 hover:bg-indigo-700 text-white">
              <Sparkles className="w-3.5 h-3.5 mr-1.5" />
              Generate Flow
            </Button>
          </div>
        </form>
      </Modal>

      {/* Embed Modal */}
      <Modal
        isOpen={!!embedModalFlow}
        onClose={() => setEmbedModalFlow(null)}
        title="Embed Chatbot"
        description={`Add "${embedModalFlow?.name}" to your website or app.`}
      >
        {embedModalFlow && (
          <div className="space-y-6 text-xs">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="font-bold text-slate-700">Widget Script</label>
                <Button 
                  type="button"
                  size="sm" 
                  variant="ghost" 
                  className="h-6 text-[10px] px-2 text-indigo-600 hover:bg-indigo-50"
                  onClick={() => {
                    const script = `<script src="${typeof window !== 'undefined' ? window.location.origin : ''}/widget.js" data-tenant-slug="${tenantSlug}" data-flow-id="${embedModalFlow.id}"></script>`;
                    copyToClipboard(script, 'embed-script');
                  }}
                >
                  {copiedState === 'embed-script' ? <CheckCircle2 className="w-3 h-3 mr-1" /> : <Copy className="w-3 h-3 mr-1" />}
                  Copy Code
                </Button>
              </div>
              <p className="text-slate-500 text-[11px]">Paste this snippet right before the closing <code>&lt;/body&gt;</code> tag on your website to show the floating chat widget.</p>
              <pre className="p-3 rounded-lg bg-slate-900 text-slate-50 overflow-x-auto text-[11px] font-mono leading-relaxed">
{`<script src="${typeof window !== 'undefined' ? window.location.origin : ''}/widget.js" data-tenant-slug="${tenantSlug}" data-flow-id="${embedModalFlow.id}"></script>`}
              </pre>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="font-bold text-slate-700">Iframe Embed</label>
                <Button 
                  type="button"
                  size="sm" 
                  variant="ghost" 
                  className="h-6 text-[10px] px-2 text-indigo-600 hover:bg-indigo-50"
                  onClick={() => {
                    const iframe = `<iframe src="${typeof window !== 'undefined' ? window.location.origin : ''}/embed/${tenantSlug}/${embedModalFlow.id}" width="100%" height="650"></iframe>`;
                    copyToClipboard(iframe, 'embed-iframe');
                  }}
                >
                  {copiedState === 'embed-iframe' ? <CheckCircle2 className="w-3 h-3 mr-1" /> : <Copy className="w-3 h-3 mr-1" />}
                  Copy Code
                </Button>
              </div>
              <p className="text-slate-500 text-[11px]">Use this to embed the chatbot directly into a page layout (e.g. contact page or help center).</p>
              <pre className="p-3 rounded-lg bg-slate-900 text-slate-50 overflow-x-auto text-[11px] font-mono leading-relaxed">
{`<iframe src="${typeof window !== 'undefined' ? window.location.origin : ''}/embed/${tenantSlug}/${embedModalFlow.id}" width="100%" height="650"></iframe>`}
              </pre>
            </div>

            <div className="pt-4 border-t border-slate-100 flex justify-end">
              <Button type="button" onClick={() => setEmbedModalFlow(null)} variant="outline">Done</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
