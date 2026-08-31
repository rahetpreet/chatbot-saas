import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { randomBytes } from "crypto";
import { sendAppEmail } from "@/lib/services/email";

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json();
    if (!email) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
      include: { tenant: true },
    });

    // To prevent email enumeration, we return success even if user not found,
    // but if found, generate token & send email
    if (user) {
      const resetToken = randomBytes(32).toString("hex");
      const expires = new Date(Date.now() + 1000 * 60 * 60); // 1 hour

      await prisma.user.update({
        where: { id: user.id },
        data: {
          resetToken,
          resetTokenExpires: expires,
        },
      });

      const host = req.headers.get("host") || "localhost:3000";
      const protocol = req.headers.get("x-forwarded-proto") || "http";
      const resetUrl = `${protocol}://${host}/reset-password?token=${resetToken}`;

      let smtpConfig = null;
      if (user.tenant?.customSmtpConfig) {
        try {
          smtpConfig = JSON.parse(user.tenant.customSmtpConfig);
        } catch {}
      }

      await sendAppEmail(
        {
          to: user.email,
          subject: "Password Reset Request - Chatbot SaaS",
          html: `
            <div style="font-family: sans-serif; padding: 20px;">
              <h2>Reset Your Password</h2>
              <p>Hi ${user.name},</p>
              <p>We received a request to reset your password. Click the link below to set a new password:</p>
              <p><a href="${resetUrl}" style="background: #4f46e5; color: white; padding: 10px 20px; text-decoration: none; border-radius: 6px; display: inline-block;">Reset Password</a></p>
              <p style="color: #666; font-size: 12px; margin-top: 20px;">Link expires in 1 hour. If you didn't request this, please ignore this email.</p>
            </div>
          `,
          text: `Reset your password by visiting: ${resetUrl}`,
          resetLink: resetUrl,
        },
        smtpConfig
      );
    }

    return NextResponse.json({
      success: true,
      message: "If an account exists with this email, password reset instructions have been sent.",
    });
  } catch (error: any) {
    console.error("Forgot password error:", error);
    return NextResponse.json({ error: "Failed to process forgot password request" }, { status: 500 });
  }
}
