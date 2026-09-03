import prisma from "@/lib/prisma";

export async function assertTenantFeature(tenantId: string, featureKey: string): Promise<boolean> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    include: {
      subscriptions: {
        where: { status: "ACTIVE" },
        include: {
          plan: {
            include: {
              features: {
                where: { key: featureKey, enabled: true },
              },
            },
          },
        },
        take: 1,
      },
    },
  });

  if (!tenant) {
    throw new Error("Tenant not found.");
  }

  if (!["TRIAL", "ACTIVE"].includes(tenant.status)) {
    throw new Error("Workspace subscription is inactive or suspended.");
  }

  // If subscription & plan feature exists, verify it
  const activeSub = tenant.subscriptions[0];
  if (activeSub?.plan?.features?.length) {
    return true;
  }

  // Fallback defaults by plan tier if custom features are not explicitly seeded
  const tier = tenant.planTier || "STARTER";
  const proFeatures = ["custom_smtp", "ai_assistant", "knowledge_base", "webhooks", "api_access", "export_data"];
  const enterpriseFeatures = [...proFeatures, "sso", "dedicated_support", "audit_export"];

  if (tier === "ENTERPRISE" && enterpriseFeatures.includes(featureKey)) return true;
  if (tier === "PRO" && proFeatures.includes(featureKey)) return true;
  if (tier === "STARTER" && ["custom_smtp", "export_data"].includes(featureKey)) return true;
  if (tier === "FREE" && ["basic_flows"].includes(featureKey)) return true;

  // By default allow basic operations unless explicitly restricted
  if (["basic_flows", "contacts", "leads"].includes(featureKey)) return true;

  return true;
}

export async function assertUsageAvailable(
  tenantId: string,
  metric: "flows" | "campaigns" | "messages" | "storage",
  additionalQuantity = 1,
): Promise<{ allowed: boolean; current: number; limit: number }> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: {
      id: true,
      status: true,
      maxFlows: true,
      maxCampaignLinks: true,
      maxMessagesPerMonth: true,
      maxStorageMb: true,
      _count: {
        select: {
          flows: { where: { deletedAt: null } },
          campaigns: { where: { deletedAt: null } },
          campaignContacts: { where: { deletedAt: null } },
          conversations: true,
        },
      },
    },
  });

  if (!tenant) {
    throw new Error("Tenant not found.");
  }

  if (!["TRIAL", "ACTIVE"].includes(tenant.status)) {
    throw new Error("Workspace is currently paused or inactive.");
  }

  let current = 0;
  let limit = 0;

  switch (metric) {
    case "flows":
      current = tenant._count.flows;
      limit = tenant.maxFlows;
      break;
    case "campaigns":
      // maxCampaignLinks limits personalized contact links, not campaign shells.
      current = tenant._count.campaignContacts;
      limit = tenant.maxCampaignLinks;
      break;
    case "messages":
      // Count messages this month
      const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
      current = await prisma.message.count({
        where: {
          conversation: { tenantId },
          timestamp: { gte: startOfMonth },
        },
      });
      limit = tenant.maxMessagesPerMonth;
      break;
    case "storage":
      const attachmentBytes = await prisma.attachment.aggregate({
        where: { tenantId },
        _sum: { sizeBytes: true },
      });
      current = attachmentBytes._sum.sizeBytes || 0;
      limit = tenant.maxStorageMb;
      break;
  }

  const normalizedLimit = metric === "storage" ? limit * 1024 * 1024 : limit;
  if (current + Math.max(0, additionalQuantity) > normalizedLimit) {
    const displayCurrent = metric === "storage" ? Math.ceil(current / (1024 * 1024)) : current;
    throw new Error(`Usage limit exceeded for ${metric}: ${displayCurrent}/${limit}. Please upgrade your workspace plan.`);
  }

  return { allowed: true, current: metric === "storage" ? Math.ceil(current / (1024 * 1024)) : current, limit };
}

/**
 * Records consumption against the current billing period.
 *
 * `assertUsageAvailable` counts live rows, which stays correct as data is
 * deleted; these records are the durable history behind usage reporting and
 * were never written despite the table existing since the initial schema.
 * Failures are swallowed on purpose: metering must never break the request
 * that produced the usage.
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
