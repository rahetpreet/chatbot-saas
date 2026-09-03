import prisma from "@/lib/prisma";

/**
 * Plan quotas are intentionally disabled.
 *
 * Feature gating and usage caps are a commercial decision, not a technical
 * one, and enforcing them today only got in the way. What remains enforced is
 * workspace *status*: a paused, expired or cancelled workspace must still stop
 * working, because that is how the platform operator suspends an account.
 *
 * Re-enabling quotas later means changing these two functions and nothing
 * else -- every call site already routes through them.
 */

const USABLE_STATUSES = ["TRIAL", "ACTIVE"];

async function assertWorkspaceUsable(tenantId: string): Promise<void> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { status: true, deletedAt: true },
  });

  if (!tenant || tenant.deletedAt) {
    const error = new Error("Workspace not found.") as Error & { code?: string };
    error.code = "NOT_FOUND";
    throw error;
  }

  if (!USABLE_STATUSES.includes(tenant.status)) {
    const error = new Error("This workspace is currently paused or inactive.") as Error & { code?: string };
    error.code = "SUBSCRIPTION_INACTIVE";
    throw error;
  }
}

/** Every feature is available on every plan. Status is still enforced. */
export async function assertTenantFeature(tenantId: string, _featureKey: string): Promise<boolean> {
  await assertWorkspaceUsable(tenantId);
  return true;
}

/**
 * Unlimited. Returns a shape compatible with the previous signature so call
 * sites and any UI reading `current`/`limit` keep working; `limit` of
 * `Infinity` is the honest representation of "no cap".
 */
export async function assertUsageAvailable(
  tenantId: string,
  _metric: "flows" | "campaigns" | "messages" | "storage" | string,
  _additionalQuantity = 1,
): Promise<{ allowed: boolean; current: number; limit: number }> {
  await assertWorkspaceUsable(tenantId);
  return { allowed: true, current: 0, limit: Number.POSITIVE_INFINITY };
}

/**
 * Records consumption against the current billing period.
 *
 * Nothing is capped, but the history is still worth keeping: it is what usage
 * reporting and any future billing would be built on. Failures are swallowed
 * on purpose -- metering must never break the request that produced it.
 */
export async function recordUsage(
  tenantId: string,
  metric: "messages" | "conversations" | "storage" | "ai_messages",
  quantity = 1,
): Promise<void> {
  if (quantity <= 0) return;
  const now = new Date();
  const period = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  try {
    await prisma.usageRecord.upsert({
      where: { tenantId_metric_period: { tenantId, metric, period } },
      create: { tenantId, metric, period, quantity },
      update: { quantity: { increment: quantity } },
    });
  } catch (error) {
    console.warn("[usage] could not record usage:", error);
  }
}
