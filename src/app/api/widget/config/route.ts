import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

function cors(response: NextResponse, origin: string | null, allowedDomains: string[]) {
  if (origin && allowedDomains.some((domain) => domain === new URL(origin).hostname)) response.headers.set("Access-Control-Allow-Origin", origin);
  response.headers.set("Vary", "Origin");
  response.headers.set("Access-Control-Allow-Methods", "GET, OPTIONS");
  return response;
}

export async function GET(req: NextRequest) {
  const tenantSlug = new URL(req.url).searchParams.get("tenantSlug");
  if (!tenantSlug) return NextResponse.json({ success: false, error: { code: "VALIDATION_ERROR", message: "Tenant slug is required." } }, { status: 400 });
  const tenant = await prisma.tenant.findFirst({ where: { slug: tenantSlug, status: { in: ["TRIAL", "ACTIVE"] }, deletedAt: null }, select: { id: true, name: true, slug: true, widgetSettings: true, flows: { where: { status: "PUBLISHED", isDefault: true, deletedAt: null }, select: { id: true, name: true, version: true }, take: 1 } } });
  if (!tenant || !tenant.flows[0]) return NextResponse.json({ success: false, error: { code: "BOT_DISABLED", message: "This chatbot is unavailable." } }, { status: 404 });
  let settings: Record<string, unknown> = {};
  try { settings = JSON.parse(tenant.widgetSettings || "{}"); } catch { /* use safe defaults */ }
  const allowedDomains = Array.isArray(settings.allowedDomains) ? settings.allowedDomains.filter((item): item is string => typeof item === "string") : [];
  const origin = req.headers.get("origin");
  if (origin && !allowedDomains.includes(new URL(origin).hostname)) return NextResponse.json({ success: false, error: { code: "FORBIDDEN", message: "Origin is not allowed." } }, { status: 403 });
  return cors(NextResponse.json({ success: true, data: { tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug }, widget: settings, activeFlow: tenant.flows[0] } }), origin, allowedDomains);
}

export function OPTIONS(req: NextRequest) { return cors(new NextResponse(null, { status: 204 }), req.headers.get("origin"), []); }
