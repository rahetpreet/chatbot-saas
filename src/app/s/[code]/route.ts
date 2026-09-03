import { NextRequest, NextResponse } from "next/server";
import { resolveShortLink } from "@/lib/services/shortlink";
import { getAppUrl } from "@/lib/appUrl";

export const dynamic = "force-dynamic";

/**
 * Short-link redirect: /s/<code>.
 *
 * Kept deliberately small and dependency-free — this sits in front of every
 * SMS click, so it does one indexed lookup and a 302. The click is counted
 * without blocking the redirect.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;

  const link = code ? await resolveShortLink(code) : null;
  if (!link) {
    // 302 to the marketing root rather than a 404 page: a recipient who
    // mistypes a character should land somewhere useful, not on an error.
    return NextResponse.redirect(new URL("/", getAppUrl() || "http://localhost:3000"), 302);
  }

  return NextResponse.redirect(link.targetUrl, 302);
}
