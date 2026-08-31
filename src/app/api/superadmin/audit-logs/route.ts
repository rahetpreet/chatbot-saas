import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireSuperAdmin } from "@/lib/services/auth/session";

export async function GET(req: NextRequest) {
  try {
    await requireSuperAdmin();

    let logs: any[] = [];
    try {
      logs = await prisma.auditLog.findMany({
        take: 50,
        orderBy: { timestamp: "desc" },
        include: {
          tenant: { select: { id: true, name: true, slug: true } },
          user: { select: { id: true, email: true, name: true } },
        },
      });
    } catch (dbErr) {
      console.warn("DB audit logs fallback notice:", dbErr);
    }

    return NextResponse.json({ logs });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Unauthorized" }, { status: 403 });
  }
}
