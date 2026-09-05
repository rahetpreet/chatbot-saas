/**
 * End-to-end feature audit.
 *
 * Exercises every user-facing feature against a running deployment using a
 * throwaway workspace, then removes it. Reading code finds bugs you thought
 * to look for; driving the real HTTP surface finds the ones you did not.
 *
 *   npx tsx scripts/audit-e2e.ts                      # against production
 *   AUDIT_BASE=http://localhost:3000 npx tsx ...      # against a local server
 *
 * Creates nothing permanent: the workspace and everything under it is deleted
 * in a finally block, even when a check throws.
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

type Result = { area: string; name: string; ok: boolean; detail: string };
const results: Result[] = [];
let cookie = "";
let agentCookie = "";
let adminCookie = "";

function record(area: string, name: string, ok: boolean, detail = "") {
  results.push({ area, name, ok, detail });
  process.stdout.write(`${ok ? "  PASS" : "  FAIL"}  ${area} · ${name}${detail ? ` — ${detail}` : ""}\n`);
}

async function check(area: string, name: string, fn: () => Promise<string | void>) {
  try {
    const detail = await fn();
    record(area, name, true, typeof detail === "string" ? detail : "");
  } catch (error: any) {
    record(area, name, false, String(error?.message || error).slice(0, 180));
  }
}

async function api(
  path: string,
  init: RequestInit & { asAgent?: boolean } = {},
): Promise<{ status: number; json: any; text: string; headers: Headers }> {
  const jar = init.asAgent ? agentCookie : cookie;
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    redirect: "manual",
    headers: {
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(jar ? { cookie: jar } : {}),
      ...(init.headers || {}),
    },
  });
  const setCookie = res.headers.getSetCookie?.() || [];
  for (const entry of setCookie) {
    const pair = entry.split(";")[0];
    if (pair.startsWith("chatbot_saas_auth=") && !pair.endsWith("=")) {
      if (init.asAgent) agentCookie = pair;
      else cookie = pair;
    }
  }
  const text = await res.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* not JSON, e.g. CSV or HTML */
  }
  return { status: res.status, json, text, headers: res.headers };
}

