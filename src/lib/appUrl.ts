/**
 * Resolves the externally reachable base URL of this deployment.
 *
 * The request Host header is deliberately NOT used: trusting it would let an
 * attacker poison password-reset links via host-header injection. Only values
 * the operator or the platform set are accepted.
 */
export function getAppUrl(): string | null {
  const configured = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL;
  if (configured) return configured.replace(/\/+$/, "");
  // Set automatically by Vercel; host-only, so the scheme must be added.
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return null;
}
