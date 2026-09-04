"use client";

import React, { useRef, useState } from "react";
import { Globe, Upload, Check, AlertTriangle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

/**
 * Imports company knowledge from a website page or a document.
 *
 * The bot answers only from what is imported here, and hands the visitor to a
 * person when the answer is not present — so the value of this panel is
 * directly the quality of what gets loaded into it.
 */
export function KnowledgeImport({ onImported }: { onImported: () => void }) {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState<"url" | "file" | null>(null);
  const [result, setResult] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const importUrl = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!url.trim()) return;
    setBusy("url");
    setResult(null);
    try {
      const res = await fetch("/api/client/settings/knowledge/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
      });
      const json = await res.json();
      if (!json.success) {
        setResult({ tone: "error", text: json.error?.message || "Could not import that page." });
        return;
      }
      setResult({ tone: "ok", text: (json.data || json).message });
      setUrl("");
      onImported();
    } catch {
      setResult({ tone: "error", text: "Could not reach the server." });
    } finally {
      setBusy(null);
    }
  };

  const importFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setBusy("file");
    setResult(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/client/settings/knowledge/ingest", { method: "POST", body: form });
      const json = await res.json();
      if (!json.success) {
        setResult({ tone: "error", text: json.error?.message || "Could not read that file." });
        return;
      }
      setResult({ tone: "ok", text: (json.data || json).message });
      onImported();
    } catch {
      setResult({ tone: "error", text: "Could not reach the server." });
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card>
      <div className="p-4 space-y-3">
        <div>
          <h4 className="text-sm font-bold text-slate-900">Teach the bot about your business</h4>
          <p className="text-xs text-slate-500 mt-0.5">
            Import a page from your website or upload a document. The bot answers only from what it finds here, and
            passes the visitor to a person when it does not know — so it never invents an answer about your pricing or
            services.
          </p>
        </div>

        <form onSubmit={importUrl} className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Globe className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://yourcompany.com/services"
              className="w-full pl-8 pr-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <Button type="submit" disabled={busy !== null || !url.trim()} className="gap-1.5 font-bold text-xs">
            {busy === "url" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Globe className="w-3.5 h-3.5" />}
            <span>{busy === "url" ? "Reading page…" : "Import page"}</span>
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={busy !== null}
            onClick={() => fileRef.current?.click()}
            className="gap-1.5 font-bold text-xs"
          >
            {busy === "file" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
            <span>Upload file</span>
          </Button>
          <input
            ref={fileRef}
            type="file"
            hidden
            accept=".txt,.md,.csv,.json,.html,text/plain,text/markdown,text/csv,text/html,application/json"
            onChange={importFile}
          />
        </form>

        {result && (
          <div
            className={`flex items-start gap-2 rounded-xl px-3 py-2 text-xs font-medium border ${
              result.tone === "ok"
                ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                : "bg-amber-50 text-amber-800 border-amber-200"
            }`}
          >
            {result.tone === "ok" ? (
              <Check className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            ) : (
              <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            )}
            <span>{result.text}</span>
          </div>
        )}

        <p className="text-[11px] text-slate-400">
          Import one page at a time — the pages a customer would actually read, such as services, pricing and FAQs.
          Re-importing the same address replaces its previous content, so it is safe to refresh after you update your
          site. Text, Markdown, CSV, JSON and HTML files are read directly; for a PDF or Word file, paste the text in
          as an FAQ document.
        </p>
      </div>
    </Card>
  );
}
