import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { analyticsContext, analyticsError } from "@/lib/services/analytics/request";
import { reportToCsv, REPORT_LABELS, type GeneratedReport, type ReportType } from "@/lib/services/analytics/reports";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Downloads a stored report.
 *
 * The export is rendered from the snapshot, not recomputed, so the file always
 * matches the report the client was looking at when they clicked download --
 * including the filters that were applied at the time.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const context = await analyticsContext(req);
    const { id } = await params;
    const format = (context.searchParams.get("format") || "csv").toLowerCase();

    const snapshot = await prisma.reportSnapshot.findFirst({
      where: { id, tenantId: context.tenantId },
    });
    if (!snapshot) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "Report not found." } },
        { status: 404 },
      );
    }

    const report = JSON.parse(snapshot.metrics) as GeneratedReport;
    const label = REPORT_LABELS[snapshot.reportType as ReportType] ?? snapshot.reportType;
    const day = snapshot.generatedAt.toISOString().slice(0, 10);
    const filename = `${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${day}`;

    if (format === "json") {
      return new NextResponse(JSON.stringify(report, null, 2), {
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Content-Disposition": `attachment; filename="${filename}.json"`,
        },
      });
    }

    // CSV is the default because it opens in a spreadsheet, which is where
    // clients actually want to slice these numbers.
    return new NextResponse(reportToCsv(report), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}.csv"`,
      },
    });
  } catch (error) {
    return analyticsError(error);
  }
}
