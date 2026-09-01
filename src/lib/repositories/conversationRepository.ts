import prisma from "@/lib/prisma";

export class ConversationRepository {
  static async findByTenant(tenantId: string, options?: {
    status?: string;
    campaignId?: string;
    flowId?: string;
    limit?: number;
  }) {
    const where: Record<string, any> = { tenantId };

    if (options?.status && options.status !== "ALL") {
      where.sessionStatus = options.status;
    }
    if (options?.campaignId) {
      where.campaignContact = { campaignId: options.campaignId };
    }
    if (options?.flowId) {
      where.flowId = options.flowId;
    }

    return prisma.conversation.findMany({
      where,
      orderBy: { lastActiveAt: "desc" },
      take: options?.limit || 100,
      include: {
        flow: { select: { id: true, name: true } },
        campaignContact: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            campaign: { select: { name: true, slug: true } },
          },
        },
        messages: {
          orderBy: { timestamp: "desc" },
          take: 1,
        },
        _count: {
          select: { messages: true },
        },
      },
    });
  }

  static async findById(tenantId: string, id: string) {
    return prisma.conversation.findFirst({
      where: { id, tenantId },
      include: {
        flow: true,
        campaignContact: true,
        messages: { orderBy: { timestamp: "asc" } },
      },
    });
  }

  static async findByPublicToken(tokenHash: string) {
    return prisma.conversation.findFirst({
      where: { publicSessionTokenHash: tokenHash },
      include: {
        flow: true,
        tenant: true,
        messages: { orderBy: { timestamp: "asc" } },
      },
    });
  }

  static async create(data: {
    tenantId: string;
    flowId?: string;
    campaignContactId?: string;
    visitorId: string;
    publicSessionTokenHash: string;
    sessionStatus: string;
    currentNodeId?: string;
    collectedData: string;
    visitorInfo: string;
  }) {
    return prisma.conversation.create({
      data,
    });
  }

  static async update(id: string, data: {
    currentNodeId?: string;
    collectedData?: string;
    sessionStatus?: string;
    lastActiveAt?: Date;
    closedAt?: Date;
  }) {
    return prisma.conversation.update({
      where: { id },
      data,
    });
  }

  static async countMonthlyMessages(tenantId: string) {
    const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    return prisma.message.count({
      where: {
        conversation: { tenantId },
        timestamp: { gte: startOfMonth },
      },
    });
  }
}
