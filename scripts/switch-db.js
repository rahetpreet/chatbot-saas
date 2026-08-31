const fs = require("fs");
const path = require("path");

const target = process.argv[2] || "sqlite"; // sqlite or postgres

const root = path.join(__dirname, "..");
const schemaPrisma = path.join(root, "prisma", "schema.prisma");
const sqliteSchema = path.join(root, "prisma", "schema.sqlite.prisma");
const postgresSchema = path.join(root, "prisma", "schema.postgres.prisma");

// If postgres backup doesn't exist yet, save current as postgres schema
if (!fs.existsSync(postgresSchema)) {
  const current = fs.readFileSync(schemaPrisma, "utf-8");
  if (current.includes('provider = "postgresql"')) {
    fs.writeFileSync(postgresSchema, current);
  }
}

if (target === "sqlite") {
  if (fs.existsSync(sqliteSchema)) {
    fs.copyFileSync(sqliteSchema, schemaPrisma);
    console.log("✅ Switched Prisma Schema to SQLite (file:./dev.db)");
  }
} else if (target === "postgres") {
  if (fs.existsSync(postgresSchema)) {
    fs.copyFileSync(postgresSchema, schemaPrisma);
    console.log("✅ Switched Prisma Schema to PostgreSQL");
  }
}

// Generate .env.production.example
const envProdPath = path.join(root, ".env.production.example");
const envContent = `# ===================================================================
# 🚀 PRODUCTION ENVIRONMENT VARIABLES FOR VERCEL DEPLOYMENT
# ===================================================================

# 1. Database Configuration (Free Serverless PostgreSQL from Neon.tech or Supabase)
# Sign up free at https://console.neon.tech -> Create Project -> Copy Connection String
DATABASE_URL="postgresql://neondb_owner:YOUR_PASSWORD@ep-sample-123456.us-east-2.aws.neon.tech/neondb?sslmode=require"

# 2. App & Authentication
# Your live Vercel domain (e.g. https://chatbot-saas.vercel.app or custom domain)
NEXT_PUBLIC_APP_URL="https://your-chatbot-platform.vercel.app"
# Secure 32+ character secret key
JWT_SECRET="prod-jwt-secret-replace-with-a-random-32-char-string-12345"
APP_MODE="production"

# 3. Storage Provider
STORAGE_PROVIDER="local"
STORAGE_LOCAL_DIR="./public/uploads"

# 4. Optional SMTP Email (Free Brevo / Sendinblue or Gmail)
EMAIL_PROVIDER="console"
SMTP_HOST="smtp-relay.brevo.com"
SMTP_PORT="587"
SMTP_USER=""
SMTP_PASSWORD=""
SMTP_FROM="noreply@yourdomain.com"

# 5. Optional External AI Provider (Free Groq or OpenRouter)
AI_PROVIDER="disabled"
EXTERNAL_AI_PROVIDER="groq"
EXTERNAL_AI_API_KEY=""
`;
fs.writeFileSync(envProdPath, envContent);

