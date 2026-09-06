import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { verifyPassword } from "@/lib/security/password";
import { createSession, setSessionCookie } from "@/lib/services/auth/session";
import { checkRateLimit, resetRateLimit } from "@/lib/security/rateLimit";
import { validateRequest, loginSchema } from "@/lib/validation";

const invalidCredentials = { success: false, error: { code: "INVALID_CREDENTIALS", message: "Invalid email or password" } };

const RATE_LIMITED = {
  success: false,
  error: { code: "RATE_LIMITED", message: "Too many login attempts. Try again later." },
};

/**
 * Brute-force protection, in two layers.
 *
 * A single per-IP counter of ten attempts per quarter hour was too tight for
 * the customers this product is sold to: an office shares one public address,
 * so the eleventh colleague to sign in that quarter-hour was locked out by the
 * other ten — a self-inflicted outage with no attacker involved.
 *
 * The tight limit belongs on the account, which is what an attacker actually
 * targets. The address keeps a much looser ceiling, enough to stop somebody
 * spraying many accounts from one machine while leaving a busy office alone.
 */
const PER_ACCOUNT = { limit: 10, windowMs: 15 * 60_000 };
const PER_ADDRESS = { limit: 100, windowMs: 15 * 60_000 };

export async function POST(req: NextRequest) {
  const ipAddress = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
  if (!(await checkRateLimit(`login-ip:${ipAddress}`, PER_ADDRESS.limit, PER_ADDRESS.windowMs))) {
    return NextResponse.json(RATE_LIMITED, { status: 429 });
  }
  try {
    const body = await req.json();
    const validation = await validateRequest(loginSchema, body);
    if (!validation.success) return NextResponse.json({ success: false, error: { code: "VALIDATION_ERROR", message: validation.error } }, { status: 400 });

    const { email, password } = validation.data;

    // Keyed on the account being attacked, not on who is asking.
    if (!(await checkRateLimit(`login-account:${email}`, PER_ACCOUNT.limit, PER_ACCOUNT.windowMs))) {
      return NextResponse.json(RATE_LIMITED, { status: 429 });
    }
    const user = await prisma.user.findUnique({ where: { email }, include: { tenant: true } });
    const valid = user ? await verifyPassword(password, user.passwordHash) : false;
    if (!user || !valid || !user.isActive || user.status !== "ACTIVE") {
      await prisma.auditLog.create({ data: { action: "LOGIN_FAILED", details: JSON.stringify({ email }), ipAddress } });
      return NextResponse.json(invalidCredentials, { status: 401 });
    }
    if (user.tenant && !["TRIAL", "ACTIVE"].includes(user.tenant.status)) return NextResponse.json({ success: false, error: { code: "SUBSCRIPTION_INACTIVE", message: "This workspace is not active." } }, { status: 403 });
    // Signing in successfully clears the account's counter. Someone who
    // mistypes their password twice and then gets it right should not spend the
    // next quarter of an hour one slip away from being locked out.
    await resetRateLimit(`login-account:${email}`);

    const { token, expiresAt } = await createSession(user, { ipAddress, userAgent: req.headers.get("user-agent") });
    await prisma.$transaction([
      prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } }),
      prisma.auditLog.create({ data: { tenantId: user.tenantId, userId: user.id, action: "LOGIN_SUCCEEDED", ipAddress } }),
    ]);
    const userPayload = { id: user.id, name: user.name, email: user.email, role: user.role, tenantId: user.tenantId, mustChangePassword: user.mustChangePassword };
    const response = NextResponse.json({ success: true, user: userPayload, data: { user: userPayload } });
    return setSessionCookie(response, token, expiresAt);
  } catch {
    return NextResponse.json({ success: false, error: { code: "INVALID_REQUEST", message: "Unable to process login." } }, { status: 400 });
  }
}
