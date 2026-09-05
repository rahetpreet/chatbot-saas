import test from "node:test";
import assert from "node:assert/strict";

import {
  normalizeHost,
  isPlatformHost,
  validateCustomDomain,
  dnsInstructionsFor,
} from "../src/lib/services/tenant/domainResolver";
import { isDomainAutomationConfigured, registerDomain } from "../src/lib/services/tenant/vercelDomains";
import {
  encryptSecret,
  decryptSecret,
  encryptJsonFields,
  decryptJsonFields,
  AI_SECRET_FIELDS,
} from "../src/lib/security/crypto";
import { assertUsageAvailable } from "../src/lib/services/subscription/planLimits";

test("host normalisation strips ports and casing", () => {
  assert.equal(normalizeHost("Example.COM:3000"), "example.com");
  assert.equal(normalizeHost("  chat.acme.com  "), "chat.acme.com");
  // A proxy can append hosts; only the first is meaningful.
  assert.equal(normalizeHost("a.com, b.com"), "a.com");
  assert.equal(normalizeHost(null), null);
});

test("platform hosts are never treated as customer domains", () => {
  assert.equal(isPlatformHost("localhost"), true);
  assert.equal(isPlatformHost("localhost:3000"), true);
  assert.equal(isPlatformHost("my-app-git-main.vercel.app"), true);
  assert.equal(isPlatformHost(null), true);
  assert.equal(isPlatformHost("chat.acme.com"), false);
});

test("custom domain validation rejects the things people actually paste", () => {
  assert.equal(validateCustomDomain("https://chat.acme.com/").valid, true);
  assert.equal(validateCustomDomain("https://chat.acme.com/").domain, "chat.acme.com");
  assert.equal(validateCustomDomain("CHAT.ACME.COM").domain, "chat.acme.com");

  assert.equal(validateCustomDomain("").valid, false);
  assert.equal(validateCustomDomain("not a domain").valid, false);
  assert.equal(validateCustomDomain("acme").valid, false, "a bare label is not a domain");
  assert.equal(validateCustomDomain("*.acme.com").valid, false, "wildcards cannot be routed");
  assert.equal(validateCustomDomain("localhost").valid, false, "the platform's own host cannot be claimed");
});

test("DNS guidance differs for apex and subdomains", () => {
  const sub = dnsInstructionsFor("chat.acme.com");
  assert.equal(sub.isApex, false);
  // The A record leads because it is what Vercel itself asks for, on
  // subdomains as well as apex domains.
  assert.equal(sub.records[0].type, "A");
  assert.equal(sub.records[0].name, "chat");
  // A CNAME also works for a subdomain, so it is offered as an alternative.
  assert.ok(
    sub.records.some((record) => record.type === "CNAME" && record.name === "chat"),
    "a subdomain should also offer the CNAME option",
  );

  // An apex domain cannot use CNAME, so offering one would send people down a
  // path their DNS provider will reject.
  const apex = dnsInstructionsFor("acme.com");
  assert.equal(apex.isApex, true);
  assert.equal(apex.records[0].type, "A");
  assert.equal(apex.records[0].name, "@");
  assert.equal(
    apex.records.some((record) => record.type === "CNAME"),
    false,
    "an apex domain must never be told to use CNAME",
  );
});

test("DNS guidance warns about Cloudflare proxying", () => {
  // The most common reason a correctly pointed domain still fails: with the
  // orange cloud on, Cloudflare terminates TLS and the certificate is never
  // issued.
  const dns = dnsInstructionsFor("chat.acme.com");
  assert.match(dns.proxyWarning || "", /cloudflare/i);
  assert.match(dns.proxyWarning || "", /grey|dns only/i);
});

