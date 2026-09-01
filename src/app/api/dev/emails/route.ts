import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireSuperAdmin } from "@/lib/services/auth/session";

function unavailable() {
  return NextResponse.json({ error: "Not found" }, { status: 404 });
}

export async function GET() {
  if (process.env.NODE_ENV === "production" || process.env.EMAIL_PROVIDER !== "console") return unavailable();
  try {
    await requireSuperAdmin();
    const emails = await prisma.devEmail.findMany({ orderBy: { createdAt: "desc" }, take: 20 });
    return NextResponse.json({ emails });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }
}

export async function DELETE() {
  if (process.env.NODE_ENV === "production" || process.env.EMAIL_PROVIDER !== "console") return unavailable();
  try {
    await requireSuperAdmin();
    await prisma.devEmail.deleteMany();
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }
}
