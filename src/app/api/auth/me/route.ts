import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/services/auth/session";

export async function GET(_req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ success: false, error: { code: "UNAUTHORIZED", message: "Not authenticated" } }, { status: 401 });
    }

    return NextResponse.json({
      success: true,
      data: {
        user: {
          id: session.userId,
          email: session.email,
          role: session.role,
          tenantId: session.tenantId,
          impersonatingFrom: session.impersonatingFrom,
        },
      },
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: { code: "INVALID_REQUEST", message: error.message || "Failed to get user info" } }, { status: 400 });
  }
}
