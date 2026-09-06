import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { analyticsContext, analyticsSuccess, analyticsError } from "@/lib/services/analytics/request";
import { nodeAnalytics, optionAnalytics } from "@/lib/services/analytics/queries";
import { EVENT } from "@/lib/services/analytics/events";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * One step of the flow in detail.
 *
 * Alongside its own numbers this answers "where did people go next?", which is
 * what turns a drop-off percentage into something actionable: a step that
 * loses people to one particular branch is a different problem from one that
 * loses them entirely.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const context = await analyticsContext(req);
    const { tenantId, range, filters } = context;
    const { id } = await params;

    const [nodes, options] = await Promise.all([
      nodeAnalytics(tenantId, range, filters),
      optionAnalytics(tenantId, range, filters),
    ]);

    const node = nodes.find((n) => n.nodeId === id) ?? null;

    // The conversations that passed through this node, and where each of them
    // went immediately afterwards.
    const visits = await prisma.analyticsEvent.findMany({
      where: {
        tenantId,
        nodeId: id,
        eventType: EVENT.NODE_ENTERED,
        timestamp: { gte: range.start, lte: range.end },
      },
      select: { conversationId: true, timestamp: true },
      take: 5000,
    });

    const conversationIds = [...new Set(visits.map((v) => v.conversationId).filter(Boolean))] as string[];
    const nextSteps = conversationIds.length
      ? await prisma.analyticsEvent.groupBy({
          by: ["nodeId"],
          where: {
            tenantId,
            eventType: EVENT.NODE_ENTERED,
            conversationId: { in: conversationIds },
            nodeId: { not: id },
            timestamp: { gte: range.start, lte: range.end },
          },
          _count: { _all: true },
        })
      : [];

    const labelFor = (nodeId: string | null) =>
      nodes.find((n) => n.nodeId === nodeId)?.label || nodeId || "Unknown";

    return analyticsSuccess(
      {
        node,
        options: options.filter((option) => option.nodeId === id),
        nextSteps: nextSteps
          .map((row) => ({ nodeId: row.nodeId, label: labelFor(row.nodeId), count: row._count._all }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 10),
        visits: visits.length,
      },
      context,
    );
  } catch (error) {
    return analyticsError(error);
  }
}
