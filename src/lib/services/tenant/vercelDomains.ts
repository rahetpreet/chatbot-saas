/**
 * Registers custom domains with the hosting platform.
 *
 * Assigning a domain in the panel used to leave the operator with a command to
 * run by hand. Forgetting it produced the worst failure mode this system has:
 * DNS resolves, so the client believes it is done, but no certificate is
 * issued, so every visitor gets a browser security warning. Automating it
 * removes the gap between "assigned" and "actually working".
 *
 * When no token is configured the functions report that plainly instead of
 * failing, so the product still works with the manual step.
 */

const API = "https://api.vercel.com";

interface VercelConfig {
  token: string;
  projectId: string;
  teamId?: string;
}

function config(): VercelConfig | null {
  const token = process.env.VERCEL_API_TOKEN;
  // VERCEL_PROJECT_ID is injected on Vercel deployments, so it usually needs
  // no configuration of its own.
  const projectId = process.env.VERCEL_PROJECT_ID;
  if (!token || !projectId) return null;
  return { token, projectId, teamId: process.env.VERCEL_TEAM_ID || process.env.VERCEL_ORG_ID };
}

export function isDomainAutomationConfigured(): boolean {
  return config() !== null;
}

function url(path: string, cfg: VercelConfig): string {
  const query = cfg.teamId ? `?teamId=${encodeURIComponent(cfg.teamId)}` : "";
  return `${API}${path}${query}`;
}

async function call(path: string, cfg: VercelConfig, init: RequestInit = {}) {
  const response = await fetch(url(path, cfg), {
    ...init,
    headers: {
      Authorization: `Bearer ${cfg.token}`,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(init.headers || {}),
    },
    signal: AbortSignal.timeout(15_000),
  });
  const payload = await response.json().catch(() => ({}) as any);
  return { status: response.status, ok: response.ok, payload };
}

export interface DomainRegistration {
  /** Whether the hostname is now registered, including when it already was. */
  registered: boolean;
  /** True when nothing had to change. */
  alreadyPresent: boolean;
  /** Set when automation is switched off, so callers can fall back. */
  manual: boolean;
  detail: string;
}

/** Registers a hostname against the project so a certificate can be issued. */
export async function registerDomain(domain: string): Promise<DomainRegistration> {
  const cfg = config();
  if (!cfg) {
    return {
      registered: false,
      alreadyPresent: false,
      manual: true,
      detail: `Automation is off. Run: vercel domains add ${domain}`,
    };
  }

  try {
    const { status, ok, payload } = await call(`/v10/projects/${cfg.projectId}/domains`, cfg, {
      method: "POST",
      body: JSON.stringify({ name: domain }),
    });

    if (ok) {
      return { registered: true, alreadyPresent: false, manual: false, detail: "Registered for a certificate." };
    }

    // Re-assigning a domain that is already attached is a normal outcome, not
    // an error: the operator may simply be re-saving.
    const code = payload?.error?.code || "";
    if (status === 409 || code === "domain_already_in_use" || /already in use|already exists/i.test(payload?.error?.message || "")) {
      return {
        registered: true,
        alreadyPresent: true,
        manual: false,
        detail: "Already registered on this project.",
      };
    }

    if (status === 403) {
      return {
        registered: false,
        alreadyPresent: false,
        manual: true,
        detail: `The API token was refused. Check VERCEL_API_TOKEN, or run: vercel domains add ${domain}`,
      };
    }

    return {
      registered: false,
      alreadyPresent: false,
      manual: true,
      detail: `${payload?.error?.message || `HTTP ${status}`}. Run: vercel domains add ${domain}`,
    };
  } catch (error: any) {
    // Never let this block the assignment: the domain is stored either way,
    // and the panel shows the remaining manual step.
    return {
      registered: false,
      alreadyPresent: false,
      manual: true,
      detail: `Could not reach the hosting API (${error?.message || "network error"}). Run: vercel domains add ${domain}`,
    };
  }
}

/** Detaches a hostname when a workspace's domain is disconnected. */
export async function unregisterDomain(domain: string): Promise<{ removed: boolean; detail: string }> {
  const cfg = config();
  if (!cfg) return { removed: false, detail: `Automation is off. Run: vercel domains rm ${domain}` };

  try {
    const { ok, status, payload } = await call(
      `/v9/projects/${cfg.projectId}/domains/${encodeURIComponent(domain)}`,
      cfg,
      { method: "DELETE" },
    );
    // A hostname that is already gone is the desired end state.
    if (ok || status === 404) return { removed: true, detail: "Removed from the project." };
    return { removed: false, detail: payload?.error?.message || `HTTP ${status}` };
  } catch (error: any) {
    return { removed: false, detail: error?.message || "network error" };
  }
}

export interface DomainStatus {
  known: boolean;
  verified: boolean;
  misconfigured: boolean;
  detail: string;
}

/**
 * What the hosting platform believes about a hostname.
 *
 * Complements the live HTTP probe: the probe answers "is it serving?", this
 * answers "is it registered here at all?".
 *
 * Note that the host's "verified" flag means the hostname is confirmed as
 * belonging to this project -- NOT that DNS points at us. A subdomain of an
 * already-verified domain comes back verified the instant it is added, with no
 * DNS record anywhere. So this must never be worded as though it proves the
 * domain works; the probe is the only thing that proves that.
 */
export async function getDomainStatus(domain: string): Promise<DomainStatus> {
  const cfg = config();
  if (!cfg) return { known: false, verified: false, misconfigured: false, detail: "Automation is off." };

  try {
    const { ok, status, payload } = await call(
      `/v9/projects/${cfg.projectId}/domains/${encodeURIComponent(domain)}`,
      cfg,
    );
    if (status === 404) {
      return {
        known: false,
        verified: false,
        misconfigured: true,
        detail: "Not registered on this project, so no certificate can be issued.",
      };
    }
    if (!ok) return { known: false, verified: false, misconfigured: false, detail: `HTTP ${status}` };

    const verified = Boolean(payload?.verified);
    return {
      known: true,
      verified,
      misconfigured: !verified,
      detail: verified
        ? "Registered here, so anything still missing is DNS, not registration."
        : "Registered, but ownership is not confirmed yet. Check the DNS record.",
    };
  } catch (error: any) {
    return { known: false, verified: false, misconfigured: false, detail: error?.message || "network error" };
  }
}
