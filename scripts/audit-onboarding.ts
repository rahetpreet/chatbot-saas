/**
 * New-client onboarding audit.
 *
 * Walks the entire journey a real client takes, over HTTP against the live
 * app, using only the buttons a person would use:
 *
 *   operator onboards the company → client signs in with the temporary
 *   password → is forced to change it → builds a flow → publishes it →
 *   operator connects their domain → client creates a campaign and links →
 *   a visitor opens a link and chats → a lead is captured → the client sees
 *   the conversation, the lead and the analytics → the domain disconnects
 *   cleanly.
 *
 *   npx tsx scripts/audit-onboarding.ts
 *
 * Nothing is seeded directly into the database except the super-admin fixture
 * this needs to log in as an operator: every client-facing step goes through
 * the real API, so a pass means onboarding genuinely works rather than that
 * the tables can be written to. Everything created is removed.
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

const results: Array<{ step: string; ok: boolean; detail: string }> = [];
let stepNumber = 0;

function record(step: string, ok: boolean, detail = "") {
  results.push({ step, ok, detail });
  process.stdout.write(`  ${ok ? "OK  " : "FAIL"} ${String(++stepNumber).padStart(2)}. ${step}${detail ? ` — ${detail}` : ""}\n`);
}

async function step(name: string, run: () => Promise<string>) {
  try {
    record(name, true, await run());
  } catch (error: any) {
    record(name, false, String(error?.message || error).slice(0, 200));
  }
}

function must(condition: boolean, whatFailed: string) {
  if (!condition) throw new Error(whatFailed);
}

/** Pulls the session cookie out of a login response. */
function sessionCookie(response: Response): string {
  for (const entry of response.headers.getSetCookie?.() || []) {
    const pair = entry.split(";")[0];
    if (pair.startsWith("chatbot_saas_auth=") && !pair.endsWith("=")) return pair;
  }
  return "";
}

