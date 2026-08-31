import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireTenantAccess } from "@/lib/services/auth/session";
import { generateLeadsCSV, generateLeadsJSON } from "@/lib/services/export";

export async function GET(req: NextRequest) {
  try {
    const { tenantId } = await requireTenantAccess();
    const { searchParams } = new URL(req.url);
    const format = searchParams.get("format") || "csv"; // csv or json
    const status = searchParams.get("status");

    const where: Record<string, any> = { tenantId };
    if (status && status !== "ALL") {
      where.status = status;
    }

    const leads = await prisma.lead.findMany({
      where,
      orderBy: { createdAt: "desc" },
    });

    if (format === "csv") {
      const csv = generateLeadsCSV(leads);
      return new NextResponse(csv, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="leads_${Date.now()}.csv"`,
        },
      });
    }

    const json = generateLeadsJSON(leads);
    return new NextResponse(json, {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="leads_${Date.now()}.json"`,
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Export failed" }, { status: 500 });
  }
}
