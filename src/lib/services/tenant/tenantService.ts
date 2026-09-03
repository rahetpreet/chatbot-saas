import prisma from "@/lib/prisma";
import { generateTemporaryPassword, hashPassword } from "@/lib/security/password";
import { slugify } from "@/lib/utils";

export interface CreateTenantInput {
  name: string;
  slug?: string;
  adminEmail: string;
  adminName?: string;
  planTier?: "FREE" | "STARTER" | "PRO" | "ENTERPRISE";
  maxMessagesPerMonth?: number;
  maxFlows?: number;
  maxCampaignLinks?: number;
  maxStorageMb?: number;
  operatorUserId: string;
  ipAddress?: string;
}

export class TenantService {
  static async createTenant(input: CreateTenantInput) {
    const name = input.name?.trim();
    const email = input.adminEmail?.trim().toLowerCase();
    const slug = slugify(input.slug || name || "");
    if (!name || !email || !/^\S+@\S+\.\S+$/.test(email) || !slug) {
      throw new Error("Valid company details are required.");
    }

    const existing = await prisma.tenant.findFirst({
      where: { OR: [{ slug }, { users: { some: { email } } }] },
      select: { id: true },
    });
    if (existing) {
      throw new Error("A workspace or user with those details already exists.");
    }

    const temporaryPassword = generateTemporaryPassword(18);
    const passwordHash = await hashPassword(temporaryPassword);
    const planCode = input.planTier || "STARTER";

    const result = await prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: {
          name,
          slug,
          status: "ACTIVE",
          planTier: planCode,
          maxMessagesPerMonth: input.maxMessagesPerMonth ?? 5000,
          maxFlows: input.maxFlows ?? 5,
          maxCampaignLinks: input.maxCampaignLinks ?? 50,
          maxStorageMb: input.maxStorageMb ?? 100,
        },
      });

      const user = await tx.user.create({
        data: {
          tenantId: tenant.id,
          email,
          name: input.adminName?.trim() || `${name} Owner`,
          role: "CLIENT_OWNER",
          passwordHash,
          status: "ACTIVE",
          isActive: true,
          mustChangePassword: true,
        },
      });

      await tx.tenantUser.create({
        data: {
          tenantId: tenant.id,
          userId: user.id,
          role: "CLIENT_OWNER",
        },
      });

      const plan = await tx.plan.upsert({
        where: { code: planCode },
        create: { code: planCode, name: planCode },
        update: {},
      });

      await tx.subscription.create({
        data: {
          tenantId: tenant.id,
          planId: plan.id,
          status: "ACTIVE",
        },
      });

      await tx.flow.create({
        data: {
          tenantId: tenant.id,
          name: "Welcome flow",
          status: "DRAFT",
          isDefault: true,
          nodes: "[]",
          edges: "[]",
        },
      });

      await tx.auditLog.create({
        data: {
          tenantId: tenant.id,
          userId: input.operatorUserId,
          action: "TENANT_CREATED",
          ipAddress: input.ipAddress || null,
          details: JSON.stringify({ email, plan: planCode }),
        },
      });

      return { tenant, user };
    });

    return {
      success: true,
      credentials: {
        email: result.user.email,
        temporaryPassword,
        slug: result.tenant.slug,
        loginUrl: "/login",
      },
      tenant: result.tenant,
      data: {
        tenant: result.tenant,
        clientEmail: result.user.email,
        temporaryPassword,
        dashboardUrl: "/login",
        credentials: {
          email: result.user.email,
          temporaryPassword,
          slug: result.tenant.slug,
        },
      },
    };
  }

  static async resetClientPassword(tenantId: string, operatorUserId: string, ipAddress?: string) {
    const temporaryPassword = generateTemporaryPassword(18);
    const passwordHash = await hashPassword(temporaryPassword);

    const user = await prisma.$transaction(async (tx) => {
      const owner = await tx.user.findFirst({
        where: { tenantId, role: { in: ["CLIENT_OWNER", "CLIENT_ADMIN"] }, isActive: true },
        orderBy: { createdAt: "asc" },
      });
      if (!owner) throw new Error("No active tenant owner was found.");

      await tx.user.update({
        where: { id: owner.id },
        data: {
          passwordHash,
          mustChangePassword: true,
          passwordResetTokenHash: null,
          passwordResetExpiresAt: null,
        },
      });

      await tx.session.deleteMany({ where: { userId: owner.id } });

      // An outstanding self-service reset link must not survive an admin
      // reset, or it could be used to take the account back.
      await tx.passwordResetToken.updateMany({
        where: { userId: owner.id, consumedAt: null },
        data: { consumedAt: new Date() },
      });

      await tx.auditLog.create({
        data: {
          tenantId,
          userId: operatorUserId,
          action: "PASSWORD_RESET_BY_ADMIN",
          ipAddress: ipAddress || null,
          details: JSON.stringify({ targetUserId: owner.id }),
        },
      });

      return owner;
    });

    return {
      success: true,
      credentials: {
        email: user.email,
        temporaryPassword,
        loginUrl: "/login",
      },
      data: {
        email: user.email,
        temporaryPassword,
        loginUrl: "/login",
        credentials: {
          email: user.email,
          temporaryPassword,
        },
      },
    };
  }

  static async pauseTenant(tenantId: string, operatorUserId: string, ipAddress?: string) {
    await prisma.$transaction([
      prisma.tenant.update({ where: { id: tenantId }, data: { status: "PAUSED" } }),
      prisma.session.deleteMany({ where: { tenantId } }),
      prisma.auditLog.create({ data: { tenantId, userId: operatorUserId, action: "TENANT_PAUSED", ipAddress: ipAddress || null } }),
    ]);
    return { success: true, message: "Workspace paused successfully." };
  }

  static async resumeTenant(tenantId: string, operatorUserId: string, ipAddress?: string) {
    await prisma.$transaction([
      prisma.tenant.update({ where: { id: tenantId }, data: { status: "ACTIVE" } }),
      prisma.auditLog.create({ data: { tenantId, userId: operatorUserId, action: "TENANT_RESUMED", ipAddress: ipAddress || null } }),
    ]);
    return { success: true, message: "Workspace resumed successfully." };
  }

  static async getTenantUsage(tenantId: string) {
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

    if (!tenant) throw new Error("Tenant not found.");

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
      success: true,
      tenantId: tenant.id,
      name: tenant.name,
      planTier: tenant.planTier,
      status: tenant.status,
      limits: {
        maxMessagesPerMonth: tenant.maxMessagesPerMonth,
        maxFlows: tenant.maxFlows,
        maxCampaignLinks: tenant.maxCampaignLinks,
        maxStorageMb: tenant.maxStorageMb,
      },
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

  /**
   * Permanently delete a tenant and all tenant-owned data.
   *
   * Tenant foreign keys are configured with `onDelete: Cascade` in the Prisma
   * schema. Deleting the root tenant is therefore both complete and resilient
   * when optional product tables have not yet been created in an older
   * installation.
   */
  /**
   * Archives a workspace. This is deliberately a soft delete.
   *
   * It used to be `tenant.deleteMany`, which cascaded through users, flows,
   * campaigns, conversations, contacts, leads and even the audit log, and
   * wrote no audit record of its own -- so a single mis-click destroyed a
   * customer's entire history and left nothing behind explaining what
   * happened. One click should never be able to do that.
   *
   * The workspace stops working immediately: it is marked CANCELLED, hidden
   * from listings by the `deletedAt` filters, and every session is revoked.
   * The rows remain, so it can be restored.
   */
  static async deleteTenant(tenantId: string, operatorUserId: string, ipAddress?: string) {
    const tenant = await prisma.tenant.findFirst({
      where: { id: tenantId, deletedAt: null },
      select: { id: true, name: true, slug: true },
    });
    if (!tenant) throw new Error("Tenant not found.");

    await prisma.$transaction([
      prisma.tenant.update({
        where: { id: tenantId },
        data: { deletedAt: new Date(), status: "CANCELLED" },
      }),
      // Revoke access straight away; the data staying put must not mean the
      // workspace stays usable.
      prisma.session.deleteMany({ where: { tenantId } }),
      prisma.auditLog.create({
        data: {
          tenantId: null, // survives the workspace it describes
          userId: operatorUserId,
          action: "TENANT_ARCHIVED",
          ipAddress: ipAddress || null,
          details: JSON.stringify({ tenantId, name: tenant.name, slug: tenant.slug }),
        },
      }),
    ]);

    return {
      success: true,
      message: `${tenant.name} has been archived. Its data is retained and can be restored.`,
    };
  }

  /** Reverses an archive. */
  static async restoreTenant(tenantId: string, operatorUserId: string, ipAddress?: string) {
    const tenant = await prisma.tenant.findFirst({
      where: { id: tenantId, deletedAt: { not: null } },
      select: { id: true, name: true },
    });
    if (!tenant) throw new Error("No archived workspace with that id.");

    await prisma.$transaction([
      prisma.tenant.update({
        where: { id: tenantId },
        data: { deletedAt: null, status: "ACTIVE" },
      }),
      prisma.auditLog.create({
        data: {
          tenantId,
          userId: operatorUserId,
          action: "TENANT_RESTORED",
          ipAddress: ipAddress || null,
          details: JSON.stringify({ tenantId, name: tenant.name }),
        },
      }),
    ]);

    return { success: true, message: `${tenant.name} has been restored.` };
  }
}
