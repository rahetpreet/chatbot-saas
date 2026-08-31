import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireTenantAccess } from "@/lib/services/auth/session";

export async function GET(req: NextRequest) {
  try {
    const { tenantId } = await requireTenantAccess();

    const docs = await prisma.knowledgeDoc.findMany({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ docs });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Unauthorized" }, { status: 403 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { tenantId } = await requireTenantAccess();
    const body = await req.json();
    const { title, category, content } = body;

    if (!title || !content) {
      return NextResponse.json({ error: "Title and content are required" }, { status: 400 });
    }

    const doc = await prisma.knowledgeDoc.create({
      data: {
        tenantId,
        title,
        category: category || "General",
        content,
      },
    });

    return NextResponse.json({ success: true, doc });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to create knowledge doc" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { tenantId } = await requireTenantAccess();
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Doc ID is required" }, { status: 400 });
    }

    await prisma.knowledgeDoc.deleteMany({
      where: { id, tenantId },
    });

    return NextResponse.json({ success: true, message: "Doc deleted" });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to delete" }, { status: 500 });
  }
}
