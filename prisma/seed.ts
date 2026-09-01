import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/security/password";

const prisma = new PrismaClient();

async function main() {
  console.log("Starting database seed...");
  
  // Check if SUPER_ADMIN already exists (idempotent)
  const exists = await prisma.user.findFirst({ where: { role: "SUPER_ADMIN" }, select: { id: true } });
  if (exists) {
    console.log("SUPER_ADMIN already exists, skipping bootstrap creation.");
    return;
  }
  
  const email = process.env.ADMIN_BOOTSTRAP_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_BOOTSTRAP_PASSWORD;
  
  if (!email || !password) {
    throw new Error("SUPER ADMIN BOOTSTRAP PASSWORD IS REQUIRED FOR INITIAL SETUP. Please set ADMIN_BOOTSTRAP_EMAIL and ADMIN_BOOTSTRAP_PASSWORD environment variables.");
  }
  
  console.log("Creating SUPER_ADMIN user...");
  await prisma.user.create({ 
    data: { 
      email, 
      name: "System Super Admin", 
      role: "SUPER_ADMIN", 
      passwordHash: await hashPassword(password), 
      status: "ACTIVE", 
      isActive: true 
    } 
  });
  
  console.log("SUPER_ADMIN created successfully.");
  console.log("IMPORTANT: The bootstrap password is ONLY for initial setup. Please change it after first login.");
}

main()
  .catch((error) => { 
    console.error("Seed error:", error.message); 
    process.exitCode = 1; 
  })
  .finally(() => prisma.$disconnect());
