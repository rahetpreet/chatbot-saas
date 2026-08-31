"use client";

import React, { useState, useEffect } from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import {
  Palette,
  Code2,
  Copy,
  CheckCircle2,
  ExternalLink,
  Volume2,
  Sparkles,
  Layers,
  Save,
} from "lucide-react";

export default function WidgetCustomizerPage() {
  const [tenantSlug, setTenantSlug] = useState("acme-corp");
  const [settings, setSettings] = useState({
    primaryColor: "#4f46e5",
    secondaryColor: "#6366f1",
    textColor: "#ffffff",
    botName: "Acme Assistant",
    botSubtitle: "Typically replies instantly",
    avatarUrl: "https://api.dicebear.com/7.x/bottts/svg?seed=Acme",
    launcherStyle: "bubble",
    launcherPosition: "bottom-right",
    greetingBadge: "👋 Have questions? Chat with us!",
    showGreetingBadge: true,
    soundEnabled: true,
    allowedDomains: [] as string[],
  });

  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [domainInput, setDomainInput] = useState("");
  const [copiedSnippet, setCopiedSnippet] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/settings/widget")
      .then((res) => res.json())
      .then((data) => {
        if (data.tenant?.slug) setTenantSlug(data.tenant.slug);
        if (data.settings && Object.keys(data.settings).length > 0) {
          setSettings((prev) => ({ ...prev, ...data.settings }));
        }
      });
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setSaveSuccess(false);
    try {
      const res = await fetch("/api/settings/widget", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      if (res.ok) {
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 3000);
      }
    } catch {
      alert("Failed to save widget settings");
    } finally {
      setSaving(false);
    }
  };

  const handleAddDomain = () => {
    if (!domainInput.trim()) return;
    const clean = domainInput.trim().replace(/^https?:\/\//, "");
    if (!settings.allowedDomains.includes(clean)) {
      setSettings((prev) => ({ ...prev, allowedDomains: [...prev.allowedDomains, clean] }));
    }
    setDomainInput("");
  };

  const handleRemoveDomain = (d: string) => {
    setSettings((prev) => ({ ...prev, allowedDomains: prev.allowedDomains.filter((x) => x !== d) }));
  };

  const copySnippet = (code: string, id: string) => {
    navigator.clipboard.writeText(code);
    setCopiedSnippet(id);
    setTimeout(() => setCopiedSnippet(null), 2000);
  };

  const hostUrl = typeof window !== "undefined" ? window.location.origin : "https://yourdomain.com";
  const scriptTagCode = `<script src="${hostUrl}/widget.js" data-tenant-slug="${tenantSlug}" async></script>`;
  const iframeCode = `<iframe src="${hostUrl}/c/${tenantSlug}" width="100%" height="700" frameborder="0"></iframe>`;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">Widget Customizer & Deployment Hub</h1>
          <p className="text-sm text-slate-500">
            Brand colors, floating launcher styles, greeting badges, and 1-line embed snippets.
          </p>
        </div>
        <Button onClick={handleSave} loading={saving} className="gap-1.5 text-xs font-bold shadow-sm">
          <Save className="w-4 h-4" />
          <span>{saveSuccess ? "Saved Successfully!" : "Save Changes"}</span>
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left 7 Columns: Form Controls */}
        <div className="lg:col-span-7 space-y-5">
          {/* Visual Styling Card */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Palette className="w-4 h-4 text-indigo-600" />
                <span>Branding & Appearance</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">Primary Brand Color</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={settings.primaryColor}
                      onChange={(e) => setSettings({ ...settings, primaryColor: e.target.value })}
                      className="w-10 h-10 rounded-lg border border-slate-300 p-0.5 cursor-pointer"
                    />
                    <input
                      type="text"
                      value={settings.primaryColor}
                      onChange={(e) => setSettings({ ...settings, primaryColor: e.target.value })}
                      className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-xs font-mono"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">Launcher Position</label>
                  <select
                    value={settings.launcherPosition}
                    onChange={(e) => setSettings({ ...settings, launcherPosition: e.target.value as any })}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium"
                  >
                    <option value="bottom-right">Bottom Right (Default)</option>
                    <option value="bottom-left">Bottom Left</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <Input
                  label="Bot Display Name"
                  value={settings.botName}
                  onChange={(e) => setSettings({ ...settings, botName: e.target.value })}
                  placeholder="Assistant"
                />

                <Input
                  label="Subtitle / Response SLA"
                  value={settings.botSubtitle}
                  onChange={(e) => setSettings({ ...settings, botSubtitle: e.target.value })}
                  placeholder="Typically replies in seconds"
                />
              </div>

              <Input
                label="Avatar Image URL"
                value={settings.avatarUrl}
                onChange={(e) => setSettings({ ...settings, avatarUrl: e.target.value })}
                placeholder="https://example.com/avatar.png"
              />

              <Input
                label="Greeting Badge Text"
                value={settings.greetingBadge}
                onChange={(e) => setSettings({ ...settings, greetingBadge: e.target.value })}
                placeholder="👋 Have questions? Chat with us!"
                helperText="Popup notification badge that appears beside the launcher."
              />

              <div className="flex items-center gap-6 pt-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.showGreetingBadge}
                    onChange={(e) => setSettings({ ...settings, showGreetingBadge: e.target.checked })}
                    className="rounded border-slate-300 text-indigo-600"
                  />
                  <span className="font-semibold text-slate-800">Show Greeting Badge</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.soundEnabled}
                    onChange={(e) => setSettings({ ...settings, soundEnabled: e.target.checked })}
                    className="rounded border-slate-300 text-indigo-600"
                  />
                  <span className="font-semibold text-slate-800">Audio Chime on Messages</span>
                </label>
              </div>
            </CardContent>
          </Card>

          {/* Domain Whitelist Card */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Allowed Domains (CORS Security)</CardTitle>
              <CardDescription>
                Restrict embed widget execution exclusively to authorized websites. If empty, all origins are permitted.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-xs">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder="e.g. mycompany.com or localhost"
                  value={domainInput}
                  onChange={(e) => setDomainInput(e.target.value)}
                  className="flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs"
                />
                <Button size="sm" onClick={handleAddDomain} className="h-8">
                  Add Domain
                </Button>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {settings.allowedDomains.map((d) => (
                  <span
                    key={d}
                    className="inline-flex items-center gap-1.5 bg-slate-100 border border-slate-200 px-2.5 py-1 rounded-lg text-xs text-slate-800 font-semibold"
                  >
                    <span>{d}</span>
                    <button onClick={() => handleRemoveDomain(d)} className="text-slate-400 hover:text-rose-600 font-bold">
                      ×
                    </button>
                  </span>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Embed Code Snippets Card */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Code2 className="w-4 h-4 text-indigo-600" />
                <span>Deploy-Ready Embed Snippets</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-xs">
              {/* Script tag */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="font-bold text-slate-800">1. Standard 1-Line Script Tag</span>
                  <button
                    onClick={() => copySnippet(scriptTagCode, "script")}
                    className="text-indigo-600 hover:underline font-semibold flex items-center gap-1"
                  >
                    {copiedSnippet === "script" ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedSnippet === "script" ? "Copied!" : "Copy Tag"}</span>
                  </button>
                </div>
                <div className="p-3 bg-slate-950 text-indigo-300 font-mono text-[11px] rounded-lg overflow-x-auto">
                  {scriptTagCode}
                </div>
              </div>

              {/* Iframe tag */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="font-bold text-slate-800">2. Full-Page Iframe Embed</span>
                  <button
                    onClick={() => copySnippet(iframeCode, "iframe")}
                    className="text-indigo-600 hover:underline font-semibold flex items-center gap-1"
                  >
                    {copiedSnippet === "iframe" ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedSnippet === "iframe" ? "Copied!" : "Copy Iframe"}</span>
                  </button>
                </div>
                <div className="p-3 bg-slate-950 text-indigo-300 font-mono text-[11px] rounded-lg overflow-x-auto">
                  {iframeCode}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right 5 Columns: Live Real-Time Interactive Visual Preview */}
        <div className="lg:col-span-5 space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">Live Visual Theme Preview</h3>
          <div className="rounded-2xl border-2 border-slate-300 bg-slate-200/50 p-6 flex items-center justify-center relative min-h-[540px] overflow-hidden shadow-inner">
            {/* Mock website background */}
            <div className="absolute inset-4 bg-white rounded-xl shadow-xs p-5 opacity-40 select-none">
              <div className="w-32 h-4 bg-slate-300 rounded mb-4" />
              <div className="space-y-2">
                <div className="w-full h-2 bg-slate-200 rounded" />
                <div className="w-5/6 h-2 bg-slate-200 rounded" />
                <div className="w-4/6 h-2 bg-slate-200 rounded" />
              </div>
            </div>

            {/* Live Rendered Widget Mock */}
            <div
              className={`absolute bottom-6 ${
                settings.launcherPosition === "bottom-left" ? "left-6 items-start" : "right-6 items-end"
              } flex flex-col gap-3 z-10`}
            >
              {/* Greeting badge */}
              {settings.showGreetingBadge && settings.greetingBadge && (
                <div className="bg-white text-slate-800 px-3 py-2 rounded-xl shadow-lg border border-slate-200 text-xs font-semibold max-w-[220px] animate-fade-in">
                  {settings.greetingBadge}
                </div>
              )}

              {/* Launcher bubble */}
              <div
                className="w-14 h-14 rounded-full flex items-center justify-center text-white shadow-xl cursor-pointer hover:scale-105 transition-transform"
                style={{ background: settings.primaryColor }}
              >
                <Sparkles className="w-6 h-6" />
              </div>
            </div>

            {/* Chat Mockup Card */}
            <div className="w-72 bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden z-20 animate-fade-in">
              <div
                className="p-3.5 text-white flex items-center gap-2.5"
                style={{ background: settings.primaryColor }}
              >
                <img src={settings.avatarUrl} alt="Avatar" className="w-8 h-8 rounded-full bg-white p-0.5" />
                <div>
                  <div className="font-bold text-xs">{settings.botName}</div>
                  <div className="text-[10px] opacity-85 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    <span>{settings.botSubtitle}</span>
                  </div>
                </div>
              </div>
              <div className="p-3 space-y-2.5 bg-slate-50 text-[11px]">
                <div className="bg-white p-2.5 rounded-xl rounded-bl-xs border border-slate-200 text-slate-800 shadow-xs">
                  👋 Welcome to our website! How can we assist you today?
                </div>
                <div className="flex flex-col gap-1.5 pt-1">
                  <div
                    className="p-2 rounded-lg bg-white border border-slate-300 text-xs font-semibold cursor-pointer text-center"
                    style={{ color: settings.primaryColor }}
                  >
                    📅 Book a Demo
                  </div>
                  <div
                    className="p-2 rounded-lg bg-white border border-slate-300 text-xs font-semibold cursor-pointer text-center"
                    style={{ color: settings.primaryColor }}
                  >
                    💰 Pricing & Plans
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
