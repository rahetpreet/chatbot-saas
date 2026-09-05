import { resolveTenantByHost } from "@/lib/services/tenant/domainResolver";

/**
 * A connected domain may serve only its own workspace.
 *
 * Without this, any workspace's slug could be appended to any customer's
 * hostname — chat.acme.com/c/their-rival served the rival's bot on Acme's
 * domain. Nothing private leaks, since a published bot is public at the
 * platform URL regardless, but a customer's own domain hosting somebody else's
 * chatbot is a brand and phishing problem: a hostname the visitor trusts
 * presenting a conversation its owner never authorised.
 *
 * The platform's own hostname is unrestricted, because that is where every
 * workspace is legitimately reachable at /c/<slug>.
 */
export async function isSlugAllowedOnHost(host: string | null | undefined, slug: string): Promise<boolean> {
  const owner = await resolveTenantByHost(host);
  // Not a custom domain: the platform serves every workspace.
  if (!owner) return true;
  return owner.slug === slug;
}

/**
 * The workspace a custom domain belongs to, or null on the platform host.
 * Lets a route default to the domain's owner instead of requiring a slug.
 */
export async function tenantForHost(host: string | null | undefined): Promise<string | null> {
  const owner = await resolveTenantByHost(host);
  return owner?.slug ?? null;
}
