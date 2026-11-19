// SPDX-License-Identifier: AGPL-3.0-only
// Per-indexer rate limits from the definition's hints (ADR 0035): at most `requests` in any
// `seconds`, and at least `minGapMs` between two. Searches and tests share one queue per indexer,
// so a test can't push a search over the limit.
//
// A wait longer than a minute isn't waited out: a limit counted per day (BitSearch's 200 requests
// a day per address, bitsearch.eu/api) that's used up fails the request as rate-limited, with the
// time it frees up as its Retry-After, so health rests the indexer until then instead of holding
// a search, and every request queued behind it, for hours.
import type { Clock } from '@highsea-tv/core'
import { IndexerError } from './http.ts'

/** The longest a request waits for its turn before it fails as rate-limited. */
export const MAX_RATE_WAIT_MS = 60_000

export type RateRule = { requests: number; seconds: number; minGapMs: number }

/** 86400 → "24 hours", 90 → "2 minutes". */
function span(seconds: number): string {
  const [n, unit] =
    seconds >= 3600
      ? [Math.round(seconds / 3600), 'hour']
      : [Math.max(1, Math.round(seconds / 60)), 'minute']
  return `${n} ${unit}${n === 1 ? '' : 's'}`
}

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
      if (delay > MAX_RATE_WAIT_MS)
        throw new IndexerError(
          'rate-limited',
          `highsea has sent this indexer the ${rule.requests} requests its site allows in ${span(rule.seconds)}. It tries again in ${span(Math.ceil(delay / 1000))}.`,
          delay,
        )
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
