import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { checkRateLimit } from "@/lib/security/rateLimit";
import { isSlugAllowedOnHost } from "@/lib/services/tenant/hostGuard";
import {
  isAllowedPublicOrigin,
  parseAllowedDomains,
  publicCorsPreflight,
  withPublicCors,
} from "@/lib/services/public/cors";

/**
 * Bootstrap configuration for the embedded widget. Returns only published,
 * public-safe settings: no SMTP credentials, AI keys, internal notes or
 * private identifiers ever appear here.
 */
export async function GET(req: NextRequest) {
  const origin = req.headers.get("origin");
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";

  const tenantSlug = new URL(req.url).searchParams.get("tenantSlug");

  // A connected domain answers only for its own workspace, so a customer's
  // hostname cannot be used to serve another company's bot.
  if (tenantSlug && !(await isSlugAllowedOnHost(req.headers.get("host"), tenantSlug))) {
    return NextResponse.json(
      { success: false, error: { code: "BOT_NOT_PUBLISHED", message: "This chatbot is unavailable." } },
      { status: 404 },
    );
  }

  if (!tenantSlug) {
    return NextResponse.json(
      { success: false, error: { code: "VALIDATION_ERROR", message: "Tenant slug is required." } },
      { status: 400 },
    );
  }

  // The rate-limit counter is a database write and the tenant lookup is a
  // database read; run them together rather than paying for two round trips
  // in series. This endpoint is fetched on every widget load, so the saving
  // is on the path every visitor waits for. The limit is still enforced
  // below -- the read is simply already in flight by then.
  const [allowed, tenant] = await Promise.all([
    checkRateLimit(`public-config:${ip}`, 120, 60_000),
    prisma.tenant.findFirst({
      where: { slug: tenantSlug, status: { in: ["TRIAL", "ACTIVE"] }, deletedAt: null },
      select: {
        id: true,
        name: true,
        slug: true,
        widgetSettings: true,
        flows: {
          where: { status: "PUBLISHED", isDefault: true, deletedAt: null },
          select: { id: true, name: true, version: true },
          take: 1,
        },
      },
    }),
  ]);

  if (!allowed) {
    return NextResponse.json(
      { success: false, error: { code: "RATE_LIMITED", message: "Too many requests." } },
      { status: 429 },
    );
  }

  if (!tenant || !tenant.flows[0]) {
    return NextResponse.json(
      { success: false, error: { code: "BOT_NOT_PUBLISHED", message: "This chatbot is unavailable." } },
      { status: 404 },
    );
  }

  // Uses the shared helpers so this endpoint agrees with sessions, messages,
  // uploads and sync. Its own copy compared hostnames case-sensitively, so a
  // tenant configuring "Example.com" was blocked here but allowed elsewhere.
  const allowedDomains = parseAllowedDomains(tenant.widgetSettings);
  if (!isAllowedPublicOrigin(origin, allowedDomains)) {
    return NextResponse.json(
      { success: false, error: { code: "FORBIDDEN", message: "Origin is not allowed." } },
      { status: 403 },
    );
  }

  let settings: Record<string, unknown> = {};
  try {
    settings = JSON.parse(tenant.widgetSettings || "{}");
  } catch {
    /* fall back to safe defaults */
  }

  const data = {
    tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug },
    widget: settings,
    activeFlow: tenant.flows[0],
  };
  return withPublicCors(NextResponse.json({ success: true, ...data, data }), origin, allowedDomains);
}

export function OPTIONS(req: NextRequest) {
  return publicCorsPreflight(req.headers.get("origin"));
}
