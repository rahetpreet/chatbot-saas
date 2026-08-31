"use client";

import React, { useState, useEffect } from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Textarea } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import {
  Mail,
  Sparkles,
  BookOpen,
  Plus,
  Trash2,
  Send,
  Save,
  CheckCircle2,
  Cpu,
  ShieldCheck,
} from "lucide-react";

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<"smtp" | "ai" | "knowledge">("smtp");

  // SMTP state
  const [smtpConfig, setSmtpConfig] = useState({
    host: "",
    port: 587,
    user: "",
    pass: "",
    secure: false,
    from: "",
  });
  const [testEmail, setTestEmail] = useState("");
  const [testingSmtp, setTestingSmtp] = useState(false);
  const [savingSmtp, setSavingSmtp] = useState(false);
  const [smtpFeedback, setSmtpFeedback] = useState<{ type: "success" | "error"; msg: string } | null>(null);

  // AI state
  const [aiConfig, setAiConfig] = useState({
    enabled: false,
    provider: "disabled", // disabled, ollama, groq, openrouter, gemini
    model: "llama3.2",
    baseUrl: "http://localhost:11434",
    apiKey: "",
    systemPrompt: "You are the helpful virtual assistant for our company.",
    temperature: 0.7,
    confidenceThreshold: 0.6,
  });
  const [savingAi, setSavingAi] = useState(false);
  const [aiFeedback, setAiFeedback] = useState<{ type: "success" | "error"; msg: string } | null>(null);

  // Knowledge docs state
  const [knowledgeDocs, setKnowledgeDocs] = useState<any[]>([]);
  const [isAddDocModalOpen, setIsAddDocModalOpen] = useState(false);
  const [docTitle, setDocTitle] = useState("");
  const [docCategory, setDocCategory] = useState("General");
  const [docContent, setDocContent] = useState("");
  const [addingDoc, setAddingDoc] = useState(false);

  useEffect(() => {
    // Load SMTP
    fetch("/api/settings/smtp")
      .then((r) => r.json())
      .then((d) => {
        if (d.config) setSmtpConfig(d.config);
      });

    // Load AI
    fetch("/api/settings/ai")
      .then((r) => r.json())
      .then((d) => {
        if (d.config) setAiConfig(d.config);
      });

    // Load Knowledge Docs
    fetchKnowledgeDocs();
  }, []);

  const fetchKnowledgeDocs = async () => {
    try {
      const res = await fetch("/api/settings/knowledge");
      const data = await res.json();
      setKnowledgeDocs(data.docs || []);
    } catch {
      setKnowledgeDocs([]);
    }
  };

  // 1. Save SMTP
  const handleSaveSmtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSmtp(true);
    setSmtpFeedback(null);
    try {
      const res = await fetch("/api/settings/smtp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(smtpConfig),
      });
      const data = await res.json();
      if (res.ok) {
        setSmtpFeedback({ type: "success", msg: "Custom SMTP settings saved successfully!" });
      } else {
        setSmtpFeedback({ type: "error", msg: data.error || "Failed to save SMTP" });
      }
    } catch {
      setSmtpFeedback({ type: "error", msg: "Network error" });
    } finally {
      setSavingSmtp(false);
    }
  };

  // 2. Test SMTP
  const handleTestSmtp = async () => {
    if (!testEmail) {
      alert("Please enter a destination email address to test.");
      return;
    }
    setTestingSmtp(true);
    setSmtpFeedback(null);
    try {
      const res = await fetch("/api/settings/smtp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...smtpConfig, testEmail }),
      });
      const data = await res.json();
      if (data.success) {
        setSmtpFeedback({ type: "success", msg: data.message });
      } else {
        setSmtpFeedback({ type: "error", msg: data.error || "Test email delivery failed" });
      }
    } catch {
      setSmtpFeedback({ type: "error", msg: "SMTP verification failed" });
    } finally {
      setTestingSmtp(false);
    }
  };

  // 3. Save AI Settings
  const handleSaveAi = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingAi(true);
    setAiFeedback(null);
    try {
      const res = await fetch("/api/settings/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(aiConfig),
      });
      const data = await res.json();
      if (res.ok) {
        setAiFeedback({ type: "success", msg: "AI configuration saved successfully!" });
      } else {
        setAiFeedback({ type: "error", msg: data.error || "Failed to save AI config" });
      }
    } catch {
      setAiFeedback({ type: "error", msg: "Network error" });
    } finally {
      setSavingAi(false);
    }
  };

  // 4. Add Knowledge Base Doc
  const handleAddKnowledgeDoc = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddingDoc(true);
    try {
      const res = await fetch("/api/settings/knowledge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: docTitle,
          category: docCategory,
          content: docContent,
        }),
      });
      if (res.ok) {
        setIsAddDocModalOpen(false);
        setDocTitle("");
        setDocContent("");
        fetchKnowledgeDocs();
      }
    } catch {
      alert("Failed to add knowledge doc");
    } finally {
      setAddingDoc(false);
    }
  };

  const handleDeleteKnowledgeDoc = async (id: string) => {
    if (!confirm("Delete this knowledge entry?")) return;
    try {
      await fetch(`/api/settings/knowledge?id=${id}`, { method: "DELETE" });
      fetchKnowledgeDocs();
    } catch {
      alert("Failed to delete doc");
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-black text-slate-900 tracking-tight">Settings & Integrations</h1>
        <p className="text-sm text-slate-500">
          Configure custom SMTP email delivery, modular AI engines (Ollama/Free tier), and FAQ knowledge base.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
        <button
          onClick={() => setActiveTab("smtp")}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-colors ${
            activeTab === "smtp" ? "bg-indigo-600 text-white shadow-xs" : "text-slate-600 hover:bg-slate-100"
          }`}
        >
          <Mail className="w-4 h-4" />
          <span>Custom SMTP Email</span>
        </button>

        <button
          onClick={() => setActiveTab("ai")}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-colors ${
            activeTab === "ai" ? "bg-indigo-600 text-white shadow-xs" : "text-slate-600 hover:bg-slate-100"
          }`}
        >
          <Cpu className="w-4 h-4" />
          <span>AI Fallback Engine</span>
        </button>

        <button
          onClick={() => setActiveTab("knowledge")}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-colors ${
            activeTab === "knowledge" ? "bg-indigo-600 text-white shadow-xs" : "text-slate-600 hover:bg-slate-100"
          }`}
        >
          <BookOpen className="w-4 h-4" />
          <span>FAQ Knowledge Base ({knowledgeDocs.length})</span>
        </button>
      </div>

      {/* TAB 1: Custom SMTP Setup */}
      {activeTab === "smtp" && (
        <div className="space-y-4 animate-fade-in">
          <Card>
            <form onSubmit={handleSaveSmtp}>
              <CardHeader>
                <CardTitle className="text-base">Custom Brand SMTP Server</CardTitle>
                <CardDescription>
                  Configure your own SMTP server to send password reset links and lead notification alerts from your custom domain.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 text-xs">
                {smtpFeedback && (
                  <div
                    className={`p-3 rounded-lg text-xs font-medium border ${
                      smtpFeedback.type === "success"
                        ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                        : "bg-rose-50 text-rose-700 border-rose-200"
                    }`}
                  >
                    {smtpFeedback.msg}
                  </div>
                )}

                <div className="flex flex-wrap gap-2 pb-2 border-b border-slate-100">
                  <span className="w-full text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-0.5">Quick Setup Presets:</span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="text-[11px] h-7 px-2.5"
                    onClick={() => setSmtpConfig({ ...smtpConfig, host: "smtp-relay.brevo.com", port: 587, secure: false, user: "", pass: "" })}
                  >
                    ⚡ Brevo (Sendinblue)
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="text-[11px] h-7 px-2.5"
                    onClick={() => setSmtpConfig({ ...smtpConfig, host: "smtp.gmail.com", port: 587, secure: false })}
                  >
                    ✉️ Gmail / Google Workspace
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="text-[11px] h-7 px-2.5"
                    onClick={() => setSmtpConfig({ ...smtpConfig, host: "email-smtp.us-east-1.amazonaws.com", port: 587, secure: false })}
                  >
                    ☁️ Amazon SES
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="text-[11px] h-7 px-2.5"
                    onClick={() => setSmtpConfig({ ...smtpConfig, host: "", port: 587, secure: false, user: "", pass: "" })}
                  >
                    ⚙️ Custom SMTP
                  </Button>
                </div>
                {smtpConfig.host === "smtp-relay.brevo.com" && (
                  <div className="p-2.5 bg-indigo-50 border border-indigo-200 rounded-lg text-indigo-800 text-[11px]">
                    <strong>Brevo Setup:</strong> Login to Brevo {'>'} Transactional {'>'} SMTP to copy your login and Master API key as password.
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <Input
                    label="SMTP Host"
                    value={smtpConfig.host}
                    onChange={(e) => setSmtpConfig({ ...smtpConfig, host: e.target.value })}
                    placeholder="smtp.gmail.com or mail.yourdomain.com"
                  />
                  <Input
                    label="SMTP Port"
                    type="number"
                    value={smtpConfig.port}
                    onChange={(e) => setSmtpConfig({ ...smtpConfig, port: Number(e.target.value) })}
                    placeholder="587"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <Input
                    label="SMTP Username"
                    value={smtpConfig.user}
                    onChange={(e) => setSmtpConfig({ ...smtpConfig, user: e.target.value })}
                    placeholder="you@yourdomain.com"
                  />
                  <Input
                    label="SMTP Password / App Password"
                    type="password"
                    value={smtpConfig.pass}
                    onChange={(e) => setSmtpConfig({ ...smtpConfig, pass: e.target.value })}
                    placeholder="••••••••"
                  />
                </div>

                <Input
                  label="From Email Address (Sender)"
                  value={smtpConfig.from}
                  onChange={(e) => setSmtpConfig({ ...smtpConfig, from: e.target.value })}
                  placeholder="noreply@yourdomain.com"
                />

                <label className="flex items-center gap-2 cursor-pointer pt-1">
                  <input
                    type="checkbox"
                    checked={smtpConfig.secure}
                    onChange={(e) => setSmtpConfig({ ...smtpConfig, secure: e.target.checked })}
                    className="rounded border-slate-300 text-indigo-600"
                  />
                  <span className="font-semibold text-slate-800">Use SSL/TLS (Port 465)</span>
                </label>

                {/* Dev Mode Notification */}
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-[11px] text-slate-600 space-y-1">
                  <p className="font-bold text-slate-800 flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Zero-Cost / Free-First Default Mode</span>
                  </p>
                  <p>
                    If no custom SMTP is provided, the platform automatically routes all emails to the ₹0 Development Mailbox.
                  </p>
                </div>
              </CardContent>

              <CardFooter className="flex items-center justify-between">
                {/* Test Email Form */}
                <div className="flex items-center gap-2">
                  <input
                    type="email"
                    placeholder="test@example.com"
                    value={testEmail}
                    onChange={(e) => setTestEmail(e.target.value)}
                    className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs w-48"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    loading={testingSmtp}
                    onClick={handleTestSmtp}
                    className="text-xs"
                  >
                    <Send className="w-3 h-3 mr-1" /> Test Email
                  </Button>
                </div>

                <Button type="submit" loading={savingSmtp} className="font-bold text-xs">
                  Save SMTP Settings
                </Button>
              </CardFooter>
            </form>
          </Card>
        </div>
      )}

      {/* TAB 2: AI Fallback Settings */}
      {activeTab === "ai" && (
        <div className="space-y-4 animate-fade-in">
          <Card>
            <form onSubmit={handleSaveAi}>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-indigo-600" />
                  <span>Modular AI Layer & LLM Fallback</span>
                </CardTitle>
                <CardDescription>
                  Enable optional AI inference for queries outside standard button branches. The platform works 100% with rule-based flows even if AI is disabled.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 text-xs">
                {aiFeedback && (
                  <div
                    className={`p-3 rounded-lg text-xs font-medium border ${
                      aiFeedback.type === "success"
                        ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                        : "bg-rose-50 text-rose-700 border-rose-200"
                    }`}
                  >
                    {aiFeedback.msg}
                  </div>
                )}

                <div className="flex items-center justify-between p-3.5 bg-slate-50 border border-slate-200 rounded-xl">
                  <div>
                    <span className="font-bold text-slate-900 block">Enable AI Layer</span>
                    <span className="text-slate-500 text-[11px]">
                      When enabled, queries without explicit button matches are evaluated by your chosen AI model.
                    </span>
                  </div>
                  <input
                    type="checkbox"
                    checked={aiConfig.enabled}
                    onChange={(e) => setAiConfig({ ...aiConfig, enabled: e.target.checked })}
                    className="w-5 h-5 rounded text-indigo-600"
                  />
                </div>

                {aiConfig.enabled && (
                  <>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">AI Provider</label>
                        <select
                          value={aiConfig.provider}
                          onChange={(e) => setAiConfig({ ...aiConfig, provider: e.target.value as any })}
                          className="w-full rounded-lg border border-slate-300 bg-white p-2 text-xs font-medium"
                        >
                          <option value="ollama">Ollama (100% Free Local AI)</option>
                          <option value="groq">Groq (Free Tier API)</option>
                          <option value="openrouter">OpenRouter (Free Open-Source Models)</option>
                          <option value="disabled">Disabled / Pure Rule-Based Only</option>
                        </select>
                      </div>

                      <Input
                        label="Model Name"
                        value={aiConfig.model}
                        onChange={(e) => setAiConfig({ ...aiConfig, model: e.target.value })}
                        placeholder="e.g. llama3.2, mistral, qwen"
                      />
                    </div>

                    {aiConfig.provider === "ollama" ? (
                      <Input
                        label="Local Ollama Server URL"
                        value={aiConfig.baseUrl}
                        onChange={(e) => setAiConfig({ ...aiConfig, baseUrl: e.target.value })}
                        placeholder="http://localhost:11434"
                        helperText="Runs locally without any API key or subscription."
                      />
                    ) : aiConfig.provider !== "disabled" ? (
                      <Input
                        label="Provider API Key"
                        type="password"
                        value={aiConfig.apiKey}
                        onChange={(e) => setAiConfig({ ...aiConfig, apiKey: e.target.value })}
                        placeholder="gsk_... or sk-or-..."
                      />
                    ) : null}

                    <Textarea
                      label="Company AI System Prompt / Persona"
                      value={aiConfig.systemPrompt}
                      onChange={(e) => setAiConfig({ ...aiConfig, systemPrompt: e.target.value })}
                      placeholder="You are the friendly customer support assistant for Acme Corp."
                      rows={3}
                    />

                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-xs font-semibold text-slate-700">
                          Confidence Fallback Threshold: {Math.round(aiConfig.confidenceThreshold * 100)}%
                        </label>
                      </div>
                      <input
                        type="range"
                        min="0.3"
                        max="0.9"
                        step="0.05"
                        value={aiConfig.confidenceThreshold}
                        onChange={(e) => setAiConfig({ ...aiConfig, confidenceThreshold: parseFloat(e.target.value) })}
                        className="w-full accent-indigo-600"
                      />
                      <span className="text-[10px] text-slate-400">
                        If confidence drops below this score, bot automatically triggers human handover or fallback message.
                      </span>
                    </div>
                  </>
                )}
              </CardContent>
              <CardFooter className="justify-end">
                <Button type="submit" loading={savingAi} className="font-bold text-xs">
                  Save AI Settings
                </Button>
              </CardFooter>
            </form>
          </Card>
        </div>
      )}

      {/* TAB 3: FAQ & Knowledge Base */}
      {activeTab === "knowledge" && (
        <div className="space-y-4 animate-fade-in">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-slate-900">Company FAQs & Knowledge Documents</h3>
              <p className="text-xs text-slate-500">
                Documents are indexed for zero-cost lexical matching and AI context augmentation.
              </p>
            </div>
            <Button size="sm" onClick={() => setIsAddDocModalOpen(true)} className="gap-1.5 text-xs font-bold">
              <Plus className="w-3.5 h-3.5" />
              <span>Add FAQ Document</span>
            </Button>
          </div>

          <div className="space-y-3">
            {knowledgeDocs.length === 0 ? (
              <Card className="p-8 text-center text-slate-400 text-xs">
                No knowledge base documents added yet. Add FAQs so your bot can answer common user questions automatically!
              </Card>
            ) : (
              knowledgeDocs.map((doc) => (
                <Card key={doc.id} className="hover:shadow-sm transition-shadow">
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <div>
                      <span className="text-[10px] font-bold text-indigo-600 uppercase tracking-wider bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100">
                        {doc.category || "General"}
                      </span>
                      <h4 className="text-sm font-bold text-slate-900 mt-1">{doc.title}</h4>
                    </div>
                    <button
                      onClick={() => handleDeleteKnowledgeDoc(doc.id)}
                      className="p-1.5 text-slate-400 hover:text-rose-600 rounded"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </CardHeader>
                  <CardContent className="text-xs text-slate-600 whitespace-pre-wrap">
                    {doc.content}
                  </CardContent>
                </Card>
              ))
            )}
          </div>

          {/* Add Doc Modal */}
          <Modal
            isOpen={isAddDocModalOpen}
            onClose={() => setIsAddDocModalOpen(false)}
            title="Add FAQ Knowledge Entry"
            description="Provide questions and answers for automated answering."
          >
            <form onSubmit={handleAddKnowledgeDoc} className="space-y-3 text-xs">
              <Input
                label="Question / Title"
                required
                value={docTitle}
                onChange={(e) => setDocTitle(e.target.value)}
                placeholder="e.g. What are your operating hours?"
              />

              <Input
                label="Category Tag"
                value={docCategory}
                onChange={(e) => setDocCategory(e.target.value)}
                placeholder="e.g. Support, Billing, Products"
              />

              <Textarea
                label="Detailed Answer / Information"
                required
                value={docContent}
                onChange={(e) => setDocContent(e.target.value)}
                placeholder="Our customer success team operates Monday through Friday 9am to 6pm..."
                rows={4}
              />

              <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-100">
                <Button type="button" variant="outline" onClick={() => setIsAddDocModalOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" loading={addingDoc} className="font-bold">
                  Save Document
                </Button>
              </div>
            </form>
          </Modal>
        </div>
      )}
    </div>
  );
}
