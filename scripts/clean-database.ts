import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Checking for default / dummy tenants in Neon DB...");

  const tenants = await prisma.tenant.findMany({
    include: {
      users: true,
      _count: {
        select: {
          flows: true,
          conversations: true,
          leads: true,
        },
      },
    },
  });

  console.log(`Found ${tenants.length} tenants in database:`);
  for (const t of tenants) {
    console.log(`- Tenant: ${t.name} (ID: ${t.id}, Slug: ${t.slug}, Status: ${t.status}, Users: ${t.users.map(u => u.email).join(", ")})`);
  }

  // Delete any dummy tenants like 'Acme Corporation' or deletedAt != null
  for (const t of tenants) {
    if (t.slug === "acme-corp" || t.name === "Acme Corporation" || t.deletedAt !== null) {
      console.log(`Cleaning dummy/deleted tenant: ${t.name} (${t.id})...`);
      await prisma.session.deleteMany({ where: { tenantId: t.id } });
      await prisma.message.deleteMany({ where: { conversation: { tenantId: t.id } } });
      await prisma.conversation.deleteMany({ where: { tenantId: t.id } });
      await prisma.lead.deleteMany({ where: { tenantId: t.id } });
      await prisma.campaignContact.deleteMany({ where: { tenantId: t.id } });
      await prisma.campaign.deleteMany({ where: { tenantId: t.id } });
      await prisma.contact.deleteMany({ where: { tenantId: t.id } });
      await prisma.flow.deleteMany({ where: { tenantId: t.id } });
      await prisma.attachment.deleteMany({ where: { tenantId: t.id } });
      await prisma.analyticsEvent.deleteMany({ where: { tenantId: t.id } });
      await prisma.subscription.deleteMany({ where: { tenantId: t.id } });
      await prisma.tenantUser.deleteMany({ where: { tenantId: t.id } });
      await prisma.user.deleteMany({ where: { tenantId: t.id } });
      await prisma.auditLog.deleteMany({ where: { tenantId: t.id } });
      await prisma.tenant.delete({ where: { id: t.id } });
      console.log(`✅ Permanently removed tenant ${t.name}`);
    }
  }
}

main()
  .catch((e) => {
    console.error("Clean error:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
