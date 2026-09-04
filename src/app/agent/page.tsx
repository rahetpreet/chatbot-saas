"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Headset, Send, RefreshCw, LogOut, Clock, User, Bot, CheckCircle2, Bell, BellOff } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { SkeletonList, LoadingPanel } from "@/components/ui/Loading";
import { playNewConversationChime } from "@/lib/notificationSound";

interface QueueItem {
  id: string;
  sessionStatus: string;
  visitorId: string;
  lastActiveAt: string;
  flowName: string | null;
  campaignName: string | null;
  contact: { name: string | null; email: string | null; phone: string | null } | null;
  lastMessage: { content: string; senderType: string } | null;
  waitingSeconds: number;
}

function waitLabel(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

/**
 * The agent console.
 *
 * Deliberately not the client dashboard: an agent's job is the queue of
 * visitors waiting for a person, and everything else — flows, campaigns,
 * contacts, settings — is noise they should not have to navigate past, or in
 * most cases see at all. The server enforces the same restriction, so this is
 * a focused view rather than a security boundary on its own.
 */
export default function AgentConsolePage() {
  const router = useRouter();

  const [me, setMe] = useState<any>(null);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [waitingCount, setWaitingCount] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<any | null>(null);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [soundOn, setSoundOn] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const transcriptEnd = useRef<HTMLDivElement>(null);
  const knownIds = useRef<Set<string> | null>(null);
  const selectedRef = useRef<string | null>(null);
  const soundRef = useRef(true);

  useEffect(() => {
    soundRef.current = soundOn;
  }, [soundOn]);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((res) => res.json())
      .then((json) => {
        const user = json.user || json.data?.user;
        if (!user) {
          router.push("/login?next=/agent");
          return;
        }
        setMe(user);
      })
      .catch(() => router.push("/login?next=/agent"));
  }, [router]);

  const loadQueue = useCallback(async () => {
    try {
      const res = await fetch("/api/client/agent/conversations");
      const json = await res.json();
      if (!json.success) {
        setError(json.error?.message || "Could not load the queue.");
        return;
      }
      setError(null);
      const data = json.data || json;
      const list: QueueItem[] = data.conversations || [];
      setQueue(list);
      setWaitingCount(data.waitingCount || 0);

      // Only alert for genuinely new arrivals; the first load is the baseline.
      const ids = new Set(list.filter((item) => item.sessionStatus === "HANDOVER").map((item) => item.id));
      if (knownIds.current === null) {
        knownIds.current = ids;
      } else {
        const arrived = [...ids].filter((id) => !knownIds.current!.has(id));
        knownIds.current = ids;
        if (arrived.length && soundRef.current) playNewConversationChime();
      }
    } catch {
      setError("Could not reach the server.");
    } finally {
      setLoading(false);
    }
  }, []);

  const openConversation = useCallback(async (id: string, spinner = false) => {
    selectedRef.current = id;
    setSelectedId(id);
    if (spinner) setDetailLoading(true);
    try {
      const res = await fetch(`/api/client/conversations/${id}`);
      const json = await res.json();
      const conversation = json.conversation || json.data?.conversation;
      if (conversation) setDetail(conversation);
    } catch {
      /* the queue poll will retry */
    } finally {
      if (spinner) setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!me) return;
    loadQueue();
    const timer = setInterval(() => {
      loadQueue();
      if (selectedRef.current) openConversation(selectedRef.current);
    }, 5000);
    return () => clearInterval(timer);
  }, [me, loadQueue, openConversation]);

  useEffect(() => {
    transcriptEnd.current?.scrollIntoView({ behavior: "smooth" });
  }, [detail?.messages]);

  const sendReply = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedId || !reply.trim() || sending) return;
    const content = reply.trim();
    setReply("");
    setSending(true);
    try {
      await fetch(`/api/client/conversations/${selectedId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      await openConversation(selectedId);
    } catch {
      setReply(content);
      setError("That reply did not send. Please try again.");
    } finally {
      setSending(false);
    }
  };

  const resolve = async () => {
    if (!selectedId) return;
    await fetch(`/api/client/conversations/${selectedId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionStatus: "RESOLVED" }),
    });
    await Promise.all([loadQueue(), openConversation(selectedId)]);
  };

  const signOut = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  };

  if (!me) return <LoadingPanel label="Signing you in…" className="min-h-screen" />;

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col">
      <header className="bg-white border-b border-slate-200 px-4 py-2.5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-orange-100 text-orange-700 flex items-center justify-center">
            <Headset className="w-4 h-4" />
          </div>
          <div>
            <h1 className="text-sm font-black text-slate-900 leading-none">Agent Console</h1>
            <p className="text-[11px] text-slate-500 mt-0.5">
              {waitingCount > 0 ? `${waitingCount} visitor${waitingCount === 1 ? "" : "s"} waiting` : "No one waiting"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setSoundOn((on) => !on)}
            className={`h-8 w-8 rounded-lg border flex items-center justify-center ${
              soundOn ? "bg-white border-slate-200 text-slate-700" : "bg-slate-100 border-slate-200 text-slate-400"
            }`}
            title={soundOn ? "Sound on" : "Muted"}
          >
            {soundOn ? <Bell className="w-3.5 h-3.5" /> : <BellOff className="w-3.5 h-3.5" />}
          </button>
          <Button size="sm" variant="outline" onClick={loadQueue} className="h-8 gap-1 text-xs">
            <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} />
            <span className="hidden sm:inline">Refresh</span>
          </Button>
          <span className="text-xs text-slate-600 hidden sm:block">{me.name || me.email}</span>
          <Button size="sm" variant="outline" onClick={signOut} className="h-8 gap-1 text-xs">
            <LogOut className="w-3 h-3" />
            <span className="hidden sm:inline">Sign out</span>
          </Button>
        </div>
      </header>

      {error && (
        <div className="mx-4 mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-800">
          {error}
        </div>
      )}

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-0 overflow-hidden">
        {/* Queue */}
        <aside className="lg:col-span-4 xl:col-span-3 border-r border-slate-200 bg-white overflow-y-auto">
          {loading && queue.length === 0 ? (
            <div className="p-3">
              <SkeletonList rows={5} />
            </div>
          ) : queue.length === 0 ? (
            <div className="p-8 text-center">
              <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
              <p className="text-sm font-bold text-slate-800">Queue is clear</p>
              <p className="text-xs text-slate-500 mt-1">
                Conversations appear here the moment a visitor asks for a person.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {queue.map((item) => {
                const active = selectedId === item.id;
                const waiting = item.sessionStatus === "HANDOVER";
                return (
                  <button
                    key={item.id}
                    onClick={() => openConversation(item.id, true)}
                    className={`w-full text-left p-3.5 transition-colors ${
                      active ? "bg-orange-50 border-l-4 border-orange-500" : "hover:bg-slate-50"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="text-xs font-bold text-slate-900 truncate">
                        {item.contact?.name || item.visitorId.slice(0, 14)}
                      </span>
                      {waiting ? (
                        <span className="flex items-center gap-1 text-[10px] font-bold text-orange-700 bg-orange-100 px-1.5 py-0.5 rounded-full shrink-0">
                          <Clock className="w-2.5 h-2.5" />
                          {waitLabel(item.waitingSeconds)}
                        </span>
                      ) : (
                        <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded-full shrink-0">
                          Done
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-500 truncate">
                      {item.lastMessage?.content || "Waiting for a reply…"}
                    </p>
                    {item.campaignName && (
                      <p className="text-[10px] text-slate-400 mt-0.5 truncate">{item.campaignName}</p>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </aside>

        {/* Transcript */}
        <section className="lg:col-span-8 xl:col-span-9 flex flex-col bg-white overflow-hidden">
          {detailLoading && !detail ? (
            <LoadingPanel label="Opening conversation…" className="flex-1" />
          ) : !detail ? (
            <div className="flex-1 flex items-center justify-center text-slate-400 text-xs px-6 text-center">
              Choose a waiting visitor to see the full conversation and reply.
            </div>
          ) : (
            <>
              <div className="p-3.5 border-b border-slate-200 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-slate-900 truncate">
                    {detail.campaignContact?.name || detail.visitorId?.slice(0, 18)}
                  </p>
                  <p className="text-[11px] text-slate-500 truncate">
                    {detail.campaignContact?.email || detail.campaignContact?.phone || detail.flow?.name || "Visitor"}
                  </p>
                </div>
                {detail.sessionStatus === "HANDOVER" && (
                  <Button size="sm" onClick={resolve} className="gap-1.5 text-xs font-bold bg-emerald-600 text-white">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Mark resolved</span>
                  </Button>
                )}
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50">
                {(detail.messages || []).map((message: any, index: number) => {
                  const fromVisitor = message.senderType === "VISITOR";
                  const fromSystem = message.senderType === "SYSTEM";
                  if (fromSystem) {
                    return (
                      <div key={message.id || index} className="flex justify-center">
                        <span className="text-[11px] text-slate-500 bg-slate-200/70 rounded-full px-3 py-1">
                          {message.content}
                        </span>
                      </div>
                    );
                  }
                  return (
                    <div
                      key={message.id || index}
                      className={`flex gap-2 ${fromVisitor ? "justify-start" : "justify-end"}`}
                    >
                      {fromVisitor && (
                        <div className="w-7 h-7 rounded-full bg-slate-200 text-slate-600 flex items-center justify-center shrink-0">
                          <User className="w-3.5 h-3.5" />
                        </div>
                      )}
                      <div
                        className={`max-w-[75%] rounded-2xl px-3.5 py-2 text-xs leading-relaxed whitespace-pre-wrap ${
                          fromVisitor
                            ? "bg-white border border-slate-200 text-slate-800"
                            : message.senderType === "AGENT"
                              ? "bg-orange-500 text-white"
                              : "bg-indigo-600 text-white"
                        }`}
                      >
                        {message.content}
                      </div>
                      {!fromVisitor && (
                        <div className="w-7 h-7 rounded-full bg-slate-800 text-white flex items-center justify-center shrink-0">
                          {message.senderType === "AGENT" ? (
                            <Headset className="w-3.5 h-3.5" />
                          ) : (
                            <Bot className="w-3.5 h-3.5" />
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
                <div ref={transcriptEnd} />
              </div>

              <form onSubmit={sendReply} className="p-3 border-t border-slate-200 flex items-center gap-2">
                <input
                  value={reply}
                  onChange={(event) => setReply(event.target.value)}
                  placeholder="Type your reply to the visitor…"
                  className="flex-1 px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
                <Button
                  type="submit"
                  loading={sending}
                  disabled={!reply.trim()}
                  className="gap-1.5 font-bold bg-orange-600 hover:bg-orange-700 text-white"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Send</span>
                </Button>
              </form>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
