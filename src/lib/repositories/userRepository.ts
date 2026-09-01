import prisma from "@/lib/prisma";

export class UserRepository {
  static async findByEmail(email: string) {
    return prisma.user.findUnique({
      where: { email },
      include: { tenant: true },
    });
  }

  static async findById(id: string) {
    return prisma.user.findUnique({
      where: { id },
      include: { tenant: true },
    });
  }

  static async findByTenant(tenantId: string) {
    return prisma.user.findMany({
      where: { tenantId, deletedAt: null },
      select: { id: true, email: true, name: true, role: true, status: true, isActive: true, createdAt: true },
    });
  }

  static async create(data: {
    tenantId?: string | null;
    email: string;
    name: string;
    passwordHash: string;
    role: string;
    status?: string;
    mustChangePassword?: boolean;
  }) {
    return prisma.user.create({
      data,
    });
  }

  static async update(id: string, data: {
    name?: string;
    passwordHash?: string;
    mustChangePassword?: boolean;
    isActive?: boolean;
    status?: string;
    passwordResetTokenHash?: string | null;
    passwordResetExpiresAt?: Date | null;
  }) {
    return prisma.user.update({
      where: { id },
      data,
    });
  }

  static async invalidateSessions(userId: string) {
    return prisma.session.deleteMany({
      where: { userId },
    });
  }

  static async findSuperAdmin() {
    return prisma.user.findFirst({
      where: { role: "SUPER_ADMIN" },
    });
  }

  static async findTenantOwner(tenantId: string) {
    return prisma.user.findFirst({
      where: {
        tenantId,
        role: { in: ["CLIENT_OWNER", "CLIENT_ADMIN"] },
        isActive: true,
      },
      orderBy: { createdAt: "asc" },
    });
  }
}