async function main() {
  const { default: prisma } = await import("../src/lib/prisma");
  const bcrypt = await import("bcryptjs");

  const stamp = Date.now();
  const companyName = `Onboard Test ${stamp}`;
  const clientEmail = `onboard-${stamp}@example.com`;
  const domain = `onboard-${stamp}.example.com`;

  const operatorEmail = `operator-${stamp}@example.com`;
  const operatorPassword = `Op1!${randomBytes(9).toString("base64url")}`;

  console.log(`\nNew-client onboarding audit against ${BASE}\n`);

  // The one thing seeded directly: an operator to sign in as. Everything the
  // client does afterwards goes through the product.
  const operator = await prisma.user.create({
    data: {
      email: operatorEmail,
      passwordHash: await bcrypt.hash(operatorPassword, 10),
      name: "Audit Operator",
      role: "SUPER_ADMIN",
      isActive: true,
      mustChangePassword: false,
    },
  });

  let tenantId: string | null = null;

  try {
    // ---- 1. the operator signs in ------------------------------------------
    let operatorCookie = "";
    await step("operator signs in", async () => {
      const res = await fetch(`${BASE}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: operatorEmail, password: operatorPassword }),
      });
      operatorCookie = sessionCookie(res);
      must(Boolean(operatorCookie), `login failed (${res.status})`);
      return "signed in";
    });
    if (!operatorCookie) throw new Error("cannot continue without an operator session");

    const asOperator = (path: string, init: RequestInit = {}) =>
      fetch(`${BASE}${path}`, {
        ...init,
        headers: {
          cookie: operatorCookie,
          ...(init.body ? { "Content-Type": "application/json" } : {}),
          ...(init.headers || {}),
        },
      });

    // ---- 2. onboard the company --------------------------------------------
    let clientPassword = "";
    let slug = "";
    await step("operator onboards a new company", async () => {
      const res = await asOperator("/api/admin/tenants", {
        method: "POST",
        body: JSON.stringify({
          name: companyName,
          adminEmail: clientEmail,
          adminName: "New Client",
          planTier: "PRO",
        }),
      });
      const json = await res.json();
      must(res.status === 201 && json.success, json.error?.message || `status ${res.status}`);
      must(Boolean(json.credentials?.temporaryPassword), "no temporary password was issued");
      clientPassword = json.credentials.temporaryPassword;
      slug = json.credentials.slug || json.tenant?.slug;
      tenantId = json.tenant?.id;
      must(Boolean(slug && tenantId), "the workspace came back without a slug or id");
      return `${companyName} → /${slug}`;
    });
    if (!tenantId) throw new Error("cannot continue without a workspace");

    await step("the temporary password is not a guessable one", async () => {
      must(clientPassword.length >= 12, `only ${clientPassword.length} characters`);
      must(/[a-z]/.test(clientPassword) && /[A-Z]/.test(clientPassword), "not mixed case");
      must(/[0-9]/.test(clientPassword), "no digit");
      return `${clientPassword.length} characters, mixed`;
    });

    // ---- 3. the client signs in and is forced to change it ------------------
    let clientCookie = "";
    await step("the new client can sign in with it", async () => {
      const res = await fetch(`${BASE}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: clientEmail, password: clientPassword }),
      });
      const json = await res.json();
      clientCookie = sessionCookie(res);
      must(Boolean(clientCookie), json.error?.message || `login failed (${res.status})`);
      const mustChange = json.user?.mustChangePassword ?? json.data?.user?.mustChangePassword;
      must(mustChange === true, "the client was not asked to change the temporary password");
      return "signed in, change required";
    });

    const newPassword = `Client1!${randomBytes(9).toString("base64url")}`;
    const asClient = (path: string, init: RequestInit = {}) =>
      fetch(`${BASE}${path}`, {
        ...init,
        headers: {
          cookie: clientCookie,
          ...(init.body ? { "Content-Type": "application/json" } : {}),
          ...(init.headers || {}),
        },
      });

    await step("the client sets their own password", async () => {
      const res = await asClient("/api/auth/change-password", {
        method: "POST",
        // confirmPassword is part of the contract: the form asks twice.
        body: JSON.stringify({ currentPassword: clientPassword, newPassword, confirmPassword: newPassword }),
      });
      const json = await res.json().catch(() => ({}));
      must(res.ok && json.success !== false, json.error?.message || `status ${res.status}`);

      // Changing the password ends existing sessions, so sign in afresh.
      const again = await fetch(`${BASE}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: clientEmail, password: newPassword }),
      });
      clientCookie = sessionCookie(again);
      must(Boolean(clientCookie), "could not sign in with the new password");
      return "changed and re-authenticated";
    });

    await step("the old temporary password no longer works", async () => {
      const res = await fetch(`${BASE}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: clientEmail, password: clientPassword }),
      });
      must(!sessionCookie(res), "the temporary password still signs in");
      return `${res.status}`;
    });

    // ---- 4. the client builds and publishes a chatbot -----------------------
    let flowId = "";
    await step("the client creates a chatbot", async () => {
      const res = await asClient("/api/client/chatbots", {
        method: "POST",
        body: JSON.stringify({ name: "Welcome bot" }),
      });
      const json = await res.json();
      flowId = json.flow?.id || json.data?.flow?.id || json.chatbot?.id;
      must(Boolean(flowId), json.error?.message || `no flow returned (${res.status})`);
      return "created";
    });

    await step("a new chatbot arrives with a usable starter flow", async () => {
      const res = await asClient(`/api/client/chatbots/${flowId}`);
      const json = await res.json();
      const flow = json.flow || json.data?.flow;
      const nodes = JSON.parse(flow?.nodes || "[]");
      // A brand-new client should not face an empty canvas that refuses to
      // publish; the starter template is what makes the first minute work.
      must(nodes.length > 0, "the new chatbot has no nodes at all");
      return `${nodes.length} nodes ready to edit`;
    });

    await step("the client publishes it", async () => {
      const res = await asClient(`/api/client/chatbots/${flowId}/publish`, { method: "POST" });
      const json = await res.json().catch(() => ({}));
      must(res.ok, json.error?.message || json.error || `status ${res.status}`);
      return `version ${json.flow?.version ?? json.data?.flow?.version ?? "?"} live`;
    });

    // ---- 5. the operator connects the client's domain ----------------------
    await step("the operator connects the client's domain", async () => {
      const res = await asOperator("/api/admin/domains", {
        method: "POST",
        body: JSON.stringify({ tenantId, domain }),
      });
      const json = await res.json();
      must(json.success, json.error?.message || `status ${res.status}`);
      must(Boolean(json.data?.dns?.records?.length), "no DNS records were returned to hand the client");
      const record = json.data.dns.records[0];
      must(Boolean(record.type && record.value), "the DNS record is incomplete");
      return `${record.type} ${record.name} → ${record.value}`;
    });

    await step("the client is told exactly what to do next", async () => {
      const res = await asOperator("/api/admin/domains");
      const json = await res.json();
      const row = (json.data?.domains || []).find((d: any) => d.tenantId === tenantId);
      must(Boolean(row), "the workspace is missing from the domain list");
      must(Boolean(row.dns?.steps?.length), "no setup steps were produced");
      must(
        row.dns.steps.some((s: any) => s.who === "client"),
        "there is no step telling the client what they must do",
      );
      must(Boolean(row.dns.proxyWarning), "the Cloudflare proxy warning is missing");
      return `${row.dns.steps.length} steps, live check says: ${row.detail}`;
    });

    await step("an unverified domain is honestly reported as not serving", async () => {
      const res = await asOperator("/api/admin/domains");
      const json = await res.json();
      const row = (json.data?.domains || []).find((d: any) => d.tenantId === tenantId);
      // The domain does not exist, so claiming it is live would be the
      // dangerous outcome — that is what sends a client chasing a dead link.
      must(row.live === false, "a non-existent domain was reported as live");
      return "reported not live";
    });

    await step("another company cannot take that domain", async () => {
      const second = await asOperator("/api/admin/tenants", {
        method: "POST",
        body: JSON.stringify({ name: `Rival ${stamp}`, adminEmail: `rival-${stamp}@example.com` }),
      });
      const rival = await second.json();
      const rivalId = rival.tenant?.id;
      must(Boolean(rivalId), "could not create the second company");

      const clash = await asOperator("/api/admin/domains", {
        method: "POST",
        body: JSON.stringify({ tenantId: rivalId, domain }),
      });
      const clashJson = await clash.json();
      await prisma.tenant.delete({ where: { id: rivalId } }).catch(() => undefined);

      must(clash.status === 409 || clashJson.success === false, "a second company took the same domain");
      return `refused (${clash.status})`;
    });

    // ---- 6. campaign and links ---------------------------------------------
    let campaignId = "";
    let campaignSlug = "";
    await step("the client creates a campaign", async () => {
      campaignSlug = `launch-${stamp}`;
      const res = await asClient("/api/client/campaigns", {
        method: "POST",
        body: JSON.stringify({ name: "Launch campaign", slug: campaignSlug, flowId }),
      });
      const json = await res.json();
      campaignId = json.campaign?.id || json.data?.campaign?.id;
      must(Boolean(campaignId), json.error?.message || `status ${res.status}`);
      return `/${campaignSlug}`;
    });

    // ---- 7. a real visitor arrives ------------------------------------------
    const visitorId = `onboard-visitor-${stamp}`;
    let conversationId = "";
    let sessionToken = "";
    await step("a visitor opens the chat and it responds", async () => {
      const res = await fetch(`${BASE}/api/public/v1/sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantSlug: slug, visitorId, campaignSlug }),
      });
      const json = await res.json();
      must(json.success, json.error?.message || `status ${res.status}`);
      conversationId = json.conversationId;
      sessionToken = json.sessionToken;
      must(Boolean(json.messages?.length), "the bot said nothing to the visitor");
      return `${json.messages.length} opening message(s)`;
    });

    await step("the visitor's details become a lead", async () => {
      const res = await fetch(`${BASE}/api/public/v1/leads`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId,
          sessionToken,
          name: "Priya Menon",
          email: `priya-${stamp}@example.com`,
          phone: "+91 98765 43210",
        }),
      });
      const json = await res.json();
      must(json.success, json.error?.message || `status ${res.status}`);
      return "captured";
    });

    // ---- 8. the client sees it all -----------------------------------------
    await step("the conversation appears in the client's inbox", async () => {
      const res = await asClient("/api/client/conversations");
      const json = await res.json();
      const found = (json.conversations || []).find((c: any) => c.id === conversationId);
      must(Boolean(found), "the conversation is not in the inbox");
      return `${json.conversations.length} in inbox`;
    });

    await step("the inbox names the person, not the browser id", async () => {
      const { describeVisitor } = await import("../src/lib/services/conversation/identity");
      const res = await asClient("/api/client/conversations");
      const json = await res.json();
      const found = (json.conversations || []).find((c: any) => c.id === conversationId);
      const who = describeVisitor(found);
      must(!who.title.includes(visitorId), `the row is titled with the raw id: ${who.title}`);
      return `titled "${who.title}"`;
    });

    await step("the lead appears in the client's leads list", async () => {
      const res = await asClient("/api/client/leads");
      const json = await res.json();
      const leads = json.leads || json.data?.leads || [];
      must(leads.some((l: any) => l.email === `priya-${stamp}@example.com`), "the lead is missing");
      return `${leads.length} lead(s)`;
    });

    await step("the dashboard shows the activity", async () => {
      const res = await asClient("/api/client/dashboard?preset=last30");
      const json = await res.json();
      must(json.success, json.error?.message || `status ${res.status}`);
      must(json.data.metrics.conversationsStarted >= 1, "the dashboard shows no conversations");
      must(json.data.metrics.totalLeads >= 1, "the dashboard shows no leads");
      // A workspace that has just had its first chat is no longer "new".
      must(json.data.setup.hasConversation === true, "the setup checklist still says no conversations");
      return `${json.data.metrics.conversationsStarted} chat, ${json.data.metrics.totalLeads} lead`;
    });

    await step("the funnel and reports are populated", async () => {
      const res = await asClient("/api/client/analytics/overview?preset=last30");
      const json = await res.json();
      must(json.success, json.error?.message || `status ${res.status}`);
      const leadStep = json.data.funnel.find((s: any) => s.key === "leads");
      must(leadStep?.count >= 1, "the funnel does not show the lead");
      return `funnel ends at ${leadStep.count} lead`;
    });

    await step("a report generates and exports", async () => {
      const gen = await asClient("/api/client/reports?preset=last30", {
        method: "POST",
        body: JSON.stringify({ type: "executive" }),
      });
      const json = await gen.json();
      must(json.success, json.error?.message || `status ${gen.status}`);
      const csv = await asClient(`/api/client/reports/${json.data.report.id}/export?format=csv`);
      const text = await csv.text();
      must(text.includes("Headline metrics"), "the CSV export is empty or malformed");
      return `${text.length} byte CSV`;
    });

    // ---- 9. disconnecting cleanly ------------------------------------------
    await step("the operator can disconnect the domain again", async () => {
      const res = await asOperator(`/api/admin/domains?tenantId=${tenantId}`, { method: "DELETE" });
      const json = await res.json();
      must(json.success, json.error?.message || `status ${res.status}`);
      const after = await prisma.tenant.findUnique({
        where: { id: tenantId! },
        select: { customDomain: true },
      });
      must(after?.customDomain === null, "the domain is still attached");
      return "released";
    });

    await step("the workspace keeps working without a domain", async () => {
      const res = await fetch(`${BASE}/api/public/v1/sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantSlug: slug, visitorId: `${visitorId}-2` }),
      });
      const json = await res.json();
      must(json.success, "the chat stopped working after the domain was removed");
      return "platform link still serves the bot";
    });
  } finally {
    if (tenantId) await prisma.tenant.delete({ where: { id: tenantId } }).catch(() => undefined);
    await prisma.user.delete({ where: { id: operator.id } }).catch(() => undefined);
    await prisma.tenant
      .deleteMany({ where: { slug: { startsWith: `rival-${stamp}` } } })
      .catch(() => undefined);
    console.log("\n  test company and operator removed");

    const failed = results.filter((r) => !r.ok);
    console.log(`\n${results.length - failed.length}/${results.length} onboarding steps passed`);
    if (failed.length) {
      console.log("\nBROKEN:");
      for (const f of failed) console.log(`  - ${f.step}: ${f.detail}`);
      process.exitCode = 1;
    }
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error("\nAUDIT ABORTED:", error?.message || error);
  process.exitCode = 1;
});
