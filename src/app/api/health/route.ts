import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * Liveness probe. Deliberately unauthenticated: this endpoint has to answer
 * precisely when auth is the thing that is broken. It reports reachability
 * only and never leaks row counts, schema details or error internals.
 */
export async function GET() {
  const startedAt = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({
      status: "ok",
      database: "connected",
      latencyMs: Date.now() - startedAt,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    // Log the real cause server-side; return an opaque failure to the caller.
    console.error("[health] database unreachable:", error);
    return NextResponse.json(
      {
        status: "error",
        database: "unreachable",
        latencyMs: Date.now() - startedAt,
        timestamp: new Date().toISOString(),
      },
      { status: 503 },
    );
  }
}
