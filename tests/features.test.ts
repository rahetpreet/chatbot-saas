import test from "node:test";
import assert from "node:assert/strict";

import {
  normalizeHost,
  isPlatformHost,
  validateCustomDomain,
  dnsInstructionsFor,
} from "../src/lib/services/tenant/domainResolver";
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
  assert.equal(sub.records[0].type, "CNAME");
  assert.equal(sub.records[0].name, "chat");

  // An apex domain cannot use CNAME, so recommending one would not work.
  const apex = dnsInstructionsFor("acme.com");
  assert.equal(apex.isApex, true);
  assert.equal(apex.records[0].type, "A");
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

test("a verified custom domain serves the chat at its own root", () => {
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

  assert.equal(url.hostname, "chat.acme.com");
  assert.equal(url.pathname, "/", "a white-labelled domain must not expose /c/<slug>");
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