function must(condition: any, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function main() {
  const { PrismaClient } = await import("@prisma/client");
  const { hashPassword } = await import("../src/lib/security/password");
  const prisma = new PrismaClient();

  const run = randomBytes(3).toString("hex");
  const slug = `audit-${run}`;
  const ownerEmail = `audit-owner-${run}@example.test`;
  const agentEmail = `audit-agent-${run}@example.test`;
  const adminEmail = `audit-admin-${run}@example.test`;
  const password = `Audit!${randomBytes(6).toString("hex")}A1`;

  let tenantId = "";
  let flowId = "";
  let campaignId = "";
  let conversationId = "";
  let sessionToken = "";

  console.log(`\nAuditing ${BASE}\nWorkspace: ${slug}\n`);

  try {
    // ---- fixture -----------------------------------------------------------
    const hash = await hashPassword(password);
    const tenant = await prisma.tenant.create({
      data: { name: `Audit ${run}`, slug, status: "ACTIVE" },
    });
    tenantId = tenant.id;
    // Platform operator: no tenantId, which is what makes a super admin.
    await prisma.user.create({
      data: {
        email: adminEmail,
        name: "Audit Admin",
        role: "SUPER_ADMIN",
        passwordHash: hash,
        isActive: true,
        status: "ACTIVE",
        mustChangePassword: false,
      },
    });
    await prisma.user.create({
      data: {
        tenantId,
        email: ownerEmail,
        name: "Audit Owner",
        role: "CLIENT_OWNER",
        passwordHash: hash,
        isActive: true,
        status: "ACTIVE",
        mustChangePassword: false,
      },
    });

    // ---- auth --------------------------------------------------------------
    await check("Auth", "client login", async () => {
      const res = await api("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email: ownerEmail, password }),
      });
      must(res.status === 200, `status ${res.status}`);
      must(cookie, "no session cookie returned");
      return "session established";
    });

    await check("Auth", "wrong password rejected", async () => {
      const before = cookie;
      cookie = "";
      const res = await api("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email: ownerEmail, password: "wrong-password-123" }),
      });
      cookie = before;
      must(res.status === 401, `expected 401, got ${res.status}`);
      return "401";
    });

    await check("Auth", "/api/auth/me returns tenant slug", async () => {
      const res = await api("/api/auth/me");
      const user = res.json?.user || res.json?.data?.user;
      must(user, "no user");
      must(user.tenant?.slug === slug, `tenant.slug missing or wrong: ${JSON.stringify(user.tenant)}`);
      return `tenant.slug=${user.tenant.slug}`;
    });

    // ---- flows -------------------------------------------------------------
    await check("Chatbots", "create flow", async () => {
      const res = await api("/api/client/chatbots", {
        method: "POST",
        body: JSON.stringify({ name: "Audit Flow", description: "created by audit" }),
      });
      const flow = res.json?.flow || res.json?.data?.flow;
      must(flow?.id, `no flow in response (status ${res.status})`);
      flowId = flow.id;
      return flowId;
    });

    await check("Chatbots", "save nodes and edges", async () => {
      const nodes = [
        { id: "n-start", type: "start", position: { x: 300, y: 40 }, data: { label: "Start", nodeType: "start" } },
        {
          id: "n-msg",
          type: "message",
          position: { x: 300, y: 180 },
          data: { label: "Greeting", nodeType: "message", messageText: "Hello from the audit bot." },
        },
        {
          id: "n-ask",
          type: "input",
          position: { x: 300, y: 320 },
          data: {
            label: "Ask email",
            nodeType: "input",
            inputType: "email",
            inputKey: "email",
            required: true,
            messageText: "What is your email?",
          },
        },
        {
          id: "n-human",
          type: "handover",
          position: { x: 300, y: 460 },
          data: { label: "Human", nodeType: "handover" },
        },
      ];
      const edges = [
        { id: "e1", source: "n-start", target: "n-msg" },
        { id: "e2", source: "n-msg", target: "n-ask" },
        { id: "e3", source: "n-ask", target: "n-human" },
      ];
      const res = await api(`/api/client/chatbots/${flowId}`, {
        method: "PATCH",
        body: JSON.stringify({ nodes: JSON.stringify(nodes), edges: JSON.stringify(edges) }),
      });
      must(res.status === 200, `status ${res.status}`);
      return "saved";
    });

    await check("Chatbots", "publish", async () => {
      const res = await api(`/api/client/chatbots/${flowId}/publish`, { method: "POST" });
      must(res.json?.success, `publish failed: ${res.text.slice(0, 160)}`);
      return `version ${res.json.flow?.version}`;
    });

    await check("Chatbots", "saving a broken graph is refused", async () => {
      const bad = await api("/api/client/chatbots", {
        method: "POST",
        body: JSON.stringify({ name: "Audit Broken" }),
      });
      const badId = (bad.json?.flow || bad.json?.data?.flow)?.id;
      must(badId, "could not create the flow");

      const res = await api(`/api/client/chatbots/${badId}`, {
        method: "PATCH",
        body: JSON.stringify({ nodes: "[]", edges: "[]" }),
      });
      must(res.status === 400, `an empty graph was saved (status ${res.status})`);
      must(res.json?.details?.length, "no reason was given");

      // Publish is the second line of defence, so it is worth proving on a
      // graph that reached the database by some other route.
      await prisma.flow.update({ where: { id: badId }, data: { nodes: "[]", edges: "[]" } });
      const publish = await api(`/api/client/chatbots/${badId}/publish`, { method: "POST" });
      must(!publish.json?.success, "an empty flow was published");

      await prisma.flow.delete({ where: { id: badId } });
      return `save and publish both refused: ${res.json.details[0]}`;
    });

    await check("Chatbots", "a new flow starts publishable", async () => {
      // The starter template must be valid, or every new flow greets the user
      // with a validation error before they have touched anything.
      const fresh = await api("/api/client/chatbots", {
        method: "POST",
        body: JSON.stringify({ name: "Audit Starter" }),
      });
      const freshId = (fresh.json?.flow || fresh.json?.data?.flow)?.id;
      must(freshId, "could not create the flow");
      const res = await api(`/api/client/chatbots/${freshId}/publish`, { method: "POST" });
      const ok = res.json?.success;
      await api(`/api/client/chatbots/${freshId}`, { method: "DELETE" });
      must(ok, `the default template does not validate: ${JSON.stringify(res.json?.details)}`);
      return "starter template is valid";
    });

    await check("Chatbots", "simulator runs", async () => {
      const res = await api(`/api/client/chatbots/${flowId}/simulate`, {
        method: "POST",
        body: JSON.stringify({ userInput: { type: "text", value: "hi" }, state: null }),
      });
      must(res.status === 200, `status ${res.status}: ${res.text.slice(0, 120)}`);
      return "ok";
    });

    // ---- public chat -------------------------------------------------------
    await check("Public chat", "widget config", async () => {
      const res = await api(`/api/public/v1/config?tenantSlug=${slug}`);
      must(res.json?.success, `config failed: ${res.text.slice(0, 160)}`);
      must(res.json.activeFlow?.id, "no published flow returned");
      return res.json.activeFlow.name;
    });

    await check("Public chat", "start session", async () => {
      const res = await api("/api/public/v1/sessions", {
        method: "POST",
        body: JSON.stringify({ tenantSlug: slug, visitorId: `audit-${run}` }),
      });
      must(res.json?.success, `session failed: ${res.text.slice(0, 160)}`);
      conversationId = res.json.conversationId;
      sessionToken = res.json.sessionToken;
      must(res.json.messages?.length, "no opening message");
      return `${res.json.messages.length} opening message(s)`;
    });

    await check("Public chat", "send message and get a reply", async () => {
      const res = await api("/api/public/v1/messages", {
        method: "POST",
        body: JSON.stringify({
          conversationId,
          sessionToken,
          userInput: { type: "text", value: "audit@example.test" },
        }),
      });
      must(res.json?.success, `message failed: ${res.text.slice(0, 160)}`);
      return `${(res.json.botMessages || []).length} bot reply(ies)`;
    });

    await check("Public chat", "handover announces the wait", async () => {
      const conversation = await prisma.conversation.findUnique({
        where: { id: conversationId },
        select: { sessionStatus: true },
      });
      const messages = await prisma.message.findMany({
        where: { conversationId },
        orderBy: { timestamp: "desc" },
        take: 4,
      });
      must(conversation?.sessionStatus === "HANDOVER", `status is ${conversation?.sessionStatus}`);
      const said = messages.some((message) => /hold for about 2 minutes/i.test(message.content));
      must(said, "the visitor was not told to hold");
      return "visitor informed";
    });

    await check("Public chat", "a forged session token is refused", async () => {
      const res = await api("/api/public/v1/messages", {
        method: "POST",
        body: JSON.stringify({
          conversationId,
          sessionToken: "f".repeat(43),
          userInput: { type: "text", value: "should not work" },
        }),
      });
      must(!res.json?.success, "a forged token was accepted");
      return `refused (${res.status})`;
    });

    // ---- embedding ---------------------------------------------------------
    await check("Embed", "widget.js is served and self-configures", async () => {
      const res = await fetch(`${BASE}/widget.js`);
      const body = await res.text();
      must(res.status === 200, `status ${res.status}`);
      must(/data-tenant-slug/.test(body), "the script does not read data-tenant-slug");
      // A snippet copied before the slug loaded would carry an empty slug; the
      // widget must refuse rather than silently attach to the wrong workspace.
      must(/Missing data-tenant-slug/.test(body), "an empty tenant slug is not guarded");
      return `${Math.round(body.length / 1024)}kb`;
    });

    await check("Embed", "iframe page renders for a real flow", async () => {
      const res = await fetch(`${BASE}/embed/${slug}/${flowId}`);
      const body = await res.text();
      must(res.status === 200, `status ${res.status}`);
      must(body.includes("iframe"), "no iframe in the embed page");
      return "renders";
    });

    await check("Embed", "hosted chat page loads", async () => {
      const res = await fetch(`${BASE}/c/${slug}`);
      must(res.status === 200, `status ${res.status}`);
      return "200";
    });

    await check("Embed", "widget config is reachable cross-origin", async () => {
      // The widget runs on the customer's own site, so a missing CORS header
      // makes it fail there while working perfectly in local testing.
      const res = await fetch(`${BASE}/api/public/v1/config?tenantSlug=${slug}`, {
        headers: { origin: "https://some-customer-site.example" },
      });
      const allow = res.headers.get("access-control-allow-origin");
      must(allow, "no Access-Control-Allow-Origin header");
      return `allow-origin: ${allow}`;
    });

    await check("Embed", "preflight is answered", async () => {
      const res = await fetch(`${BASE}/api/public/v1/sessions`, {
        method: "OPTIONS",
        headers: {
          origin: "https://some-customer-site.example",
          "access-control-request-method": "POST",
        },
      });
      must(res.status === 204 || res.status === 200, `status ${res.status}`);
      must(res.headers.get("access-control-allow-origin"), "preflight has no allow-origin");
      return `${res.status}`;
    });

    // ---- campaigns, tracking and short links -------------------------------
    await check("Campaigns", "create campaign", async () => {
      const res = await api("/api/client/campaigns", {
        method: "POST",
        body: JSON.stringify({ name: `Audit Campaign ${run}`, flowId }),
      });
      const campaign = res.json?.campaign || res.json?.data?.campaign;
      must(campaign?.id, `no campaign (status ${res.status}): ${res.text.slice(0, 140)}`);
      campaignId = campaign.id;
      return campaignId;
    });

    await check("Campaigns", "generate tracking links", async () => {
      const res = await api(`/api/client/campaigns/${campaignId}/generate-links`, {
        method: "POST",
        body: JSON.stringify({
          contacts: [
            { name: "Audit One", email: `one-${run}@example.test`, phone: "+1 (555) 010-2030" },
            { name: "Audit Two", email: `two-${run}@example.test` },
          ],
        }),
      });
      const links = res.json?.data?.links || res.json?.links;
      must(links?.length === 2, `expected 2 links, got ${links?.length}`);
      must(links[0].trackingUrl, "no /t/ tracking URL returned");
      return links[0].trackingUrl;
    });

    await check("Tracking", "/t/<token> redirects with attribution", async () => {
      const link = await prisma.trackingLink.findFirst({
        where: { tenantId },
        select: { token: true },
      });
      must(link?.token, "no tracking link stored");
      const res = await fetch(`${BASE}/t/${link.token}`, { redirect: "manual" });
      const location = res.headers.get("location") || "";
      must(res.status === 302 || res.status === 307, `status ${res.status}`);
      must(location.includes("campaign="), `no campaign in redirect: ${location}`);
      must(location.includes("t="), `no token in redirect: ${location}`);
      const updated = await prisma.trackingLink.findFirst({ where: { token: link.token } });
      must((updated?.openCount || 0) >= 1, "the open was not counted");
      return `counted, -> ${location.slice(0, 70)}`;
    });

    await check("Tracking", "unknown token does not error", async () => {
      const res = await fetch(`${BASE}/t/definitelynotreal`, { redirect: "manual" });
      must(res.status === 302 || res.status === 307, `status ${res.status}`);
      return "redirected to home";
    });

    await check("Short links", "bulk export mints and shortens", async () => {
      const res = await api(`/api/client/campaigns/${campaignId}/export-contacts?short=1`);
      must(res.status === 200, `status ${res.status}`);
      must(res.text.includes("Short Link"), "no Short Link column");
      const lines = res.text.trim().split("\n");
      must(lines.length >= 3, `expected 2 rows, got ${lines.length - 1}`);
      const shortUrl = res.text.match(/https?:\/\/\S*?\/s\/[A-Za-z0-9]+/)?.[0];
      must(shortUrl, "no /s/ short URL in the CSV");
      return shortUrl!;
    });

    await check("Short links", "/s/<code> redirects and counts", async () => {
      const link = await prisma.shortLink.findFirst({ where: { tenantId }, select: { code: true } });
      must(link?.code, "no short link stored");
      const res = await fetch(`${BASE}/s/${link.code}`, { redirect: "manual" });
      must(res.status === 302 || res.status === 307, `status ${res.status}`);
      const location = res.headers.get("location") || "";
      must(location.includes("/t/") || location.includes("/c/"), `unexpected target: ${location}`);
      const updated = await prisma.shortLink.findFirst({ where: { code: link.code } });
      must((updated?.clickCount || 0) >= 1, "the click was not counted");
      return `-> ${location.slice(0, 70)}`;
    });

    await check("Short links", "re-export reuses codes", async () => {
      const before = await prisma.shortLink.count({ where: { tenantId } });
      await api(`/api/client/campaigns/${campaignId}/export-contacts?short=1`);
      const after = await prisma.shortLink.count({ where: { tenantId } });
      must(before === after, `codes were regenerated: ${before} -> ${after}, invalidating links already sent`);
      return `${after} stable`;
    });

    await check("Campaigns", "QR code renders", async () => {
      const res = await api(`/api/client/campaigns/${campaignId}/qr`);
      must(res.status === 200, `status ${res.status}`);
      must(res.text.length > 200, "QR response suspiciously small");
      return `${Math.round(res.text.length / 1024)}kb`;
    });

    await check("Campaigns", "CSV import", async () => {
      const csv = "name,email,phone\nImported One,imp1@example.test,+1 555 111 2222\nImported Two,imp2@example.test,\n";
      const form = new FormData();
      form.append("file", new Blob([csv], { type: "text/csv" }), "contacts.csv");
      const res = await fetch(`${BASE}/api/client/campaigns/${campaignId}/import-csv`, {
        method: "POST",
        headers: { cookie },
        body: form,
      });
      const json = await res.json().catch(() => null);
      must(res.status === 200, `status ${res.status}: ${JSON.stringify(json).slice(0, 140)}`);
      return "imported";
    });

    // ---- conversations -----------------------------------------------------
    await check("Inbox", "list conversations", async () => {
      const res = await api("/api/client/conversations");
      const list = res.json?.conversations || res.json?.data?.conversations;
      must(Array.isArray(list) && list.length >= 1, `expected at least 1, got ${list?.length}`);
      return `${list.length}`;
    });

    await check("Inbox", "full transcript loads", async () => {
      const res = await api(`/api/client/conversations/${conversationId}`);
      const conversation = res.json?.conversation || res.json?.data?.conversation;
      must(conversation?.messages?.length >= 2, `only ${conversation?.messages?.length} messages`);
      return `${conversation.messages.length} messages`;
    });

    await check("Inbox", "export all conversations to CSV", async () => {
      const res = await api("/api/client/conversations/export?format=csv");
      must(res.status === 200, `status ${res.status}`);
      must(/transcript|message/i.test(res.text), "no transcript column in the CSV");
      return `${res.text.trim().split("\n").length - 1} row(s)`;
    });

    // ---- team and agents ---------------------------------------------------
    let agentPassword = "";
    await check("Team", "create an agent login", async () => {
      const res = await api("/api/client/team", {
        method: "POST",
        body: JSON.stringify({ name: "Audit Agent", email: agentEmail, role: "CLIENT_AGENT" }),
      });
      const credentials = res.json?.credentials || res.json?.data?.credentials;
      must(credentials?.temporaryPassword, `no password returned: ${res.text.slice(0, 140)}`);
      agentPassword = credentials.temporaryPassword;
      return "created";
    });

    await check("Team", "temporary password is not stored in the clear", async () => {
      const user = await prisma.user.findUnique({ where: { email: agentEmail } });
      must(user, "agent not created");
      must(user!.passwordHash.startsWith("$2"), "not a bcrypt hash");
      must(!user!.passwordHash.includes(agentPassword), "the plaintext is inside the stored value");
      must(user!.mustChangePassword, "the agent is not forced to change it");
      return "hashed";
    });

    await check("Agent", "agent can sign in", async () => {
      const res = await api("/api/auth/login", {
        method: "POST",
        asAgent: true,
        body: JSON.stringify({ email: agentEmail, password: agentPassword }),
      });
      must(res.status === 200, `status ${res.status}`);
      must(agentCookie, "no agent session");
      return "ok";
    });

    await check("Agent", "queue shows the waiting visitor", async () => {
      const res = await api("/api/client/agent/conversations", { asAgent: true });
      const list = res.json?.conversations || res.json?.data?.conversations;
      must(Array.isArray(list), `no list: ${res.text.slice(0, 140)}`);
      must(list.some((item: any) => item.id === conversationId), "the handover conversation is missing");
      return `${list.length} in queue`;
    });

    await check("Agent", "agent cannot read a non-handover conversation", async () => {
      const other = await prisma.conversation.create({
        data: { tenantId, flowId, visitorId: `audit-other-${run}`, sessionStatus: "ACTIVE" },
      });
      const res = await api(`/api/client/conversations/${other.id}`, { asAgent: true });
      const leaked = res.json?.conversation || res.json?.data?.conversation;
      await prisma.conversation.delete({ where: { id: other.id } });
      must(!leaked, "an agent read a conversation outside their queue");
      return `refused (${res.status})`;
    });

    await check("Agent", "agent cannot list contacts", async () => {
      const res = await api("/api/client/contacts", { asAgent: true });
      must(res.status === 403 || res.json?.success === false, `contacts were returned (${res.status})`);
      return `refused (${res.status})`;
    });

    await check("Agent", "agent reply reaches the visitor", async () => {
      const res = await api(`/api/client/conversations/${conversationId}/messages`, {
        method: "POST",
        asAgent: true,
        body: JSON.stringify({ content: "An agent is here to help." }),
      });
      must(res.status === 200, `status ${res.status}: ${res.text.slice(0, 140)}`);
      const stored = await prisma.message.findFirst({
        where: { conversationId, senderType: "AGENT" },
        orderBy: { timestamp: "desc" },
      });
      must(stored, "the agent reply was not stored");
      return "delivered";
    });

    // ---- knowledge and AI --------------------------------------------------
    await check("Knowledge", "add a document", async () => {
      const res = await api("/api/client/settings/knowledge", {
        method: "POST",
        body: JSON.stringify({
          title: "Audit refund policy",
          category: "Policies",
          content: "Refunds are available within 14 days of purchase. Contact support with your order number.",
        }),
      });
      must(res.status === 200 || res.json?.success, `status ${res.status}`);
      return "stored";
    });

    await check("Knowledge", "AI toggle saves", async () => {
      const res = await api("/api/client/settings/ai", {
        method: "POST",
        body: JSON.stringify({ enabled: true, provider: "gemini", model: "", apiKey: "", systemPrompt: "", temperature: 0.7, confidenceThreshold: 0.6 }),
      });
      must(res.status === 200, `status ${res.status}: ${res.text.slice(0, 140)}`);
      const check2 = await api("/api/client/settings/ai");
      must(check2.json?.config?.enabled === true, "the toggle did not persist");
      return "on";
    });

    await check("Knowledge", "API key never leaves the server", async () => {
      const res = await api("/api/client/settings/ai");
      const body = JSON.stringify(res.json);
      must(!/AIza|gsk_|sk-/.test(body), "an API key was returned to the browser");
      return "masked";
    });

    // ---- domains -----------------------------------------------------------
    // ---- domains (operator-controlled) -------------------------------------
    // Domains are assigned by the operator, so these run as a super admin
    // rather than as the client.
    await check("Domains", "operator assigns a domain", async () => {
      const before = cookie;
      cookie = "";
      const login = await api("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email: adminEmail, password }),
      });
      must(login.status === 200, `super admin login failed (${login.status})`);
      adminCookie = cookie;

      const res = await api("/api/admin/domains", {
        method: "POST",
        body: JSON.stringify({ tenantId, domain: `chat.audit-${run}.example` }),
      });
      cookie = before;

      must(res.json?.success, `assign failed: ${res.text.slice(0, 160)}`);
      const dns = res.json?.dns || res.json?.data?.dns;
      must(dns?.records?.[0]?.type === "A", `expected the A record first, got ${dns?.records?.[0]?.type}`);
      must(dns.proxyWarning, "no Cloudflare proxy warning");
      must(dns.cacheWarning, "no DNS-caching warning");
      must(dns.steps?.length >= 3, "no ordered setup checklist");
      must(
        dns.steps.some((step: any) => step.who === "client") && dns.steps.some((step: any) => step.who === "operator"),
        "the checklist does not say who does what",
      );
      return `${dns.records[0].type} -> ${dns.records[0].value}, ${dns.steps.length} steps`;
    });

    await check("Domains", "an invalid domain is refused", async () => {
      const before = cookie;
      cookie = adminCookie;
      const res = await api("/api/admin/domains", {
        method: "POST",
        body: JSON.stringify({ tenantId, domain: "not a domain at all" }),
      });
      cookie = before;
      must(!res.json?.success, "an invalid domain was accepted");
      return "rejected";
    });

    await check("Domains", "a domain that does not exist reports as not serving", async () => {
      const before = cookie;
      cookie = adminCookie;
      const res = await api("/api/admin/domains");
      cookie = before;

      const row = (res.json?.domains || res.json?.data?.domains || []).find(
        (entry: any) => entry.tenantId === tenantId,
      );
      must(row, "the workspace is missing from the domain list");
      must(row.live === false, "a domain that does not exist reported as live");
      return `honest: ${row.detail.slice(0, 60)}`;
    });

    await check("Domains", "the client can no longer set their own domain", async () => {
      // Self-service left domains half-connected, so the route is gone.
      const res = await api("/api/client/settings/domain", {
        method: "POST",
        body: JSON.stringify({ domain: "sneaky.example" }),
      });
      must(res.status === 404 || res.status === 405, `the route still answers (${res.status})`);
      return `removed (${res.status})`;
    });


    // ---- tenant isolation --------------------------------------------------
    await check("Security", "cannot read another workspace's conversation", async () => {
      const other = await prisma.tenant.findFirst({
        where: { id: { not: tenantId }, deletedAt: null },
        select: { id: true },
      });
      if (!other) return "skipped (only one workspace exists)";
      const theirs = await prisma.conversation.findFirst({
        where: { tenantId: other.id },
        select: { id: true },
      });
      if (!theirs) return "skipped (the other workspace has no conversations)";
      const res = await api(`/api/client/conversations/${theirs.id}`);
      const leaked = res.json?.conversation || res.json?.data?.conversation;
      must(!leaked, "another workspace's conversation was returned");
      return `refused (${res.status})`;
    });

    await check("Security", "logout ends the session", async () => {
      await api("/api/auth/logout", { method: "POST" });
      const res = await api("/api/auth/me");
      must(res.status === 401, `still authenticated (${res.status})`);
      return "401";
    });
  } finally {
    // ---- teardown ----------------------------------------------------------
    try {
      if (tenantId) {
        await prisma.shortLink.deleteMany({ where: { tenantId } });
        await prisma.trackingLink.deleteMany({ where: { tenantId } });
        const convs = await prisma.conversation.findMany({ where: { tenantId }, select: { id: true } });
        const ids = convs.map((c) => c.id);
        await prisma.analyticsEvent.deleteMany({ where: { tenantId } });
        await prisma.message.deleteMany({ where: { conversationId: { in: ids } } });
        await prisma.lead.deleteMany({ where: { tenantId } });
        await prisma.conversation.deleteMany({ where: { tenantId } });
        await prisma.tenant.delete({ where: { id: tenantId } });
      }
      await prisma.user.deleteMany({ where: { email: { in: [ownerEmail, agentEmail, adminEmail] } } });
    } catch (error) {
      console.error("\nCLEANUP FAILED — remove workspace manually:", slug, error);
    }
    await prisma.$disconnect();
  }

  const failed = results.filter((result) => !result.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  if (failed.length) {
    console.log("\nFailures:");
    for (const failure of failed) console.log(`  ${failure.area} · ${failure.name}\n    ${failure.detail}`);
  }
  process.exit(failed.length ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
