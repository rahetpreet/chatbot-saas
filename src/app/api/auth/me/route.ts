import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getSession } from "@/lib/services/auth/session";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ success: false, error: { code: "UNAUTHORIZED", message: "Authentication required." } }, { status: 401 });
  const user = await prisma.user.findUnique({ where: { id: session.userId }, select: { id: true, name: true, email: true, role: true, tenantId: true, mustChangePassword: true, tenant: { select: { id: true, name: true, slug: true, status: true, planTier: true } } } });
  if (!user) return NextResponse.json({ success: false, error: { code: "UNAUTHORIZED", message: "Authentication required." } }, { status: 401 });
  return NextResponse.json({
    success: true,
    user,
    impersonating: Boolean(session.impersonatingFrom),
    data: { user, impersonating: Boolean(session.impersonatingFrom) },
  });
}
