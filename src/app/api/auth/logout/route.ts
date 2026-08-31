import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE_NAME, IMPERSONATION_COOKIE_NAME } from "@/lib/services/auth/session";

export async function POST(req: NextRequest) {
  const response = NextResponse.json({ success: true, message: "Logged out successfully" });
  response.cookies.delete(AUTH_COOKIE_NAME);
  response.cookies.delete(IMPERSONATION_COOKIE_NAME);
  return response;
}
