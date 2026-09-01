import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import prisma from "@/lib/prisma";
import { hashPassword, validatePasswordStrength } from "@/lib/security/password";
import { checkRateLimit } from "@/lib/security/rateLimit";

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!checkRateLimit(`reset:${ip}`, 10, 15 * 60_000)) return NextResponse.json({ success: false, error: { code: "RATE_LIMITED", message: "Too many requests." } }, { status: 429 });
  try {
    const { token, password, confirmPassword } = await req.json();
    if (typeof token !== "string" || typeof password !== "string" || (confirmPassword !== undefined && confirmPassword !== password)) return NextResponse.json({ success: false, error: { code: "VALIDATION_ERROR", message: "Invalid reset request." } }, { status: 400 });
    const strength = validatePasswordStrength(password);
    if (!strength.valid) return NextResponse.json({ success: false, error: { code: "VALIDATION_ERROR", message: strength.errors[0] } }, { status: 400 });
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    const user = await prisma.user.findFirst({ where: { passwordResetTokenHash: tokenHash, passwordResetExpiresAt: { gt: new Date() } } });
    if (!user) return NextResponse.json({ success: false, error: { code: "PASSWORD_RESET_INVALID", message: "This reset link is invalid or has expired." } }, { status: 400 });
    const passwordHash = await hashPassword(password);
    await prisma.$transaction([
      prisma.user.update({ where: { id: user.id }, data: { passwordHash, passwordResetTokenHash: null, passwordResetExpiresAt: null, mustChangePassword: false } }),
      prisma.session.deleteMany({ where: { userId: user.id } }),
      prisma.auditLog.create({ data: { tenantId: user.tenantId, userId: user.id, action: "PASSWORD_RESET", ipAddress: ip } }),
    ]);
    return NextResponse.json({ success: true, data: { message: "Password reset successfully." } });
  } catch {
    return NextResponse.json({ success: false, error: { code: "INVALID_REQUEST", message: "Unable to reset password." } }, { status: 400 });
  }
}
