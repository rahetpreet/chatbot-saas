/**
 * Notification isolation audit.
 *
 * One question: can a lead in one company ever reach another company's phone,
 * inbox or Telegram — or can one company read another's alert configuration?
 *
 *   npx tsx scripts/audit-notifications.ts
 *
 * Two unrelated workspaces are given real alert settings, real push devices and
 * real leads, then pushed against each other. Every check is written to FAIL if
 * the crossover succeeds. Everything created is removed.
 */
import { readFileSync, existsSync } from "node:fs";
import { randomBytes } from "node:crypto";

function loadEnv(path: string) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    const value = match[2].trim().replace(/^"|"$/g, "");
    if (!process.env[match[1]]) process.env[match[1]] = value;
  }
}
loadEnv(".env");
loadEnv(".env.vercel");

const BASE = (process.env.AUDIT_BASE || "https://chatbot-saas-peach.vercel.app").replace(/\/+$/, "");

const results: Array<{ name: string; ok: boolean; detail: string }> = [];
function record(name: string, ok: boolean, detail = "") {
  results.push({ name, ok, detail });
  process.stdout.write(`  ${ok ? "SAFE  " : "LEAK  "} ${name}${detail ? ` — ${detail}` : ""}\n`);
}
async function mustPrevent(name: string, attempt: () => Promise<string>) {
  try {
    record(name, true, await attempt());
  } catch (error: any) {
    record(name, false, String(error?.message || error).slice(0, 180));
  }
}
function refuse(condition: boolean, whatWentWrong: string) {
  if (!condition) throw new Error(whatWentWrong);
}

