import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET(req: NextRequest) {
  try {
    const emails = await prisma.devEmail.findMany({
      orderBy: { createdAt: "desc" },
      take: 20,
    });

    return NextResponse.json({ emails });
  } catch (error: any) {
    return NextResponse.json({ error: "Failed to fetch dev emails", emails: [] });
  }
}

export async function DELETE() {
  try {
    await prisma.devEmail.deleteMany();
    return NextResponse.json({ success: true, message: "Cleared dev email inbox" });
  } catch (error: any) {
    return NextResponse.json({ error: "Failed to clear" }, { status: 500 });
  }
}