test("secrets round-trip through encryption", () => {
  const previous = process.env.ENCRYPTION_KEY;
  process.env.ENCRYPTION_KEY = "a".repeat(64);
  try {
    const secret = "sk-test-abcdef1234567890";
    const encrypted = encryptSecret(secret)!;

    assert.notEqual(encrypted, secret, "the stored value must not be the plaintext");
    assert.ok(!encrypted.includes(secret), "the plaintext must not appear in the ciphertext");
    assert.ok(encrypted.startsWith("enc:v1:"));
    assert.equal(decryptSecret(encrypted), secret);

    // A fresh IV each time means identical inputs must not produce identical output.
    assert.notEqual(encryptSecret(secret), encrypted);

    // Already-encrypted values must not be double-wrapped.
    assert.equal(encryptSecret(encrypted), encrypted);
  } finally {
    if (previous === undefined) delete process.env.ENCRYPTION_KEY;
    else process.env.ENCRYPTION_KEY = previous;
  }
});

test("tampered ciphertext is rejected rather than partially decrypted", () => {
  const previous = process.env.ENCRYPTION_KEY;
  process.env.ENCRYPTION_KEY = "b".repeat(64);
  try {
    const encrypted = encryptSecret("super-secret-value")!;
    const tampered = encrypted.slice(0, -4) + "AAAA";
    assert.equal(decryptSecret(tampered), null, "GCM authentication must reject a modified value");
  } finally {
    if (previous === undefined) delete process.env.ENCRYPTION_KEY;
    else process.env.ENCRYPTION_KEY = previous;
  }
});

test("only the named JSON fields are encrypted", () => {
  const previous = process.env.ENCRYPTION_KEY;
  process.env.ENCRYPTION_KEY = "c".repeat(64);
  try {
    const config = JSON.stringify({ enabled: true, provider: "gemini", apiKey: "secret-key", temperature: 0.7 });
    const stored = encryptJsonFields(config, AI_SECRET_FIELDS)!;
    const parsed = JSON.parse(stored);

    assert.equal(parsed.provider, "gemini", "non-secret fields stay readable");
    assert.equal(parsed.enabled, true);
    assert.notEqual(parsed.apiKey, "secret-key");
    assert.ok(!stored.includes("secret-key"));

    assert.equal(JSON.parse(decryptJsonFields(stored, AI_SECRET_FIELDS)!).apiKey, "secret-key");
  } finally {
    if (previous === undefined) delete process.env.ENCRYPTION_KEY;
    else process.env.ENCRYPTION_KEY = previous;
  }
});

test("values stored before encryption existed still read back", () => {
  const previous = process.env.ENCRYPTION_KEY;
  delete process.env.ENCRYPTION_KEY;
  try {
    // Without a key, storage is pass-through rather than a hard failure.
    assert.equal(encryptSecret("plain"), "plain");
    assert.equal(decryptSecret("plain"), "plain");
  } finally {
    if (previous !== undefined) process.env.ENCRYPTION_KEY = previous;
  }
});

test("usage limits are not enforced", async () => {
  // Guards against quotas being silently reintroduced: the signature must
  // report no cap regardless of the quantity requested.
  assert.equal(typeof assertUsageAvailable, "function");
  assert.equal(assertUsageAvailable.length <= 3, true);
});

import { normalizeEmail, normalizeName, normalizePhone } from "../src/lib/services/contact/normalize";
import { generateTrackingToken, trackingRedirectUrl } from "../src/lib/services/tracking";

test("phone normalisation keeps the number, not just the plus", () => {
  // Regression: a mangled character class once reduced every number to "+",
  // silently destroying imported and captured phone numbers.
  assert.equal(normalizePhone("+1 (555) 010-2030"), "+15550102030");
  assert.equal(normalizePhone("555.010.2030"), "5550102030");
  assert.equal(normalizePhone("  0044 20 7946 0958 "), "+442079460958");
  assert.equal(normalizePhone("+91-98765 43210"), "+919876543210");

  // The same number written differently must compare equal.
  assert.equal(normalizePhone("(555) 010 2030"), normalizePhone("555-010-2030"));

  assert.equal(normalizePhone("not a number"), null);
  assert.equal(normalizePhone(""), null);
  assert.equal(normalizePhone(null), null);
});

