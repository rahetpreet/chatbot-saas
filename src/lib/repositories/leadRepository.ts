import prisma from "@/lib/prisma";

export class LeadRepository {
  static async findByTenant(tenantId: string, options?: {
    status?: string;
    search?: string;
  }) {
    const where: Record<string, unknown> = { tenantId, deletedAt: null };
    
    if (options?.status && options.status !== "ALL") {
      where.status = options.status;
    }
    if (options?.search) {
      where.OR = [
        { name: { contains: options.search, mode: "insensitive" } },
        { email: { contains: options.search, mode: "insensitive" } },
        { phone: { contains: options.search, mode: "insensitive" } },
      ];
    }

    return prisma.lead.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        conversation: {
          select: {
            id: true,
            sessionStatus: true,
            startedAt: true,
            flow: { select: { name: true } },
          },
        },
      },
    });
  }

  static async findById(tenantId: string, id: string) {
    return prisma.lead.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: {
        conversation: true,
      },
    });
  }

  static async create(data: {
    tenantId: string;
    conversationId?: string;
    name?: string | null;
    email?: string | null;
    phone?: string | null;
    contactInfo?: string;
    collectedFields?: string;
    status?: string;
    score?: number;
  }) {
    return prisma.lead.create({
      data,
    });
  }

  static async update(tenantId: string, id: string, data: {
    status?: string;
    score?: number;
    notes?: string;
    assignedUserId?: string;
  }) {
    return prisma.lead.updateMany({
      where: { id, tenantId, deletedAt: null },
      data,
    });
  }

  static async delete(tenantId: string, id: string) {
    return prisma.lead.updateMany({
      where: { id, tenantId, deletedAt: null },
      data: { deletedAt: new Date() },
    });
  }
}
