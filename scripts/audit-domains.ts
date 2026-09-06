/**
 * Domain and widget-whitelist isolation audit.
 *
 * Answers one question: can one client's domain or origin allow-list ever
 * reach into another client's workspace?
 *
 *   npx tsx scripts/audit-domains.ts
 *
 * Every check is written to FAIL if the clash succeeds, so a pass means the
 * attempt was refused rather than that nothing was tried. Two unrelated
 * workspaces are built with real domains and allow-lists, then pushed against
 * each other. Everything created is removed in a finally block.
 */
import { readFileSync, existsSync } from "node:fs";

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

const results: Array<{ name: string; ok: boolean; detail: string }> = [];
function record(name: string, ok: boolean, detail = "") {
  results.push({ name, ok, detail });
  process.stdout.write(`  ${ok ? "SAFE   " : "CLASH  "} ${name}${detail ? ` — ${detail}` : ""}\n`);
}

/** Records a pass only when the clash was actually prevented. */
async function mustPrevent(name: string, attempt: () => Promise<string>) {
  try {
    const detail = await attempt();
    record(name, true, detail);
  } catch (error: any) {
    record(name, false, String(error?.message || error).slice(0, 160));
  }
}

function refuse(condition: boolean, whatWentWrong: string) {
  if (!condition) throw new Error(whatWentWrong);
}

