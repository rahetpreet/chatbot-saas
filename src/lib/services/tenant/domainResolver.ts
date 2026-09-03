import prisma from "@/lib/prisma";

/**
 * Resolves which workspace a request belongs to from its Host header.
 *
 * A workspace can serve its chat from its own hostname (chat.acme.com) instead
 * of the platform path (/c/acme). The Host header is safe to use here because
 * it only ever *selects* a tenant that has already been configured and
 * verified by an operator -- it never grants access, and an unknown host
 * simply resolves to nothing.
 */

/** Hosts that always mean "the platform itself", never a customer domain. */
function platformHosts(): string[] {
  const hosts = new Set<string>(["localhost", "127.0.0.1"]);

  for (const value of [process.env.APP_URL, process.env.NEXT_PUBLIC_APP_URL]) {
    if (!value) continue;
    try {
      hosts.add(new URL(value).hostname.toLowerCase());
    } catch {
      /* ignore a malformed configuration value */
    }
  }
  if (process.env.VERCEL_URL) hosts.add(process.env.VERCEL_URL.toLowerCase());
  if (process.env.PLATFORM_DOMAIN) hosts.add(process.env.PLATFORM_DOMAIN.toLowerCase());

  return [...hosts];
}

export function normalizeHost(host: string | null | undefined): string | null {
  if (!host) return null;
  // Strip the port and any surrounding whitespace; Host can be "example.com:3000".
  const cleaned = host.trim().toLowerCase().split(",")[0].trim().replace(/:\d+$/, "");
  return cleaned || null;
}

export function isPlatformHost(host: string | null | undefined): boolean {
  const normalized = normalizeHost(host);
  if (!normalized) return true;
  if (platformHosts().includes(normalized)) return true;
  // Every preview deployment gets its own *.vercel.app hostname.
  return normalized.endsWith(".vercel.app");
}

export interface ResolvedDomainTenant {
  id: string;
  name: string;
  slug: string;
  status: string;
}

/**
 * Returns the workspace that owns this hostname, or null when the request is
 * for the platform itself or the domain is not configured.
 */
export async function resolveTenantByHost(host: string | null | undefined): Promise<ResolvedDomainTenant | null> {
  const normalized = normalizeHost(host);
  if (!normalized || isPlatformHost(normalized)) return null;

  const tenant = await prisma.tenant.findFirst({
    where: {
      customDomain: normalized,
      deletedAt: null,
      status: { in: ["TRIAL", "ACTIVE"] },
    },
    select: { id: true, name: true, slug: true, status: true },
  });

  return tenant;
}

/** A hostname must be a bare domain: no scheme, path, port or wildcard. */
export function validateCustomDomain(input: string): { valid: boolean; domain: string; error?: string } {
  const domain = input.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/:\d+$/, "");

  if (!domain) return { valid: false, domain, error: "Enter a domain." };
  if (domain.length > 253) return { valid: false, domain, error: "That domain is too long." };
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(domain)) {
    return { valid: false, domain, error: "Enter a valid domain such as chat.yourcompany.com." };
  }
  if (isPlatformHost(domain)) {
    return { valid: false, domain, error: "That domain belongs to the platform and cannot be claimed." };
  }
  return { valid: true, domain };
}

/**
 * The DNS the customer has to create. A subdomain uses CNAME; an apex domain
 * cannot, so it gets Vercel's A record instead.
 */
export function dnsInstructionsFor(domain: string) {
  const labels = domain.split(".");
  const isApex = labels.length <= 2;

  return {
    domain,
    isApex,
    records: isApex
      ? [
          {
            type: "A",
            name: "@",
            value: "76.76.21.21",
            note: "Apex domains cannot use CNAME, so Vercel's A record is used instead.",
          },
        ]
      : [
          {
            type: "CNAME",
            name: labels[0],
            value: "cname.vercel-dns.com",
            note: `Creates ${domain}. Propagation usually takes a few minutes and can take up to 24 hours.`,
          },
        ],
    // Storing the domain is only half the job: Vercel must also terminate TLS
    // for it, and that is done in the project's own domain settings.
    platformStep:
      "Add this domain under Vercel → Project → Settings → Domains so the certificate is issued. Until then the browser will show a certificate warning.",
  };
}
