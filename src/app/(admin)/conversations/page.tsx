"use client";

import React, { useState, useEffect, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import {
  MessageSquare,
  Search,
  CheckCircle2,
  Headset,
  Download,
  Send,
  User,
  Bot,
  Bell,
  BellOff,
  RefreshCw,
  Clock,
  Sparkles,
  Paperclip,
} from "lucide-react";
import { formatDate } from "@/lib/utils";
import { describeVisitor } from "@/lib/services/conversation/identity";
import {
  playNewConversationChime,
  unlockNotificationSound,
  isUnread,
  markConversationRead,
  markAllRead,
} from "@/lib/notificationSound";
import { SkeletonList, LoadingPanel } from "@/components/ui/Loading";

function LiveConversationsInbox() {
  const searchParams = useSearchParams();
  const initialId = searchParams.get("id");

  const [conversations, setConversations] = useState<any[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<any | null>(null);
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [search, setSearch] = useState("");
  const [replyText, setReplyText] = useState("");
  const [sendingReply, setSendingReply] = useState(false);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [unreadIds, setUnreadIds] = useState<Set<string>>(new Set());
  const [soundOn, setSoundOn] = useState(true);
  const transcriptEndRef = useRef<HTMLDivElement>(null);
  // Ref rather than state: the poll closure must see the current ids without
  // being re-created, which would reset the interval on every tick.
  const knownIdsRef = useRef<Set<string> | null>(null);
  const soundOnRef = useRef(true);
  const selectedConversationRef = useRef<string | null>(null);
  /**
   * Cheap signatures of what is already on screen.
   *
   * The poll used to call setState unconditionally every five seconds, so React
   * re-rendered the whole inbox — and moved it — even when the response was
   * byte-for-byte what was already displayed. Comparing first means an idle
   * inbox is completely still.
   */
  const listSignatureRef = useRef<string>("");
  const detailSignatureRef = useRef<string>("");
  /** Message count of the open chat, to tell a refresh from a real new message. */
  const messageCountRef = useRef<number>(0);
  /** The scrolling transcript element, so we can tell whether the agent is at the bottom. */
  const transcriptRef = useRef<HTMLDivElement>(null);

  /**
   * @param background true for the five-second poll.
   *
   * A background refresh must not touch the loading flag. Setting it re-rendered
   * the whole inbox twice every five seconds and span the refresh icon as though
   * the agent had asked for something, when nothing had happened at all.
   */
  const fetchConversations = async (autoSelectId?: string, background = false) => {
    if (!background) setLoading(true);
    try {
      let url = "/api/client/conversations";
      if (statusFilter !== "ALL") url += `?status=${statusFilter}`;
      const res = await fetch(url);
      const data = await res.json();
      const list = data.conversations || [];

      // Ordered ids plus each row's last activity: enough to notice a new chat,
      // a new message or a status change, and nothing else.
      const signature = list
        .map((c: any) => `${c.id}:${c.lastActiveAt}:${c.sessionStatus}:${c._count?.messages ?? 0}`)
        .join("|");
      if (signature !== listSignatureRef.current) {
        listSignatureRef.current = signature;
        setConversations(list);
      }

      // First load establishes the baseline; everything already there is not
      // an "arrival", or the agent would be chimed at on every page open.
      const incomingIds = new Set<string>(list.map((conversation: any) => conversation.id));
      if (knownIdsRef.current === null) {
        knownIdsRef.current = incomingIds;
      } else {
        const arrived = list.filter((conversation: any) => !knownIdsRef.current!.has(conversation.id));
        knownIdsRef.current = incomingIds;
        if (arrived.length && soundOnRef.current) playNewConversationChime();
      }

      // Only replace the set when membership actually changed. Handing React
      // a fresh Set every five seconds re-rendered the entire inbox — every row
      // and every click handler — on a timer, whether or not anything had
      // happened. An idle inbox should be completely inert.
      const unread = list.filter((conversation: any) => isUnread(conversation)).map((c: any) => c.id);
      setUnreadIds((current) => {
        if (current.size === unread.length && unread.every((id: string) => current.has(id))) return current;
        return new Set<string>(unread);
      });

      // Auto-select ONLY when nothing is open. This runs on a 5s poll, and
      // reading selectedConversation from the closure gave a stale value, so
      // every tick re-selected the newest conversation and threw the agent out
      // of whichever one they had just opened. The ref is always current.
      const alreadyOpen = selectedConversationRef.current;
      if (alreadyOpen) return;

      const targetId = autoSelectId || initialId;
      if (targetId) {
        loadConversationDetails(targetId);
      } else if (list.length > 0) {
        loadConversationDetails(list[0].id);
      }
    } catch (e) {
      console.error(e);
    } finally {
      if (!background) setLoading(false);
    }
  };

  const loadConversationDetails = async (id: string, showSpinner = false) => {
    // Claim the selection before awaiting. The effect that syncs this ref runs
    // after render, which left a window where a poll could auto-select over
    // the conversation the agent had just clicked.
    // Opening a different conversation starts fresh: the signature and message
    // count belong to the previous one and would suppress the first render.
    if (selectedConversationRef.current !== id) {
      detailSignatureRef.current = "";
      messageCountRef.current = 0;
    }
    selectedConversationRef.current = id;
    if (showSpinner) setDetailLoading(true);
    try {
      const res = await fetch(`/api/client/conversations/${id}`);
      const data = await res.json();
      // Discard a response for a conversation that is no longer open.
      //
      // The five-second poll and a click both call this. If the poll's request
      // for the previously open chat was already in flight when the agent
      // clicked a different one, its reply lands last and overwrites the
      // selection — the click appeared to do nothing, or to open the wrong
      // conversation. Whichever id is current when the reply arrives wins.
      if (selectedConversationRef.current !== id) return;

      const conversation = data.conversation || data.data?.conversation;
      if (conversation) {
        // A poll that finds nothing new must not replace the object: doing so
        // re-rendered the transcript and threw the reader back to the bottom.
        const messages = conversation.messages || [];
        const signature = `${conversation.id}:${conversation.sessionStatus}:${messages.length}:${
          messages[messages.length - 1]?.id ?? ""
        }`;
        const changed = signature !== detailSignatureRef.current;
        detailSignatureRef.current = signature;
        if (changed) setSelectedConversation(conversation);
        // Opening it is what marks it read, so a conversation that receives a
        // new message afterwards becomes unread again.
        markConversationRead(conversation.id);
        setUnreadIds((current) => {
          const next = new Set(current);
          next.delete(conversation.id);
          return next;
        });
      }
    } catch (e) {
      console.error(e);
    } finally {
      if (showSpinner) setDetailLoading(false);
    }
  };

  useEffect(() => {
    fetchConversations(initialId || undefined);
    // Poll every 5s for live incoming messages
    // The list was never refreshed, so a brand-new conversation only appeared
    // after a manual reload -- which is why arrivals went unnoticed.
    const timer = setInterval(() => {
      fetchConversations(undefined, true);
      if (selectedConversationRef.current) {
        loadConversationDetails(selectedConversationRef.current);
      }
    }, 5000);
    return () => clearInterval(timer);
  }, [statusFilter]);

  useEffect(() => {
    const messages = selectedConversation?.messages || [];
    const previousCount = messageCountRef.current;
    messageCountRef.current = messages.length;

    // Opening a chat jumps to the newest message; after that, only a genuinely
    // new message scrolls, and only when the agent is already near the bottom.
    // Scrolling someone who has deliberately gone back to read earlier
    // messages is what made the inbox feel like it was fighting them.
    if (!messages.length) return;

    const container = transcriptRef.current;
    const openedFresh = previousCount === 0;
    const grew = messages.length > previousCount;
    if (!openedFresh && !grew) return;

    if (!openedFresh && container) {
      const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
      if (distanceFromBottom > 120) return;
    }

    // Scroll the transcript itself, never scrollIntoView.
    //
    // scrollIntoView walks up and scrolls EVERY scrollable ancestor, so it
    // dragged the whole page down and pushed the conversation list out of
    // view — the inbox appeared to jump upwards on its own every few seconds,
    // and the list you were trying to click went off screen. Setting scrollTop
    // moves only this panel.
    if (!container) return;
    container.scrollTo({ top: container.scrollHeight, behavior: openedFresh ? "auto" : "smooth" });
  }, [selectedConversation?.id, selectedConversation?.messages]);

  useEffect(() => {
    soundOnRef.current = soundOn;
  }, [soundOn]);

  // Arm the chime. Browsers only start audio inside a user gesture, and the
  // chime fires from a background poll, so without this the context stayed
  // suspended and every alert was silently dropped.
  useEffect(() => unlockNotificationSound(), []);

  useEffect(() => {
    selectedConversationRef.current = selectedConversation?.id ?? null;
  }, [selectedConversation?.id]);

  // Send live agent reply
  const handleSendAgentReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedConversation || !replyText.trim() || sendingReply) return;

    setSendingReply(true);
    const content = replyText.trim();
    setReplyText("");

    try {
      const res = await fetch(`/api/client/conversations/${selectedConversation.id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      const data = await res.json();
      if (data.success) {
        loadConversationDetails(selectedConversation.id);
      }
    } catch {
      alert("Failed to send reply");
    } finally {
      setSendingReply(false);
    }
  };

  // Resolve session
  const handleResolveSession = async () => {
    if (!selectedConversation) return;
    try {
      await fetch(`/api/client/conversations/${selectedConversation.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionStatus: "RESOLVED" }),
      });
      loadConversationDetails(selectedConversation.id);
      fetchConversations();
    } catch {
      alert("Failed to update status");
    }
  };

  const filtered = conversations.filter((conversation) => {
    if (!search.trim()) return true;
    // Searchable by anything that identifies the person: name, email, phone or
    // the raw visitor id. Matching only the contact name meant a chat where the
    // visitor typed their email could not be found by that email.
    const who = describeVisitor(conversation);
    const haystack = [who.title, who.name, who.email, who.phone, conversation.visitorId]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return haystack.includes(search.toLowerCase());
  });

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">Live Conversations & Transcripts</h1>
          <p className="text-sm text-slate-500">
            Real-time chat inbox, human agent live handover, and PDF transcript exports.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {unreadIds.size > 0 && (
            <button
              onClick={() => {
                markAllRead(conversations);
                setUnreadIds(new Set());
              }}
              className="h-8 px-2.5 rounded-lg text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100 flex items-center gap-1.5"
              title="Mark all as read"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
              <span>{unreadIds.size} new</span>
            </button>
          )}

          <button
            onClick={() => setSoundOn((on) => !on)}
            className={`h-8 w-8 rounded-lg border flex items-center justify-center transition-colors ${
              soundOn
                ? "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
                : "bg-slate-100 border-slate-200 text-slate-400"
            }`}
            title={soundOn ? "Sound on for new chats" : "Sound muted"}
          >
            {soundOn ? <Bell className="w-3.5 h-3.5" /> : <BellOff className="w-3.5 h-3.5" />}
          </button>

          <a
            href="/api/client/conversations/export?format=csv"
            className="h-8 px-2.5 rounded-lg text-xs font-bold bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 flex items-center gap-1.5"
            title="Download every conversation as a spreadsheet"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export CSV</span>
          </a>

          <Button size="sm" variant="outline" onClick={() => fetchConversations()} className="h-8 gap-1 text-xs">
            <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} />
            <span>Refresh</span>
          </Button>
        </div>
      </div>

      {/* 2-Pane Inbox Box */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-0 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden h-[calc(100vh-14rem)] min-h-[580px]">
        {/* Left Pane (4 Cols): Threads List */}
        <div className="lg:col-span-5 border-r border-slate-200 flex flex-col h-full min-h-0 bg-slate-50/50">
          {/* Filter Tabs */}
          <div className="p-3 border-b border-slate-200 bg-white space-y-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search chats by visitor..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-slate-300 bg-white"
              />
            </div>

            <div className="flex items-center gap-1 overflow-x-auto pb-0.5">
              {["ALL", "HANDOVER", "ACTIVE", "RESOLVED"].map((tab) => (
                <button
                  key={tab}
                  onClick={() => setStatusFilter(tab)}
                  className={`text-[11px] font-bold px-2.5 py-1 rounded-lg transition-colors whitespace-nowrap ${
                    statusFilter === tab
                      ? "bg-indigo-600 text-white shadow-xs"
                      : "text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  {tab === "HANDOVER" ? "🚨 Needs Agent" : tab}
                </button>
              ))}
            </div>
          </div>

          {/* Conversations Thread Feed */}
          <div className="flex-1 min-h-0 overflow-y-auto divide-y divide-slate-100">
            {loading && conversations.length === 0 ? (
              <div className="p-3">
                <SkeletonList rows={6} />
              </div>
            ) : filtered.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-400">No conversations match the filter.</div>
            ) : (
              filtered.map((conv) => {
                const isSelected = selectedConversation?.id === conv.id;
                const isHandover = conv.sessionStatus === "HANDOVER";
                const isResolved = conv.sessionStatus === "RESOLVED";
                const unread = unreadIds.has(conv.id);

                return (
                  <div
                    key={conv.id}
                    onClick={() => loadConversationDetails(conv.id, true)}
                    className={`p-3.5 transition-all cursor-pointer ${
                      isSelected
                        ? "bg-indigo-50/80 border-l-4 border-indigo-600"
                        : "hover:bg-slate-100/70 bg-white"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <h4 className="text-xs font-bold text-slate-900 truncate flex items-center gap-1.5">
                        {unread && (
                          <span
                            className="w-2 h-2 rounded-full bg-rose-500 shrink-0 animate-pulse"
                            title="Unread"
                            aria-label="Unread"
                          />
                        )}
                        <span className={unread ? "text-slate-900" : "text-slate-700 font-semibold"}>
                          {describeVisitor(conv).title}
                        </span>
                      </h4>
                      <Badge
                        variant={isHandover ? "warning" : isResolved ? "success" : "info"}
                        className="text-[9px] px-1.5 py-0"
                      >
                        {conv.sessionStatus}
                      </Badge>
                    </div>

                    <p className="text-[11px] text-slate-500 truncate mb-1">
                      {conv.messages?.[0]?.content || "Ongoing conversation..."}
                    </p>

                    <div className="flex items-center justify-between text-[10px] text-slate-400">
                      <span className="truncate">{conv.flow?.name || "Default Flow"}</span>
                      <span>{formatDate(conv.lastActiveAt)}</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Pane (7 Cols): Active Chat Transcript & Agent Reply */}
        <div className="lg:col-span-7 flex flex-col h-full min-h-0 bg-white">
          {selectedConversation ? (
            <>
              {/* Transcript Header */}
              <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-white shrink-0">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-xs">
                    {describeVisitor(selectedConversation).initial}
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-slate-900 leading-tight">
                      {describeVisitor(selectedConversation).title}
                    </h3>
                    <div className="flex items-center gap-2 text-[11px] text-slate-500">
                      {/* Contact details the visitor gave, which used not to be
                          shown anywhere even though the flow had captured them. */}
                      {describeVisitor(selectedConversation).subtitle && (
                        <>
                          <span className="font-medium text-slate-600">
                            {describeVisitor(selectedConversation).subtitle}
                          </span>
                          <span>•</span>
                        </>
                      )}
                      <span>Status: {selectedConversation.sessionStatus}</span>
                      <span>•</span>
                      <span>{selectedConversation.flow?.name || "Bot Flow"}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {selectedConversation.sessionStatus !== "RESOLVED" && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleResolveSession}
                      className="h-8 text-xs gap-1 text-emerald-700 hover:bg-emerald-50 border-emerald-200"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Resolve Chat</span>
                    </Button>
                  )}

                  {/* PDF Download Button */}
                  <a
                    href={`/api/client/conversations/${selectedConversation.id}/export?format=pdf`}
                    download={`transcript_${selectedConversation.id}.pdf`}
                    className="inline-flex items-center gap-1.5 px-3 h-8 text-xs font-semibold rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 transition-colors shadow-xs"
                    title="Export transcript as PDF"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>PDF</span>
                  </a>
                </div>
              </div>

              {/* Message Transcript View */}
              <div ref={transcriptRef} className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3 bg-slate-50/50">
                {(selectedConversation.messages || []).map((msg: any) => {
                  const isAgent = msg.senderType === "AGENT";
                  const isBot = msg.senderType === "BOT" || msg.senderType === "AI";
                  const isVisitor = msg.senderType === "VISITOR";

                  return (
                    <div
                      key={msg.id}
                      className={`flex gap-2.5 ${isVisitor ? "justify-start" : "justify-end"}`}
                    >
                      {isVisitor && (
                        <div className="w-7 h-7 rounded-full bg-slate-800 text-white flex items-center justify-center shrink-0 text-xs shadow-xs">
                          <User className="w-3.5 h-3.5" />
                        </div>
                      )}

                      <div
                        className={`max-w-[78%] rounded-2xl px-3.5 py-2.5 text-xs shadow-xs ${
                          isVisitor
                            ? "bg-white text-slate-800 border border-slate-200 rounded-bl-xs"
                            : isAgent
                            ? "bg-emerald-600 text-white rounded-br-xs font-medium"
                            : "bg-indigo-600 text-white rounded-br-xs"
                        }`}
                      >
                        <div className="text-[10px] opacity-75 font-semibold mb-0.5">
                          {isVisitor
                            ? "Visitor"
                            : isAgent
                            ? `Live Operator (${msg.senderName || "Agent"})`
                            : "Automated Bot"}
                        </div>
                        <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                        <span className="text-[9px] opacity-60 block mt-1 text-right">
                          {formatDate(msg.timestamp)}
                        </span>
                      </div>

                      {!isVisitor && (
                        <div
                          className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-xs text-white shadow-xs ${
                            isAgent ? "bg-emerald-600" : "bg-indigo-600"
                          }`}
                        >
                          {isAgent ? <Headset className="w-3.5 h-3.5" /> : <Bot className="w-3.5 h-3.5" />}
                        </div>
                      )}
                    </div>
                  );
                })}
                <div ref={transcriptEndRef} />
              </div>

              {/* Agent Reply Bar */}
              <form onSubmit={handleSendAgentReply} className="p-3 border-t border-slate-200 bg-white flex items-center gap-2">
                <input
                  type="text"
                  placeholder="Type an agent reply to the visitor in real-time..."
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <Button type="submit" size="sm" loading={sendingReply} disabled={!replyText.trim()} className="gap-1.5 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white">
                  <Send className="w-3.5 h-3.5" />
                  <span>Reply</span>
                </Button>
              </form>
            </>
          ) : detailLoading || (loading && conversations.length === 0) ? (
            // Never show "select a conversation" while one is on its way --
            // it reads as an empty inbox rather than a pending load.
            <LoadingPanel label="Opening conversation…" className="flex-1" />
          ) : (
            <div className="flex-1 flex items-center justify-center text-slate-400 text-xs">
              Select a conversation thread to view the live transcript.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ConversationsPage() {
  return (
    <Suspense fallback={<div className="text-center py-10">Loading conversations...</div>}>
      <LiveConversationsInbox />
    </Suspense>
  );
}
