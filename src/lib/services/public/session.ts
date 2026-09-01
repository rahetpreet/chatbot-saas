import crypto from "crypto";
import prisma from "@/lib/prisma";

export function hashPublicSessionToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export async function getPublicConversation(conversationId: unknown, sessionToken: unknown) {
  if (typeof conversationId !== "string" || typeof sessionToken !== "string" || sessionToken.length < 32) return null;
  return prisma.conversation.findFirst({ where: { id: conversationId, publicSessionTokenHash: hashPublicSessionToken(sessionToken) } });
}
