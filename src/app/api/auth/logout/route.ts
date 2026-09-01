import { NextResponse } from "next/server";
import { AUTH_COOKIE_NAME, IMPERSONATION_COOKIE_NAME, getPrimarySession, getSession, invalidateSession } from "@/lib/services/auth/session";

export async function POST() {
  const session = await getSession();
  const primarySession = await getPrimarySession();
  if (session?.sessionId) await invalidateSession(session.sessionId);
  if (primarySession?.sessionId && primarySession.sessionId !== session?.sessionId) await invalidateSession(primarySession.sessionId);
  const response = NextResponse.json({ success: true, data: { message: "Logged out successfully." } });
  response.cookies.set(AUTH_COOKIE_NAME, "", { httpOnly: true, path: "/", maxAge: 0 });
  response.cookies.set(IMPERSONATION_COOKIE_NAME, "", { httpOnly: true, path: "/", maxAge: 0 });
  return response;
}
