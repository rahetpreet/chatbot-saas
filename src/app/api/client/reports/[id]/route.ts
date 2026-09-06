import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { analyticsContext, analyticsError } from "@/lib/services/analytics/request";
import { REPORT_LABELS, type ReportType } from "@/lib/services/analytics/reports";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * One stored report, exactly as it was generated.
 *
 * Scoped to the caller's workspace, so a report id guessed from elsewhere
 * returns 404 rather than another company's numbers.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const context = await analyticsContext(req);
    const { id } = await params;

    const snapshot = await prisma.reportSnapshot.findFirst({
      where: { id, tenantId: context.tenantId },
    });
    if (!snapshot) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "Report not found." } },
        { status: 404 },
      );
    }

    let report: unknown = null;
    try {
      report = JSON.parse(snapshot.metrics);
    } catch {
      // A snapshot that cannot be parsed is corrupt rather than missing, and
      // saying so is more useful than showing an empty report.
      return NextResponse.json(
        { success: false, error: { code: "CORRUPT_REPORT", message: "This report could not be read." } },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        id: snapshot.id,
        type: snapshot.reportType,
        label: REPORT_LABELS[snapshot.reportType as ReportType] ?? snapshot.reportType,
        rangeStart: snapshot.rangeStart,
        rangeEnd: snapshot.rangeEnd,
        generatedAt: snapshot.generatedAt,
        report,
      },
    });
  } catch (error) {
    return analyticsError(error);
  }
}

/** Removes a stored report. */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const context = await analyticsContext(req);
    const { id } = await params;

    const deleted = await prisma.reportSnapshot.deleteMany({
      where: { id, tenantId: context.tenantId },
    });
    if (!deleted.count) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "Report not found." } },
        { status: 404 },
      );
    }
    return NextResponse.json({ success: true, data: { message: "Report deleted." } });
  } catch (error) {
    return analyticsError(error);
  }
}
