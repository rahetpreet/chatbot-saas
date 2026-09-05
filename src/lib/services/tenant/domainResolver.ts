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
    // The A record is listed first because it is what Vercel itself asks for,
    // on subdomains as well as apex domains. The CNAME also works for a
    // subdomain and is offered as an alternative for anyone who prefers it;
    // an apex domain cannot use CNAME at all.
    records: [
      {
        type: "A",
        name: isApex ? "@" : labels[0],
        value: "76.76.21.21",
        note: isApex
          ? "Apex domains cannot use CNAME, so this is the only option."
          : `Creates ${domain}. Propagation is usually minutes, occasionally up to 24 hours.`,
      },
      ...(isApex
        ? []
        : [
            {
              type: "CNAME",
              name: labels[0],
              value: "cname.vercel-dns.com",
              note: "Alternative to the A record above. Create one or the other, not both.",
            },
          ]),
    ],
    /**
     * Cloudflare proxying is the single most common reason a correctly
     * pointed domain still fails: with the orange cloud on, Cloudflare
     * terminates TLS itself, so the certificate can never be issued and
     * visitors get a security warning or a redirect loop.
     */
    proxyWarning:
      "If the DNS is on Cloudflare, set this record to DNS only (grey cloud, not orange). A proxied record stops the certificate being issued.",
    /**
     * The most common false alarm in domain onboarding.
     *
     * Resolvers cache "no such name" as readily as they cache a real answer,
     * for the zone's negative TTL — typically 30 minutes. Anyone who opens the
     * URL before the record exists teaches their own resolver the domain is
     * missing, and it then keeps failing for them long after the setup is
     * correct. It looks exactly like a broken configuration.
     */
    cacheWarning:
      "Do not open the address until after the DNS record exists. Checking too early makes your network cache " +
      "'not found' for around 30 minutes, and it will keep failing for you while working for everyone else. " +
      "If that happens, use mobile data to confirm, or set the device DNS to 1.1.1.1.",
    /** Ordered, so the panel can show exactly who does what next. */
    steps: [
      {
        who: "client" as const,
        title: "Create the DNS record",
        detail: `At the DNS provider for ${domain}, add the record shown above.${
          isApex ? "" : " Either the A record or the CNAME works — create one, not both."
        }`,
      },
      {
        who: "operator" as const,
        title: "Add the domain to the platform",
        detail: `Run: vercel domains add ${domain} — or add it under Vercel → Project → Settings → Domains. This is what issues the TLS certificate.`,
      },
      {
        who: "operator" as const,
        title: "Verify it is serving",
        detail:
          "Use Re-check below. It makes a real request and confirms the response came from this application, not merely that something answered.",
      },
    ],
    // Storing the domain is only half the job: Vercel must also terminate TLS
    // for it, and that is done in the project's own domain settings.
    platformStep:
      "Add this domain under Vercel → Project → Settings → Domains so the certificate is issued. Until then the browser will show a certificate warning.",
    // These are Vercel's published targets and are verified to resolve, but
    // Vercel shows the exact record for each domain when it is added. If the
    // dashboard shows something different, the dashboard is authoritative --
    // a hard-coded value here would otherwise silently rot.
    accuracyNote:
      "Vercel shows the exact record when the domain is added. If it differs from the values above, use Vercel's.",
  };
}

/**
 * Serving the chat from a path on the customer's own site, e.g.
 * example.com/chat-bot/.
 *
 * This cannot be done with DNS. A DNS record points a whole hostname at a
 * server; it has no concept of a path, so no record can send only
 * example.com/chat-bot to us while the rest of the site stays where it is.
 * Anyone promising otherwise is describing a subdomain.
 *
 * There are two ways that actually work, and they trade off differently:
 *
 *  - Embed: the customer adds one page to their own site containing an
 *    iframe. Works on every stack including Wix and WordPress, needs no
 *    server access, and their existing site keeps serving the URL.
 *
 *  - Reverse proxy: their web server forwards that path to us. Truly
 *    path-based with no iframe, but it needs server or CDN access, and
 *    assets must be forwarded too or the page loads without styling.
 */
export interface PathHostingOption {
  id: "embed" | "proxy";
  label: string;
  summary: string;
  worksWith: string;
  snippets: Array<{ platform: string; language: string; code: string }>;
}

export function pathHostingOptions(publicChatUrl: string, sitePath = "/chat-bot"): PathHostingOption[] {
  const path = "/" + sitePath.replace(/^\/+|\/+$/g, "");

  return [
    {
      id: "embed",
      label: "Embed on a page (recommended)",
      summary:
        "Create a page at " + path + " on your own site and paste this in. Your site keeps serving the URL; the chat " +
        "runs inside it.",
      worksWith: "Any website — WordPress, Wix, Shopify, Squarespace, a hand-written HTML page.",
      snippets: [
        {
          platform: "HTML",
          language: "html",
          code: `<iframe
  src="${publicChatUrl}"
  title="Chat"
  style="width:100%;height:100vh;border:0;display:block"
  allow="clipboard-write"
></iframe>`,
        },
      ],
    },
    {
      id: "proxy",
      label: "Reverse proxy (no iframe)",
      summary:
        "Your web server forwards " + path + " to us. The address bar stays on your domain and there is no iframe, " +
        "but you need access to your server or CDN configuration.",
      worksWith: "Nginx, Apache, Cloudflare, Vercel, Netlify.",
      snippets: [
        {
          platform: "Nginx",
          language: "nginx",
          code: `location ${path}/ {
    proxy_pass ${publicChatUrl.replace(/\/+$/, "")}/;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
}

# Assets are served from the app's root, so they must be forwarded too or
# the page loads without styling.
location /_next/ {
    proxy_pass ${new URL(publicChatUrl).origin}/_next/;
}`,
        },
        {
          platform: "Cloudflare Worker",
          language: "javascript",
          code: `export default {
  async fetch(request) {
    const url = new URL(request.url);
    const target = "${new URL(publicChatUrl).origin}";

    if (url.pathname.startsWith("${path}")) {
      const upstream = new URL("${new URL(publicChatUrl).pathname}", target);
      upstream.search = url.search;
      return fetch(upstream, request);
    }
    // Styling and scripts live at the app's root.
    if (url.pathname.startsWith("/_next/")) {
      return fetch(new URL(url.pathname + url.search, target), request);
    }
    return fetch(request);
  },
};`,
        },
        {
          platform: "Vercel (vercel.json)",
          language: "json",
          code: `{
  "rewrites": [
    { "source": "${path}", "destination": "${publicChatUrl}" },
    { "source": "${path}/:path*", "destination": "${publicChatUrl}" },
    { "source": "/_next/:path*", "destination": "${new URL(publicChatUrl).origin}/_next/:path*" }
  ]
}`,
        },
        {
          platform: "Apache (.htaccess)",
          language: "apache",
          code: `RewriteEngine On
RewriteRule ^${path.replace(/^\//, "")}/?$ ${publicChatUrl} [P,L]
ProxyPassReverse ${path} ${publicChatUrl}

# Assets live at the app's root.
ProxyPass /_next/ ${new URL(publicChatUrl).origin}/_next/
ProxyPassReverse /_next/ ${new URL(publicChatUrl).origin}/_next/`,
        },
      ],
    },
  ];
}
