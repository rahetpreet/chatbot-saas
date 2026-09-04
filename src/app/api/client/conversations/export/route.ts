import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireTenantRole } from "@/lib/services/auth/session";

export async function POST(req: NextRequest) {
  try {
    const { tenantId } = await requireTenantRole(["CLIENT_OWNER", "CLIENT_ADMIN"]);
    const body = await req.json();
    const { startDate, endDate, status, campaignId, flowId } = body;

    // Create export job
    const exportJob = await prisma.exportJob.create({
      data: {
        tenantId,
        type: "CONVERSATIONS",
        status: "PENDING",
        filters: JSON.stringify({ startDate, endDate, status, campaignId, flowId }),
      },
    });

    // Process export (simplified for MVP - in production would be background job)
    const where: Record<string, any> = { tenantId };
    if (startDate) where.startedAt = { ...where.startedAt, gte: new Date(startDate) };
    if (endDate) where.startedAt = { ...where.startedAt, lte: new Date(endDate) };
    if (status && status !== "ALL") where.sessionStatus = status;
    if (campaignId) where.campaignContact = { campaignId };
    if (flowId) where.flowId = flowId;

    const conversations = await prisma.conversation.findMany({
      where,
      include: {
        flow: { select: { name: true } },
        campaignContact: {
          select: {
            name: true,
            email: true,
            phone: true,
            campaign: { select: { name: true } },
          },
        },
        messages: { orderBy: { timestamp: "asc" } },
      },
      orderBy: { startedAt: "desc" },
    });

    // Convert to CSV format
    const csvHeaders = ["ID", "Status", "Started At", "Ended At", "Flow", "Campaign", "Contact Name", "Contact Email", "Contact Phone", "Message Count"];
    const csvRows = conversations.map(conv => [
      conv.id,
      conv.sessionStatus,
      conv.startedAt.toISOString(),
      conv.closedAt?.toISOString() || "",
      conv.flow?.name || "",
      conv.campaignContact?.campaign?.name || "",
      conv.campaignContact?.name || "",
      conv.campaignContact?.email || "",
      conv.campaignContact?.phone || "",
      conv.messages.length.toString(),
    ]);

    const csvContent = [csvHeaders.join(","), ...csvRows.map(row => row.join(","))].join("\n");

    // Update export job as completed
    await prisma.exportJob.update({
      where: { id: exportJob.id },
      data: {
        status: "COMPLETED",
        downloadUrl: `/api/client/exports/${exportJob.id}/download`,
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        jobId: exportJob.id,
        status: "COMPLETED",
        downloadUrl: `/api/client/exports/${exportJob.id}/download`,
        recordCount: conversations.length,
      },
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: { code: "INVALID_REQUEST", message: error.message || "Failed to create export" } }, { status: 400 });
  }
}

/**
 * Direct CSV download of every conversation.
 *
 * The POST above queues an ExportJob, which suits very large exports but is
 * awkward for a dashboard button. This streams the file back immediately.
 *
 * `?level=messages` emits one row per message, for reading transcripts in a
 * spreadsheet. The default emits one row per conversation with the whole
 * transcript in a single cell, which is what "a report of all conversations"
 * usually means.
 */
export async function GET(req: NextRequest) {
  try {
    const { tenantId } = await requireTenantRole([
      "CLIENT_OWNER",
      "CLIENT_ADMIN",
      "CLIENT_AGENT",
      "CLIENT_VIEWER",
    ]);

    const { searchParams } = new URL(req.url);
    const level = (searchParams.get("level") || "conversations").toLowerCase();
    const status = searchParams.get("status");
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");

    const where: Record<string, any> = { tenantId };
    if (status && status !== "ALL") where.sessionStatus = status;
    if (startDate) where.startedAt = { ...(where.startedAt || {}), gte: new Date(startDate) };
    if (endDate) where.startedAt = { ...(where.startedAt || {}), lte: new Date(endDate) };

    const conversations = await prisma.conversation.findMany({
      where,
      orderBy: { startedAt: "desc" },
      include: {
        flow: { select: { name: true } },
        campaign: { select: { name: true } },
        campaignContact: { select: { name: true, email: true, phone: true } },
        leads: { select: { name: true, email: true, phone: true, status: true } },
        messages: { orderBy: { timestamp: "asc" } },
      },
    });

    const escape = (value: unknown) => {
      const text = value === null || value === undefined ? "" : String(value);
      // Quote everything: transcripts contain commas, quotes and newlines.
      return `"${text.replace(/"/g, '""')}"`;
    };
    const toRow = (values: unknown[]) => values.map(escape).join(",");

    let csv: string;
    let filename: string;

    if (level === "messages") {
      const header = [
        "Conversation ID", "Started At", "Status", "Flow", "Campaign",
        "Visitor", "Contact Name", "Contact Email", "Contact Phone",
        "Message At", "Sender", "Message",
      ];
      const rows = [toRow(header)];
      for (const conversation of conversations) {
        for (const message of conversation.messages) {
          rows.push(
            toRow([
              conversation.id,
              conversation.startedAt.toISOString(),
              conversation.sessionStatus,
              conversation.flow?.name || "",
              conversation.campaign?.name || "",
              conversation.visitorId,
              conversation.campaignContact?.name || "",
              conversation.campaignContact?.email || "",
              conversation.campaignContact?.phone || "",
              message.timestamp.toISOString(),
              message.senderType,
              message.content,
            ]),
          );
        }
      }
      csv = rows.join("\n");
      filename = "conversation-messages.csv";
    } else {
      const header = [
        "Conversation ID", "Started At", "Last Active", "Status", "Flow", "Campaign",
        "Visitor", "Contact Name", "Contact Email", "Contact Phone",
        "Lead Captured", "Lead Status", "Messages", "Visitor Messages", "Transcript",
      ];
      const rows = [toRow(header)];
      for (const conversation of conversations) {
        const lead = conversation.leads[0];
        const transcript = conversation.messages
          .map((message) => `[${message.timestamp.toISOString()}] ${message.senderType}: ${message.content}`)
          .join("\n");

        rows.push(
          toRow([
            conversation.id,
            conversation.startedAt.toISOString(),
            conversation.lastActiveAt.toISOString(),
            conversation.sessionStatus,
            conversation.flow?.name || "",
            conversation.campaign?.name || "",
            conversation.visitorId,
            conversation.campaignContact?.name || lead?.name || "",
            conversation.campaignContact?.email || lead?.email || "",
            conversation.campaignContact?.phone || lead?.phone || "",
            lead ? "Yes" : "No",
            lead?.status || "",
            conversation.messages.length,
            conversation.messages.filter((message) => message.senderType === "VISITOR").length,
            transcript,
          ]),
        );
      }
      csv = rows.join("\n");
      filename = "conversations.csv";
    }

    return new NextResponse(
      // A BOM so Excel opens UTF-8 correctly; without it names and ₹ are mangled.
      "\uFEFF" + csv,
      {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="${filename}"`,
          "Cache-Control": "no-store",
        },
      },
    );
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: { code: "EXPORT_FAILED", message: error?.message || "Failed to export." } },
      { status: 400 },
    );
  }
}
