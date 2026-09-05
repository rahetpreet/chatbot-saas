#!/usr/bin/env node
/**
 * Pushes selected variables from your local .env into the Vercel project.
 *
 * Run it yourself: it uses your own Vercel login, and secret values go
 * straight from .env to Vercel without being printed anywhere.
 *
 *   node scripts/sync-vercel-env.mjs            # show what would change
 *   node scripts/sync-vercel-env.mjs --apply    # actually push
 *
 * Only the keys listed in SYNCED below are touched. Anything already set in
 * Vercel is replaced, so this is safe to re-run.
 */

import { readFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";

const APPLY = process.argv.includes("--apply");
const ENVIRONMENTS = ["production", "preview"];

/**
 * Keys worth syncing.
 *
 * `rejectIf` blocks a value that is fine locally but wrong in production.
 * .env is a development file, so pushing it wholesale would set APP_URL to
 * localhost and storage to the local filesystem — both of which break a
 * deployed app. Such values are reported and skipped rather than pushed.
 */
const SYNCED = [
  {
    key: "DATABASE_URL",
    why: "Pooled Neon URL. Must include pgbouncer=true or transactions fail intermittently.",
    rejectIf: (value) =>
      !value.includes("pgbouncer=true") && "missing pgbouncer=true — fix it in .env before pushing",
  },
  { key: "DIRECT_URL", why: "Non-pooled Neon URL. Required by prisma migrate deploy during the build." },
  { key: "ENCRYPTION_KEY", why: "Encrypts AI keys and SMTP passwords at rest." },
  {
    key: "APP_URL",
    why: "Used to build password-reset and tracking links.",
    rejectIf: (value) =>
      /localhost|127\.0\.0\.1/.test(value) && "points at localhost — set your production URL in .env first",
  },
  { key: "AI_PROVIDER", why: "gemini | groq | openrouter | ollama | disabled" },
  { key: "AI_API_KEY", why: "Platform AI key, shared by every workspace." },
  { key: "AI_MODEL", why: "Optional; blank uses the provider default." },
  { key: "GEMINI_API_KEY", why: "Backup provider key." },
  { key: "GROQ_API_KEY", why: "Backup provider. Free key at https://console.groq.com/keys" },
  { key: "OPENROUTER_API_KEY", why: "Optional third provider." },
  {
    key: "VERCEL_API_TOKEN",
    why: "Registers custom domains automatically. Create at https://vercel.com/account/tokens",
  },
  { key: "VERCEL_PROJECT_ID", why: "From .vercel/project.json. Injected on Vercel, so usually not needed here." },
  { key: "VERCEL_TEAM_ID", why: "Only when the project belongs to a team. This is orgId in .vercel/project.json." },
  {
    key: "STORAGE_PROVIDER",
    why: "Must be 'blob' in production; 'local' is refused on serverless.",
    rejectIf: (value) => value === "local" && "'local' is refused in production — set it to 'blob'",
  },
  {
    key: "EMAIL_PROVIDER",
    why: "smtp in production, console locally.",
    rejectIf: (value) => value === "console" && "'console' means no email is ever delivered — set it to 'smtp'",
  },
  { key: "SMTP_HOST", why: "" },
  { key: "SMTP_PORT", why: "" },
  { key: "SMTP_USER", why: "" },
  { key: "SMTP_PASSWORD", why: "Gmail App Password, not your account password." },
  {
    key: "SMTP_FROM_EMAIL",
    why: "",
    rejectIf: (value) => value.endsWith(".local") && "placeholder address — set a real sender in .env",
  },
  { key: "SMTP_FROM_NAME", why: "" },
  { key: "PLATFORM_DOMAIN", why: "Optional; extra hostname that is the platform, not a customer domain." },
];

function parseEnvFile(path) {
  const out = {};
  if (!existsSync(path)) return out;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[match[1]] = value;
  }
  return out;
}

/** Never print a secret; show only enough to confirm it is the right one. */
function preview(key, value) {
  if (/KEY|PASSWORD|SECRET|TOKEN/.test(key)) return `${value.slice(0, 3)}…${value.slice(-3)} (${value.length} chars)`;
  if (key.endsWith("_URL") && value.includes("@")) {
    return value.replace(/\/\/[^@]*@/, "//***:***@");
  }
  return value;
}