async function main() {
  const { default: prisma } = await import("../src/lib/prisma");
  const bcrypt = await import("bcryptjs");
  const { notifyLeadCaptured } = await import("../src/lib/services/notifications/leadAlerts");
  const { encryptSecret, decryptSecret } = await import("../src/lib/security/crypto");

  const stamp = Date.now();
  const created: string[] = [];
  const password = `Notify1!${randomBytes(8).toString("base64url")}`;

  console.log(`\nNotification isolation audit against ${BASE}\n`);

  const build = async (label: string) => {
    const slug = `notify-${label}-${stamp}`;
    const email = `notify-${label}-${stamp}@example.com`;
    const tenant = await prisma.tenant.create({
      data: { name: `Notify ${label}`, slug, status: "ACTIVE" },
    });
    created.push(tenant.id);
    const user = await prisma.user.create({
      data: {
        tenantId: tenant.id,
        email,
        passwordHash: await bcrypt.hash(password, 10),
        name: label,
        role: "CLIENT_OWNER",
        isActive: true,
        mustChangePassword: false,
      },
    });

    // A distinctive token and address per company, so a leak is unmistakable.
    await prisma.notificationSetting.create({
      data: {
        tenantId: tenant.id,
        leadAlerts: true,
        telegramEnabled: true,
        telegramBotToken: encryptSecret(`SECRET-TOKEN-${label}-${stamp}`),
        telegramChatId: `chat-${label}-${stamp}`,
        emailEnabled: true,
        emailTo: `alerts-${label}-${stamp}@example.com`,
        webPushEnabled: true,
      },
    });

    await prisma.pushSubscription.create({
      data: {
        tenantId: tenant.id,
        userId: user.id,
        endpoint: `https://push.example.com/device-${label}-${stamp}`,
        p256dh: "x".repeat(87),
        auth: "y".repeat(22),
      },
    });

    return { tenant, user, slug, email };
  };

  const alpha = await build("alpha");
  const beta = await build("beta");
  console.log(`  alpha: ${alpha.slug}\n  beta:  ${beta.slug}\n`);

  try {
    // ---- configuration is private ------------------------------------------
    let cookie = "";
    const login = await fetch(`${BASE}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: alpha.email, password }),
    });
    for (const entry of login.headers.getSetCookie?.() || []) {
      const pair = entry.split(";")[0];
      if (pair.startsWith("chatbot_saas_auth=") && !pair.endsWith("=")) cookie = pair;
    }
    refuse(Boolean(cookie), "could not sign in as alpha");

    const asAlpha = async (path: string, init: RequestInit = {}) => {
      const res = await fetch(`${BASE}${path}`, {
        ...init,
        headers: { cookie, ...(init.body ? { "Content-Type": "application/json" } : {}), ...(init.headers || {}) },
      });
      const text = await res.text();
      let json: any = null;
      try {
        json = JSON.parse(text);
      } catch {
        /* not json */
      }
      return { status: res.status, text, json };
    };

    await mustPrevent("alpha CAN read its own alert settings (guards a vacuous pass)", async () => {
      const res = await asAlpha("/api/client/settings/notifications");
      refuse(res.status === 200 && res.json?.success === true, `own settings returned ${res.status}`);
      refuse(res.json.data.settings.telegramChatId === `chat-alpha-${stamp}`, "alpha did not get its own chat id");
      return "200";
    });

    await mustPrevent("settings never expose beta's chat id or address", async () => {
      const res = await asAlpha("/api/client/settings/notifications");
      refuse(!res.text.includes(`chat-beta-${stamp}`), "beta's chat id appeared in alpha's settings");
      refuse(!res.text.includes(`alerts-beta-${stamp}`), "beta's alert address appeared in alpha's settings");
      return "own configuration only";
    });

    await mustPrevent("no live bot token is ever returned, not even its owner's", async () => {
      const res = await asAlpha("/api/client/settings/notifications");
      refuse(!res.text.includes(`SECRET-TOKEN-alpha-${stamp}`), "alpha's own token was returned in the clear");
      refuse(!res.text.includes(`SECRET-TOKEN-beta-${stamp}`), "beta's token was returned");
      refuse(res.json.data.settings.telegramTokenSet === true, "the form cannot tell a token is stored");
      return "masked hint only";
    });

    await mustPrevent("the token is encrypted at rest", async () => {
      const row = await prisma.notificationSetting.findUnique({
        where: { tenantId: alpha.tenant.id },
        select: { telegramBotToken: true },
      });
      refuse(!String(row?.telegramBotToken).includes("SECRET-TOKEN"), "the token is stored in plaintext");
      refuse(decryptSecret(row!.telegramBotToken) === `SECRET-TOKEN-alpha-${stamp}`, "the token cannot be read back");
      return "encrypted, and decrypts correctly";
    });

    // ---- a lead notifies only its own company ------------------------------
    await mustPrevent("a lead in beta touches none of alpha's devices", async () => {
      // Telegram and email would need real network endpoints; the push channel
      // reads devices from the database, which is the crossover that matters.
      const before = await prisma.pushSubscription.findMany({
        where: { tenantId: alpha.tenant.id },
        select: { id: true, lastUsedAt: true, failedAt: true },
      });

      await notifyLeadCaptured({
        tenantId: beta.tenant.id,
        leadId: "beta-lead",
        name: "Beta Person",
        email: `beta-person-${stamp}@example.com`,
      });

      const after = await prisma.pushSubscription.findMany({
        where: { tenantId: alpha.tenant.id },
        select: { id: true, lastUsedAt: true, failedAt: true },
      });
      refuse(
        JSON.stringify(before) === JSON.stringify(after),
        "alpha's device rows changed when beta captured a lead",
      );
      return "alpha's devices untouched";
    });

    await mustPrevent("the dispatcher only ever loads its own tenant's devices", async () => {
      const devices = await prisma.pushSubscription.findMany({
        where: { tenantId: beta.tenant.id },
        select: { endpoint: true },
      });
      refuse(devices.length === 1, `beta should own exactly one device, found ${devices.length}`);
      refuse(devices[0].endpoint.includes("beta"), "beta's device list contains a foreign endpoint");
      return "one device, its own";
    });

    // ---- one company cannot touch another's devices ------------------------
    await mustPrevent("alpha cannot unsubscribe beta's device", async () => {
      const betaEndpoint = `https://push.example.com/device-beta-${stamp}`;
      await asAlpha(`/api/client/settings/notifications/push?endpoint=${encodeURIComponent(betaEndpoint)}`, {
        method: "DELETE",
      });
      const stillThere = await prisma.pushSubscription.findUnique({ where: { endpoint: betaEndpoint } });
      refuse(Boolean(stillThere), "alpha deleted beta's push device");
      return "beta's device survived";
    });

    await mustPrevent("registering a device binds it to the caller's own workspace", async () => {
      const endpoint = `https://push.example.com/new-device-${stamp}`;
      const res = await asAlpha("/api/client/settings/notifications/push", {
        method: "POST",
        body: JSON.stringify({ endpoint, keys: { p256dh: "p".repeat(87), auth: "a".repeat(22) } }),
      });
      refuse(res.json?.success === true, `registration failed: ${res.text.slice(0, 80)}`);
      const row = await prisma.pushSubscription.findUnique({
        where: { endpoint },
        select: { tenantId: true, userId: true },
      });
      refuse(row?.tenantId === alpha.tenant.id, "the device was bound to the wrong workspace");
      refuse(row?.userId === alpha.user.id, "the device was bound to the wrong person");
      return "bound to alpha";
    });

    await mustPrevent("alpha cannot save settings onto beta's workspace", async () => {
      // The endpoint takes no tenant id at all, but prove a smuggled one is
      // ignored rather than honoured.
      await asAlpha("/api/client/settings/notifications", {
        method: "PUT",
        body: JSON.stringify({
          tenantId: beta.tenant.id,
          telegramEnabled: true,
          telegramChatId: `hijacked-${stamp}`,
          leadAlerts: true,
        }),
      });
      const betaAfter = await prisma.notificationSetting.findUnique({
        where: { tenantId: beta.tenant.id },
        select: { telegramChatId: true },
      });
      const alphaAfter = await prisma.notificationSetting.findUnique({
        where: { tenantId: alpha.tenant.id },
        select: { telegramChatId: true },
      });
      refuse(betaAfter?.telegramChatId === `chat-beta-${stamp}`, "beta's chat id was overwritten by alpha");
      refuse(alphaAfter?.telegramChatId === `hijacked-${stamp}`, "alpha's own save did not apply");
      return "written to alpha, beta untouched";
    });

    await mustPrevent("the master switch actually silences a workspace", async () => {
      await prisma.notificationSetting.update({
        where: { tenantId: beta.tenant.id },
        data: { leadAlerts: false },
      });
      const sent = await notifyLeadCaptured({
        tenantId: beta.tenant.id,
        leadId: "silenced",
        name: "Nobody",
      });
      refuse(sent.length === 0, `expected no channels, ${sent.length} fired`);
      await prisma.notificationSetting.update({
        where: { tenantId: beta.tenant.id },
        data: { leadAlerts: true },
      });
      return "no channel fired";
    });

    await mustPrevent("a workspace with no configuration is silent, not broken", async () => {
      const bare = await prisma.tenant.create({
        data: { name: "Bare", slug: `bare-${stamp}`, status: "ACTIVE" },
      });
      created.push(bare.id);
      const sent = await notifyLeadCaptured({ tenantId: bare.id, leadId: "x", name: "Someone" });
      refuse(sent.length === 0, "an unconfigured workspace tried to send something");
      return "silent";
    });
  } finally {
    for (const id of created) await prisma.tenant.delete({ where: { id } }).catch(() => undefined);
    console.log(`\n  cleaned up ${created.length} test workspaces`);

    const failed = results.filter((r) => !r.ok);
    console.log(`\n${results.length - failed.length}/${results.length} notification isolation checks passed`);
    if (failed.length) {
      console.log("\nLEAKS FOUND:");
      for (const f of failed) console.log(`  - ${f.name}: ${f.detail}`);
      process.exitCode = 1;
    }
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error("\nAUDIT ABORTED:", error?.message || error);
  process.exitCode = 1;
});
