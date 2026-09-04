import prisma from "@/lib/prisma";
import type { JWTPayload } from "@/types";

/**
 * Agents are limited to conversations that asked for a person.
 *
 * Enforced on the server rather than by hiding rows in the agent UI: an agent
 * holds a real session and can call the API directly, so a client-side filter
 * would be decoration rather than a boundary.
 *
 * Recently resolved conversations stay reachable for a short window so an
 * agent can see the reply they just sent.
 */
const RESOLVED_GRACE_MINUTES = 30;

export function isAgentOnly(session: JWTPayload): boolean {
  return session.role === "CLIENT_AGENT";
}

/** Extra where-clause an agent's queries must carry. */
export function agentConversationFilter(session: JWTPayload): Record<string, unknown> {
  if (!isAgentOnly(session)) return {};
  return {
    OR: [
      { sessionStatus: "HANDOVER" },
      {
        sessionStatus: "RESOLVED",
        lastActiveAt: { gte: new Date(Date.now() - RESOLVED_GRACE_MINUTES * 60_000) },
      },
    ],
  };
}

/** Throws when an agent reaches for a conversation outside their queue. */
export async function assertAgentMayAccess(session: JWTPayload, conversationId: string): Promise<void> {
  if (!isAgentOnly(session)) return;

  const conversation = await prisma.conversation.findFirst({
    where: { id: conversationId, ...agentConversationFilter(session) },
    select: { id: true },
  });

  if (!conversation) {
    // Same message whether it does not exist or is simply not theirs, so the
    // queue cannot be probed for which conversations exist.
    throw new Error("Conversation not found");
  }
}
