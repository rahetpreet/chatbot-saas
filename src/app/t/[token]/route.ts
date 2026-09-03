import { NextRequest, NextResponse } from "next/server";
import { resolveTrackingLink, trackingRedirectUrl } from "@/lib/services/tracking";
import { getAppUrl } from "@/lib/appUrl";
import { checkRateLimit } from "@/lib/security/rateLimit";

export const dynamic = "force-dynamic";

/**
 * Tracking-link entry point: /t/<token>.
 *
 * This is the URL that goes out in an SMS, email or QR code. It records the
 * open, then redirects to the chat carrying campaign, contact and UTM
 * attribution so the resulting conversation can be traced back to the exact
 * link that produced it.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const platformOrigin = getAppUrl() || `${req.headers.get("x-forwarded-proto") || "https"}://${req.headers.get("host")}`;
  const fallback = NextResponse.redirect(new URL("/", platformOrigin), 302);

  if (!token) return fallback;

  // Generous, but this is an unauthenticated endpoint that writes on every
  // request, so it must not be usable to hammer the database.
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!(await checkRateLimit(`tracking-open:${ip}`, 120, 60_000))) {
    return NextResponse.redirect(new URL("/", platformOrigin), 302);
  }

  try {
    const link = await resolveTrackingLink(token);
    // An expired, deactivated or deleted link sends the visitor somewhere
    // neutral rather than showing them an error page.
    if (!link) return fallback;

    return NextResponse.redirect(trackingRedirectUrl(link, platformOrigin), 302);
  } catch (error) {
    console.error("[tracking] could not resolve link:", error);
    return fallback;
  }
}
