import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { checkRateLimit } from "@/lib/security/rateLimit";
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
  // Generous: this is fetched once per widget load, but it is still an
  // unauthenticated endpoint that performs a database lookup.
  if (!(await checkRateLimit(`public-config:${ip}`, 120, 60_000))) {
    return NextResponse.json(
      { success: false, error: { code: "RATE_LIMITED", message: "Too many requests." } },
      { status: 429 },
    );
  }

  const tenantSlug = new URL(req.url).searchParams.get("tenantSlug");
  if (!tenantSlug) {
    return NextResponse.json(
      { success: false, error: { code: "VALIDATION_ERROR", message: "Tenant slug is required." } },
      { status: 400 },
    );
  }

  const tenant = await prisma.tenant.findFirst({
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
  });

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
