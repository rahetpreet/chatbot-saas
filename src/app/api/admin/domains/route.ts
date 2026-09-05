import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireSuperAdmin } from "@/lib/services/auth/session";
import { dnsInstructionsFor, validateCustomDomain } from "@/lib/services/tenant/domainResolver";

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

    // Every workspace, not only those already connected: this page is where a
    // domain gets assigned, so the operator needs to see the ones without one.
    const tenants = await prisma.tenant.findMany({
      where: { deletedAt: null },
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
        if (!tenant.customDomain) {
          return {
            tenantId: tenant.id,
            tenantName: tenant.name,
            tenantSlug: tenant.slug,
            tenantStatus: tenant.status,
            domain: null,
            live: false,
            detail: "No custom domain. The chat is served from the platform link.",
            dns: null,
          };
        }

        const result = await probe(tenant.customDomain);

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
          dns: dnsInstructionsFor(tenant.customDomain),
        };
      }),
    );

    const data = {
      domains,
      summary: {
        workspaces: domains.length,
        total: domains.filter((entry) => entry.domain).length,
        live: domains.filter((entry) => entry.live).length,
        pending: domains.filter((entry) => entry.domain && !entry.live).length,
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

/**
 * Assigns a custom domain to a workspace.
 *
 * Domains are operator-controlled rather than self-service: connecting one
 * needs a step only the operator can perform (adding the hostname so a
 * certificate is issued), so letting a client set one alone produced a
 * half-connected domain and a support ticket.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await requireSuperAdmin();
    const body = await req.json().catch(() => ({}));
    const tenantId = String(body.tenantId || "");

    const check = validateCustomDomain(String(body.domain || ""));
    if (!check.valid) {
      return NextResponse.json(
        { success: false, error: { code: "VALIDATION_ERROR", message: check.error } },
        { status: 400 },
      );
    }

    const tenant = await prisma.tenant.findFirst({
      where: { id: tenantId, deletedAt: null },
      select: { id: true, name: true },
    });
    if (!tenant) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "Workspace not found." } },
        { status: 404 },
      );
    }

    // A hostname routes to exactly one workspace, so the claim is unique
    // across the platform rather than within a workspace.
    const taken = await prisma.tenant.findFirst({
      where: { customDomain: check.domain, id: { not: tenantId } },
      select: { name: true },
    });
    if (taken) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "CONFLICT", message: `That domain is already assigned to ${taken.name}.` },
        },
        { status: 409 },
      );
    }

    await prisma.$transaction([
      prisma.tenant.update({
        where: { id: tenantId },
        data: { customDomain: check.domain, customDomainVerifiedAt: null },
      }),
      prisma.auditLog.create({
        data: {
          tenantId,
          userId: session.userId,
          action: "CUSTOM_DOMAIN_ASSIGNED",
          details: JSON.stringify({ domain: check.domain, tenant: tenant.name }),
        },
      }),
    ]);

    return NextResponse.json({
      success: true,
      data: { domain: check.domain, dns: dnsInstructionsFor(check.domain) },
      dns: dnsInstructionsFor(check.domain),
      message: `${check.domain} assigned to ${tenant.name}. Send the client the DNS record, then add the domain on the platform.`,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: { code: "FORBIDDEN", message: error?.message || "Super Admin access required." } },
      { status: 403 },
    );
  }
}

/** Removes a workspace's custom domain. Its platform link keeps working. */
export async function DELETE(req: NextRequest) {
  try {
    const session = await requireSuperAdmin();
    const tenantId = new URL(req.url).searchParams.get("tenantId") || "";

    const tenant = await prisma.tenant.findFirst({
      where: { id: tenantId, deletedAt: null },
      select: { id: true, name: true, customDomain: true },
    });
    if (!tenant?.customDomain) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "That workspace has no custom domain." } },
        { status: 404 },
      );
    }

    await prisma.$transaction([
      prisma.tenant.update({
        where: { id: tenantId },
        data: { customDomain: null, customDomainVerifiedAt: null },
      }),
      prisma.auditLog.create({
        data: {
          tenantId,
          userId: session.userId,
          action: "CUSTOM_DOMAIN_REMOVED",
          details: JSON.stringify({ domain: tenant.customDomain, tenant: tenant.name }),
        },
      }),
    ]);

    return NextResponse.json({
      success: true,
      data: { message: `${tenant.customDomain} disconnected. ${tenant.name} keeps its platform link.` },
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: { code: "FORBIDDEN", message: error?.message || "Super Admin access required." } },
      { status: 403 },
    );
  }
}
