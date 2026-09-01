import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { JWTPayload, UserRole } from "@/types";
import prisma from "@/lib/prisma";
import crypto from "crypto";

export const AUTH_COOKIE_NAME = "chatbot_saas_auth";
export const IMPERSONATION_COOKIE_NAME = "chatbot_saas_impersonate";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

function hashSessionToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function toPayload(session: any): JWTPayload {
  return {
    userId: session.user.id,
    email: session.user.email,
    role: session.user.role as UserRole,
    tenantId: session.tenantId,
    sessionId: session.id,
    impersonatingFrom: session.impersonatedByUserId || undefined,
  };
}

async function getSessionForCookie(cookieName: string): Promise<JWTPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(cookieName)?.value;
  if (!token) return null;
  const session = await prisma.session.findUnique({
    where: { tokenHash: hashSessionToken(token) },
    include: { user: true, tenant: true },
  });
  if (!session || session.expiresAt <= new Date() || !session.user.isActive || session.user.status !== "ACTIVE") {
    return null;
  }
  if (session.tenant && !["TRIAL", "ACTIVE"].includes(session.tenant.status)) return null;
  // Fire-and-forget would hide database failures; last-seen is non-critical.
  await prisma.session.update({ where: { id: session.id }, data: { lastSeenAt: new Date() } });
  return toPayload(session);
}

/** The effective session is an impersonation session when one is active. */
export async function getSession(): Promise<JWTPayload | null> {
  return (await getSessionForCookie(IMPERSONATION_COOKIE_NAME)) || getSessionForCookie(AUTH_COOKIE_NAME);
}

/** The original sign-in remains available only to end an impersonation session. */
export async function getPrimarySession(): Promise<JWTPayload | null> {
  return getSessionForCookie(AUTH_COOKIE_NAME);
}

export async function createSession(user: { id: string; tenantId: string | null }, metadata: { ipAddress?: string | null; userAgent?: string | null; impersonatedByUserId?: string | null } = {}) {
  const token = crypto.randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000);
  const session = await prisma.session.create({
    data: {
      userId: user.id,
      tenantId: user.tenantId,
      tokenHash: hashSessionToken(token),
      expiresAt,
      ipAddress: metadata.ipAddress || null,
      userAgent: metadata.userAgent || null,
      impersonatedByUserId: metadata.impersonatedByUserId || null,
    },
  });
  return { token, session, expiresAt };
}

export function setSessionCookie(response: NextResponse, token: string, expiresAt: Date, impersonating = false): NextResponse {
  response.cookies.set(impersonating ? IMPERSONATION_COOKIE_NAME : AUTH_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
  return response;
}

export async function setAuthCookie(_payload: JWTPayload, _response?: NextResponse): Promise<never> {
  throw new Error("Use createSession() and setSessionCookie().");
}

export async function clearAuthCookies(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(AUTH_COOKIE_NAME);
  cookieStore.delete(IMPERSONATION_COOKIE_NAME);
}

export async function invalidateSession(sessionId: string) {
  await prisma.session.deleteMany({ where: { id: sessionId } });
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
    // Platform-wide authority must deliberately select a tenant; an omitted
    // tenant is never interpreted as permission to query every tenant.
    if (!tenantId) throw new Error("Tenant context is required for client data access");
    return { session, tenantId };
  }
  if (!session.tenantId) {
    throw new Error("Forbidden: No tenant associated with this account");
  }
  if (tenantId && session.tenantId !== tenantId) {
    throw new Error("Forbidden: Access to specified tenant denied");
  }
  return { session, tenantId: session.tenantId };
}

export async function requireTenantRole(allowed: UserRole[]): Promise<{ session: JWTPayload; tenantId: string }> {
  const context = await requireTenantAccess();
  if (!allowed.includes(context.session.role)) throw new Error("Forbidden: Insufficient role");
  return context;
}
