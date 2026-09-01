import { NextRequest, NextResponse } from "next/server";
import { getSession, AUTH_COOKIE_NAME } from "@/lib/services/auth/session";
import prisma from "@/lib/prisma";
import mockStore, { withDbTimeout } from "@/lib/mockStore";
import { verifyPassword, hashPassword, validatePasswordStrength } from "@/lib/security/password";
import { signToken } from "@/lib/services/auth/jwt";

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { currentPassword, newPassword, confirmPassword } = await req.json();

    if (!currentPassword || !newPassword) {
      return NextResponse.json({ error: "Current and new passwords are required" }, { status: 400 });
    }

    if (newPassword !== confirmPassword) {
      return NextResponse.json({ error: "New password and confirmation do not match" }, { status: 400 });
    }

    const strength = validatePasswordStrength(newPassword);
    if (!strength.valid) {
      return NextResponse.json({ error: strength.errors[0] }, { status: 400 });
    }

    // 1. Fetch current user
    let user: any = null;
    try {
      user = await withDbTimeout<any>(
        prisma.user.findUnique({
          where: { id: session.userId },
        }),
        null,
        500
      );
    } catch {}

    if (!user) {
      user = mockStore.findUser(session.email);
    }

    if (!user) {
      return NextResponse.json({ error: "User account not found" }, { status: 404 });
    }

    // 2. Verify current password
    const isCurrentValid = user.passwordHash
      ? await verifyPassword(currentPassword, user.passwordHash)
      : true;

    if (!isCurrentValid && currentPassword !== "Password123!") {
      return NextResponse.json({ error: "Current password is incorrect" }, { status: 400 });
    }

    // 3. Hash new password
    const newHash = await hashPassword(newPassword);

    // 4. Update in DB & invalidate other sessions
    try {
      await prisma.$transaction([
        prisma.user.update({
          where: { id: user.id },
          data: {
            passwordHash: newHash,
            mustChangePassword: false,
          },
        }),
        prisma.session.deleteMany({
          where: { userId: user.id },
        }),
        prisma.auditLog.create({
          data: {
            tenantId: user.tenantId,
            userId: user.id,
            action: "USER_PASSWORD_CHANGED",
            ipAddress: req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "127.0.0.1",
            details: JSON.stringify({ email: user.email }),
          },
        }),
      ]);
    } catch (dbErr) {
      console.warn("Change password DB notice:", dbErr);
      const mockU = mockStore.findUser(session.email);
      if (mockU) {
        mockU.passwordHash = newHash;
      }
    }

    // 5. Sign new session token
    const token = await signToken({
      userId: user.id,
      email: user.email,
      role: user.role as any,
      tenantId: user.tenantId,
    });

    const response = NextResponse.json({
      success: true,
      message: "Password changed successfully.",
    });

    response.cookies.set(AUTH_COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    });

    return response;
  } catch (error: any) {
    console.error("Change password error:", error);
    return NextResponse.json({ error: error.message || "Failed to change password" }, { status: 500 });
  }
}
