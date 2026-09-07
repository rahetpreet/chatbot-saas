/**
 * Static guards over the API surface. These catch the classes of regression
 * that are easy to reintroduce during a refactor and expensive to notice in
 * production, without needing a database or a running server.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const API_ROOT = path.join(process.cwd(), "src", "app", "api");

function routeFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...routeFiles(full));
    else if (entry.name === "route.ts") out.push(full);
  }
  return out;
}

const routes = routeFiles(API_ROOT).map((file) => ({
  file,
  rel: path.relative(process.cwd(), file).split(path.sep).join("/"),
  source: fs.readFileSync(file, "utf8"),
}));

test("there is at least one route to check", () => {
  assert.ok(routes.length > 20, `expected the full API surface, found ${routes.length}`);
});

test("no private route accepts a client-supplied tenantId", () => {
  // The tenant must always come from the trusted session. Reading it from the
  // request body or query string is what would let one workspace address
  // another's data.
  const forbidden = [
    /searchParams\.get\(\s*["'`]tenantId["'`]\s*\)/,
    /body\.tenantId/,
    /params\.tenantId/,
  ];
  const offenders: string[] = [];
  for (const route of routes) {
    if (route.rel.includes("/api/public/")) continue; // visitor endpoints resolve tenant from the bot slug
    if (route.rel.includes("/api/admin/")) continue;  // super admin selects a tenant deliberately
    for (const pattern of forbidden) {
      if (pattern.test(route.source)) offenders.push(`${route.rel} matched ${pattern}`);
    }
  }
  assert.deepEqual(offenders, [], "these routes trust a client-supplied tenant");
});

/**
 * Helpers that authenticate on a route's behalf.
 *
 * A route may delegate its guard, but only to a helper this suite has checked.
 * Each entry here is verified by the test below to actually call a real guard,
 * so adding a name cannot quietly excuse a route from authentication.
 */
const GUARD_HELPERS: Record<string, string> = {
  analyticsContext: "src/lib/services/analytics/request.ts",
};

test("delegated auth helpers really do authenticate", () => {
  for (const [helper, file] of Object.entries(GUARD_HELPERS)) {
    const source = fs.readFileSync(path.join(process.cwd(), file), "utf8");
    assert.ok(
      /requireTenantRole|requireTenantAccess|requireSuperAdmin|requireAuth/.test(source),
      `${helper} is treated as an auth guard but ${file} calls no real guard`,
    );
  }
});

test("every private route enforces authentication", () => {
  const offenders: string[] = [];
  for (const route of routes) {
    const isPrivate = route.rel.includes("/api/client/") || route.rel.includes("/api/admin/");
    if (!isPrivate) continue;
    const guarded =
      route.source.includes("requireTenantRole") ||
      route.source.includes("requireTenantAccess") ||
      route.source.includes("requireSuperAdmin") ||
      route.source.includes("requireAuth") ||
      Object.keys(GUARD_HELPERS).some((helper) => route.source.includes(helper));
    if (!guarded) offenders.push(route.rel);
  }
  assert.deepEqual(offenders, [], "these private routes have no authorization check");
});

test("admin-only routes require a super admin", () => {
  const offenders: string[] = [];
  for (const route of routes) {
    if (!route.rel.includes("/api/admin/")) continue;
    if (!route.source.includes("requireSuperAdmin")) offenders.push(route.rel);
  }
  assert.deepEqual(offenders, [], "these admin routes do not require SUPER_ADMIN");
});

test("public visitor endpoints are rate limited", () => {
  const offenders: string[] = [];
  for (const route of routes) {
    if (!route.rel.includes("/api/public/v1/")) continue;
    if (!route.source.includes("checkRateLimit")) offenders.push(route.rel);
  }
  assert.deepEqual(offenders, [], "these public endpoints have no rate limit");
});

test("public endpoints answer CORS preflight and apply origin rules", () => {
  const offenders: string[] = [];
  for (const route of routes) {
    if (!route.rel.includes("/api/public/v1/")) continue;
    if (!route.source.includes("isAllowedPublicOrigin")) offenders.push(`${route.rel}: no origin check`);
    if (!route.source.includes("OPTIONS")) offenders.push(`${route.rel}: no preflight handler`);
  }
  assert.deepEqual(offenders, [], "public endpoints must all agree on the origin policy");
});

