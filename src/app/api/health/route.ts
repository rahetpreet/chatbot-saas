import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireSuperAdmin } from "@/lib/services/auth/session";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireSuperAdmin();
    const userCount = await prisma.user.count();
    const tenantCount = await prisma.tenant.count();

    return NextResponse.json({
      status: "OK",
      database: "CONNECTED",
      userCount,
      tenantCount,
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    return NextResponse.json({
      status: "ERROR",
      database: "DISCONNECTED",
      errorMessage: error?.message || error?.toString(),
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}
