import prisma from "@/lib/prisma";

/**
 * Fixed-window rate limiting backed by Postgres.
 *
 * The counter lives in the database rather than in process memory because
 * every Vercel lambda has its own heap: an in-memory Map meant the real limit
 * was `limit x number of live instances`, and it reset on every cold start.
 *
 * The increment is a single atomic upsert, so concurrent lambdas cannot race
 * past the limit.
 */
export async function checkRateLimit(key: string, limit: number, windowMs: number): Promise<boolean> {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + windowMs);

  try {
    const rows = await prisma.$queryRaw<{ count: number }[]>`
      INSERT INTO "RateLimitCounter" ("key", "windowStart", "count", "expiresAt")
      VALUES (${key}, ${now}, 1, ${expiresAt})
      ON CONFLICT ("key") DO UPDATE SET
        "count"       = CASE WHEN "RateLimitCounter"."expiresAt" <= ${now} THEN 1 ELSE "RateLimitCounter"."count" + 1 END,
        "windowStart" = CASE WHEN "RateLimitCounter"."expiresAt" <= ${now} THEN ${now} ELSE "RateLimitCounter"."windowStart" END,
        "expiresAt"   = CASE WHEN "RateLimitCounter"."expiresAt" <= ${now} THEN ${expiresAt} ELSE "RateLimitCounter"."expiresAt" END
      RETURNING "count";
    `;
    const count = Number(rows[0]?.count ?? 1);
    return count <= limit;
  } catch (error) {
    // Fail open. A database problem must not lock every user out of the
    // product; the failure is logged so it is still visible.
    console.error("[rateLimit] counter unavailable, allowing request:", error);
    return true;
  }
}

/** Clears one key. Used by tests and by successful-login resets. */
export async function resetRateLimit(key: string): Promise<void> {
  try {
    await prisma.rateLimitCounter.deleteMany({ where: { key } });
  } catch (error) {
    console.error("[rateLimit] could not reset key:", error);
  }
}

/**
 * Removes expired counters. Called opportunistically rather than on a
 * schedule so that no always-on process is required.
 */
export async function pruneRateLimits(): Promise<void> {
  try {
    await prisma.rateLimitCounter.deleteMany({ where: { expiresAt: { lte: new Date() } } });
  } catch (error) {
    console.error("[rateLimit] prune failed:", error);
  }
}
