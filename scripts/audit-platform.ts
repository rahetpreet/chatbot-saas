/**
 * Platform health audit.
 *
 * Covers the parts a client touches that the other audits do not: the embed
 * snippet and its tracking, the agent handover workflow, whether AI answering
 * stays inside the documents it was given, and whether a lead reaches the email
 * address a workspace configured.
 *
 *   npx tsx scripts/audit-platform.ts
 *
 * Everything runs over HTTP against the live app. Everything created is removed.
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

const results: Array<{ area: string; name: string; ok: boolean; detail: string }> = [];
function record(area: string, name: string, ok: boolean, detail = "") {
  results.push({ area, name, ok, detail });
  process.stdout.write(`  ${ok ? "PASS" : "FAIL"}  ${area} · ${name}${detail ? ` — ${detail}` : ""}\n`);
}
async function check(area: string, name: string, run: () => Promise<string>) {
  try {
    record(area, name, true, await run());
  } catch (error: any) {
    record(area, name, false, String(error?.message || error).slice(0, 180));
  }
}
function must(condition: boolean, whatFailed: string) {
  if (!condition) throw new Error(whatFailed);
}

async function main() {
  const { default: prisma } = await import("../src/lib/prisma");
  const bcrypt = await import("bcryptjs");

  const stamp = Date.now();
  const slug = `platform-${stamp}`;
  const ownerEmail = `owner-${stamp}@example.com`;
  const agentEmail = `agent-${stamp}@example.com`;
  const password = `Plat1!${randomBytes(8).toString("base64url")}`;
  const alertEmail = `alerts-${stamp}@example.com`;

  console.log(`\nPlatform health audit against ${BASE}\n`);

  const tenant = await prisma.tenant.create({
    data: { name: "Platform Audit", slug, status: "ACTIVE" },
  });

  try {
    const hash = await bcrypt.hash(password, 10);
    await prisma.user.create({
      data: { tenantId: tenant.id, email: ownerEmail, passwordHash: hash, name: "Owner",
        role: "CLIENT_OWNER", isActive: true, mustChangePassword: false },
    });
    await prisma.user.create({
      data: { tenantId: tenant.id, email: agentEmail, passwordHash: hash, name: "Agent",
        role: "CLIENT_AGENT", isActive: true, mustChangePassword: false },
    });

    // A flow whose only interactive step hands over, so the agent path is
    // reachable without walking a long conversation.
    const nodes = [
      { id: "start", type: "start", data: { label: "Start", nodeType: "start" }, position: { x: 0, y: 0 } },
      { id: "ask", type: "buttons", data: { label: "How can we help?", nodeType: "buttons",
        options: [{ id: "o1", label: "Talk to a person", value: "agent" }] }, position: { x: 0, y: 100 } },
      { id: "hand", type: "handover", data: { label: "Handover", nodeType: "handover" }, position: { x: 0, y: 200 } },
    ];
    const edges = [
      { id: "e1", source: "start", target: "ask" },
      { id: "e2", source: "ask", target: "hand" },
    ];
    const flow = await prisma.flow.create({
      data: { tenantId: tenant.id, name: "Support bot", status: "PUBLISHED", isDefault: true, version: 1,
        nodes: JSON.stringify(nodes), edges: JSON.stringify(edges),
        publishedNodes: JSON.stringify(nodes), publishedEdges: JSON.stringify(edges) },
    });
    const campaign = await prisma.campaign.create({
      data: { tenantId: tenant.id, name: "Embed campaign", slug: `embed-${stamp}`, flowId: flow.id },
    });
    const link = await prisma.trackingLink.create({
      data: { tenantId: tenant.id, campaignId: campaign.id, flowId: flow.id, token: `emb${stamp}`.slice(0, 20) },
    });

    const signIn = async (email: string) => {
      const res = await fetch(`${BASE}/api/auth/login`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      for (const entry of res.headers.getSetCookie?.() || []) {
        const pair = entry.split(";")[0];
        if (pair.startsWith("chatbot_saas_auth=") && !pair.endsWith("=")) return pair;
      }
      return "";
    };

    // ---- EMBED -------------------------------------------------------------
    await check("Embed", "widget.js is served", async () => {
      const res = await fetch(`${BASE}/widget.js`);
      const body = await res.text();
      must(res.ok, `status ${res.status}`);
      must(body.length > 1000, `only ${body.length} bytes`);
      must(body.includes("data-tenant-slug"), "the script does not read data-tenant-slug");
      must(body.includes("/api/public/v1/sessions"), "the script never starts a session");
      return `${(body.length / 1024).toFixed(0)} KB`;
    });

    await check("Embed", "the snippet's attribute matches what the script reads", async () => {
      const script = await (await fetch(`${BASE}/widget.js`)).text();
      // The customizer emits data-tenant-slug; a mismatch here means every
      // pasted snippet silently fails on the client's own website.
      must(/getAttribute\(\s*["']data-tenant-slug["']\s*\)/.test(script), "attribute name mismatch");
      return "data-tenant-slug";
    });

    await check("Embed", "config loads for an embedded page", async () => {
      const res = await fetch(`${BASE}/api/public/v1/config?tenantSlug=${slug}`, {
        headers: { origin: "https://someclientsite.example" },
      });
      const json = await res.json();
      must(json.success, json.error?.message || `status ${res.status}`);
      must(Boolean(json.activeFlow?.id), "no published flow was returned to the widget");
      must(!JSON.stringify(json).toLowerCase().includes("apikey"), "the public config exposes a key");
      return `flow "${json.activeFlow.name}"`;
    });

    // ---- TRACKING ----------------------------------------------------------
    let conversationId = "";
    let sessionToken = "";
    await check("Tracking", "an embedded chat attributes to campaign and link", async () => {
      await fetch(`${BASE}/t/${link.token}`, { redirect: "manual" });
      const res = await fetch(`${BASE}/api/public/v1/sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", origin: "https://someclientsite.example" },
        body: JSON.stringify({
          tenantSlug: slug, visitorId: `embed-visitor-${stamp}`,
          campaignSlug: campaign.slug, trackingToken: link.token,
        }),
      });
      const json = await res.json();
      must(json.success, json.error?.message || `status ${res.status}`);
      conversationId = json.conversationId;
      sessionToken = json.sessionToken;

      const stored = await prisma.conversation.findUnique({
        where: { id: conversationId },
        select: { campaignId: true, trackingLinkId: true, flowVersion: true },
      });
      must(stored?.campaignId === campaign.id, "the conversation is not attributed to the campaign");
      must(stored?.trackingLinkId === link.id, "the conversation is not attributed to the link");
      must(stored?.flowVersion === 1, "the conversation did not record which version served it");
      return "campaign, link and version all recorded";
    });

    await check("Tracking", "the link's own counters move", async () => {
      const stored = await prisma.trackingLink.findUnique({
        where: { id: link.id },
        select: { openCount: true, conversationCount: true },
      });
      must((stored?.openCount ?? 0) >= 1, "the open was not counted");
      must((stored?.conversationCount ?? 0) >= 1, "the conversation was not counted against the link");
      return `${stored!.openCount} open, ${stored!.conversationCount} chat`;
    });

    // ---- AGENT WORKFLOW ----------------------------------------------------
    await check("Agent", "choosing a person puts the chat into handover", async () => {
      const res = await fetch(`${BASE}/api/public/v1/messages`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId, sessionToken,
          userInput: { type: "button_click", value: "o1", buttonId: "o1", label: "Talk to a person" },
        }),
      });
      const json = await res.json();
      must(json.success, json.error?.message || `status ${res.status}`);
      const stored = await prisma.conversation.findUnique({
        where: { id: conversationId }, select: { sessionStatus: true },
      });
      must(stored?.sessionStatus === "HANDOVER", `status is ${stored?.sessionStatus}, expected HANDOVER`);
      const said = (json.botMessages || []).map((m: any) => m.content).join(" ");
      must(/hold|agent|connect/i.test(said), `the visitor was not told to wait: "${said.slice(0, 60)}"`);
      return "waiting for an agent";
    });

    let agentCookie = "";
    await check("Agent", "an agent signs in and sees the queue", async () => {
      agentCookie = await signIn(agentEmail);
      must(Boolean(agentCookie), "the agent could not sign in");
      const res = await fetch(`${BASE}/api/client/agent/conversations`, { headers: { cookie: agentCookie } });
      const json = await res.json();
      must(res.ok, `status ${res.status}`);
      const queue = json.conversations || json.data?.conversations || [];
      must(queue.some((c: any) => c.id === conversationId), "the waiting chat is not in the agent's queue");
      return `${queue.length} waiting`;
    });

    await check("Agent", "an agent sees only chats that asked for a person", async () => {
      // A chat nobody escalated must not appear in the queue: an agent console
      // that shows every conversation is a privacy problem, not a feature.
      const other = await prisma.conversation.create({
        data: { tenantId: tenant.id, flowId: flow.id, visitorId: `not-escalated-${stamp}`, sessionStatus: "ACTIVE" },
      });
      const res = await fetch(`${BASE}/api/client/agent/conversations`, { headers: { cookie: agentCookie } });
      const json = await res.json();
      const queue = json.conversations || json.data?.conversations || [];
      must(!queue.some((c: any) => c.id === other.id), "a non-escalated chat appeared in the agent queue");
      return "escalated only";
    });

    await check("Agent", "an agent's reply reaches the visitor", async () => {
      const res = await fetch(`${BASE}/api/client/conversations/${conversationId}/messages`, {
        method: "POST",
        headers: { cookie: agentCookie, "Content-Type": "application/json" },
        body: JSON.stringify({ content: `Hello from the agent ${stamp}` }),
      });
      must(res.ok, `status ${res.status}`);
      const sync = await fetch(
        `${BASE}/api/public/v1/sync?conversationId=${conversationId}&sessionToken=${encodeURIComponent(sessionToken)}`,
      );
      const json = await sync.json();
      const messages = json.messages || json.data?.messages || [];
      must(
        messages.some((m: any) => String(m.content).includes(`agent ${stamp}`)),
        "the visitor never received the agent's reply",
      );
      return "delivered";
    });

    await check("Agent", "an agent cannot reach the client's reports", async () => {
      const res = await fetch(`${BASE}/api/client/analytics/overview?preset=last30`, {
        headers: { cookie: agentCookie },
      });
      must(res.status === 403, `expected 403, got ${res.status}`);
      return "403";
    });

    // ---- AI GROUNDING ------------------------------------------------------
    await check("AI", "a question with no matching document hands over", async () => {
      const { answerFromKnowledge } = await import("../src/lib/services/knowledge/answer");
      const answer = await answerFromKnowledge({
        tenantId: tenant.id,
        question: "What is the capital of France?",
      });
      // Nothing was uploaded, so there is nothing to ground an answer in.
      // Answering anyway from the model's general knowledge is the exact
      // failure the grounding rule exists to prevent.
      must(answer.answered === false, `the AI answered with no documents: "${answer.content.slice(0, 60)}"`);
      must(answer.handover === true, "it did not hand over");
      return "refused and handed over";
    });

    await check("AI", "an uploaded document becomes answerable", async () => {
      await prisma.knowledgeDoc.create({
        data: {
          tenantId: tenant.id,
          title: "Refund policy",
          content:
            "Our refund window is 21 days from purchase. Refunds are issued to the original payment method within 5 working days.",
          sourceType: "manual",
        },
      });
      const { retrievePassages } = await import("../src/lib/services/knowledge/answer");
      const passages = await retrievePassages(tenant.id, "how long do I have to get a refund");
      must(passages.length > 0, "the uploaded document was not retrievable");
      must(/21 days/.test(passages.map((p: any) => p.content).join(" ")), "the retrieved passage is the wrong one");
      return `${passages.length} passage(s) retrieved`;
    });

    // ---- LEAD EMAIL --------------------------------------------------------
    await check("Notifications", "a lead reaches the email a workspace configured", async () => {
      await prisma.notificationSetting.create({
        data: { tenantId: tenant.id, leadAlerts: true, emailEnabled: true, emailTo: alertEmail },
      });
      const { notifyLeadCaptured } = await import("../src/lib/services/notifications/leadAlerts");
      const sent = await notifyLeadCaptured({
        tenantId: tenant.id, leadId: "test", name: "Lead Person", email: "lead@example.com",
      });
      const email = sent.find((r) => r.channel === "email");
      must(Boolean(email), "the email channel did not fire at all");
      must(email!.sent === true, `email not sent: ${email!.detail}`);
      return email!.detail;
    });

    await check("Notifications", "no email is sent when the workspace set none", async () => {
      await prisma.notificationSetting.update({
        where: { tenantId: tenant.id }, data: { emailTo: null },
      });
      const { notifyLeadCaptured } = await import("../src/lib/services/notifications/leadAlerts");
      const sent = await notifyLeadCaptured({ tenantId: tenant.id, leadId: "t2", name: "Nobody" });
      must(!sent.some((r) => r.channel === "email"), "an email was attempted with no address configured");
      return "silent";
    });
  } finally {
    await prisma.tenant.delete({ where: { id: tenant.id } }).catch(() => undefined);
    console.log("\n  test workspace removed");

    const failed = results.filter((r) => !r.ok);
    console.log(`\n${results.length - failed.length}/${results.length} platform checks passed`);
    if (failed.length) {
      console.log("\nBROKEN:");
      for (const f of failed) console.log(`  - ${f.area} · ${f.name}: ${f.detail}`);
      process.exitCode = 1;
    }
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error("\nAUDIT ABORTED:", error?.message || error);
  process.exitCode = 1;
});