test("no route returns a password hash to the client", () => {
  const offenders: string[] = [];
  for (const route of routes) {
    // Selecting the hash is fine; returning it is not. Flag any select/include
    // that exposes it on a response-shaped object.
    if (/passwordHash:\s*true/.test(route.source)) offenders.push(route.rel);
  }
  assert.deepEqual(offenders, [], "these routes select passwordHash into a response shape");
});

test("no plaintext credential is hard-coded in the API surface", () => {
  const offenders: string[] = [];
  const suspicious = /(password|secret|apiKey)\s*[:=]\s*["'`][^"'`$\s]{8,}["'`]/i;
  for (const route of routes) {
    const hits = route.source
      .split("\n")
      .filter((line) => suspicious.test(line))
      .filter((line) => !/process\.env|Hash|schema|z\./i.test(line));
    if (hits.length) offenders.push(`${route.rel}: ${hits[0].trim()}`);
  }
  assert.deepEqual(offenders, [], "these routes appear to hard-code a credential");
});

test("the debug password endpoint is gone", () => {
  assert.equal(
    fs.existsSync(path.join(API_ROOT, "debug")),
    false,
    "/api/debug returned a generated password and its hash without authentication",
  );
});

test("login is rate limited per account, not only per address", () => {
  // A single per-IP counter locked out an office: colleagues share one public
  // address, so the eleventh person to sign in that quarter-hour was refused
  // because of the other ten. The tight limit belongs on the account, which is
  // what an attacker actually targets.
  const source = fs.readFileSync(path.join(API_ROOT, "auth", "login", "route.ts"), "utf8");

  assert.match(source, /login-account:/, "there is no per-account rate limit");
  assert.match(source, /login-ip:/, "the per-address ceiling is gone entirely");

  // The address ceiling must be materially looser than the account one, or the
  // office lockout simply comes back.
  const account = Number(source.match(/PER_ACCOUNT\s*=\s*\{\s*limit:\s*(\d+)/)?.[1]);
  const address = Number(source.match(/PER_ADDRESS\s*=\s*\{\s*limit:\s*(\d+)/)?.[1]);
  assert.ok(account > 0 && account <= 20, `per-account limit should stay tight, found ${account}`);
  assert.ok(address >= account * 5, `per-address ceiling ${address} is too close to the per-account ${account}`);

  // Succeeding clears the account counter, so a user who mistypes and then
  // gets in is not left one slip from a lockout.
  assert.match(source, /resetRateLimit\(`login-account:/, "a successful sign-in does not clear the counter");
});

test("lead alerts are per workspace and never return a live token", () => {
  const service = fs.readFileSync(
    path.join(process.cwd(), "src", "lib", "services", "notifications", "leadAlerts.ts"),
    "utf8",
  );
  const settings = fs.readFileSync(
    path.join(API_ROOT, "client", "settings", "notifications", "route.ts"),
    "utf8",
  );

  // Every lookup is keyed on the tenant that owns the lead, so one client's
  // alerts can never reach another's phone.
  assert.match(service, /where:\s*\{\s*tenantId:\s*alert\.tenantId\s*\}/, "settings are not looked up per tenant");
  assert.match(service, /findMany\(\{\s*where:\s*\{\s*tenantId,/, "push devices are not scoped to the tenant");

  // A bot token is a live credential: stored encrypted, never handed back.
  assert.match(service, /decryptSecret\(settings\.telegramBotToken\)/, "the token is not decrypted at use");
  assert.match(settings, /maskSecret\(/, "the settings endpoint does not mask the token");
  assert.ok(
    !/telegramBotToken:\s*settings\?\.telegramBotToken/.test(settings),
    "the settings endpoint returns the stored token to the browser",
  );

  // The alert must never take the lead down with it.
  assert.match(service, /catch[\s\S]{0,200}dispatch failed/, "dispatch failures are not contained");

  // Awaited, not fired and forgotten: a dangling promise is never delivered on
  // serverless, which is how the short-link counter lost every click.
  const capture = fs.readFileSync(path.join(API_ROOT, "public", "v1", "leads", "route.ts"), "utf8");
  assert.match(capture, /await notifyLeadCaptured\(/, "the alert is not awaited");
  assert.match(capture, /if \(!alreadyNotified\)/, "a resubmitted form would alert the team twice");
});
