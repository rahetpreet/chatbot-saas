import prisma from "@/lib/prisma";

export class FlowRepository {
  static async findByTenant(tenantId: string) {
    return prisma.flow.findMany({
      where: { tenantId, deletedAt: null },
      orderBy: { updatedAt: "desc" },
      include: {
        _count: {
          select: {
            conversations: true,
            analyticsEvents: true,
          },
        },
      },
    });
  }

  static async findById(tenantId: string, id: string) {
    return prisma.flow.findFirst({
      where: { id, tenantId, deletedAt: null },
    });
  }

  static async create(tenantId: string, data: {
    name: string;
    description?: string | null;
    nodes?: string;
    edges?: string;
    status?: string;
    version?: number;
    isDefault?: boolean;
  }) {
    return prisma.flow.create({
      data: {
        tenantId,
        name: data.name,
        description: data.description,
        status: data.status || "DRAFT",
        version: data.version || 1,
        isDefault: data.isDefault || false,
        nodes: data.nodes || "[]",
        edges: data.edges || "[]",
      },
    });
  }

  static async update(tenantId: string, id: string, data: {
    name?: string;
    description?: string | null;
    nodes?: string;
    edges?: string;
    status?: string;
    publishedNodes?: string | null;
    publishedEdges?: string | null;
  }) {
    return prisma.flow.updateMany({
      where: { id, tenantId, deletedAt: null },
      data,
    });
  }

  static async delete(tenantId: string, id: string) {
    return prisma.flow.updateMany({
      where: { id, tenantId, deletedAt: null },
      data: { deletedAt: new Date() },
    });
  }

  static async findByPublicId(id: string) {
    return prisma.flow.findFirst({
      where: { 
        id, 
        status: "PUBLISHED", 
        deletedAt: null,
        tenant: { 
          status: { in: ["TRIAL", "ACTIVE"] }, 
          deletedAt: null 
        } 
      },
    });
  }
}
