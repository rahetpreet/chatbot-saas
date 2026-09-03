"use client";

import React, { useState, useEffect, useRef } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { RefreshCw, Send, Bot, User, Sparkles, CheckCircle2, Paperclip } from "lucide-react";
import { FlowNodeData } from "@/types";

interface FlowSimulatorModalProps {
  isOpen: boolean;
  onClose: () => void;
  flowId: string;
  nodes: any[];
  edges: any[];
  tenantSlug?: string;
}

export function FlowSimulatorModal({ isOpen, onClose, flowId, nodes, edges, tenantSlug }: FlowSimulatorModalProps) {
  const [messages, setMessages] = useState<Array<{ role: "bot" | "user"; text: string; mediaUrl?: string; mediaType?: string }>>([]);
  const [currentNodeId, setCurrentNodeId] = useState<string | null>(null);
  const [interactiveNode, setInteractiveNode] = useState<any | null>(null);
  const [collectedData, setCollectedData] = useState<Record<string, any>>({});
  const [sessionStatus, setSessionStatus] = useState<string>("ACTIVE");
  const [inputValue, setInputValue] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    if (isOpen) {
      handleRestart();
    }
  }, [isOpen]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, interactiveNode]);

  const handleRestart = async () => {
    setMessages([]);
    setCurrentNodeId(null);
    setInteractiveNode(null);
    setCollectedData({});
    setSessionStatus("ACTIVE");
    setErrorText(null);
    setInputValue("");
    setLoading(true);

    try {
      const res = await fetch(`/api/client/chatbots/${flowId}/simulate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nodes,
          edges,
          state: {
            currentNodeId: null,
            collectedData: {},
            sessionStatus: "ACTIVE",
            history: [],
          },
        }),
      });

      const data = await res.json();
      if (data.success && data.result) {
        await new Promise((resolve) => setTimeout(resolve, 1500));
        const botMsgs = (data.result.botMessages || []).map((m: any) => ({
          role: "bot" as const,
          text: m.text,
          mediaUrl: m.mediaUrl,
          mediaType: m.mediaType,
        }));
        setMessages(botMsgs);
        setCurrentNodeId(data.result.currentNodeId);
        setInteractiveNode(data.result.interactiveNode);
        setCollectedData(data.result.updatedCollectedData || {});
        setSessionStatus(data.result.sessionStatus);
      }
    } catch (e: any) {
      setErrorText("Failed to start simulator session.");
    } finally {
      setLoading(false);
    }
  };

  const handleSendInput = async (input: { type: "text" | "button_click" | "form_submit" | "attachment_upload"; value: any; label?: string; buttonId?: string }) => {
    if (loading) return;

    setErrorText(null);
    const displayText = input.label || (typeof input.value === "string" ? input.value : "Submitted");

    // Add user message to UI
    setMessages((prev) => [...prev, { role: "user", text: displayText }]);
    setLoading(true);
    setInputValue("");

    try {
      const res = await fetch(`/api/client/chatbots/${flowId}/simulate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nodes,
          edges,
          state: {
            currentNodeId,
            collectedData,
            sessionStatus,
            history: messages.map((m) => ({
              role: m.role === "bot" ? "assistant" : "user",
              content: m.text,
            })),
          },
          userInput: input,
        }),
      });

      const data = await res.json();
      if (data.success && data.result) {
        if (data.result.error) {
          setErrorText(data.result.error);
        }

        await new Promise((resolve) => setTimeout(resolve, 1500));
        const newBotMsgs = (data.result.botMessages || []).map((m: any) => ({
          role: "bot" as const,
          text: m.text,
          mediaUrl: m.mediaUrl,
          mediaType: m.mediaType,
        }));

        setMessages((prev) => [...prev, ...newBotMsgs]);
        setCurrentNodeId(data.result.currentNodeId);
        setInteractiveNode(data.result.interactiveNode);
        setCollectedData(data.result.updatedCollectedData || {});
        setSessionStatus(data.result.sessionStatus);
      } else {
        setErrorText(data.error || "Simulation error");
      }
    } catch (err: any) {
      setErrorText("Failed to advance flow step.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Interactive Flow Simulator" maxWidth="4xl">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 h-[560px]">
        {/* Left 2 Cols: Chat Simulator Canvas */}
        <div className="md:col-span-2 flex flex-col rounded-xl border border-slate-200 bg-slate-50 overflow-hidden">
          {/* Simulator Bar */}
          <div className="bg-white px-4 py-2.5 border-b border-slate-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-xs font-bold text-slate-800">Test Simulation Playground</span>
              <span className="text-[10px] bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded font-mono font-bold">
                Status: {sessionStatus}
              </span>
            </div>
            <Button size="sm" variant="outline" onClick={handleRestart} disabled={loading} className="h-7 text-xs gap-1">
              <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} />
              <span>Restart</span>
            </Button>
          </div>

          {/* Chat Messages Body */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.map((msg, idx) => (
              <div
                key={idx}
                className={`flex gap-2.5 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                {msg.role === "bot" && (
                  <div className="w-7 h-7 rounded-full bg-indigo-600 text-white flex items-center justify-center shrink-0 text-xs shadow-sm">
                    <Bot className="w-4 h-4" />
                  </div>
                )}
                <div
                  className={`max-w-[80%] rounded-2xl px-3.5 py-2.5 text-xs shadow-xs ${
                    msg.role === "user"
                      ? "bg-indigo-600 text-white rounded-br-xs"
                      : "bg-white text-slate-800 border border-slate-200/80 rounded-bl-xs"
                  }`}
                >
                  <p className="whitespace-pre-wrap">{msg.text}</p>
                  {msg.mediaUrl && (
                    <div className="mt-2 rounded-lg overflow-hidden border border-slate-200">
                      {msg.mediaType === "image" && (
                        <img src={msg.mediaUrl} alt="attachment" className="max-h-40 w-full object-cover" />
                      )}
                    </div>
                  )}
                </div>
                {msg.role === "user" && (
                  <div className="w-7 h-7 rounded-full bg-slate-800 text-white flex items-center justify-center shrink-0 text-xs shadow-sm">
                    <User className="w-4 h-4" />
                  </div>
                )}
              </div>
            ))}

            {loading && (
              <div className="flex items-center gap-2 text-xs text-slate-400 italic">
                <span className="w-2 h-2 rounded-full bg-indigo-500 animate-bounce" />
                <span className="w-2 h-2 rounded-full bg-indigo-500 animate-bounce [animation-delay:0.2s]" />
                <span className="w-2 h-2 rounded-full bg-indigo-500 animate-bounce [animation-delay:0.4s]" />
                <span>Assistant is typing...</span>
              </div>
            )}

            {/* Interactive Node Options */}
            {interactiveNode && !loading && (
              <div className="mt-3 pt-2">
                {/* 1. Buttons Node */}
                {(interactiveNode.data?.nodeType === "buttons" || interactiveNode.type === "buttons") && (
                  <div className="flex flex-wrap gap-2">
                    {(interactiveNode.data?.options || []).map((opt: any, i: number) => (
                      <button
                        key={opt.id || i}
                        onClick={() =>
                          handleSendInput({
                            type: "button_click",
                            value: opt.value || opt.label,
                            label: opt.label,
                            buttonId: opt.id,
                          })
                        }
                        className="bg-white hover:bg-indigo-600 border-2 border-indigo-500 hover:border-indigo-600 text-indigo-700 hover:text-white text-xs font-bold px-4 py-2 rounded-full shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all active:scale-95 cursor-pointer"
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                )}

                {/* 2. Attachment upload mock */}
                {(interactiveNode.data?.nodeType === "attachment" || interactiveNode.type === "attachment") && (
                  <div className="bg-purple-50 border border-purple-200 rounded-xl p-3 text-center">
                    <p className="text-xs text-purple-900 font-semibold mb-2">
                      {interactiveNode.data?.uploadPrompt || "Upload document or screenshot"}
                    </p>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        handleSendInput({
                          type: "attachment_upload",
                          value: { name: "sample_doc.pdf", url: "/sample.pdf", size: 102400 },
                          label: "Uploaded sample_doc.pdf",
                        })
                      }
                      className="text-xs gap-1 border-purple-300 text-purple-700 hover:bg-purple-100"
                    >
                      <Paperclip className="w-3.5 h-3.5" />
                      <span>Simulate File Upload</span>
                    </Button>
                  </div>
                )}
              </div>
            )}

            {errorText && (
              <div className="p-2 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium">
                {errorText}
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Waiting for Input Banner */}
          {interactiveNode && (interactiveNode.data?.nodeType === "input" || interactiveNode.type === "input") && !loading && (
            <div className="px-3 py-1.5 bg-amber-50 border-t border-amber-200 flex items-center justify-between text-xs text-amber-900">
              <span className="font-semibold flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-amber-600" />
                <span>Waiting for input: <strong>{interactiveNode.data?.label || interactiveNode.data?.inputType || "text"}</strong></span>
              </span>
              <span className="font-mono text-[10px] bg-amber-200/80 text-amber-950 px-2 py-0.5 rounded font-bold">
                ${"{" + (interactiveNode.data?.inputKey || "answer") + "}"}
              </span>
            </div>
          )}

          {/* Chat Input Bar */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (inputValue.trim()) {
                handleSendInput({ type: "text", value: inputValue.trim() });
              }
            }}
            className="p-3 bg-white border-t border-slate-200 flex items-center gap-2"
          >
            <input
              type="text"
              placeholder={
                interactiveNode?.data?.inputPlaceholder ||
                (sessionStatus === "RESOLVED" ? "Conversation finished." : "Type a response...")
              }
              disabled={loading || sessionStatus === "RESOLVED"}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              className="flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <Button
              type="submit"
              size="sm"
              disabled={loading || !inputValue.trim() || sessionStatus === "RESOLVED"}
              className="h-8 px-3"
            >
              <Send className="w-3.5 h-3.5" />
            </Button>
          </form>
        </div>

        {/* Right Col: Live Variable & State Inspector */}
        <div className="flex flex-col rounded-xl border border-slate-200 bg-white p-3.5 overflow-hidden">
          <div className="flex items-center gap-2 pb-2 border-b border-slate-100 mb-3">
            <Sparkles className="w-4 h-4 text-indigo-600" />
            <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">Variable Inspector</h4>
          </div>

          <div className="flex-1 overflow-y-auto space-y-3">
            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                Current Node ID
              </span>
              <div className="bg-slate-50 border border-slate-200 rounded p-1.5 font-mono text-[11px] text-slate-700 truncate">
                {currentNodeId || "Start Node"}
              </div>
            </div>

            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                Captured Variables ({Object.keys(collectedData).length})
              </span>

              {Object.keys(collectedData).length === 0 ? (
                <p className="text-xs text-slate-400 italic p-2 bg-slate-50 rounded border border-slate-100">
                  No variables captured yet. As visitor answers questions, keys will appear here.
                </p>
              ) : (
                <div className="space-y-1.5">
                  {Object.entries(collectedData).map(([k, v]) => (
                    <div key={k} className="p-2 rounded-lg bg-indigo-50/60 border border-indigo-100 text-xs">
                      <span className="font-mono font-bold text-indigo-700 block">${"{" + k + "}"}</span>
                      <span className="text-slate-800 font-medium break-all">
                        {typeof v === "object" ? JSON.stringify(v) : String(v)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
}
