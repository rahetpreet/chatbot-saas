import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const userCount = await prisma.user.count();
    const tenantCount = await prisma.tenant.count();
    const users = await prisma.user.findMany({ select: { email: true, role: true } });

    return NextResponse.json({
      status: "OK",
      database: "CONNECTED",
      userCount,
      tenantCount,
      users,
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
