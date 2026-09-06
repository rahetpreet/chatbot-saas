import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { analyticsContext, analyticsError } from "@/lib/services/analytics/request";
import { getSession } from "@/lib/services/auth/session";
import { saveReport, REPORT_TYPES, REPORT_LABELS, type ReportType } from "@/lib/services/analytics/reports";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Previously generated reports, newest first. */
export async function GET(req: NextRequest) {
  try {
    const context = await analyticsContext(req);
    const reports = await prisma.reportSnapshot.findMany({
      where: { tenantId: context.tenantId },
      orderBy: { generatedAt: "desc" },
      take: 100,
      select: {
        id: true,
        reportType: true,
        rangeStart: true,
        rangeEnd: true,
        filters: true,
        generatedAt: true,
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        reports: reports.map((report) => ({
          ...report,
          label: REPORT_LABELS[report.reportType as ReportType] ?? report.reportType,
        })),
        types: REPORT_TYPES.map((type) => ({ type, label: REPORT_LABELS[type] })),
      },
    });
  } catch (error) {
    return analyticsError(error);
  }
}

/**
 * Generates a report and stores it.
 *
 * The stored copy is the deliverable: it freezes the numbers as they stood at
 * generation time, so re-opening it next month shows what was actually
 * reported rather than a silently updated version of it.
 */
export async function POST(req: NextRequest) {
  try {
    const context = await analyticsContext(req);
    const body = await req.json().catch(() => ({}));

    const requested = String(body.type || "executive") as ReportType;
    const type = REPORT_TYPES.includes(requested) ? requested : "executive";

    const session = await getSession();
    const saved = await saveReport(
      context.tenantId,
      session?.userId ?? null,
      type,
      context.range,
      context.filters,
    );

    return NextResponse.json({
      success: true,
      data: { report: { ...saved, label: REPORT_LABELS[type] } },
      message: `${REPORT_LABELS[type]} generated for ${context.range.label}.`,
    });
  } catch (error) {
    return analyticsError(error);
  }
}

