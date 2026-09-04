"use client";

import React, { useState, useEffect } from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Textarea } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { CustomDomainPanel } from "@/components/settings/CustomDomainPanel";
import { KnowledgeImport } from "@/components/settings/KnowledgeImport";
import { TeamPanel } from "@/components/settings/TeamPanel";
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
  Globe,
  Headset,
  ShieldCheck,
  KeyRound,
  Lock,
} from "lucide-react";

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<"ai" | "knowledge" | "team" | "domain" | "security">("ai");
  const [aiPlatform, setAiPlatform] = useState<{ available: boolean; provider: string | null; model: string | null } | null>(null);

  // Security & Password state
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);
  const [passwordFeedback, setPasswordFeedback] = useState<{ type: "success" | "error"; msg: string } | null>(null);

  // AI state
  const [aiConfig, setAiConfig] = useState({
    enabled: false,
    // Kept so existing saved configurations round-trip unchanged; the client
    // never sees or sets these.
    provider: "gemini",
    model: "",
    baseUrl: "",
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
    // Load AI
    fetch("/api/client/settings/ai")
      .then((r) => r.json())
      .then((d) => {
        if (d.config) setAiConfig(d.config);
        if (d.platform) setAiPlatform(d.platform);
      });

    // Load Knowledge Docs
    fetchKnowledgeDocs();
  }, []);

  const fetchKnowledgeDocs = async () => {
    try {
      const res = await fetch("/api/client/settings/knowledge");
      const data = await res.json();
      setKnowledgeDocs(data.docs || []);
    } catch {
      setKnowledgeDocs([]);
    }
  };

  // 3. Save AI Settings
  /**
   * AI is a single on/off choice for the client.
   *
   * Provider, model, temperature and API key are platform concerns, not
   * something a business owner should have to reason about — and asking them
   * to made a working setup look broken. Saving immediately on toggle removes
   * the "did that save?" doubt a separate Save button creates.
   */
  const handleToggleAi = async (enabled: boolean) => {
    const previous = aiConfig;
    const next = { ...aiConfig, enabled };
    setAiConfig(next);
    setSavingAi(true);
    setAiFeedback(null);

    try {
      const res = await fetch("/api/client/settings/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // The platform supplies provider and credentials; only the switch and
        // the workspace's own prompt travel from here.
        body: JSON.stringify({ ...next, apiKey: next.apiKey || "" }),
      });
      const data = await res.json();

      if (res.ok && data.success !== false) {
        setAiFeedback({
          type: "success",
          msg: enabled ? "AI answering is now on." : "AI answering is now off.",
        });
      } else {
        // Put the switch back rather than leaving it showing a state that was
        // never stored.
        setAiConfig(previous);
        setAiFeedback({
          type: "error",
          msg: data.error?.message || data.error || "Could not save that change.",
        });
      }
    } catch {
      setAiConfig(previous);
      setAiFeedback({ type: "error", msg: "Could not reach the server." });
    } finally {
      setSavingAi(false);
    }
  };

  // 4. Add Knowledge Base Doc
  const handleAddKnowledgeDoc = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddingDoc(true);
    try {
      const res = await fetch("/api/client/settings/knowledge", {
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
      await fetch(`/api/client/settings/knowledge?id=${id}`, { method: "DELETE" });
      fetchKnowledgeDocs();
    } catch {
      alert("Failed to delete doc");
    }
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordFeedback(null);
    setChangingPassword(true);

    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword,
          newPassword,
          confirmPassword,
        }),
      });

      const data = await res.json();
      if (!res.ok || data.error) {
        setPasswordFeedback({ type: "error", msg: data.error || "Failed to update password." });
      } else {
        setPasswordFeedback({ type: "success", msg: "Password updated successfully!" });
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
      }
    } catch {
      setPasswordFeedback({ type: "error", msg: "Network error occurred." });
    } finally {
      setChangingPassword(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-black text-slate-900 tracking-tight">Settings & Integrations</h1>
        <p className="text-sm text-slate-500">
          Turn AI answering on or off, teach the bot about your business, and connect your own domain.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
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

        <button
          onClick={() => setActiveTab("team")}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-colors ${
            activeTab === "team" ? "bg-indigo-600 text-white shadow-xs" : "text-slate-600 hover:bg-slate-100"
          }`}
        >
          <Headset className="w-4 h-4" />
          <span>Team &amp; Agents</span>
        </button>

        <button
          onClick={() => setActiveTab("domain")}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-colors ${
            activeTab === "domain" ? "bg-indigo-600 text-white shadow-xs" : "text-slate-600 hover:bg-slate-100"
          }`}
        >
          <Globe className="w-4 h-4" />
          <span>Custom Domain</span>
        </button>

        <button
          onClick={() => setActiveTab("security")}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-colors ${
            activeTab === "security" ? "bg-indigo-600 text-white shadow-xs" : "text-slate-600 hover:bg-slate-100"
          }`}
        >
          <ShieldCheck className="w-4 h-4" />
          <span>Security & Password</span>
        </button>
      </div>

      {/* TAB 2: AI Fallback Settings */}
      {activeTab === "ai" && (
        <div className="space-y-4 animate-fade-in">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-indigo-600" />
                <span>AI Answering</span>
              </CardTitle>
              <CardDescription>
                Lets the bot answer questions in its own words, using only what you have added under FAQ &amp;
                Knowledge Base. When the answer is not there, it says so and passes the visitor to a person rather
                than guessing.
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

              <button
                type="button"
                onClick={() => handleToggleAi(!aiConfig.enabled)}
                className={`w-full flex items-center justify-between gap-4 p-4 rounded-xl border-2 text-left transition-colors ${
                  aiConfig.enabled
                    ? "border-emerald-300 bg-emerald-50"
                    : "border-slate-200 bg-white hover:border-slate-300"
                }`}
              >
                <div>
                  <span className="font-bold text-slate-900 block text-sm">
                    {aiConfig.enabled ? "AI answering is on" : "AI answering is off"}
                  </span>
                  <span className="text-slate-500 text-[11px]">
                    {aiConfig.enabled
                      ? "Visitors get written answers from your content, with a handover when it does not know."
                      : "The bot follows your flow buttons only."}
                  </span>
                </div>
                <span
                  className={`relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors ${
                    aiConfig.enabled ? "bg-emerald-500" : "bg-slate-300"
                  }`}
                >
                  <span
                    className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
                      aiConfig.enabled ? "left-[22px]" : "left-0.5"
                    }`}
                  />
                </span>
              </button>

              {aiPlatform?.available ? (
                <p className="text-[11px] text-slate-500">
                  Answers are generated by the platform&apos;s AI service. Nothing else to set up.
                </p>
              ) : (
                <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900">
                  <p className="font-bold">AI is not available on this platform yet</p>
                  <p className="text-[11px] mt-0.5">
                    Your administrator needs to configure the AI service. Until then the bot follows your flow
                    buttons and hands over for anything else.
                  </p>
                </div>
              )}

              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                <p className="font-bold text-slate-800">To make answers better</p>
                <p className="text-[11px] text-slate-600 mt-0.5">
                  Add more of your real content under FAQ &amp; Knowledge Base — your services, pricing and common
                  questions. The bot can only answer from what is there.
                </p>
              </div>
            </CardContent>
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
                Imported pages and documents are what the bot answers from. Anything it cannot find here is handed
                to a person instead of guessed at.
              </p>
            </div>
            <Button size="sm" onClick={() => setIsAddDocModalOpen(true)} className="gap-1.5 text-xs font-bold">
              <Plus className="w-3.5 h-3.5" />
              <span>Add FAQ Document</span>
            </Button>
          </div>

          <KnowledgeImport onImported={fetchKnowledgeDocs} />

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

      {/* TAB 4: Security & Password */}
      {activeTab === "team" && <TeamPanel />}

      {activeTab === "domain" && <CustomDomainPanel />}

      {activeTab === "security" && (
        <div className="space-y-4 animate-fade-in">
          <Card>
            <form onSubmit={handlePasswordChange}>
              <CardHeader>
                <CardTitle className="text-base font-bold flex items-center gap-2">
                  <Lock className="w-4 h-4 text-indigo-600" />
                  <span>Update Account Password</span>
                </CardTitle>
                <CardDescription className="text-xs">
                  Change your current temporary or permanent password. Must be at least 8 characters with a mix of uppercase, lowercase, and numbers.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {passwordFeedback && (
                  <div
                    className={`p-3 rounded-lg text-xs font-medium border flex items-center gap-2 ${
                      passwordFeedback.type === "success"
                        ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                        : "bg-rose-50 text-rose-800 border-rose-200"
                    }`}
                  >
                    {passwordFeedback.type === "success" ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    ) : null}
                    <span>{passwordFeedback.msg}</span>
                  </div>
                )}

                <Input
                  label="Current Password"
                  type="password"
                  required
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="Enter current / temporary password"
                />

                <Input
                  label="New Password"
                  type="password"
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Minimum 8 characters with mixed case & numbers"
                />

                <Input
                  label="Confirm New Password"
                  type="password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter new password"
                />
              </CardContent>
              <CardFooter className="justify-end">
                <Button type="submit" loading={changingPassword} className="font-bold text-xs">
                  Update Password
                </Button>
              </CardFooter>
            </form>
          </Card>
        </div>
      )}
    </div>
  );
}
