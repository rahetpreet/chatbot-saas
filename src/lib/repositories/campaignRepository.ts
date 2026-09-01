import prisma from "@/lib/prisma";

export class CampaignRepository {
  static async findByTenant(tenantId: string) {
    return prisma.campaign.findMany({
      where: { tenantId, deletedAt: null },
      orderBy: { createdAt: "desc" },
      include: {
        _count: {
          select: {
            contacts: true,
          },
        },
      },
    });
  }

  static async findById(tenantId: string, id: string) {
    return prisma.campaign.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: {
        contacts: true,
      },
    });
  }

  static async create(tenantId: string, data: {
    name: string;
    slug: string;
    flowId?: string;
    metadata?: string;
  }) {
    return prisma.campaign.create({
      data: {
        tenantId,
        name: data.name,
        slug: data.slug,
        flowId: data.flowId,
        metadata: data.metadata,
      },
    });
  }

  static async update(tenantId: string, id: string, data: {
    name?: string;
    slug?: string;
    flowId?: string;
    metadata?: string;
  }) {
    return prisma.campaign.updateMany({
      where: { id, tenantId, deletedAt: null },
      data,
    });
  }

  static async delete(tenantId: string, id: string) {
    return prisma.campaign.updateMany({
      where: { id, tenantId, deletedAt: null },
      data: { deletedAt: new Date() },
    });
  }

  static async findBySlug(tenantId: string, slug: string) {
    return prisma.campaign.findFirst({
      where: { tenantId, slug, deletedAt: null },
    });
  }
}