/**
 * Production values live in .env.vercel; .env stays your local development
 * file. Keeping them apart is what stops a localhost URL or the console email
 * recorder being pushed to a live site. .env.vercel wins per key, and .env
 * fills in anything it does not define.
 */
const localEnv = parseEnvFile(".env");
const prodEnv = parseEnvFile(".env.vercel");
const env = { ...localEnv, ...prodEnv };

if (Object.keys(prodEnv).length === 0) {
  console.log("\nNote: no .env.vercel found, so values are read from .env.");
  console.log("Copy .env.vercel.example to .env.vercel and fill it in for production values.");
}

const push = [];
const blocked = [];
const missing = [];

/**
 * Cross-field checks. A setting can be individually valid but wrong in
 * combination — "use SMTP" with no password is the worst kind, because email
 * then fails silently and users are told to check an inbox nothing arrives in.
 */
const CROSS_CHECKS = {
  EMAIL_PROVIDER: (value) =>
    value === "smtp" &&
    !env.SMTP_PASSWORD &&
    "set to 'smtp' but SMTP_PASSWORD is empty, so no email would ever be delivered",
};

/**
 * Not wrong, just worth knowing. BLOB_READ_WRITE_TOKEN, for instance, is
 * injected by Vercel and never exists locally, so its absence here says
 * nothing about whether storage will work.
 */
const CROSS_WARNINGS = {
  STORAGE_PROVIDER: (value) =>
    value === "blob" &&
    "uploads need a Blob store: Vercel dashboard -> Storage -> Blob -> Create, then connect it to this project",
};

const warnings = [];

for (const entry of SYNCED) {
  const value = env[entry.key];
  if (!value) {
    missing.push(entry);
    continue;
  }
  const rejection = entry.rejectIf?.(value) || CROSS_CHECKS[entry.key]?.(value);
  if (rejection) {
    blocked.push({ ...entry, rejection });
    continue;
  }
  const warning = CROSS_WARNINGS[entry.key]?.(value);
  if (warning) warnings.push(`${entry.key}: ${warning}`);
  push.push(entry);
}

console.log(`\nReading .env — ${push.length} ready to push, ${blocked.length} blocked, ${missing.length} not set.\n`);

for (const { key } of push) console.log(`  push     ${key.padEnd(18)} ${preview(key, env[key])}`);

if (blocked.length) {
  console.log("\n  Not pushed — these would break the live site:");
  for (const { key, rejection } of blocked) console.log(`  SKIP     ${key.padEnd(18)} ${rejection}`);
}

if (missing.length) {
  console.log("");
  for (const { key, why } of missing) console.log(`  not set  ${key.padEnd(18)} ${why}`);
}

if (env.AI_PROVIDER && !["disabled", "ollama"].includes(env.AI_PROVIDER) && !env.AI_API_KEY) {
  warnings.push(`AI_PROVIDER is '${env.AI_PROVIDER}' but AI_API_KEY is empty — AI falls back to rule-based replies`);
}

if (warnings.length) {
  console.log("\n  Worth knowing:");
  for (const warning of warnings) console.log(`  ! ${warning}`);
}

if (!APPLY) {
  console.log("\nNothing pushed. Re-run with --apply to push the values marked 'push'.\n");
  process.exit(0);
}

if (push.length === 0) {
  console.log("\nNothing to push. Fix the blocked values in .env first.\n");
  process.exit(1);
}

console.log("\nPushing to Vercel…\n");
let failures = 0;

for (const { key } of push) {
  for (const environment of ENVIRONMENTS) {
    // Remove first so re-running replaces rather than erroring on a duplicate.
    spawnSync("npx", ["vercel", "env", "rm", key, environment, "--yes"], {
      stdio: "ignore",
      shell: process.platform === "win32",
    });

    const result = spawnSync("npx", ["vercel", "env", "add", key, environment], {
      input: `${env[key]}\n`,
      stdio: ["pipe", "ignore", "pipe"],
      shell: process.platform === "win32",
    });

    if (result.status === 0) {
      console.log(`  ok    ${key} → ${environment}`);
    } else {
      failures++;
      console.log(`  FAIL  ${key} → ${environment}: ${String(result.stderr || "").trim().split("\n").pop()}`);
    }
  }
}

console.log(
  failures
    ? `\nDone with ${failures} failure(s). Check that you are linked to the right project: npx vercel link\n`
    : "\nDone. Redeploy for the new values to take effect: npx vercel --prod\n",
);
process.exit(failures ? 1 : 0);