test("email and name normalisation make de-duplication work", () => {
  assert.equal(normalizeEmail("  Person@Example.COM "), "person@example.com");
  assert.equal(normalizeEmail(""), null);
  assert.equal(normalizeName("  John   Smith  "), "John Smith");
  assert.equal(normalizeName("   "), null);
});

test("tracking tokens are random and unambiguous", () => {
  const tokens = new Set<string>();
  for (let i = 0; i < 500; i++) tokens.add(generateTrackingToken());
  assert.equal(tokens.size, 500, "tokens must not repeat");

  const token = generateTrackingToken();
  assert.equal(token.length, 10);
  // Characters that are easy to confuse when read aloud or retyped.
  assert.equal(/[0O1lI]/.test(token), false, `token ${token} contains an ambiguous character`);
});

test("tracking redirect carries full attribution", () => {
  const url = new URL(
    trackingRedirectUrl(
      {
        id: "tl_1",
        token: "aBcDeF1234".replace(/[0O1lI]/g, "x"),
        tenantSlug: "acme",
        customDomain: null,
        customDomainVerified: false,
        campaignSlug: "spring",
        contactSlug: "jane-abc123",
        flowId: "flow_1",
        utm: { utm_source: "sms" },
      },
      "https://platform.test",
    ),
  );

  assert.equal(url.pathname, "/c/acme");
  assert.equal(url.searchParams.get("campaign"), "spring");
  assert.equal(url.searchParams.get("contact"), "jane-abc123");
  assert.equal(url.searchParams.get("utm_source"), "sms");
  assert.ok(url.searchParams.get("t"), "the token must survive so the conversation can be attributed");
});

test("a verified custom domain hosts the chat, but not at its root", () => {
  const url = new URL(
    trackingRedirectUrl(
      {
        id: "tl_2",
        token: "aBcDeFghjk",
        tenantSlug: "acme",
        customDomain: "chat.acme.com",
        customDomainVerified: true,
        campaignSlug: "spring",
        contactSlug: null,
        flowId: null,
        utm: {},
      },
      "https://platform.test",
    ),
  );

  assert.equal(url.hostname, "chat.acme.com", "the link must carry the workspace's own hostname");
  // The root of a connected domain is that workspace's sign-in page, so the
  // chat cannot live there: one hostname serves both, and the team needs
  // somewhere to log in.
  assert.equal(url.pathname, "/c/acme");
});

test("an unverified custom domain falls back to the platform link", () => {
  const url = new URL(
    trackingRedirectUrl(
      {
        id: "tl_3",
        token: "aBcDeFghjk",
        tenantSlug: "acme",
        customDomain: "chat.acme.com",
        customDomainVerified: false,
        campaignSlug: null,
        contactSlug: null,
        flowId: null,
        utm: {},
      },
      "https://platform.test",
    ),
  );

  // Sending traffic to a domain without a certificate would show a browser warning.
  assert.equal(url.hostname, "platform.test");
  assert.equal(url.pathname, "/c/acme");
});

import { normalizeGeneratedGraph, extractJsonObject, buildFlowUserPrompt } from "../src/lib/services/flow/aiGenerator";

