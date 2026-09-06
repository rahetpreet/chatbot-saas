import prisma from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

/**
 * The analytics event vocabulary.
 *
 * Reports are only ever as good as the events underneath them, so the list is
 * closed and named in one place: a typo in an event string does not fail, it
 * silently produces a funnel step that is always zero.
 */
export const EVENT = {
  LINK_OPENED: "LINK_OPENED",
  CHATBOT_OPENED: "CHATBOT_OPENED",
  SESSION_STARTED: "SESSION_STARTED",
  CONVERSATION_STARTED: "CONVERSATION_STARTED",
  NODE_ENTERED: "NODE_ENTERED",
  NODE_COMPLETED: "NODE_COMPLETED",
  NODE_ABANDONED: "NODE_ABANDONED",
  BUTTON_CLICKED: "BUTTON_CLICKED",
  INPUT_STARTED: "INPUT_STARTED",
  INPUT_SUBMITTED: "INPUT_SUBMITTED",
  FORM_STARTED: "FORM_STARTED",
  FORM_COMPLETED: "FORM_COMPLETED",
  LEAD_CREATED: "LEAD_CREATED",
  FILE_UPLOADED: "FILE_UPLOADED",
  REDIRECT_CLICKED: "REDIRECT_CLICKED",
  AI_REQUEST: "AI_REQUEST",
  AI_RESPONSE: "AI_RESPONSE",
  AI_FALLBACK: "AI_FALLBACK",
  AI_ERROR: "AI_ERROR",
  HUMAN_HANDOFF: "HUMAN_HANDOFF",
  CONVERSATION_COMPLETED: "CONVERSATION_COMPLETED",
} as const;

export type EventType = (typeof EVENT)[keyof typeof EVENT];

/** The ordered funnel the Overview screen draws. */
export const FUNNEL_STEPS: Array<{ key: string; label: string; event: EventType }> = [
  { key: "linksOpened", label: "Links opened", event: EVENT.LINK_OPENED },
  { key: "chatbotOpened", label: "Chatbot opened", event: EVENT.CHATBOT_OPENED },
  { key: "conversationsStarted", label: "Conversation started", event: EVENT.CONVERSATION_STARTED },
  { key: "firstAnswer", label: "First question answered", event: EVENT.INPUT_SUBMITTED },
  { key: "formsStarted", label: "Lead form started", event: EVENT.FORM_STARTED },
  { key: "formsCompleted", label: "Lead form completed", event: EVENT.FORM_COMPLETED },
  { key: "leads", label: "Lead created", event: EVENT.LEAD_CREATED },
];

/**
 * The human-readable name of a flow node.
 *
 * Reports show these labels to clients, so they are captured at the moment the
 * event happens rather than looked up later: renaming a node next month must
 * not silently retitle last month's chart.
 */
export function nodeLabel(node: { data?: { label?: string } } | null | undefined): string | null {
  const label = node?.data?.label;
  return typeof label === "string" && label.trim() ? label.trim() : null;
}

/** The node's kind ("buttons", "input", …), used to group like with like. */
export function nodeKind(node: { data?: { nodeType?: string }; type?: string } | null | undefined): string | null {
  return node?.data?.nodeType || node?.type || null;
}

export interface EventInput {
  tenantId: string;
  eventType: EventType;
  flowId?: string | null;
  flowVersion?: number | null;
  conversationId?: string | null;
  visitorId?: string | null;
  campaignId?: string | null;
  trackingLinkId?: string | null;
  contactId?: string | null;
  leadId?: string | null;
  nodeId?: string | null;
  nodeType?: string | null;
  optionLabel?: string | null;
  metadata?: Record<string, unknown> | null;
}

/** Trims free text so one oversized answer cannot bloat the events table. */
const short = (value: unknown, max = 240): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : null;
};

function toRow(input: EventInput): Prisma.AnalyticsEventCreateManyInput {
  return {
    tenantId: input.tenantId,
    eventType: input.eventType,
    flowId: input.flowId ?? null,
    flowVersion: input.flowVersion ?? null,
    conversationId: input.conversationId ?? null,
    visitorId: short(input.visitorId, 128),
    campaignId: input.campaignId ?? null,
    trackingLinkId: input.trackingLinkId ?? null,
    contactId: input.contactId ?? null,
    leadId: input.leadId ?? null,
    nodeId: input.nodeId ?? null,
    nodeType: short(input.nodeType, 64),
    optionLabel: short(input.optionLabel),
    metadata: input.metadata ? JSON.stringify(input.metadata).slice(0, 4000) : null,
  };
}

/**
 * Records events.
 *
 * Analytics must never take the product down with it: a failed write here is
 * swallowed, because losing one funnel data point is vastly preferable to a
 * visitor's message failing to send. The failure is logged so it is still
 * visible in the platform logs rather than truly silent.
 *
 * Note this is awaited by its callers rather than fired and forgotten. On
 * serverless the function is frozen the moment a response is returned, so an
 * un-awaited promise is simply never delivered — which is exactly how the
 * short-link click counter lost every click before it was fixed.
 */
export async function recordEvents(events: EventInput[]): Promise<void> {
  if (!events.length) return;
  try {
    await prisma.analyticsEvent.createMany({ data: events.map(toRow) });
  } catch (error) {
    console.error("[analytics] failed to record events", error);
  }
}

export async function recordEvent(event: EventInput): Promise<void> {
  await recordEvents([event]);
}

/**
 * Records events inside a caller's transaction.
 *
 * Used where the event and the thing it describes must both exist or neither
 * does — a LEAD_CREATED event with no lead would overstate conversion forever.
 */
export async function recordEventsTx(
  tx: Prisma.TransactionClient,
  events: EventInput[],
): Promise<void> {
  if (!events.length) return;
  await tx.analyticsEvent.createMany({ data: events.map(toRow) });
}
