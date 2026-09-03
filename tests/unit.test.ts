import test from "node:test";
import assert from "node:assert/strict";

import {
  generateTemporaryPassword,
  hashPassword,
  verifyPassword,
  validatePasswordStrength,
  generatePasswordResetToken,
} from "../src/lib/security/password";
import { validateFlowGraph } from "../src/lib/services/flow/validation";
import { isAllowedPublicOrigin, parseAllowedDomains } from "../src/lib/services/public/cors";
import { impersonateSchema, emailSchema } from "../src/lib/validation";

test("temporary passwords are random, long and mixed-character", async () => {
  const seen = new Set<string>();
  for (let i = 0; i < 200; i++) seen.add(generateTemporaryPassword(18));
  assert.equal(seen.size, 200, "generated passwords must never repeat");

  const password = generateTemporaryPassword(18);
  assert.equal(password.length, 18);
  assert.match(password, /[A-Z]/);
  assert.match(password, /[a-z]/);
  assert.match(password, /[0-9]/);
  assert.match(password, /[^A-Za-z0-9]/);
});

test("password hashing is salted and verifiable", async () => {
  const password = generateTemporaryPassword(20);
  const a = await hashPassword(password);
  const b = await hashPassword(password);

  assert.notEqual(a, b, "identical passwords must not produce identical hashes");
  assert.ok(!a.includes(password), "the hash must not contain the plaintext");
  assert.equal(await verifyPassword(password, a), true);
  assert.equal(await verifyPassword(password + "x", a), false);
  assert.equal(await verifyPassword(password, null), false);
});

test("password policy rejects weak passwords", () => {
  assert.equal(validatePasswordStrength("short").valid, false);
  assert.equal(validatePasswordStrength("password").valid, false);
  assert.equal(validatePasswordStrength(generateTemporaryPassword(18)).valid, true);
});

test("reset tokens are stored only as hashes and expire", () => {
  const { token, tokenHash, expiresAt } = generatePasswordResetToken();
  assert.notEqual(token, tokenHash, "the raw token must never be the stored value");
  assert.equal(tokenHash.length, 64, "expected a SHA-256 hex digest");
  assert.ok(expiresAt.getTime() > Date.now());
  assert.ok(expiresAt.getTime() - Date.now() <= 30 * 60 * 1000 + 1000);

  const second = generatePasswordResetToken();
  assert.notEqual(token, second.token);
});

test("flow validation blocks structurally broken graphs", () => {
  assert.deepEqual(validateFlowGraph([], []), ["A flow must contain at least one START node."]);

  const noStart = validateFlowGraph([{ id: "a", type: "message", data: {} }], []);
  assert.ok(noStart.some((e) => e.includes("exactly one START")));

  const twoStarts = validateFlowGraph(
    [{ id: "a", type: "start", data: {} }, { id: "b", type: "start", data: {} }],
    [],
  );
  assert.ok(twoStarts.some((e) => e.includes("exactly one START")));

  const danglingEdge = validateFlowGraph(
    [{ id: "a", type: "start", data: {} }],
    [{ source: "a", target: "does-not-exist" }],
  );
  assert.ok(danglingEdge.some((e) => e.includes("existing source and target")));

  const emptyButtons = validateFlowGraph(
    [{ id: "a", type: "start", data: {} }, { id: "b", type: "buttons", data: { options: [] } }],
    [],
  );
  assert.ok(emptyButtons.some((e) => e.includes("at least one option")));

  const inputWithoutKey = validateFlowGraph(
    [{ id: "a", type: "start", data: {} }, { id: "b", type: "input", data: {} }],
    [],
  );
  assert.ok(inputWithoutKey.some((e) => e.includes("input key")));
});

test("flow validation accepts a well-formed graph", () => {
  const errors = validateFlowGraph(
    [
      { id: "start", type: "start", data: {} },
      { id: "ask", type: "input", data: { inputKey: "email" } },
      { id: "menu", type: "buttons", data: { options: [{ label: "Sales", value: "sales" }] } },
    ],
    [
      { source: "start", target: "ask" },
      { source: "ask", target: "menu" },
    ],
  );
  assert.deepEqual(errors, []);
});

test("widget origin allow-listing honours tenant configuration", () => {
  const domains = parseAllowedDomains(JSON.stringify({ allowedDomains: ["Example.com", " shop.test "] }));
  assert.deepEqual(domains, ["example.com", "shop.test"]);

  assert.equal(isAllowedPublicOrigin("https://example.com", domains), true);
  assert.equal(isAllowedPublicOrigin("https://evil.test", domains), false);
  assert.equal(isAllowedPublicOrigin("not a url", domains), false);

  // An unconfigured tenant is intentionally open, matching the default widget.
  assert.equal(isAllowedPublicOrigin("https://anything.test", []), true);
  assert.deepEqual(parseAllowedDomains("not json"), []);
});

test("impersonation stop does not require a tenantId", async () => {
  const stop = impersonateSchema.safeParse({ action: "stop" });
  assert.equal(stop.success, true, "stopping must not require a tenant the client cannot know");

  const startWithout = impersonateSchema.safeParse({ action: "start" });
  assert.equal(startWithout.success, false, "starting must still require a tenant");

  const startWith = impersonateSchema.safeParse({ action: "start", tenantId: "t_1" });
  assert.equal(startWith.success, true);
});

test("emails are normalised for uniqueness", () => {
  assert.equal(emailSchema.parse("  Person@Example.COM  "), "person@example.com");
});