async function main() {
  const { default: prisma } = await import("../src/lib/prisma");
  const bcrypt = await import("bcryptjs");
  const { resolveTenantByHost, validateCustomDomain } = await import("../src/lib/services/tenant/domainResolver");
  const { isSlugAllowedOnHost } = await import("../src/lib/services/tenant/hostGuard");
  const { isAllowedPublicOrigin, parseAllowedDomains } = await import("../src/lib/services/public/cors");

  const stamp = Date.now();
  const created: string[] = [];

  console.log(`\nDomain & whitelist isolation audit against ${BASE}\n`);

  const build = async (label: string, domain: string, allowed: string[]) => {
    const slug = `dom-${label}-${stamp}`;
    const tenant = await prisma.tenant.create({
      data: {
        name: `Domain ${label}`,
        slug,
        status: "ACTIVE",
        customDomain: domain,
        customDomainVerifiedAt: new Date(),
        widgetSettings: JSON.stringify({ allowedDomains: allowed }),
      },
    });
    created.push(tenant.id);
    await prisma.user.create({
      data: {
        tenantId: tenant.id,
        email: `dom-${label}-${stamp}@example.com`,
        passwordHash: await bcrypt.hash("DomainCheck123!", 10),
        name: label,
        role: "CLIENT_OWNER",
        isActive: true,
        mustChangePassword: false,
      },
    });
    await prisma.flow.create({
      data: {
        tenantId: tenant.id,
        name: `${label} bot`,
        status: "PUBLISHED",
        isDefault: true,
        version: 1,
        publishedNodes: "[]",
        publishedEdges: "[]",
      },
    });
    return { tenant, slug, domain, allowed };
  };

  // Two unrelated companies, each with their own domain and allow-list.
  const alpha = await build("alpha", `alpha-${stamp}.example.com`, ["shop-alpha.com", "www.shop-alpha.com"]);
  const beta = await build("beta", `beta-${stamp}.example.com`, ["shop-beta.com"]);
  console.log(`  alpha: ${alpha.domain}  allows ${alpha.allowed.join(", ")}`);
  console.log(`  beta:  ${beta.domain}  allows ${beta.allowed.join(", ")}\n`);

  try {
    // ---- one domain belongs to exactly one company ------------------------
    await mustPrevent("the database refuses a duplicate domain outright", async () => {
      let blocked = false;
      try {
        await prisma.tenant.create({
          data: { name: "Impostor", slug: `impostor-${stamp}`, status: "ACTIVE", customDomain: alpha.domain },
        });
      } catch {
        blocked = true;
      }
      // Clean up if the constraint somehow let it through.
      const sneaked = await prisma.tenant.findFirst({ where: { slug: `impostor-${stamp}` }, select: { id: true } });
      if (sneaked) await prisma.tenant.delete({ where: { id: sneaked.id } });
      refuse(blocked, "a second company was able to claim alpha's domain directly in the database");
      return "unique constraint held";
    });

    await mustPrevent("a company cannot take a domain already in use", async () => {
      let blocked = false;
      try {
        await prisma.tenant.update({ where: { id: beta.tenant.id }, data: { customDomain: alpha.domain } });
      } catch {
        blocked = true;
      }
      const betaNow = await prisma.tenant.findUnique({
        where: { id: beta.tenant.id },
        select: { customDomain: true },
      });
      refuse(blocked && betaNow?.customDomain === beta.domain, "beta took over alpha's domain");
      return "beta kept its own domain";
    });

    // ---- host resolution ---------------------------------------------------
    await mustPrevent("each domain resolves to its own company", async () => {
      const a = await resolveTenantByHost(alpha.domain);
      const b = await resolveTenantByHost(beta.domain);
      refuse(a?.slug === alpha.slug, `alpha's domain resolved to ${a?.slug ?? "nobody"}`);
      refuse(b?.slug === beta.slug, `beta's domain resolved to ${b?.slug ?? "nobody"}`);
      refuse(a?.slug !== b?.slug, "both domains resolved to the same company");
      return "alpha→alpha, beta→beta";
    });

    await mustPrevent("a domain nobody configured resolves to nobody", async () => {
      const nobody = await resolveTenantByHost(`unclaimed-${stamp}.example.com`);
      refuse(nobody === null, `an unconfigured host resolved to ${nobody?.slug}`);
      return "no fallback company";
    });

    await mustPrevent("case and port variants do not reach a different company", async () => {
      // A hostname is case-insensitive and may arrive with a port. Both must
      // land on the same company, and never on somebody else's.
      for (const variant of [alpha.domain.toUpperCase(), `${alpha.domain}:443`, `  ${alpha.domain}  `]) {
        const resolved = await resolveTenantByHost(variant);
        refuse(resolved?.slug === alpha.slug, `"${variant}" resolved to ${resolved?.slug ?? "nobody"}`);
      }
      return "normalised to the right owner";
    });

    await mustPrevent("a lookalike hostname does not resolve", async () => {
      // Suffix and prefix games: evil-alpha.example.com must not match
      // alpha.example.com, and neither must alpha.example.com.evil.com.
      for (const lookalike of [
        `evil-${alpha.domain}`,
        `${alpha.domain}.evil-${stamp}.com`,
        `sub.${alpha.domain}`,
      ]) {
        const resolved = await resolveTenantByHost(lookalike);
        refuse(resolved === null, `"${lookalike}" resolved to ${resolved?.slug}`);
      }
      return "exact match only";
    });

    // ---- a domain serves only its owner's bot -----------------------------
    await mustPrevent("alpha's domain will not serve beta's bot", async () => {
      refuse(await isSlugAllowedOnHost(alpha.domain, alpha.slug), "alpha's domain refused alpha's own bot");
      refuse(!(await isSlugAllowedOnHost(alpha.domain, beta.slug)), "alpha's domain served beta's bot");
      refuse(!(await isSlugAllowedOnHost(beta.domain, alpha.slug)), "beta's domain served alpha's bot");
      return "each domain serves only its owner";
    });

    await mustPrevent("the platform host still serves every company", async () => {
      // The platform's own hostname is deliberately unrestricted: that is
      // where every workspace is legitimately reachable at /c/<slug>.
      refuse(await isSlugAllowedOnHost("chatbot-saas-peach.vercel.app", alpha.slug), "platform refused alpha");
      refuse(await isSlugAllowedOnHost("chatbot-saas-peach.vercel.app", beta.slug), "platform refused beta");
      return "platform unrestricted, as intended";
    });

    // ---- widget origin allow-lists are independent -------------------------
    await mustPrevent("one company's allow-list does not open another's widget", async () => {
      const alphaAllowed = parseAllowedDomains(
        (await prisma.tenant.findUnique({ where: { id: alpha.tenant.id }, select: { widgetSettings: true } }))
          ?.widgetSettings,
      );
      const betaAllowed = parseAllowedDomains(
        (await prisma.tenant.findUnique({ where: { id: beta.tenant.id }, select: { widgetSettings: true } }))
          ?.widgetSettings,
      );

      // Alpha's site may embed alpha's bot.
      refuse(isAllowedPublicOrigin("https://shop-alpha.com", alphaAllowed), "alpha's own site was refused");
      // Alpha's site must NOT be able to embed beta's bot.
      refuse(!isAllowedPublicOrigin("https://shop-alpha.com", betaAllowed), "alpha's site could embed beta's bot");
      // And the reverse.
      refuse(isAllowedPublicOrigin("https://shop-beta.com", betaAllowed), "beta's own site was refused");
      refuse(!isAllowedPublicOrigin("https://shop-beta.com", alphaAllowed), "beta's site could embed alpha's bot");
      return "allow-lists are per company";
    });

    await mustPrevent("editing one allow-list does not change another", async () => {
      await prisma.tenant.update({
        where: { id: alpha.tenant.id },
        data: { widgetSettings: JSON.stringify({ allowedDomains: ["shop-alpha.com", "newsite-alpha.com"] }) },
      });
      const betaAfter = parseAllowedDomains(
        (await prisma.tenant.findUnique({ where: { id: beta.tenant.id }, select: { widgetSettings: true } }))
          ?.widgetSettings,
      );
      refuse(!isAllowedPublicOrigin("https://newsite-alpha.com", betaAfter), "alpha's new domain opened beta's bot");
      refuse(isAllowedPublicOrigin("https://shop-beta.com", betaAfter), "beta's own allow-list was disturbed");
      return "beta untouched";
    });

    // ---- over real HTTP ----------------------------------------------------
    await mustPrevent("the public config refuses a foreign origin", async () => {
      const res = await fetch(`${BASE}/api/public/v1/config?tenantSlug=${beta.slug}`, {
        headers: { origin: "https://shop-alpha.com" },
      });
      refuse(res.status === 403, `expected 403, got ${res.status}`);
      return "403";
    });

    await mustPrevent("the public config accepts the owner's own origin", async () => {
      const res = await fetch(`${BASE}/api/public/v1/config?tenantSlug=${beta.slug}`, {
        headers: { origin: "https://shop-beta.com" },
      });
      // Not a clash check: proves the previous refusal was the allow-list
      // working, not the endpoint being broken for everyone.
      refuse(res.status !== 403, "beta's own site was refused too — the check above proves nothing");
      return `${res.status}`;
    });

    // ---- removing a domain -------------------------------------------------
    await mustPrevent("disconnecting one domain leaves the other serving", async () => {
      await prisma.tenant.update({
        where: { id: alpha.tenant.id },
        data: { customDomain: null, customDomainVerifiedAt: null },
      });
      const betaStill = await resolveTenantByHost(beta.domain);
      const alphaGone = await resolveTenantByHost(alpha.domain);
      refuse(betaStill?.slug === beta.slug, "beta stopped resolving when alpha disconnected");
      refuse(alphaGone === null, "alpha's domain still resolved after being disconnected");
      return "beta unaffected";
    });

    await mustPrevent("a released domain can be claimed by someone else", async () => {
      // The freed hostname must become available, or a client who cancels
      // blocks that name forever.
      await prisma.tenant.update({ where: { id: beta.tenant.id }, data: { customDomain: alpha.domain } });
      const resolved = await resolveTenantByHost(alpha.domain);
      refuse(resolved?.slug === beta.slug, `released domain resolved to ${resolved?.slug ?? "nobody"}`);
      await prisma.tenant.update({ where: { id: beta.tenant.id }, data: { customDomain: beta.domain } });
      return "reassigned cleanly";
    });

    // ---- validation --------------------------------------------------------
    await mustPrevent("unusable domains are refused up front", async () => {
      const rejected = ["", "   ", "not a domain", "localhost", "..", "-bad.com", "a".repeat(300) + ".com"];
      for (const candidate of rejected) {
        const check = validateCustomDomain(candidate);
        refuse(!check.valid, `"${candidate.slice(0, 40)}" was accepted as a domain`);
      }
      // Not vacuous: a real domain still passes.
      refuse(validateCustomDomain("chat.example.com").valid, "a legitimate domain was refused");
      return `${rejected.length} refused, a valid one accepted`;
    });

    await mustPrevent("a pasted URL is cleaned up rather than stored as typed", async () => {
      // Pasting a full URL is the natural operator mistake. Storing it verbatim
      // would be the dangerous outcome: "http://x.com" never matches a Host
      // header, so the domain would look configured and silently never serve.
      const shouldNormaliseToExample: Array<[string, string]> = [
        ["http://example.com", "example.com"],
        ["https://example.com", "example.com"],
        ["https://example.com/chat", "example.com"],
        ["example.com:3000", "example.com"],
        ["  Example.COM  ", "example.com"],
        ["HTTPS://Chat.Example.com/x", "chat.example.com"],
      ];
      for (const [input, expected] of shouldNormaliseToExample) {
        const check = validateCustomDomain(input);
        refuse(check.valid, `"${input}" was refused instead of cleaned up`);
        refuse(check.domain === expected, `"${input}" became "${check.domain}", expected "${expected}"`);
      }

      // And the cleaned value is what actually reaches the database, or the
      // normalisation would be cosmetic.
      await prisma.tenant.update({
        where: { id: beta.tenant.id },
        data: { customDomain: validateCustomDomain(`HTTPS://Beta-Paste-${stamp}.example.com/chat`).domain },
      });
      const stored = await prisma.tenant.findUnique({
        where: { id: beta.tenant.id },
        select: { customDomain: true },
      });
      refuse(
        stored?.customDomain === `beta-paste-${stamp}.example.com`,
        `stored "${stored?.customDomain}" rather than the cleaned hostname`,
      );
      const resolved = await resolveTenantByHost(`beta-paste-${stamp}.example.com`);
      refuse(resolved?.slug === beta.slug, "the cleaned domain does not resolve to its owner");
      return "scheme, path, port and case stripped";
    });
  } finally {
    for (const id of created) {
      await prisma.tenant.delete({ where: { id } }).catch(() => undefined);
    }
    console.log(`\n  cleaned up ${created.length} test workspaces`);

    const failed = results.filter((r) => !r.ok);
    console.log(`\n${results.length - failed.length}/${results.length} isolation checks passed`);
    if (failed.length) {
      console.log("\nCLASHES FOUND:");
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
