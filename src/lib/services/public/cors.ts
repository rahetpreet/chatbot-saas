import { NextResponse } from "next/server";

/**
 * Applies the same origin policy to every public widget endpoint.  The widget
 * is embedded on a customer site, so its session, message, upload, and sync
 * requests must all agree with the configuration endpoint.
 */
export function parseAllowedDomains(widgetSettings: string | null | undefined): string[] {
  try {
    const settings = JSON.parse(widgetSettings || "{}");
    return Array.isArray(settings.allowedDomains)
      ? settings.allowedDomains
          .filter((domain: unknown): domain is string => typeof domain === "string")
          .map((domain: string) => domain.trim().toLowerCase())
          .filter(Boolean)
      : [];
  } catch {
    return [];
  }
}

export function isAllowedPublicOrigin(origin: string | null, allowedDomains: string[]): boolean {
  if (!origin || allowedDomains.length === 0) return true;
  try {
    return allowedDomains.includes(new URL(origin).hostname.toLowerCase());
  } catch {
    return false;
  }
}

export function withPublicCors(response: NextResponse, origin: string | null, allowedDomains: string[]) {
  if (allowedDomains.length === 0) {
    response.headers.set("Access-Control-Allow-Origin", "*");
  } else if (origin && isAllowedPublicOrigin(origin, allowedDomains)) {
    response.headers.set("Access-Control-Allow-Origin", origin);
  }
  response.headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  response.headers.set("Access-Control-Allow-Headers", "Content-Type");
  response.headers.set("Vary", "Origin");
  return response;
}

export function publicCorsPreflight(origin: string | null) {
  // The tenant is not known during a preflight request. The actual request
  // always validates the tenant's configured domains before returning data.
  return withPublicCors(new NextResponse(null, { status: 204 }), origin, []);
}
