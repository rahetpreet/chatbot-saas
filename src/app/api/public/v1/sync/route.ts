import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getPublicConversation } from "@/lib/services/public/session";
import { checkRateLimit } from "@/lib/security/rateLimit";
import prismaTenant from "@/lib/prisma";
import { isAllowedPublicOrigin, parseAllowedDomains, publicCorsPreflight, withPublicCors } from "@/lib/services/public/cors";

export async function GET(req: NextRequest) {
  const origin = req.headers.get("origin");
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!(await checkRateLimit(`public-sync:${ip}`, 60, 60_000))) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const { searchParams } = new URL(req.url);
  const conversation = await getPublicConversation(searchParams.get("conversationId"), searchParams.get("sessionToken"));
  if (!conversation) return NextResponse.json({ error: "Chat session not found" }, { status: 404 });
  const tenant = await prismaTenant.tenant.findUnique({ where: { id: conversation.tenantId }, select: { widgetSettings: true } });
  const allowedDomains = parseAllowedDomains(tenant?.widgetSettings);
  if (!isAllowedPublicOrigin(origin, allowedDomains)) return NextResponse.json({ error: "Origin is not allowed" }, { status: 403 });
  const messages = await prisma.message.findMany({ where: { conversationId: conversation.id }, orderBy: { timestamp: "asc" } });
  return withPublicCors(NextResponse.json({ success: true, sessionStatus: conversation.sessionStatus, messages, lastActiveAt: conversation.lastActiveAt }), origin, allowedDomains);
}

export function OPTIONS(req: NextRequest) {
  return publicCorsPreflight(req.headers.get("origin"));
}
