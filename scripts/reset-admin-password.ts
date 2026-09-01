import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/security/password";

const prisma = new PrismaClient();

async function main() {
  const email = "rahetpreet27@gmail.com";
  const password = "Ritmaser@1";
  const passwordHash = await hashPassword(password);

  console.log(`Setting password hash for ${email}...`);

  const existing = await prisma.user.findFirst({
    where: { email },
  });

  if (existing) {
    const updated = await prisma.user.update({
      where: { id: existing.id },
      data: {
        passwordHash,
        status: "ACTIVE",
        isActive: true,
        role: "SUPER_ADMIN",
      },
    });
    console.log(`✅ Successfully updated Super Admin password for ${updated.email} (ID: ${updated.id})`);
  } else {
    const created = await prisma.user.create({
      data: {
        email,
        name: "System Super Admin",
        role: "SUPER_ADMIN",
        passwordHash,
        status: "ACTIVE",
        isActive: true,
      },
    });
    console.log(`✅ Successfully created Super Admin user for ${created.email} (ID: ${created.id})`);
  }
}

main()
  .catch((e) => {
    console.error("Error resetting password:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
