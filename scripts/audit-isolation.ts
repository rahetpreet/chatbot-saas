/**
 * Cross-tenant isolation audit.
 *
 * Builds two unrelated workspaces with real data, then actively tries to reach
 * one from the other — by session, by API, by slug, and by Host header. Every
 * check here is written to FAIL if the attack succeeds, so a pass means the
 * attempt was refused rather than that nothing was tried.
 *
 *   npx tsx scripts/audit-isolation.ts
 *
 * Everything created is removed in a finally block.
 */
import { readFileSync, existsSync } from "node:fs";
import { randomBytes } from "node:crypto";

function loadEnv(path: string): Record<string, string> {
  if (!existsSync(path)) return {};
  const out: Record<string, string> = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    out[match[1]] = value;
  }
  return out;
}
const fileEnv = { ...loadEnv(".env"), ...loadEnv(".env.vercel") };
for (const [key, value] of Object.entries(fileEnv)) if (!process.env[key]) process.env[key] = value;

const BASE = (process.env.AUDIT_BASE || "https://chatbot-saas-peach.vercel.app").replace(/\/+$/, "");

const results: { name: string; ok: boolean; detail: string }[] = [];

function record(name: string, ok: boolean, detail = "") {
  results.push({ name, ok, detail });
  process.stdout.write(`  ${ok ? "BLOCKED " : "LEAKED  "} ${name}${detail ? ` — ${detail}` : ""}\n`);
}

async function attempt(name: string, fn: () => Promise<string | void>) {
  try {
    const detail = await fn();
    record(name, true, typeof detail === "string" ? detail : "");
  } catch (error: any) {
    record(name, false, String(error?.message || error).slice(0, 200));
  }
}