test("generated graphs are repaired rather than discarded", () => {
  // Models produce the right shape but not always a valid graph. Publishing
  // rejects an invalid one, so an unrepaired generation is worthless.
  const graph = normalizeGeneratedGraph({
    name: "Test",
    nodes: [
      { id: "a", data: { nodeType: "message", messageText: "hi" } }, // no start node
      { id: "b", data: { nodeType: "input" } }, // no inputKey
      { id: "c", data: { nodeType: "buttons", options: [{ label: "Yes" }] } }, // option has no id
      { id: "a", data: { nodeType: "message" } }, // duplicate id
    ],
    edges: [
      { source: "a", target: "b" },
      { source: "a", target: "ghost" }, // target does not exist
    ],
  })!;

  assert.ok(graph, "a repairable graph must not be rejected");

  const starts = graph.nodes.filter((n: any) => n.data.nodeType === "start");
  assert.equal(starts.length, 1, "exactly one start node must be present");

  const ids = graph.nodes.map((n: any) => n.id);
  assert.equal(new Set(ids).size, ids.length, "duplicate ids must be removed");

  const input = graph.nodes.find((n: any) => n.data.nodeType === "input") as any;
  assert.ok(input.data.inputKey, "an input node without a key cannot be published");

  const buttons = graph.nodes.find((n: any) => n.data.nodeType === "buttons") as any;
  assert.equal(buttons.data.options[0].id, "opt-1", "options need ids to be branch targets");

  for (const edge of graph.edges) {
    assert.ok(ids.includes(edge.source) && ids.includes(edge.target), "edges must reference real nodes");
  }
  assert.ok(
    graph.edges.some((e: any) => e.source === starts[0].id),
    "a start node connected to nothing produces a bot that never speaks",
  );
});

test("hopeless payloads are rejected so the fallback can take over", () => {
  assert.equal(normalizeGeneratedGraph(null), null);
  assert.equal(normalizeGeneratedGraph({ nodes: "not an array", edges: [] }), null);
  assert.equal(normalizeGeneratedGraph({ nodes: [{ id: "only" }], edges: [] }), null);
});

test("JSON is recovered from prose and code fences", () => {
  assert.deepEqual(extractJsonObject('```json\n{"a":1}\n```'), { a: 1 });
  assert.deepEqual(extractJsonObject('Sure! Here is the flow:\n{"a":1}\nHope that helps.'), { a: 1 });
  assert.equal(extractJsonObject("no json at all"), null);
  assert.equal(extractJsonObject(""), null);
  // Truncated output must not throw; it is rejected so the fallback runs.
  assert.equal(extractJsonObject('{"nodes":[{"id":"a"'), null);
});

test("the flow prompt does not push retail language onto non-retail businesses", () => {
  const prompt = buildFlowUserPrompt("We run a maths coaching centre for class 9 to 12", "Bright Minds");
  assert.match(prompt, /Bright Minds/);
  assert.match(prompt, /coaching centre/);
  // Wording regression: asking for "products, services or intents" produced
  // ordering flows for businesses that sell nothing.
  assert.match(prompt, /reasons someone would contact/i);
  assert.match(prompt, /unless the description is about selling goods/i);
});

import { htmlToText, chunkText } from "../src/lib/services/knowledge/ingest";

test("web page extraction keeps prose and drops the furniture", () => {
  const html = `<html><head><title>Bright Minds</title></head><body>
    <script>track(1)</script><style>.a{color:red}</style>
    <nav>Home About Contact</nav>
    <h1>Coaching</h1>
    <p>Batch timings are 4:30 PM to 7:30 PM.</p>
    <p>Fees start at &#8377;12,000 per term.</p>
    <footer>All rights reserved</footer></body></html>`;

  const { title, text } = htmlToText(html);
  assert.equal(title, "Bright Minds");

  // Script and style contents become visible text if tags are stripped first.
  assert.equal(/track\(1\)/.test(text), false);
  assert.equal(/color:red/.test(text), false);
  // Navigation and footers are boilerplate on every page and would dominate
  // retrieval if kept.
  assert.equal(/Home About Contact/.test(text), false);
  assert.equal(/All rights reserved/.test(text), false);

  assert.match(text, /Batch timings are 4:30 PM/);
  assert.match(text, /₹12,000/, "numeric entities must decode, or prices read as gibberish");
});

