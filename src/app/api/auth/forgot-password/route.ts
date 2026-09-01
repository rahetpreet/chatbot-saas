import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { generatePasswordResetToken } from "@/lib/security/password";
import { checkRateLimit } from "@/lib/security/rateLimit";
import { sendAppEmail } from "@/lib/services/email";

const message = "If an account exists, a password reset link has been sent.";
export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!checkRateLimit(`forgot:${ip}`, 5, 15 * 60_000)) return NextResponse.json({ success: false, error: { code: "RATE_LIMITED", message: "Too many requests." } }, { status: 429 });
  try {
    const body = await req.json();
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    if (email && email.length <= 320) {
      const user = await prisma.user.findUnique({ where: { email } });
      if (user && user.isActive) {
        const { token, tokenHash, expiresAt } = generatePasswordResetToken();
        await prisma.user.update({ where: { id: user.id }, data: { passwordResetTokenHash: tokenHash, passwordResetExpiresAt: expiresAt } });
        const appUrl = process.env.APP_URL;
        if (!appUrl) throw new Error("APP_URL not configured");
        const resetUrl = `${appUrl.replace(/\/$/, "")}/reset-password?token=${encodeURIComponent(token)}`;
        await sendAppEmail({ to: user.email, subject: "Reset your password", html: `<p>Use this one-time link to reset your password: <a href="${resetUrl}">Reset password</a></p>`, text: `Reset your password: ${resetUrl}`, resetLink: resetUrl });
      }
    }
  } catch { /* generic response prevents account enumeration and configuration disclosure */ }
  return NextResponse.json({ success: true, data: { message } });
}
