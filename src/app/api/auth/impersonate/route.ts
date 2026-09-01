import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { createSession, getPrimarySession, getSession, IMPERSONATION_COOKIE_NAME, invalidateSession, requireSuperAdmin, setSessionCookie } from "@/lib/services/auth/session";
import { validateRequest, impersonateSchema } from "@/lib/validation";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const validation = await validateRequest(impersonateSchema, body);
    if (!validation.success) return NextResponse.json({ success: false, error: { code: "VALIDATION_ERROR", message: validation.error } }, { status: 400 });
    
    const { tenantId, action } = validation.data;
    if (action === "stop") {
      const primary = await getPrimarySession();
      if (!primary || primary.role !== "SUPER_ADMIN") return NextResponse.json({ success: false, error: { code: "FORBIDDEN", message: "Super Admin access required." } }, { status: 403 });
      const current = await getSession();
      if (current?.sessionId && current.impersonatingFrom) await invalidateSession(current.sessionId);
      const response = NextResponse.json({ success: true, data: { message: "Impersonation ended." } });
      response.cookies.set(IMPERSONATION_COOKIE_NAME, "", { httpOnly: true, path: "/", maxAge: 0 });
      return response;
    }
    const admin = await requireSuperAdmin();
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, include: { users: { where: { role: { in: ["CLIENT_OWNER", "CLIENT_ADMIN"] }, isActive: true }, orderBy: { createdAt: "asc" }, take: 1 } } });
    const target = tenant?.users[0];
    if (!tenant || !target) return NextResponse.json({ success: false, error: { code: "NOT_FOUND", message: "Tenant owner not found." } }, { status: 404 });
    const { token, expiresAt } = await createSession(target, { impersonatedByUserId: admin.userId, ipAddress: req.headers.get("x-forwarded-for"), userAgent: req.headers.get("user-agent") });
    await prisma.auditLog.create({ data: { tenantId, userId: admin.userId, action: "IMPERSONATION_STARTED", ipAddress: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null, details: JSON.stringify({ targetUserId: target.id }) } });
    return setSessionCookie(NextResponse.json({ success: true, data: { tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug }, impersonating: true } }), token, expiresAt, true);
  } catch {
    return NextResponse.json({ success: false, error: { code: "FORBIDDEN", message: "Super Admin access required." } }, { status: 403 });
  }
}
