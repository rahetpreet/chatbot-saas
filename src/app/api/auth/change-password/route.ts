import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { createSession, getSession, setSessionCookie } from "@/lib/services/auth/session";
import { hashPassword, validatePasswordStrength, verifyPassword } from "@/lib/security/password";
import { validateRequest, changePasswordSchema } from "@/lib/validation";

export async function POST(req: NextRequest) {
  try {
    const auth = await getSession();
    if (!auth) return NextResponse.json({ success: false, error: { code: "UNAUTHORIZED", message: "Authentication required." } }, { status: 401 });
    const body = await req.json();
    
    const validation = await validateRequest(changePasswordSchema, body);
    if (!validation.success) return NextResponse.json({ success: false, error: { code: "VALIDATION_ERROR", message: validation.error } }, { status: 400 });
    
    const { currentPassword, newPassword } = validation.data;
    const strength = validatePasswordStrength(newPassword);
    if (!strength.valid) return NextResponse.json({ success: false, error: { code: "VALIDATION_ERROR", message: strength.errors[0] } }, { status: 400 });
    const user = await prisma.user.findUnique({ where: { id: auth.userId } });
    if (!user || !user.isActive || !(await verifyPassword(currentPassword, user.passwordHash))) return NextResponse.json({ success: false, error: { code: "INVALID_CREDENTIALS", message: "Current password is incorrect." } }, { status: 401 });
    const passwordHash = await hashPassword(newPassword);
    await prisma.$transaction([
      prisma.user.update({ where: { id: user.id }, data: { passwordHash, mustChangePassword: false } }),
      prisma.session.deleteMany({ where: { userId: user.id } }),
      prisma.auditLog.create({ data: { tenantId: user.tenantId, userId: user.id, action: "PASSWORD_CHANGED", ipAddress: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null } }),
    ]);
    const { token, expiresAt } = await createSession(user, { ipAddress: req.headers.get("x-forwarded-for"), userAgent: req.headers.get("user-agent") });
    return setSessionCookie(NextResponse.json({ success: true, data: { message: "Password changed successfully." } }), token, expiresAt);
  } catch {
    return NextResponse.json({ success: false, error: { code: "INVALID_REQUEST", message: "Unable to change password." } }, { status: 400 });
  }
}
