import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { verifyToken, signToken } from "./jwt";
import { JWTPayload, UserRole } from "@/types";
import prisma from "@/lib/prisma";

export const AUTH_COOKIE_NAME = "chatbot_saas_auth";
export const IMPERSONATION_COOKIE_NAME = "chatbot_saas_impersonate";

export async function getSession(): Promise<JWTPayload | null> {
  const cookieStore = await cookies();
  const impersonationToken = cookieStore.get(IMPERSONATION_COOKIE_NAME)?.value;
  if (impersonationToken) {
    const payload = await verifyToken(impersonationToken);
    if (payload) return payload;
  }

  const token = cookieStore.get(AUTH_COOKIE_NAME)?.value;
  if (!token) return null;
  return await verifyToken(token);
}

export async function setAuthCookie(payload: JWTPayload, response?: NextResponse): Promise<NextResponse | void> {
  const token = await signToken(payload);
  const cookieStore = await cookies();
  cookieStore.set(AUTH_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7, // 7 days
  });
}

export async function clearAuthCookies(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(AUTH_COOKIE_NAME);
  cookieStore.delete(IMPERSONATION_COOKIE_NAME);
}

export async function requireAuth(): Promise<JWTPayload> {
  const session = await getSession();
  if (!session) {
    throw new Error("Unauthorized");
  }
  return session;
}

export async function requireSuperAdmin(): Promise<JWTPayload> {
  const session = await requireAuth();
  if (session.role !== "SUPER_ADMIN") {
    throw new Error("Forbidden: Super Admin access required");
  }
  return session;
}

export async function requireTenantAccess(tenantId?: string): Promise<{ session: JWTPayload; tenantId: string }> {
  const session = await requireAuth();
  if (session.role === "SUPER_ADMIN") {
    return { session, tenantId: tenantId || session.tenantId || "" };
  }
  if (!session.tenantId) {
    throw new Error("Forbidden: No tenant associated with this account");
  }
  if (tenantId && session.tenantId !== tenantId) {
    throw new Error("Forbidden: Access to specified tenant denied");
  }
  return { session, tenantId: session.tenantId };
}
