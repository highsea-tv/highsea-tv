// SPDX-License-Identifier: AGPL-3.0-only
// Per-indexer rate limits from the definition's hints (ADR 0035): at most `requests` in any
// `seconds`, and at least `minGapMs` between two. Searches and tests share one queue per indexer,
// so a test can't push a search over the limit.
import type { Clock } from '@highsea/core'

export type RateRule = { requests: number; seconds: number; minGapMs: number }

export function createRateLimiter(clock: Clock, sleep: (ms: number) => Promise<void>) {
  const recent = new Map<string, number[]>()
  const queues = new Map<string, Promise<void>>()

  async function wait(key: string, rule: RateRule) {
    for (;;) {
      const now = clock.now()
      const windowMs = rule.seconds * 1000
      const times = (recent.get(key) ?? []).filter((t) => t > now - windowMs)
      recent.set(key, times)
      const last = times[times.length - 1]
      const gap = last === undefined ? 0 : last + rule.minGapMs - now
      const full = times.length >= rule.requests ? (times[0] as number) + windowMs - now : 0
      const delay = Math.max(gap, full)
      if (delay <= 0) {
        times.push(now)
        return
      }
      await sleep(delay)
    }
  }

  return {
    /** Resolves when the indexer may send its next request; requests go in the order asked. */
    acquire(key: string, rule: RateRule | undefined): Promise<void> {
      if (!rule) return Promise.resolve()
      const next = (queues.get(key) ?? Promise.resolve()).then(() => wait(key, rule))
      queues.set(
        key,
        next.catch(() => {}),
      )
      return next
    },
    forget(key: string) {
      recent.delete(key)
      queues.delete(key)
    },
  }
}
export type RateLimiter = ReturnType<typeof createRateLimiter>
