import { getRateLimitStore } from "./rateLimitStore";

/** Production-ready rate limiting with pluggable store backend. */
export function checkRateLimit(key: string, limit: number, windowMs: number): boolean {
  const store = getRateLimitStore();
  const now = Date.now();
  const current = store.get(key);
  if (!current || current.resetAt <= now) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (current.count >= limit) return false;
  current.count += 1;
  return true;
}

/** Reset rate limit for a specific key (useful for testing or manual resets). */
export function resetRateLimit(key: string): void {
  const store = getRateLimitStore();
  store.delete(key);
}

/** Clear all rate limits (useful for testing only). */
export function clearAllRateLimits(): void {
  const store = getRateLimitStore();
  store.clear();
}