/** Throws when the attack succeeded. */
function mustRefuse(condition: any, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function main() {
  const { PrismaClient } = await import("@prisma/client");
  const { hashPassword } = await import("../src/lib/security/password");
  const { resolveTenantByHost } = await import("../src/lib/services/tenant/domainResolver");
  const prisma = new PrismaClient();

  const run = randomBytes(3).toString("hex");
  const password = `Iso!${randomBytes(6).toString("hex")}A1`;
  const made: string[] = [];
  const emails: string[] = [];

  console.log(`\nCross-tenant isolation audit against ${BASE}\n`);

  try {
    // ---- two unrelated companies, each with real data ---------------------
    const build = async (label: string) => {
      const slug = `iso-${label}-${run}`;
      const email = `iso-${label}-${run}@example.test`;
      emails.push(email);

      const tenant = await prisma.tenant.create({
        data: {
          name: `${label.toUpperCase()} Company`,
          slug,
          status: "ACTIVE",
          customDomain: `chat.${label}-${run}.example`,
          customDomainVerifiedAt: new Date(),
        },
      });
      made.push(tenant.id);

      await prisma.user.create({
        data: {
          tenantId: tenant.id,
          email,
          name: `${label} owner`,
          role: "CLIENT_OWNER",
          passwordHash: await hashPassword(password),
          isActive: true,
          status: "ACTIVE",
          mustChangePassword: false,
        },
      });

      const flow = await prisma.flow.create({
        data: {
          tenantId: tenant.id,
          name: `${label} bot`,
          status: "PUBLISHED",
          isDefault: true,
          nodes: JSON.stringify([
            { id: "s", type: "start", position: { x: 0, y: 0 }, data: { label: "Start", nodeType: "start" } },
            {
              id: "m",
              type: "message",
              position: { x: 0, y: 100 },
              data: { label: "Hi", nodeType: "message", messageText: `SECRET-${label}-greeting` },
            },
          ]),
          edges: JSON.stringify([{ id: "e", source: "s", target: "m" }]),
          publishedNodes: JSON.stringify([
            { id: "s", type: "start", position: { x: 0, y: 0 }, data: { label: "Start", nodeType: "start" } },
            {
              id: "m",
              type: "message",
              position: { x: 0, y: 100 },
              data: { label: "Hi", nodeType: "message", messageText: `SECRET-${label}-greeting` },
            },
          ]),
          publishedEdges: JSON.stringify([{ id: "e", source: "s", target: "m" }]),
        },
      });

      const contact = await prisma.contact.create({
        data: { tenantId: tenant.id, name: `SECRET-${label}-contact`, email: `c-${label}-${run}@example.test` },
      });
      const conversation = await prisma.conversation.create({
        data: { tenantId: tenant.id, flowId: flow.id, visitorId: `v-${label}-${run}`, sessionStatus: "HANDOVER" },
      });
      await prisma.message.create({
        data: { conversationId: conversation.id, senderType: "VISITOR", content: `SECRET-${label}-message` },
      });
      const lead = await prisma.lead.create({
        data: { tenantId: tenant.id, conversationId: conversation.id, name: `SECRET-${label}-lead` },
      });
      const campaign = await prisma.campaign.create({
        data: { tenantId: tenant.id, name: `SECRET-${label}-campaign`, slug: `camp-${label}-${run}` },
      });

      return { tenant, slug, email, flow, contact, conversation, lead, campaign };
    };

    const a = await build("alpha");
    const b = await build("beta");

    // ---- sign in as company A --------------------------------------------
    let cookie = "";
    const login = await fetch(`${BASE}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: a.email, password }),
    });
    for (const entry of login.headers.getSetCookie?.() || []) {
      const pair = entry.split(";")[0];
      if (pair.startsWith("chatbot_saas_auth=") && !pair.endsWith("=")) cookie = pair;
    }
    if (!cookie) throw new Error("could not sign in as company A");
    console.log("  signed in as ALPHA — now attempting to reach BETA\n");

    const asA = async (path: string, init: RequestInit = {}) => {
      const res = await fetch(`${BASE}${path}`, {
        ...init,
        redirect: "manual",
        headers: { cookie, ...(init.body ? { "Content-Type": "application/json" } : {}), ...(init.headers || {}) },
      });
      const text = await res.text();
      let json: any = null;
      try {
        json = JSON.parse(text);
      } catch {
        /* CSV or HTML */
      }
      return { status: res.status, text, json };
    };

    const leaks = (text: string) => /SECRET-beta-/.test(text);

    // ---- private API, authenticated as the wrong company ------------------
    await attempt("read beta's conversation by id", async () => {
      const res = await asA(`/api/client/conversations/${b.conversation.id}`);
      mustRefuse(!leaks(res.text), "alpha read beta's conversation");
      return `${res.status}`;
    });

    await attempt("reply into beta's conversation", async () => {
      const res = await asA(`/api/client/conversations/${b.conversation.id}/messages`, {
        method: "POST",
        body: JSON.stringify({ content: "injected by alpha" }),
      });
      const planted = await prisma.message.findFirst({
        where: { conversationId: b.conversation.id, content: "injected by alpha" },
      });
      mustRefuse(!planted, "alpha posted a message into beta's conversation");
      return `${res.status}`;
    });

    await attempt("list contacts", async () => {
      const res = await asA("/api/client/contacts");
      mustRefuse(!leaks(res.text), "beta's contact appeared in alpha's list");
      return "own data only";
    });

    await attempt("read beta's contact by id", async () => {
      const res = await asA(`/api/client/contacts/${b.contact.id}`);
      mustRefuse(!leaks(res.text), "alpha read beta's contact");
      return `${res.status}`;
    });

    await attempt("edit beta's contact", async () => {
      await asA(`/api/client/contacts/${b.contact.id}`, {
        method: "PATCH",
        body: JSON.stringify({ name: "OVERWRITTEN BY ALPHA" }),
      });
      const after = await prisma.contact.findUnique({ where: { id: b.contact.id } });
      mustRefuse(after?.name === `SECRET-beta-contact`, "alpha modified beta's contact");
      return "unchanged";
    });

    await attempt("delete beta's contact", async () => {
      await asA(`/api/client/contacts/${b.contact.id}`, { method: "DELETE" });
      const after = await prisma.contact.findFirst({ where: { id: b.contact.id, deletedAt: null } });
      mustRefuse(after, "alpha deleted beta's contact");
      return "still there";
    });

    await attempt("list leads", async () => {
      const res = await asA("/api/client/leads");
      mustRefuse(!leaks(res.text), "beta's lead appeared in alpha's list");
      return "own data only";
    });

    await attempt("read beta's chatbot", async () => {
      const res = await asA(`/api/client/chatbots/${b.flow.id}`);
      mustRefuse(!leaks(res.text), "alpha read beta's flow");
      return `${res.status}`;
    });

    await attempt("overwrite beta's chatbot", async () => {
      await asA(`/api/client/chatbots/${b.flow.id}`, {
        method: "PATCH",
        body: JSON.stringify({ name: "HIJACKED" }),
      });
      const after = await prisma.flow.findUnique({ where: { id: b.flow.id } });
      mustRefuse(after?.name === "beta bot", "alpha renamed beta's flow");
      return "unchanged";
    });

    await attempt("read beta's campaign", async () => {
      const res = await asA(`/api/client/campaigns/${b.campaign.id}`);
      mustRefuse(!leaks(res.text), "alpha read beta's campaign");
      return `${res.status}`;
    });

    await attempt("export conversations", async () => {
      const res = await asA("/api/client/conversations/export?format=csv");
      mustRefuse(!leaks(res.text), "beta's data appeared in alpha's export");
      return "own data only";
    });

    await attempt("export contacts", async () => {
      const res = await asA("/api/client/contacts/export");
      mustRefuse(!leaks(res.text), "beta's contact appeared in alpha's export");
      return "own data only";
    });

    await attempt("dashboard counts", async () => {
      const res = await asA("/api/client/dashboard");
      mustRefuse(!leaks(res.text), "beta's data appeared on alpha's dashboard");
      return "own data only";
    });

    await attempt("reach the operator's admin API", async () => {
      const res = await asA("/api/admin/tenants");
      mustRefuse(res.status === 403 || res.json?.success === false, `a client reached admin (${res.status})`);
      return `${res.status}`;
    });

    await attempt("assign itself a domain via admin", async () => {
      const res = await asA("/api/admin/domains", {
        method: "POST",
        body: JSON.stringify({ tenantId: a.tenant.id, domain: "stolen.example" }),
      });
      const after = await prisma.tenant.findUnique({ where: { id: a.tenant.id } });
      mustRefuse(after?.customDomain !== "stolen.example", "a client assigned its own domain");
      return `${res.status}`;
    });

    // ---- Host header attacks ---------------------------------------------
    console.log("");
    await attempt("host header cannot select another company", async () => {
      // The resolver only ever maps a configured hostname to its owner.
      const resolved = await resolveTenantByHost(`chat.beta-${run}.example`);
      mustRefuse(resolved?.slug === b.slug, "beta's host resolved to the wrong workspace");
      const spoof = await resolveTenantByHost(`chat.beta-${run}.example.evil.test`);
      mustRefuse(spoof === null, "a lookalike hostname resolved to a workspace");
      return "exact match only";
    });

    await attempt("unconfigured host resolves to nobody", async () => {
      mustRefuse((await resolveTenantByHost("totally-unknown.example")) === null, "an unknown host got a workspace");
      return "no tenant";
    });

    await attempt("a domain cannot host another company's bot", async () => {
      // Tested through the rule itself rather than over HTTP: fetch silently
      // drops an attempt to set the Host header, so a request meant to
      // impersonate another hostname actually arrives on the platform's own —
      // where serving every workspace is correct, and the check would pass
      // while proving nothing.
      const { isSlugAllowedOnHost } = await import("../src/lib/services/tenant/hostGuard");

      const alphaHost = `chat.alpha-${run}.example`;
      mustRefuse(
        (await isSlugAllowedOnHost(alphaHost, b.slug)) === false,
        "alpha's domain was allowed to serve beta's bot",
      );
      mustRefuse(
        (await isSlugAllowedOnHost(alphaHost, a.slug)) === true,
        "alpha's domain was refused its own bot",
      );
      // The platform host must keep serving everyone, or /c/<slug> breaks for
      // every workspace without a custom domain.
      mustRefuse(
        (await isSlugAllowedOnHost("chatbot-saas-peach.vercel.app", b.slug)) === true,
        "the platform host stopped serving a workspace",
      );
      return "own workspace only, platform unrestricted";
    });

    // ---- public surface ---------------------------------------------------
    await attempt("public config for beta needs beta's own slug", async () => {
      // Public bot config is public by design; what matters is that it never
      // carries anything private.
      const res = await fetch(`${BASE}/api/public/v1/config?tenantSlug=${b.slug}`);
      const text = await res.text();
      mustRefuse(
        !/apiKey|smtp|passwordHash|customSmtpConfig|aiConfig/i.test(text),
        "public config exposed private configuration",
      );
      return "no secrets in public config";
    });

    await attempt("a visitor session cannot read another company's chat", async () => {
      const start = await fetch(`${BASE}/api/public/v1/sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantSlug: a.slug, visitorId: `iso-visitor-${run}` }),
      });
      const session = await start.json();
      mustRefuse(session.success, "could not start a session as a visitor");

      // Use alpha's visitor token against beta's conversation.
      const res = await fetch(`${BASE}/api/public/v1/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId: b.conversation.id,
          sessionToken: session.sessionToken,
          userInput: { type: "text", value: "hello" },
        }),
      });
      const text = await res.text();
      mustRefuse(!leaks(text) && !/success":true/.test(text), "a visitor token reached another company's chat");
      return `${res.status}`;
    });
  } finally {
    try {
      const convs = await prisma.conversation.findMany({ where: { tenantId: { in: made } }, select: { id: true } });
      const ids = convs.map((c) => c.id);
      await prisma.message.deleteMany({ where: { conversationId: { in: ids } } });
      await prisma.analyticsEvent.deleteMany({ where: { tenantId: { in: made } } });
      await prisma.lead.deleteMany({ where: { tenantId: { in: made } } });
      await prisma.conversation.deleteMany({ where: { tenantId: { in: made } } });
      await prisma.visitor.deleteMany({ where: { tenantId: { in: made } } });
      for (const id of made) await prisma.tenant.delete({ where: { id } }).catch(() => undefined);
      await prisma.user.deleteMany({ where: { email: { in: emails } } });
      console.log(`\n  cleaned up ${made.length} test workspaces`);
    } catch (error) {
      console.error("CLEANUP FAILED — remove workspaces manually:", made, error);
    }
    await prisma.$disconnect();
  }

  const leaked = results.filter((result) => !result.ok);
  console.log(`\n${results.length - leaked.length}/${results.length} attacks blocked`);
  if (leaked.length) {
    console.log("\nLEAKS FOUND:");
    for (const leak of leaked) console.log(`  ${leak.name}\n    ${leak.detail}`);
  }
  process.exit(leaked.length ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
