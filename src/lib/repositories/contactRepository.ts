import prisma from "@/lib/prisma";

export class ContactRepository {
  static async findByTenant(tenantId: string, options?: { search?: string }) {
    const where: Record<string, any> = { tenantId, deletedAt: null };
    
    if (options?.search) {
      where.OR = [
        { name: { contains: options.search, mode: "insensitive" } },
        { email: { contains: options.search, mode: "insensitive" } },
        { phone: { contains: options.search, mode: "insensitive" } },
        { company: { contains: options.search, mode: "insensitive" } },
      ];
    }

    return prisma.contact.findMany({
      where,
      orderBy: { createdAt: "desc" },
    });
  }

  static async findById(tenantId: string, id: string) {
    return prisma.contact.findFirst({
      where: { id, tenantId, deletedAt: null },
    });
  }

  static async create(tenantId: string, data: {
    name?: string | null;
    email?: string | null;
    phone?: string | null;
    company?: string | null;
    source?: string;
  }) {
    return prisma.contact.create({
      data: {
        tenantId,
        name: data.name,
        email: data.email,
        phone: data.phone,
        company: data.company,
        source: data.source || "manual",
      },
    });
  }

  static async update(tenantId: string, id: string, data: {
    name?: string | null;
    email?: string | null;
    phone?: string | null;
    company?: string | null;
  }) {
    return prisma.contact.updateMany({
      where: { id, tenantId, deletedAt: null },
      data,
    });
  }

  static async delete(tenantId: string, id: string) {
    return prisma.contact.updateMany({
      where: { id, tenantId, deletedAt: null },
      data: { deletedAt: new Date() },
    });
  }

  static async findByEmail(tenantId: string, email: string) {
    return prisma.contact.findFirst({
      where: { tenantId, email, deletedAt: null },
    });
  }

  static async findByPhone(tenantId: string, phone: string) {
    return prisma.contact.findFirst({
      where: { tenantId, phone, deletedAt: null },
    });
  }
}
