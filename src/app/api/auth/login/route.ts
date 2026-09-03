import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { verifyPassword } from "@/lib/security/password";
import { createSession, setSessionCookie } from "@/lib/services/auth/session";
import { checkRateLimit } from "@/lib/security/rateLimit";
import { validateRequest, loginSchema } from "@/lib/validation";

const invalidCredentials = { success: false, error: { code: "INVALID_CREDENTIALS", message: "Invalid email or password" } };

export async function POST(req: NextRequest) {
  const ipAddress = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
  if (!(await checkRateLimit(`login:${ipAddress}`, 10, 15 * 60_000))) return NextResponse.json({ success: false, error: { code: "RATE_LIMITED", message: "Too many login attempts. Try again later." } }, { status: 429 });
  try {
    const body = await req.json();
    const validation = await validateRequest(loginSchema, body);
    if (!validation.success) return NextResponse.json({ success: false, error: { code: "VALIDATION_ERROR", message: validation.error } }, { status: 400 });
    
    const { email, password } = validation.data;
    const user = await prisma.user.findUnique({ where: { email }, include: { tenant: true } });
    const valid = user ? await verifyPassword(password, user.passwordHash) : false;
    if (!user || !valid || !user.isActive || user.status !== "ACTIVE") {
      await prisma.auditLog.create({ data: { action: "LOGIN_FAILED", details: JSON.stringify({ email }), ipAddress } });
      return NextResponse.json(invalidCredentials, { status: 401 });
    }
    if (user.tenant && !["TRIAL", "ACTIVE"].includes(user.tenant.status)) return NextResponse.json({ success: false, error: { code: "SUBSCRIPTION_INACTIVE", message: "This workspace is not active." } }, { status: 403 });
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
