/**
 * Production-ready rate limiting store abstraction
 * 
 * For development: uses in-memory Map (current implementation)
 * For production: should be replaced with Redis or a similar distributed store
 * to handle multiple Vercel instances correctly.
 */

type Entry = { count: number; resetAt: number };

export interface RateLimitStore {
  get(key: string): Entry | undefined;
  set(key: string, entry: Entry): void;
  delete(key: string): void;
  clear(): void;
}

/**
 * In-memory store for development/testing only.
 * NOT suitable for production with multiple server instances.
 */
export class MemoryRateLimitStore implements RateLimitStore {
  private store = new Map<string, Entry>();

  get(key: string): Entry | undefined {
    return this.store.get(key);
  }

  set(key: string, entry: Entry): void {
    this.store.set(key, entry);
  }

  delete(key: string): void {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }
}

const defaultMemoryStore = new MemoryRateLimitStore();

/**
 * Factory function to get the appropriate rate limit store.
 * In production, this can return a distributed store.
 */
export function getRateLimitStore(): RateLimitStore {
  return defaultMemoryStore;
}
