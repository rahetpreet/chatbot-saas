import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getSession } from "@/lib/services/auth/session";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "Not authenticated" } },
        { status: 401 },
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      select: { id: true, email: true, name: true, role: true, mustChangePassword: true, tenantId: true },
    });
    if (!user) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "Not authenticated" } },
        { status: 401 },
      );
    }

    // The dashboard derives share links, embed snippets and the /c/<slug>
    // public URL from tenant.slug. Omitting it here silently produced
    // malformed links everywhere (/c/?flowId=..., data-tenant-slug="").
    const tenant = session.tenantId
      ? await prisma.tenant.findUnique({
          where: { id: session.tenantId },
          select: {
            id: true,
            name: true,
            slug: true,
            status: true,
            planTier: true,
            logoUrl: true,
            // The dashboard builds share links and embed snippets, which must
            // use the workspace's own hostname once it is serving.
            customDomain: true,
            customDomainVerifiedAt: true,
          },
        })
      : null;

    const payload = {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        tenantId: session.tenantId,
        mustChangePassword: user.mustChangePassword,
        impersonatingFrom: session.impersonatingFrom,
        tenant,
      },
      tenant,
      impersonating: Boolean(session.impersonatingFrom),
    };

    // Dual-shaped for compatibility: some pages read data.user, others read
    // the bare key. Both are served until the response envelope is unified.
    return NextResponse.json({ success: true, data: payload, ...payload });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: { code: "INVALID_REQUEST", message: error?.message || "Failed to get user info" } },
      { status: 400 },
    );
  }
}
