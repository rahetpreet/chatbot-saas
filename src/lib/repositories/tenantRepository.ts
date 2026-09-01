import prisma from "@/lib/prisma";

export class TenantRepository {
  static async findAll() {
    return prisma.tenant.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        _count: {
          select: {
            flows: { where: { deletedAt: null } },
            conversations: true,
            leads: { where: { deletedAt: null } },
            campaigns: { where: { deletedAt: null } },
            users: { where: { deletedAt: null } },
          },
        },
        users: {
          where: { deletedAt: null },
          select: { id: true, email: true, name: true, role: true, status: true, isActive: true },
        },
      },
    });
  }

  static async findById(id: string) {
    return prisma.tenant.findUnique({
      where: { id },
      include: {
        users: {
          where: { deletedAt: null },
          select: { id: true, email: true, name: true, role: true, status: true, isActive: true },
        },
      },
    });
  }

  static async findBySlug(slug: string) {
    return prisma.tenant.findUnique({
      where: { slug },
    });
  }

  static async create(data: {
    name: string;
    slug: string;
    status?: string;
    planTier?: string;
    maxMessagesPerMonth?: number;
    maxFlows?: number;
    maxCampaignLinks?: number;
    maxStorageMb?: number;
  }) {
    return prisma.tenant.create({
      data,
    });
  }

  static async update(id: string, data: {
    name?: string;
    status?: string;
    planTier?: string;
    maxMessagesPerMonth?: number;
    maxFlows?: number;
    maxCampaignLinks?: number;
    maxStorageMb?: number;
  }) {
    return prisma.tenant.update({
      where: { id },
      data,
    });
  }

  static async softDelete(id: string) {
    return prisma.tenant.update({
      where: { id },
      data: { status: "CANCELLED", deletedAt: new Date() },
    });
  }

  static async getUserWithTenant(tenantId: string) {
    return prisma.user.findFirst({
      where: {
        tenantId,
        role: { in: ["CLIENT_OWNER", "CLIENT_ADMIN"] },
        isActive: true,
      },
      orderBy: { createdAt: "asc" },
    });
  }

  static async getUsage(tenantId: string) {
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      include: {
        _count: {
          select: {
            flows: { where: { deletedAt: null } },
            campaigns: { where: { deletedAt: null } },
            conversations: true,
            leads: { where: { deletedAt: null } },
            contacts: { where: { deletedAt: null } },
            users: { where: { deletedAt: null } },
          },
        },
      },
    });

    if (!tenant) return null;

    const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const monthlyMessages = await prisma.message.count({
      where: {
        conversation: { tenantId },
        timestamp: { gte: startOfMonth },
      },
    });

    const attachmentBytes = await prisma.attachment.aggregate({
      where: { tenantId },
      _sum: { sizeBytes: true },
    });
    const usedStorageMb = Math.round((attachmentBytes._sum.sizeBytes || 0) / (1024 * 1024));

    return {
      tenant,
      usage: {
        monthlyMessages,
        flows: tenant._count.flows,
        campaigns: tenant._count.campaigns,
        conversations: tenant._count.conversations,
        leads: tenant._count.leads,
        contacts: tenant._count.contacts,
        users: tenant._count.users,
        storageMb: usedStorageMb,
      },
    };
  }
}
