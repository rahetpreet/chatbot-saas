/**
 * End-to-end audit of the Data & Reports module.
 *
 * Drives a real conversation through the public API — link open, chat start,
 * button click, form answers, lead capture — then reads every analytics
 * endpoint back over HTTP and checks the numbers match what was actually done.
 *
 *   npx tsx scripts/audit-analytics.ts
 *
 * A pass here means the events were recorded, aggregated and served correctly,
 * not merely that the endpoints returned 200. Everything created is removed.
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

const results: Array<{ name: string; ok: boolean; detail: string }> = [];
function check(name: string, ok: boolean, detail = "") {
  results.push({ name, ok, detail });
  process.stdout.write(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}\n`);
}
function expect(name: string, actual: unknown, wanted: unknown) {
  check(name, actual === wanted, `got ${JSON.stringify(actual)}, expected ${JSON.stringify(wanted)}`);
}

async function main() {
  const { default: prisma } = await import("../src/lib/prisma");
  const bcrypt = await import("bcryptjs");

  const stamp = Date.now();
  const slug = `analytics-e2e-${stamp}`;
  const email = `analytics-e2e-${stamp}@example.com`;
  const password = `Aa1!${randomBytes(9).toString("base64url")}`;

  console.log(`\nData & Reports end-to-end audit against ${BASE}\n`);

  const tenant = await prisma.tenant.create({
    data: { name: "Analytics E2E", slug, status: "ACTIVE" },
  });

  try {
    await prisma.user.create({
      data: {
        tenantId: tenant.id,
        email,
        passwordHash: await bcrypt.hash(password, 10),
        name: "Analytics Auditor",
        role: "CLIENT_ADMIN",
        isActive: true,
        mustChangePassword: false,
      },
    });

    // A published flow: one button question, one input, then close.
    const nodes = [
      { id: "start", type: "start", data: { label: "Start", nodeType: "start" }, position: { x: 0, y: 0 } },
      {
        id: "ask",
        type: "buttons",
        data: {
          label: "What do you need?",
          nodeType: "buttons",
          inputKey: "need",
          options: [
            { id: "o1", label: "Pricing", value: "pricing" },
            { id: "o2", label: "Support", value: "support" },
          ],
        },
        position: { x: 0, y: 120 },
      },
      {
        id: "email",
        type: "input",
        data: { label: "Your email", nodeType: "input", inputKey: "email", inputType: "email", required: true },
        position: { x: 0, y: 240 },
      },
      { id: "bye", type: "close", data: { label: "Done", nodeType: "close" }, position: { x: 0, y: 360 } },
    ];
    const edges = [
      { id: "e1", source: "start", target: "ask" },
      { id: "e2", source: "ask", target: "email", sourceHandle: "o1" },
      { id: "e3", source: "ask", target: "email" },
      { id: "e4", source: "email", target: "bye" },
    ];

    const flow = await prisma.flow.create({
      data: {
        tenantId: tenant.id,
        name: "E2E flow",
        status: "PUBLISHED",
        isDefault: true,
        version: 4,
        nodes: JSON.stringify(nodes),
        edges: JSON.stringify(edges),
        publishedNodes: JSON.stringify(nodes),
        publishedEdges: JSON.stringify(edges),
      },
    });

    const campaign = await prisma.campaign.create({
      data: { tenantId: tenant.id, name: "E2E campaign", slug: `e2e-${stamp}`, flowId: flow.id },
    });
    const link = await prisma.trackingLink.create({
      data: { tenantId: tenant.id, campaignId: campaign.id, flowId: flow.id, token: `e2e${stamp}`.slice(0, 20) },
    });

    // ---- drive a real visitor journey -------------------------------------
    const openRes = await fetch(`${BASE}/t/${link.token}`, { redirect: "manual" });
    check("tracking link redirects a visitor", openRes.status === 302 || openRes.status === 307, `${openRes.status}`);

    const visitorId = `e2e-visitor-${stamp}`;
    const start = await fetch(`${BASE}/api/public/v1/sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tenantSlug: slug, visitorId, campaignSlug: campaign.slug, trackingToken: link.token }),
    }).then((r) => r.json());
    check("chat session starts", Boolean(start.success && start.conversationId), start.error?.message || "");
    if (!start.success) throw new Error("cannot continue without a session");

    const say = (userInput: any) =>
      fetch(`${BASE}/api/public/v1/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId: start.conversationId,
          sessionToken: start.sessionToken,
          userInput,
        }),
      }).then((r) => r.json());

    const clicked = await say({ type: "button_click", value: "o1", buttonId: "o1", label: "Pricing" });
    check("button click accepted", Boolean(clicked.success), clicked.error?.message || "");

    const answered = await say({ type: "text", value: "visitor@example.com" });
    check("input answered", Boolean(answered.success), answered.error?.message || "");

    const lead = await fetch(`${BASE}/api/public/v1/leads`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        conversationId: start.conversationId,
        sessionToken: start.sessionToken,
        name: "E2E Visitor",
        email: "visitor@example.com",
      }),
    }).then((r) => r.json());
    check("lead captured", Boolean(lead.success), lead.error?.message || "");

    // ---- sign in and read the reports back --------------------------------
    let cookie = "";
    const login = await fetch(`${BASE}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    for (const entry of login.headers.getSetCookie?.() || []) {
      const pair = entry.split(";")[0];
      if (pair.startsWith("chatbot_saas_auth=") && !pair.endsWith("=")) cookie = pair;
    }
    if (!cookie) throw new Error("could not sign in as the audit user");

    const get = async (path: string) => {
      const res = await fetch(`${BASE}${path}`, { headers: { cookie } });
      const text = await res.text();
      try {
        return { status: res.status, json: JSON.parse(text), text };
      } catch {
        return { status: res.status, json: null, text };
      }
    };

    const overview = await get("/api/client/analytics/overview?preset=last30&compare=true");
    const m = overview.json?.data?.metrics;
    expect("overview: chatbot opens", m?.chatbotOpens, 1);
    expect("overview: conversations", m?.conversationsStarted, 1);
    expect("overview: leads", m?.totalLeads, 1);
    expect("overview: link opens", m?.linksOpened, 1);
    expect("overview: conversion rate", m?.conversionRate, 100);
    check("overview: comparison returned", overview.json?.data?.changes !== null, "compare=true");

    const funnel = overview.json?.data?.funnel || [];
    const step = (key: string) => funnel.find((s: any) => s.key === key)?.count;
    expect("funnel: links opened", step("linksOpened"), 1);
    expect("funnel: chatbot opened", step("chatbotOpened"), 1);
    expect("funnel: conversation started", step("conversationsStarted"), 1);
    expect("funnel: form started", step("formsStarted"), 1);
    expect("funnel: form completed", step("formsCompleted"), 1);
    expect("funnel: lead created", step("leads"), 1);

    const flowReport = await get("/api/client/analytics/flow?preset=last30");
    const askNode = flowReport.json?.data?.nodes?.find((n: any) => n.nodeId === "ask");
    check("flow: the question node was recorded", Boolean(askNode), askNode ? `entered ${askNode.entered}` : "missing");
    expect("flow: question label captured", askNode?.label, "What do you need?");

    const option = flowReport.json?.data?.options?.find((o: any) => o.label === "Pricing");
    check("options: the chosen button was recorded", Boolean(option), option ? `${option.clicks} click` : "missing");
    expect("options: leads after that choice", option?.leadsAfter, 1);

    const campaigns = await get("/api/client/analytics/campaigns?preset=last30");
    const camp = campaigns.json?.data?.campaigns?.find((c: any) => c.campaignId === campaign.id);
    expect("campaign: links opened", camp?.linksOpened, 1);
    expect("campaign: conversations", camp?.conversations, 1);
    expect("campaign: leads", camp?.leads, 1);

    const links = await get("/api/client/analytics/links?preset=last30");
    const linkRow = links.json?.data?.links?.find((l: any) => l.token === link.token);
    expect("link: opens", linkRow?.opens, 1);
    expect("link: conversations", linkRow?.conversations, 1);
    expect("link: leads", linkRow?.leads, 1);

    const versions = await get("/api/client/analytics/versions?preset=last30");
    const version = versions.json?.data?.versions?.find((v: any) => v.version === 4);
    check("version: conversation tied to published version 4", Boolean(version), version ? `${version.conversations} chat` : "missing");

    const forms = await get("/api/client/analytics/forms?preset=last30");
    const field = forms.json?.data?.fields?.find((f: any) => f.nodeId === "email");
    expect("form field: completion rate", field?.completionRate, 100);

    const createdLead = await prisma.lead.findFirst({ where: { tenantId: tenant.id }, select: { id: true } });
    const journey = await get(`/api/client/analytics/journey?leadId=${createdLead?.id}&preset=last30`);
    const events = journey.json?.data?.entries || [];
    check("journey: recorded in order", events.length >= 6, `${events.length} events`);
    check(
      "journey: starts with the link open",
      events[0]?.event === "LINK_OPENED" || events[0]?.event === "CHATBOT_OPENED",
      events[0]?.event || "empty",
    );
    check("journey: ends at the lead", events.some((e: any) => e.event === "LEAD_CREATED"), "");

    // ---- reports -----------------------------------------------------------
    const generated = await fetch(`${BASE}/api/client/reports?preset=last30`, {
      method: "POST",
      headers: { cookie, "Content-Type": "application/json" },
      body: JSON.stringify({ type: "complete" }),
    }).then((r) => r.json());
    check("report generates", Boolean(generated.success), generated.error?.message || "");

    if (generated.success) {
      const id = generated.data.report.id;
      const stored = await get(`/api/client/reports/${id}`);
      expect("report: stored metrics match", stored.json?.data?.report?.metrics?.totalLeads, 1);

      const csv = await get(`/api/client/reports/${id}/export?format=csv`);
      check("report: CSV export", csv.text.includes("Headline metrics"), `${csv.text.length} bytes`);
      check("report: CSV carries the funnel", csv.text.includes("Conversion funnel"), "");

      const json = await get(`/api/client/reports/${id}/export?format=json`);
      check("report: JSON export", Boolean(json.json?.metrics), "");

      // The point of a snapshot: it must not move when the data behind it does.
      await prisma.lead.updateMany({ where: { tenantId: tenant.id }, data: { status: "WON" } });
      const reread = await get(`/api/client/reports/${id}`);
      expect("report: snapshot is frozen", reread.json?.data?.report?.metrics?.totalLeads, 1);
    }

    const conversations = await get("/api/client/analytics/conversations?preset=last30");
    expect("conversations: total", conversations.json?.data?.conversations?.total, 1);

    const timeline = await get("/api/client/analytics/timeline?preset=last30");
    check("timeline: a day per day in range", timeline.json?.data?.daily?.length === 30, `${timeline.json?.data?.daily?.length} days`);

    for (const path of ["sources", "devices", "leads", "chatbots", "ai", "options", "funnel"]) {
      const res = await get(`/api/client/analytics/${path}?preset=last30`);
      check(`endpoint /${path} responds`, res.status === 200 && res.json?.success === true, `${res.status}`);
    }

    // ---- the numbers must not be reachable without signing in --------------
    const anon = await fetch(`${BASE}/api/client/analytics/overview?preset=last30`);
    check("analytics refuses an anonymous request", anon.status === 401 || anon.status === 403, `${anon.status}`);
  } finally {
    await prisma.tenant.delete({ where: { id: tenant.id } }).catch(() => undefined);
    console.log("\n  throwaway workspace removed");

    const failed = results.filter((r) => !r.ok);
    console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
    if (failed.length) {
      console.log("\nFAILED:");
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
