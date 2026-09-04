import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireTenantRole } from "@/lib/services/auth/session";
import { dnsInstructionsFor, pathHostingOptions, validateCustomDomain } from "@/lib/services/tenant/domainResolver";
import { getAppUrl } from "@/lib/appUrl";

export const dynamic = "force-dynamic";

function chatUrls(slug: string, customDomain: string | null) {
  const platform = getAppUrl() || "";
  return {
    platformUrl: `${platform}/c/${slug}`,
    customUrl: customDomain ? `https://${customDomain}` : null,
  };
}

export async function GET() {
  try {
    const { tenantId } = await requireTenantRole(["CLIENT_OWNER", "CLIENT_ADMIN", "CLIENT_AGENT", "CLIENT_VIEWER"]);
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { slug: true, customDomain: true, customDomainVerifiedAt: true },
    });
    if (!tenant) {
      return NextResponse.json({ success: false, error: { code: "NOT_FOUND", message: "Workspace not found." } }, { status: 404 });
    }

    const data = {
      slug: tenant.slug,
      customDomain: tenant.customDomain,
      verifiedAt: tenant.customDomainVerifiedAt,
      dns: tenant.customDomain ? dnsInstructionsFor(tenant.customDomain) : null,
      ...chatUrls(tenant.slug, tenant.customDomain),
      // Serving the chat from a path on the client's own site is not a DNS
      // problem, so it is answered separately from the records above.
      pathHosting: pathHostingOptions(
        tenant.customDomain && tenant.customDomainVerifiedAt
          ? `https://${tenant.customDomain}`
          : `${getAppUrl() || ""}/c/${tenant.slug}`,
      ),
    };
    return NextResponse.json({ success: true, data, ...data });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: { code: "UNAUTHORIZED", message: error?.message || "Unauthorized" } },
      { status: 401 },
    );
  }
}

/** Claims a custom domain for this workspace. */
export async function POST(req: NextRequest) {
  try {
    const { tenantId, session } = await requireTenantRole(["CLIENT_OWNER", "CLIENT_ADMIN"]);
    const body = await req.json().catch(() => ({}));

    const check = validateCustomDomain(String(body.domain || ""));
    if (!check.valid) {
      return NextResponse.json(
        { success: false, error: { code: "VALIDATION_ERROR", message: check.error } },
        { status: 400 },
      );
    }

    // A hostname can only route to one workspace, so the claim must be unique
    // across the whole platform, not just within this workspace.
    const taken = await prisma.tenant.findFirst({
      where: { customDomain: check.domain, id: { not: tenantId } },
      select: { id: true },
    });
    if (taken) {
      return NextResponse.json(
        { success: false, error: { code: "CONFLICT", message: "That domain is already connected to another workspace." } },
        { status: 409 },
      );
    }

    const tenant = await prisma.tenant.update({
      where: { id: tenantId },
      data: { customDomain: check.domain, customDomainVerifiedAt: null },
      select: { slug: true, customDomain: true, customDomainVerifiedAt: true },
    });

    await prisma.auditLog.create({
      data: {
        tenantId,
        userId: session.userId,
        action: "CUSTOM_DOMAIN_SET",
        details: JSON.stringify({ domain: check.domain }),
      },
    });

    const data = {
      slug: tenant.slug,
      customDomain: tenant.customDomain,
      verifiedAt: tenant.customDomainVerifiedAt,
      dns: dnsInstructionsFor(check.domain),
      ...chatUrls(tenant.slug, tenant.customDomain),
    };
    return NextResponse.json({ success: true, data, ...data });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: { code: "INVALID_REQUEST", message: error?.message || "Could not save the domain." } },
      { status: 400 },
    );
  }
}

/**
 * Checks whether the domain now resolves to this deployment, and records the
 * result. This is a live check rather than a stored flag so that a domain
 * which later stops resolving does not keep claiming to be verified.
 */
export async function PATCH() {
  try {
    const { tenantId } = await requireTenantRole(["CLIENT_OWNER", "CLIENT_ADMIN"]);
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { slug: true, customDomain: true },
    });
    if (!tenant?.customDomain) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "No custom domain is configured." } },
        { status: 404 },
      );
    }

    let reachable = false;
    let detail = "";
    try {
      // The health endpoint is unauthenticated and cheap, so it is a reliable
      // probe for "is this hostname pointed at us".
      const response = await fetch(`https://${tenant.customDomain}/api/health`, {
        redirect: "follow",
        signal: AbortSignal.timeout(8000),
      });
      const payload = await response.json().catch(() => ({}));
      reachable = response.ok && payload?.status === "ok";
      if (!reachable) detail = `The domain responded with HTTP ${response.status}.`;
    } catch (error: any) {
      detail = error?.name === "TimeoutError"
        ? "The domain did not respond in time. DNS may still be propagating."
        : "The domain could not be reached yet. DNS may still be propagating.";
    }

    const updated = await prisma.tenant.update({
      where: { id: tenantId },
      data: { customDomainVerifiedAt: reachable ? new Date() : null },
      select: { customDomain: true, customDomainVerifiedAt: true },
    });

    const data = {
      verified: reachable,
      customDomain: updated.customDomain,
      verifiedAt: updated.customDomainVerifiedAt,
      message: reachable
        ? "The domain is live and serving this workspace."
        : detail || "Not reachable yet.",
      dns: dnsInstructionsFor(tenant.customDomain),
    };
    return NextResponse.json({ success: true, data, ...data });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: { code: "INVALID_REQUEST", message: error?.message || "Verification failed." } },
      { status: 400 },
    );
  }
}

export async function DELETE() {
  try {
    const { tenantId, session } = await requireTenantRole(["CLIENT_OWNER", "CLIENT_ADMIN"]);
    await prisma.tenant.update({
      where: { id: tenantId },
      data: { customDomain: null, customDomainVerifiedAt: null },
    });
    await prisma.auditLog.create({
      data: { tenantId, userId: session.userId, action: "CUSTOM_DOMAIN_REMOVED" },
    });
    return NextResponse.json({ success: true, data: { message: "Custom domain removed." } });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: { code: "INVALID_REQUEST", message: error?.message || "Could not remove the domain." } },
      { status: 400 },
    );
  }
}
