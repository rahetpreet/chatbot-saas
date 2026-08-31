"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Mail, RefreshCw, Trash2, ExternalLink, ArrowLeft } from "lucide-react";
import { formatDate } from "@/lib/utils";

export default function DevEmailInboxPage() {
  const [emails, setEmails] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  if (process.env.NODE_ENV === "production") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900 text-slate-100 p-6">
        <div className="text-center space-y-3">
          <h2 className="text-xl font-bold">404 - Not Found</h2>
          <p className="text-sm text-slate-400">This development utility is disabled in production.</p>
          <Link href="/login" className="inline-block mt-4 text-xs text-indigo-400 underline">Return to Login</Link>
        </div>
      </div>
    );
  }

  const fetchEmails = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/dev/emails");
      const data = await res.json();
      setEmails(data.emails || []);
    } catch {
      setEmails([]);
    } finally {
      setLoading(false);
    }
  };

  const handleClear = async () => {
    await fetch("/api/dev/emails", { method: "DELETE" });
    fetchEmails();
  };

  useEffect(() => {
    fetchEmails();
  }, []);

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 p-6 md:p-10">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
          <div>
            <div className="flex items-center gap-2">
              <Link href="/dashboard" className="text-slate-400 hover:text-white transition-colors">
                <ArrowLeft className="w-4 h-4" />
              </Link>
              <h1 className="text-2xl font-black text-white flex items-center gap-2">
                <Mail className="w-6 h-6 text-emerald-400" />
                <span>₹0 Dev Mailbox Simulator</span>
              </h1>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Zero-cost testing mailbox. In development mode, system emails (password resets, notifications) are recorded here.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={fetchEmails} className="bg-slate-800 border-slate-700 text-white hover:bg-slate-700 text-xs gap-1.5">
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
              <span>Refresh</span>
            </Button>
            <Button size="sm" variant="danger" onClick={handleClear} disabled={emails.length === 0} className="text-xs gap-1.5">
              <Trash2 className="w-3.5 h-3.5" />
              <span>Clear Inbox</span>
            </Button>
          </div>
        </div>

        {/* Email Feed */}
        {emails.length === 0 ? (
          <div className="text-center py-16 bg-slate-950 border border-slate-800 rounded-2xl space-y-2">
            <Mail className="w-10 h-10 text-slate-600 mx-auto" />
            <h3 className="text-sm font-bold text-slate-300">No Emails Recorded Yet</h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              Trigger a password reset or lead notification to see the email rendered and test links instantly!
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {emails.map((email) => (
              <Card key={email.id} className="bg-slate-950 border-slate-800 text-slate-200 shadow-xl overflow-hidden">
                <CardHeader className="bg-slate-900/60 p-4 border-b border-slate-800 flex flex-row items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-white">{email.subject}</span>
                      <Badge variant="info" className="text-[10px]">Delivered to Dev</Badge>
                    </div>
                    <span className="text-[11px] text-slate-400">To: {email.to}</span>
                  </div>
                  <span className="text-[11px] text-slate-500">{formatDate(email.createdAt)}</span>
                </CardHeader>
                <CardContent className="p-4 space-y-3 text-xs">
                  {email.resetLink && (
                    <div className="p-3 rounded-lg bg-indigo-950/70 border border-indigo-500/40 flex items-center justify-between gap-4">
                      <div>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-400 block">
                          Password Reset Token URL
                        </span>
                        <span className="font-mono text-indigo-200 break-all text-[11px]">
                          {email.resetLink}
                        </span>
                      </div>
                      <a
                        href={email.resetLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1.5 rounded-lg shrink-0 transition-colors"
                      >
                        <span>Open Link</span>
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    </div>
                  )}

                  <div className="p-3 bg-slate-900 rounded-lg border border-slate-800/80 text-slate-300 font-mono text-[11px] whitespace-pre-wrap">
                    {email.text}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
