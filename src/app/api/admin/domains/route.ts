import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireSuperAdmin } from "@/lib/services/auth/session";
import { dnsInstructionsFor } from "@/lib/services/tenant/domainResolver";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Custom-domain overview for the operator.
 *
 * The operator has work to do that the client cannot: adding each hostname in
 * Vercel so a TLS certificate is issued. Until that happens the client sees a
 * browser security warning and assumes the product is broken, so this page has
 * to show, per workspace, whether the domain is genuinely serving.
 *
 * Checking is a live request rather than a stored flag: a domain that resolved
 * last week may not resolve today, and a stale "verified" badge is worse than
 * no badge.
 */
async function probe(domain: string): Promise<{ ok: boolean; detail: string; servesUs: boolean }> {
  try {
    const response = await fetch(`https://${domain}/api/health`, {
      redirect: "follow",
      signal: AbortSignal.timeout(8000),
      headers: { "User-Agent": "ChatbotDomainCheck/1.0" },
    });

    const payload = await response.json().catch(() => ({}) as any);
    // Reaching *something* is not enough; it has to be this application.
    const servesUs = payload?.status === "ok" && payload?.database === "connected";

    if (servesUs) return { ok: true, servesUs, detail: "Live and serving this application." };
    if (response.ok) {
      return {
        ok: false,
        servesUs: false,
        detail: "The domain resolves, but to a different site. Check the DNS record points at us.",
      };
    }
    return { ok: false, servesUs: false, detail: `The domain responded with HTTP ${response.status}.` };
  } catch (error: any) {
    if (error?.name === "TimeoutError") {
      return { ok: false, servesUs: false, detail: "No response in time. DNS may still be propagating." };
    }
    const message = String(error?.message || "");
    // A certificate error means DNS is right but the domain has not been added
    // on our side yet -- the operator's step, and the most common cause.
    if (/certificate|SSL|TLS|ERR_TLS/i.test(message)) {
      return {
        ok: false,
        servesUs: false,
        detail: "DNS is pointing here, but no certificate has been issued. Add this domain in Vercel.",
      };
    }
    return { ok: false, servesUs: false, detail: "Not reachable yet. DNS may still be propagating." };
  }
}

export async function GET(_req: NextRequest) {
  try {
    await requireSuperAdmin();

    const tenants = await prisma.tenant.findMany({
      where: { deletedAt: null, customDomain: { not: null } },
      select: {
        id: true,
        name: true,
        slug: true,
        status: true,
        customDomain: true,
        customDomainVerifiedAt: true,
      },
      orderBy: { name: "asc" },
    });

    const domains = await Promise.all(
      tenants.map(async (tenant) => {
        const result = await probe(tenant.customDomain!);

        // Keep the stored flag honest rather than letting it drift.
        if (result.ok !== Boolean(tenant.customDomainVerifiedAt)) {
          await prisma.tenant
            .update({
              where: { id: tenant.id },
              data: { customDomainVerifiedAt: result.ok ? new Date() : null },
            })
            .catch(() => undefined);
        }

        return {
          tenantId: tenant.id,
          tenantName: tenant.name,
          tenantSlug: tenant.slug,
          tenantStatus: tenant.status,
          domain: tenant.customDomain,
          live: result.ok,
          detail: result.detail,
          dns: dnsInstructionsFor(tenant.customDomain!),
        };
      }),
    );

    const data = {
      domains,
      summary: {
        total: domains.length,
        live: domains.filter((entry) => entry.live).length,
        pending: domains.filter((entry) => !entry.live).length,
      },
      checkedAt: new Date().toISOString(),
    };
    return NextResponse.json({ success: true, data, ...data });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: { code: "FORBIDDEN", message: error?.message || "Super Admin access required." } },
      { status: 403 },
    );
  }
}
