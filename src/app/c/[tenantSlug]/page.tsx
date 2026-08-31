"use client";

import React, { useState, useEffect, useRef, Suspense, use } from "react";
import { useSearchParams } from "next/navigation";
import { Bot, User, Send, Paperclip, Sparkles, RefreshCw, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/Button";

function CampaignChatContainer({ tenantSlug }: { tenantSlug: string }) {
  const searchParams = useSearchParams();
  const campaignSlug = searchParams.get("campaign") || "";
  const contactSlug = searchParams.get("contact") || "";
  const flowParam = searchParams.get("flow") || searchParams.get("flowId") || "";

  const [widgetConfig, setWidgetConfig] = useState<any>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [sessionStatus, setSessionStatus] = useState<string>("ACTIVE");
  const [messages, setMessages] = useState<any[]>([]);
  const [interactiveNode, setInteractiveNode] = useState<any | null>(null);
  const [inputValue, setInputValue] = useState("");
  const [loading, setLoading] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, interactiveNode, loading]);

  useEffect(() => {
    initializeChat();
  }, [tenantSlug, campaignSlug, contactSlug]);

  const initializeChat = async () => {
    setIsInitializing(true);
    try {
      // 1. Fetch tenant widget configuration
      const configRes = await fetch(`/api/widget/config?tenantSlug=${tenantSlug}`);
      const configData = await configRes.json();
      if (configData.success && configData.widget) {
        setWidgetConfig(configData.widget);
      }

      // 2. Generate or fetch visitor UUID
      const storageKey = `chatflow_${tenantSlug}_${flowParam || "default"}_vis`;
      let visitorId = localStorage.getItem(storageKey);
      if (!visitorId) {
        visitorId = "vis_" + Math.random().toString(36).substring(2, 10) + "_" + Date.now();
        localStorage.setItem(storageKey, visitorId);
      }

      // 3. Initialize / Restore session
      const sessionRes = await fetch("/api/widget/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantSlug,
          visitorId,
          campaignSlug,
          contactSlug,
          referrer: document.referrer,
          device: window.innerWidth < 768 ? "mobile" : "desktop",
          flowId: flowParam || undefined,
        }),
      });

      const sessionData = await sessionRes.json();
      if (sessionData.success) {
        setConversationId(sessionData.conversationId);
        setSessionStatus(sessionData.sessionStatus);
        setMessages(sessionData.messages || []);
        setInteractiveNode(sessionData.interactiveNode);
      }
    } catch (e) {
      console.error("Init chat error:", e);
    } finally {
      setIsInitializing(false);
    }
  };

  const handleSendMessage = async (inputObj: {
    type: "text" | "button_click" | "form_submit" | "attachment_upload";
    value: any;
    label?: string;
    buttonId?: string;
  }) => {
    if (!conversationId || loading) return;

    const userDisplayText = inputObj.label || (typeof inputObj.value === "string" ? inputObj.value : "Submitted file");

    // Optimistically add user message
    setMessages((prev) => [
      ...prev,
      {
        id: `temp-${Date.now()}`,
        senderType: "VISITOR",
        content: userDisplayText,
        timestamp: new Date().toISOString(),
      },
    ]);

    setLoading(true);
    setInputValue("");

    try {
      const res = await fetch("/api/widget/message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId,
          userInput: inputObj,
        }),
      });

      const data = await res.json();
      
      // Add typing animation delay (1.5s)
      await new Promise((resolve) => setTimeout(resolve, 1500));

      if (data.success) {
        setSessionStatus(data.sessionStatus);
        setInteractiveNode(data.interactiveNode);
        if (data.botMessages && data.botMessages.length > 0) {
          setMessages((prev) => [...prev, ...data.botMessages]);
        }
      }
    } catch {
      alert("Message sending failed. Please check network connection.");
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !conversationId) return;

    const formData = new FormData();
    formData.append("file", file);
    formData.append("tenantSlug", tenantSlug);
    formData.append("conversationId", conversationId);

    setLoading(true);
    try {
      const res = await fetch("/api/widget/upload", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (data.success && data.file) {
        handleSendMessage({
          type: "attachment_upload",
          value: data.file,
          label: `📎 Uploaded ${data.file.name}`,
        });
      }
    } catch {
      alert("File upload failed.");
    } finally {
      setLoading(false);
    }
  };

  const primaryColor = widgetConfig?.primaryColor || "#4f46e5";

  if (isInitializing) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900 text-white">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-sm font-semibold text-slate-300">Loading conversation...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-0 sm:p-4 md:p-6">
      <div className="w-full max-w-2xl h-screen sm:h-[820px] bg-white sm:rounded-3xl shadow-2xl flex flex-col overflow-hidden border border-slate-200/80">
        {/* Header */}
        <div
          className="p-4 sm:p-5 text-white flex items-center justify-between shadow-md shrink-0"
          style={{ background: primaryColor }}
        >
          <div className="flex items-center gap-3">
            <img
              src={widgetConfig?.avatarUrl || `https://api.dicebear.com/7.x/bottts/svg?seed=${tenantSlug}`}
              alt="Bot Avatar"
              className="w-10 h-10 rounded-full bg-white p-0.5 shadow-sm"
            />
            <div>
              <h2 className="font-bold text-base text-white leading-tight">
                {widgetConfig?.botName || "Interactive Assistant"}
              </h2>
              <p className="text-xs text-indigo-100 flex items-center gap-1.5 opacity-90">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span>{widgetConfig?.botSubtitle || "Typically replies in seconds"}</span>
              </p>
            </div>
          </div>

          <button
            onClick={initializeChat}
            className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors"
            title="Restart conversation"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

        {/* Message Feed */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 bg-slate-50">
          {messages.map((msg, idx) => {
            const isBot = msg.senderType === "BOT" || msg.senderType === "AI" || msg.senderType === "AGENT";
            let atts = [];
            try {
              if (msg.attachments) {
                atts = typeof msg.attachments === "string" ? JSON.parse(msg.attachments) : msg.attachments;
              }
            } catch {}

            return (
              <div key={msg.id || idx} className={`flex gap-3 ${isBot ? "justify-start" : "justify-end"}`}>
                {isBot && (
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center text-white shrink-0 text-xs shadow-sm"
                    style={{ background: primaryColor }}
                  >
                    <Bot className="w-4 h-4" />
                  </div>
                )}

                <div
                  className={`max-w-[85%] sm:max-w-[75%] rounded-2xl px-4 py-3 text-sm shadow-xs ${
                    !isBot
                      ? "text-white rounded-br-xs font-medium"
                      : "bg-white text-slate-800 border border-slate-200/80 rounded-bl-xs"
                  }`}
                  style={!isBot ? { background: primaryColor } : {}}
                >
                  <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>

                  {atts.map((att: any, i: number) => (
                    <div key={i} className="mt-2 rounded-lg overflow-hidden border border-slate-200">
                      {att.type === "image" || /\.(jpg|png|gif|webp)$/i.test(att.url) ? (
                        <img src={att.url} alt="Attachment" className="max-h-56 w-full object-cover" />
                      ) : (
                        <a
                          href={att.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-2 bg-slate-100 flex items-center gap-2 text-xs font-semibold text-indigo-600 hover:underline"
                        >
                          <Paperclip className="w-3.5 h-3.5" />
                          <span>View {att.name || "Attachment"}</span>
                        </a>
                      )}
                    </div>
                  ))}
                </div>

                {!isBot && (
                  <div className="w-8 h-8 rounded-full bg-slate-800 text-white flex items-center justify-center shrink-0 text-xs shadow-sm">
                    <User className="w-4 h-4" />
                  </div>
                )}
              </div>
            );
          })}

          {loading && (
            <div className="flex items-center gap-2 text-xs text-slate-400 italic">
              <span className="w-2 h-2 rounded-full bg-indigo-500 animate-bounce" />
              <span className="w-2 h-2 rounded-full bg-indigo-500 animate-bounce [animation-delay:0.2s]" />
              <span className="w-2 h-2 rounded-full bg-indigo-500 animate-bounce [animation-delay:0.4s]" />
              <span>Assistant is typing...</span>
            </div>
          )}

          {/* Interactive Option Buttons */}
          {interactiveNode && !loading && (
            <div className="pt-2">
              {(interactiveNode.data?.nodeType === "buttons" || interactiveNode.type === "buttons") && (
                <div className="flex flex-wrap gap-2 animate-fade-in">
                  {(interactiveNode.data?.options || []).map((opt: any, i: number) => (
                    <button
                      key={opt.id || i}
                      onClick={() =>
                        handleSendMessage({
                          type: "button_click",
                          value: opt.value || opt.label,
                          label: opt.label,
                          buttonId: opt.id,
                        })
                      }
                      className="bg-white hover:bg-slate-50 border border-slate-200 hover:border-indigo-500 text-slate-700 hover:text-indigo-600 font-medium text-xs sm:text-sm px-4 py-2.5 rounded-full shadow-sm hover:shadow transition-all duration-200 active:scale-[0.97] cursor-pointer"
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Footer Input Form */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (inputValue.trim()) {
              handleSendMessage({ type: "text", value: inputValue.trim() });
            }
          }}
          className="p-3 sm:p-4 bg-white border-t border-slate-200 flex items-center gap-2"
        >
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileUpload}
            style={{ display: "none" }}
          />

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={loading || sessionStatus === "RESOLVED"}
            className="p-2.5 rounded-full text-slate-500 hover:bg-slate-100 disabled:opacity-40 transition-colors"
            title="Attach file"
          >
            <Paperclip className="w-5 h-5" />
          </button>

          <input
            type="text"
            placeholder={
              interactiveNode?.data?.inputPlaceholder ||
              (sessionStatus === "RESOLVED" ? "This conversation has ended." : "Type a response...")
            }
            disabled={loading || sessionStatus === "RESOLVED"}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            className="flex-1 rounded-full border border-slate-300 px-4 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />

          <Button
            type="submit"
            size="md"
            disabled={loading || !inputValue.trim() || sessionStatus === "RESOLVED"}
            className="rounded-full px-4 h-10 shadow-md font-bold"
            style={{ background: primaryColor }}
          >
            <Send className="w-4 h-4" />
          </Button>
        </form>
      </div>
    </div>
  );
}

export default function CampaignChatPage({ params }: { params: Promise<{ tenantSlug: string }> }) {
  const resolvedParams = use(params);
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-900" />}>
      <CampaignChatContainer tenantSlug={resolvedParams.tenantSlug} />
    </Suspense>
  );
}
