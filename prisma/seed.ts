import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/security/password";

const prisma = new PrismaClient();

async function main() {
  const exists = await prisma.user.findFirst({ where: { role: "SUPER_ADMIN" }, select: { id: true } });
  if (exists) return;
  const email = process.env.ADMIN_BOOTSTRAP_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_BOOTSTRAP_PASSWORD;
  if (!email || !password) throw new Error("SUPER ADMIN BOOTSTRAP PASSWORD IS REQUIRED FOR INITIAL SETUP.");
  await prisma.user.create({ data: { email, name: "System Super Admin", role: "SUPER_ADMIN", passwordHash: await hashPassword(password), status: "ACTIVE", isActive: true } });
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; }).finally(() => prisma.$disconnect());