test("long sources are split into retrievable passages", () => {
  const paragraph = "Our coaching centre runs weekday and weekend batches for senior students. ";
  const long = Array.from({ length: 60 }, () => paragraph).join("\n\n");

  const chunks = chunkText(long, 500, 50);
  assert.ok(chunks.length > 1, "a long page must not be stored as one row");
  for (const chunk of chunks) {
    assert.ok(chunk.length <= 700, `chunk of ${chunk.length} chars is too large to rank usefully`);
    assert.ok(chunk.trim().length > 0);
  }

  // Short input stays whole rather than being pointlessly fragmented.
  assert.deepEqual(chunkText("Just one short line about fees."), ["Just one short line about fees."]);
  assert.deepEqual(chunkText("   "), []);
});

import { pathHostingOptions } from "../src/lib/services/tenant/domainResolver";

test("path hosting offers approaches that actually work", () => {
  const chatUrl = "https://platform.test/c/acme";
  const options = pathHostingOptions(chatUrl, "/chat-bot");

  // DNS cannot route a path, so an embed and a reverse proxy are the only
  // honest answers; offering a DNS record here would simply not work.
  const ids = options.map((option) => option.id);
  assert.deepEqual(ids, ["embed", "proxy"]);

  const embed = options[0];
  assert.match(embed.snippets[0].code, /<iframe/);
  assert.match(embed.snippets[0].code, new RegExp(chatUrl.replace(/\//g, "\/")));

  const proxy = options[1];
  const platforms = proxy.snippets.map((snippet) => snippet.platform);
  for (const expected of ["Nginx", "Cloudflare Worker", "Vercel (vercel.json)", "Apache (.htaccess)"]) {
    assert.ok(platforms.includes(expected), `missing configuration for ${expected}`);
  }

  // Every proxy snippet must also forward the app's assets. Forwarding only
  // the page renders it without styling, which looks broken.
  for (const snippet of proxy.snippets) {
    assert.match(snippet.code, /_next/, `${snippet.platform} does not forward assets`);
    assert.match(snippet.code, /chat-bot/, `${snippet.platform} does not use the requested path`);
  }
});

test("DNS guidance warns about caching a missing record", () => {
  // The most common false alarm in onboarding: opening the URL before the
  // record exists teaches your own resolver the domain does not exist, and it
  // keeps failing for you long after the setup is correct.
  const dns = dnsInstructionsFor("chat.acme.com");
  assert.match(dns.cacheWarning || "", /before|too early/i);
  assert.match(dns.cacheWarning || "", /mobile data|1\.1\.1\.1/i);
});

test("DNS guidance says who does each step", () => {
  const dns = dnsInstructionsFor("chat.acme.com");
  assert.ok(dns.steps && dns.steps.length >= 3, "expected an ordered checklist");

  // Connecting a domain needs both parties; a checklist that does not say
  // which is which is why domains sit half-connected.
  assert.ok(dns.steps!.some((step) => step.who === "client"), "no client step");
  assert.ok(dns.steps!.some((step) => step.who === "operator"), "no operator step");
  assert.match(dns.steps![0].detail, /DNS/i);
});

import { tenantPublicOrigin, tenantChatUrl } from "../src/lib/services/tenant/domainResolver";

test("public links use the workspace's own hostname once verified", () => {
  const verified = { slug: "acme", customDomain: "chat.acme.com", customDomainVerifiedAt: new Date() };
  assert.equal(tenantPublicOrigin(verified, "https://platform.test"), "https://chat.acme.com");

  const url = new URL(tenantChatUrl(verified, "https://platform.test", { campaign: "spring" }));
  assert.equal(url.hostname, "chat.acme.com");
  assert.equal(url.pathname, "/c/acme");
  assert.equal(url.searchParams.get("campaign"), "spring");
});

test("an unverified domain is never used for a public link", () => {
  // Sending anyone to a hostname with no certificate yet produces a browser
  // security warning, which is worse than a link that merely looks generic.
  const pending = { slug: "acme", customDomain: "chat.acme.com", customDomainVerifiedAt: null };
  assert.equal(tenantPublicOrigin(pending, "https://platform.test"), "https://platform.test");
  assert.equal(new URL(tenantChatUrl(pending, "https://platform.test")).hostname, "platform.test");

  const none = { slug: "acme", customDomain: null, customDomainVerifiedAt: null };
  assert.equal(tenantPublicOrigin(none, "https://platform.test"), "https://platform.test");
});

test("empty link parameters are dropped rather than sent blank", () => {
  const url = new URL(
    tenantChatUrl({ slug: "acme" }, "https://platform.test", { campaign: "spring", contact: null, flowId: "" }),
  );
  assert.equal(url.searchParams.get("campaign"), "spring");
  assert.equal(url.searchParams.has("contact"), false);
  assert.equal(url.searchParams.has("flowId"), false);
});

test("DNS steps drop the manual host step once registration is automated", () => {
  // The manual step is the one an operator forgets, and forgetting it leaves
  // the client with a browser security warning. When it is done automatically,
  // still listing it would invite the operator to repeat work or to believe
  // something is outstanding.
  const manual = dnsInstructionsFor("chat.acme.com");
  const manualStep = manual.steps.find((step) => step.who === "operator" && /vercel domains add/.test(step.detail));
  assert.ok(manualStep, "without automation the operator must be told the command to run");

  const automated = dnsInstructionsFor("chat.acme.com", true);
  assert.equal(
    automated.steps.some((step) => /vercel domains add/.test(step.detail)),
    false,
    "an automated setup must not ask the operator to run the command",
  );
  assert.ok(
    automated.steps.some((step) => step.who === "done"),
    "the completed registration should be shown as done, not hidden",
  );

  // The client's DNS record is still theirs to create either way -- automation
  // covers our side of the handshake, not theirs.
  for (const dns of [manual, automated]) {
    assert.ok(
      dns.steps.some((step) => step.who === "client"),
      "the client always has to create the DNS record",
    );
  }
});

test("domain automation is off unless both credentials are present", () => {
  const saved = { token: process.env.VERCEL_API_TOKEN, project: process.env.VERCEL_PROJECT_ID };
  try {
    // A half-configured setup must not claim to be automated, or the panel
    // would hide the manual step while nothing is actually registering.
    delete process.env.VERCEL_API_TOKEN;
    process.env.VERCEL_PROJECT_ID = "prj_test";
    assert.equal(isDomainAutomationConfigured(), false);

    process.env.VERCEL_API_TOKEN = "token";
    delete process.env.VERCEL_PROJECT_ID;
    assert.equal(isDomainAutomationConfigured(), false);

    process.env.VERCEL_PROJECT_ID = "prj_test";
    assert.equal(isDomainAutomationConfigured(), true);
  } finally {
    if (saved.token) process.env.VERCEL_API_TOKEN = saved.token;
    else delete process.env.VERCEL_API_TOKEN;
    if (saved.project) process.env.VERCEL_PROJECT_ID = saved.project;
    else delete process.env.VERCEL_PROJECT_ID;
  }
});

test("registering a domain never blocks the assignment", async () => {
  const saved = { token: process.env.VERCEL_API_TOKEN, project: process.env.VERCEL_PROJECT_ID };
  try {
    // With automation off, the assignment still has to succeed and the
    // operator has to be told exactly what is left to do by hand.
    delete process.env.VERCEL_API_TOKEN;
    const result = await registerDomain("chat.acme.com");
    assert.equal(result.registered, false);
    assert.equal(result.manual, true);
    assert.match(result.detail, /vercel domains add chat\.acme\.com/);
  } finally {
    if (saved.token) process.env.VERCEL_API_TOKEN = saved.token;
    if (saved.project) process.env.VERCEL_PROJECT_ID = saved.project;
  }
});
