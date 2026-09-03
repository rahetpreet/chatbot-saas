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

test("every private route enforces authentication", () => {
  const offenders: string[] = [];
  for (const route of routes) {
    const isPrivate = route.rel.includes("/api/client/") || route.rel.includes("/api/admin/");
    if (!isPrivate) continue;
    const guarded =
      route.source.includes("requireTenantRole") ||
      route.source.includes("requireTenantAccess") ||
      route.source.includes("requireSuperAdmin") ||
      route.source.includes("requireAuth");
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
