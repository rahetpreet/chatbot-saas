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
  RefreshCw,
  Clock,
  Sparkles,
  Paperclip,
} from "lucide-react";
import { formatDate } from "@/lib/utils";

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
  const transcriptEndRef = useRef<HTMLDivElement>(null);

  const fetchConversations = async (autoSelectId?: string) => {
    try {
      let url = "/api/client/conversations";
      if (statusFilter !== "ALL") url += `?status=${statusFilter}`;
      const res = await fetch(url);
      const data = await res.json();
      const list = data.conversations || [];
      setConversations(list);

      const targetId = autoSelectId || selectedConversation?.id || initialId;
      if (targetId) {
        loadConversationDetails(targetId);
      } else if (list.length > 0 && !selectedConversation) {
        loadConversationDetails(list[0].id);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const loadConversationDetails = async (id: string) => {
    try {
      const res = await fetch(`/api/client/conversations/${id}`);
      const data = await res.json();
      if (data.conversation) {
        setSelectedConversation(data.conversation);
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchConversations(initialId || undefined);
    // Poll every 5s for live incoming messages
    const timer = setInterval(() => {
      if (selectedConversation) {
        loadConversationDetails(selectedConversation.id);
      }
    }, 4000);
    return () => clearInterval(timer);
  }, [statusFilter]);

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [selectedConversation?.messages]);

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

  const filtered = conversations.filter((c) => {
    const contactName = c.campaignContact?.name || c.visitorId;
    return contactName.toLowerCase().includes(search.toLowerCase());
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
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => fetchConversations()} className="h-8 gap-1 text-xs">
            <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} />
            <span>Refresh</span>
          </Button>
        </div>
      </div>

      {/* 2-Pane Inbox Box */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-0 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden h-[calc(100vh-14rem)] min-h-[580px]">
        {/* Left Pane (4 Cols): Threads List */}
        <div className="lg:col-span-5 border-r border-slate-200 flex flex-col h-full bg-slate-50/50">
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
          <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
            {filtered.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-400">No conversations match the filter.</div>
            ) : (
              filtered.map((conv) => {
                const isSelected = selectedConversation?.id === conv.id;
                const isHandover = conv.sessionStatus === "HANDOVER";
                const isResolved = conv.sessionStatus === "RESOLVED";

                return (
                  <div
                    key={conv.id}
                    onClick={() => loadConversationDetails(conv.id)}
                    className={`p-3.5 transition-all cursor-pointer ${
                      isSelected
                        ? "bg-indigo-50/80 border-l-4 border-indigo-600"
                        : "hover:bg-slate-100/70 bg-white"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <h4 className="text-xs font-bold text-slate-900 truncate">
                        {conv.campaignContact?.name || conv.visitorId.substring(0, 14)}
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
        <div className="lg:col-span-7 flex flex-col h-full bg-white">
          {selectedConversation ? (
            <>
              {/* Transcript Header */}
              <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-white shrink-0">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-xs">
                    {(selectedConversation.campaignContact?.name || "V").charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-slate-900 leading-tight">
                      {selectedConversation.campaignContact?.name || selectedConversation.visitorId}
                    </h3>
                    <div className="flex items-center gap-2 text-[11px] text-slate-500">
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
              <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50/50">
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
