"use client";

import React, { useEffect, useState } from "react";
import { Spinner } from "@/components/ui/Loading";
import { X, MousePointerClick, MessageSquare, UserCheck, Link2, FileText, Bot, Upload, Flag } from "lucide-react";

/**
 * One person's complete history with the chatbot.
 *
 * Opened from a lead, a contact or a conversation. Events are shown exactly as
 * they were recorded, in order, with nothing inferred to fill gaps — a journey
 * with a missing middle is telling you something real about your tracking.
 */

const LABELS: Record<string, string> = {
  LINK_OPENED: "Campaign link opened",
  CHATBOT_OPENED: "Chatbot opened",
  SESSION_STARTED: "Session started",
  CONVERSATION_STARTED: "Conversation started",
  NODE_ENTERED: "Reached step",
  NODE_COMPLETED: "Completed step",
  BUTTON_CLICKED: "Selected",
  INPUT_STARTED: "Shown question",
  INPUT_SUBMITTED: "Answered",
  FORM_STARTED: "Started the form",
  FORM_COMPLETED: "Completed the form",
  LEAD_CREATED: "Became a lead",
  FILE_UPLOADED: "Uploaded a file",
  AI_REQUEST: "Asked the AI",
  AI_RESPONSE: "AI answered",
  AI_FALLBACK: "AI handed over",
  HUMAN_HANDOFF: "Passed to an agent",
  CONVERSATION_COMPLETED: "Conversation finished",
};

const ICONS: Record<string, any> = {
  LINK_OPENED: Link2,
  CHATBOT_OPENED: MessageSquare,
  BUTTON_CLICKED: MousePointerClick,
  INPUT_SUBMITTED: FileText,
  FORM_COMPLETED: FileText,
  LEAD_CREATED: UserCheck,
  FILE_UPLOADED: Upload,
  AI_RESPONSE: Bot,
  AI_FALLBACK: Bot,
  HUMAN_HANDOFF: UserCheck,
  CONVERSATION_COMPLETED: Flag,
};

/** Steps that only matter in aggregate would make a personal timeline noise. */
const HIDDEN = new Set(["SESSION_STARTED", "NODE_ENTERED", "NODE_COMPLETED", "INPUT_STARTED", "AI_REQUEST"]);

export function JourneyPanel({
  leadId,
  contactId,
  conversationId,
  onClose,
}: {
  leadId?: string;
  contactId?: string;
  conversationId?: string;
  onClose: () => void;
}) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showAll, setShowAll] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams();
    if (leadId) params.set("leadId", leadId);
    if (contactId) params.set("contactId", contactId);
    if (conversationId) params.set("conversationId", conversationId);

    setLoading(true);
    fetch(`/api/client/analytics/journey?${params}`)
      .then((res) => res.json())
      .then((json) => {
        if (json.success) setData(json.data);
        else setError(json.error?.message || "Could not load this journey.");
      })
      .catch(() => setError("Could not reach the server."))
      .finally(() => setLoading(false));
  }, [leadId, contactId, conversationId]);

  const all = data?.entries || [];
  const entries = showAll ? all : all.filter((entry: any) => !HIDDEN.has(entry.event));
  const subject = data?.subject;
  const person = subject?.lead || subject?.contact;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/40" onClick={onClose}>
      <div
        className="flex h-full w-full max-w-lg flex-col bg-white shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between border-b border-slate-200 px-4 py-3">
          <div className="min-w-0">
            <h2 className="text-sm font-bold text-slate-900">Full journey</h2>
            <p className="truncate text-xs text-slate-500">
              {person?.name || person?.email || person?.phone || "Anonymous visitor"}
              {subject?.lead?.status ? ` · ${subject.lead.status}` : ""}
            </p>
          </div>
          <button onClick={onClose} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3">
          {loading ? (
            <div className="flex items-center gap-2 py-8 text-sm text-slate-500">
              <Spinner /> Loading journey…
            </div>
          ) : error ? (
            <p className="py-8 text-center text-sm text-red-600">{error}</p>
          ) : !all.length ? (
            <p className="py-8 text-center text-sm text-slate-500">
              No tracked activity for this person yet. Journeys are recorded from the point event tracking was
              switched on.
            </p>
          ) : (
            <ol className="relative space-y-0">
              {entries.map((entry: any, index: number) => {
                const Icon = ICONS[entry.event] || MessageSquare;
                const isLast = index === entries.length - 1;
                return (
                  <li key={`${entry.at}-${index}`} className="relative flex gap-3 pb-4">
                    {!isLast && <span className="absolute left-[11px] top-6 h-full w-px bg-slate-200" />}
                    <span
                      className={`relative z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
                        entry.event === "LEAD_CREATED"
                          ? "bg-emerald-100 text-emerald-700"
                          : entry.event === "HUMAN_HANDOFF"
                            ? "bg-amber-100 text-amber-700"
                            : "bg-slate-100 text-slate-600"
                      }`}
                    >
                      <Icon className="h-3 w-3" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-slate-900">
                        {LABELS[entry.event] || entry.event}
                        {entry.label && <span className="ml-1 font-normal text-slate-600">— {entry.label}</span>}
                      </p>
                      <p className="mt-0.5 text-[11px] text-slate-400">
                        {new Date(entry.at).toLocaleString()}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </div>

        {all.length > entries.length && (
          <div className="border-t border-slate-200 px-4 py-2">
            <button
              onClick={() => setShowAll(true)}
              className="text-xs font-semibold text-indigo-600 hover:underline"
            >
              Show all {all.length} recorded events
            </button>
          </div>
        )}
        {showAll && (
          <div className="border-t border-slate-200 px-4 py-2">
            <button
              onClick={() => setShowAll(false)}
              className="text-xs font-semibold text-slate-500 hover:underline"
            >
              Show key moments only
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
