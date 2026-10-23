// SPDX-License-Identifier: AGPL-3.0-only
// Sign-in throttling (OWASP Authentication Cheat Sheet): failures count against the account, so
// guesses spread over many addresses still stop, and more loosely against the address, so one
// address can't spray many accounts. Past the limit, password attempts are refused for a while.
// Only passwords and codes are throttled: passkeys and single sign-on still work, so a lockout
// can't be used to keep someone out. Counts live in memory; a restart clears them, which costs an
// attacker a restart they can't cause.

export type Limit = { max: number; windowMs: number; blockMs: number }

export const LIMITS = {
  /** Per username, known or not. */
  account: { max: 10, windowMs: 15 * 60_000, blockMs: 5 * 60_000 },
  /** Per client address. */
  address: { max: 50, windowMs: 15 * 60_000, blockMs: 5 * 60_000 },
} satisfies Record<string, Limit>

type Entry = { failures: number[]; blockedUntil: number }

export type RateLimiter = {
  /** Milliseconds until `key` may try again, or 0. */
  retryAfter(key: string, now: number): number
  /** Records a failure; returns the new wait, or 0. */
  fail(key: string, now: number): number
  /** A success clears the key's failures. */
  clear(key: string): void
}

export function createRateLimiter(limit: Limit): RateLimiter {
  const entries = new Map<string, Entry>()
  const prune = (e: Entry, now: number) => {
    e.failures = e.failures.filter((t) => now - t < limit.windowMs)
  }
  return {
    retryAfter(key, now) {
      const e = entries.get(key)
      return e && e.blockedUntil > now ? e.blockedUntil - now : 0
    },
    fail(key, now) {
      let e = entries.get(key)
      if (!e) {
        e = { failures: [], blockedUntil: 0 }
        entries.set(key, e)
      }
      prune(e, now)
      e.failures.push(now)
      if (e.failures.length >= limit.max) {
        e.blockedUntil = now + limit.blockMs
        e.failures = []
      }
      // keep the map from growing without bound
      if (entries.size > 10_000)
        for (const [k, v] of entries)
          if (v.blockedUntil <= now && !v.failures.length) entries.delete(k)
      return Math.max(0, e.blockedUntil - now)
    },
    clear(key) {
      entries.delete(key)
    },
  }
}
