import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireTenantRole } from "@/lib/services/auth/session";
import { generateTemporaryPassword, hashPassword } from "@/lib/security/password";
import { normalizeEmail, normalizeName } from "@/lib/services/contact/normalize";
import { getAppUrl } from "@/lib/appUrl";

export const dynamic = "force-dynamic";

/** Roles a client owner or admin may hand out. Never SUPER_ADMIN. */
const ASSIGNABLE_ROLES = ["CLIENT_ADMIN", "CLIENT_AGENT", "CLIENT_VIEWER"] as const;

function safeUser(user: any) {
  // The hash never leaves the server, so it is not selected in the first place.
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    isActive: user.isActive,
    lastLoginAt: user.lastLoginAt,
    mustChangePassword: user.mustChangePassword,
    createdAt: user.createdAt,
  };
}

export async function GET() {
  try {
    const { tenantId } = await requireTenantRole(["CLIENT_OWNER", "CLIENT_ADMIN"]);

    const users = await prisma.user.findMany({
      where: { tenantId, deletedAt: null },
      select: {
        id: true, name: true, email: true, role: true, isActive: true,
        lastLoginAt: true, mustChangePassword: true, createdAt: true,
      },
      orderBy: [{ role: "asc" }, { createdAt: "asc" }],
    });

    const data = {
      users: users.map(safeUser),
      agentLoginUrl: `${getAppUrl() || ""}/agent`,
      assignableRoles: ASSIGNABLE_ROLES,
    };
    return NextResponse.json({ success: true, data, ...data });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: { code: "FORBIDDEN", message: error?.message || "Unauthorized" } },
      { status: 403 },
    );
  }
}

/**
 * Creates a team member.
 *
 * The generated password is shown to the creator exactly once and never
 * stored, logged or retrievable afterwards — the same rule the platform
 * applies when onboarding a client. The new member must change it at first
 * login.
 */
export async function POST(req: NextRequest) {
  try {
    const { tenantId, session } = await requireTenantRole(["CLIENT_OWNER", "CLIENT_ADMIN"]);
    const body = await req.json().catch(() => ({}));

    const email = normalizeEmail(String(body.email || ""));
    const name = normalizeName(String(body.name || "")) || email?.split("@")[0] || "";
    const role = String(body.role || "CLIENT_AGENT");

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json(
        { success: false, error: { code: "VALIDATION_ERROR", message: "Enter a valid email address." } },
        { status: 400 },
      );
    }
    if (!ASSIGNABLE_ROLES.includes(role as any)) {
      return NextResponse.json(
        { success: false, error: { code: "VALIDATION_ERROR", message: "That role cannot be assigned." } },
        { status: 400 },
      );
    }

    // Email is unique platform-wide, so a clash may be another workspace's
    // user. Say only that it is taken, never whose.
    const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (existing) {
      return NextResponse.json(
        { success: false, error: { code: "CONFLICT", message: "That email address is already in use." } },
        { status: 409 },
      );
    }

    const temporaryPassword = generateTemporaryPassword(16);
    const passwordHash = await hashPassword(temporaryPassword);

    const created = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          tenantId,
          email,
          name,
          role,
          passwordHash,
          isActive: true,
          status: "ACTIVE",
          mustChangePassword: true,
        },
        select: {
          id: true, name: true, email: true, role: true, isActive: true,
          lastLoginAt: true, mustChangePassword: true, createdAt: true,
        },
      });

      await tx.tenantUser.create({ data: { tenantId, userId: user.id, role } }).catch(() => undefined);

      await tx.auditLog.create({
        data: {
          tenantId,
          userId: session.userId,
          action: "TEAM_MEMBER_CREATED",
          // The password is deliberately absent: audit rows must never carry
          // a credential.
          details: JSON.stringify({ email, role }),
        },
      });

      return user;
    });

    const data = {
      user: safeUser(created),
      credentials: {
        email,
        temporaryPassword,
        loginUrl: `${getAppUrl() || ""}${role === "CLIENT_AGENT" ? "/agent" : "/login"}`,
      },
      warning: "Save this password now. It cannot be shown again.",
    };
    return NextResponse.json({ success: true, data, ...data });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: { code: "INVALID_REQUEST", message: error?.message || "Could not create the member." } },
      { status: 400 },
    );
  }
}

/** Enables, disables, or resets the password of a team member. */
export async function PATCH(req: NextRequest) {
  try {
    const { tenantId, session } = await requireTenantRole(["CLIENT_OWNER", "CLIENT_ADMIN"]);
    const body = await req.json().catch(() => ({}));
    const userId = String(body.userId || "");
    const action = String(body.action || "");

    const target = await prisma.user.findFirst({
      where: { id: userId, tenantId, deletedAt: null },
      select: { id: true, email: true, role: true, isActive: true },
    });
    if (!target) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "That member was not found." } },
        { status: 404 },
      );
    }
    if (target.id === session.userId) {
      return NextResponse.json(
        { success: false, error: { code: "FORBIDDEN", message: "You cannot change your own access here." } },
        { status: 403 },
      );
    }
    if (target.role === "CLIENT_OWNER") {
      return NextResponse.json(
        { success: false, error: { code: "FORBIDDEN", message: "The workspace owner cannot be changed here." } },
        { status: 403 },
      );
    }

    if (action === "reset-password") {
      const temporaryPassword = generateTemporaryPassword(16);
      const passwordHash = await hashPassword(temporaryPassword);

      await prisma.$transaction([
        prisma.user.update({
          where: { id: target.id },
          data: { passwordHash, mustChangePassword: true },
        }),
        // Existing sessions must not survive a password reset.
        prisma.session.deleteMany({ where: { userId: target.id } }),
        prisma.auditLog.create({
          data: {
            tenantId,
            userId: session.userId,
            action: "TEAM_PASSWORD_RESET",
            details: JSON.stringify({ email: target.email }),
          },
        }),
      ]);

      const data = {
        credentials: { email: target.email, temporaryPassword },
        warning: "Save this password now. It cannot be shown again.",
      };
      return NextResponse.json({ success: true, data, ...data });
    }

    if (action === "enable" || action === "disable") {
      const isActive = action === "enable";
      await prisma.$transaction([
        prisma.user.update({ where: { id: target.id }, data: { isActive } }),
        // Disabling must take effect immediately, not at session expiry.
        ...(isActive ? [] : [prisma.session.deleteMany({ where: { userId: target.id } })]),
        prisma.auditLog.create({
          data: {
            tenantId,
            userId: session.userId,
            action: isActive ? "TEAM_MEMBER_ENABLED" : "TEAM_MEMBER_DISABLED",
            details: JSON.stringify({ email: target.email }),
          },
        }),
      ]);
      return NextResponse.json({ success: true, data: { message: `Member ${isActive ? "enabled" : "disabled"}.` } });
    }

    return NextResponse.json(
      { success: false, error: { code: "VALIDATION_ERROR", message: "Unknown action." } },
      { status: 400 },
    );
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: { code: "INVALID_REQUEST", message: error?.message || "Could not update the member." } },
      { status: 400 },
    );
  }
}
