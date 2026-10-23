// SPDX-License-Identifier: AGPL-3.0-only
// Throttling, after Bazarr's established practice (get_providers.py › provider_throttle_map,
// https://github.com/morpheus65535/bazarr/blob/master/bazarr/app/get_providers.py): a provider that
// answers "too many requests" waits an hour (OpenSubtitles.com: a minute, or what `Retry-After`
// says), one out of downloads waits until its quota resets, a refused login waits 12 hours, and a
// timeout or server error an hour, but only once 5 have happened within 2 minutes, so one slow
// answer doesn't take a provider out. Pure: the service stores the result with the provider, so a
// restart keeps it.
import type { ProviderError, ProviderId } from './types.ts'

const MINUTE = 60_000
const HOUR = 60 * MINUTE

export const THROTTLE = {
  rateLimited: HOUR,
  openSubtitlesRateLimited: MINUTE,
  auth: 12 * HOUR,
  unavailable: HOUR,
  /** Failures that count: this many within the window. */
  repeats: 5,
  window: 2 * MINUTE,
} as const

export type ThrottleReason = 'rate-limited' | 'quota' | 'auth' | 'unavailable'

export type ThrottleState = {
  throttledUntil: number | null
  throttleReason: ThrottleReason | null
  /** Recent failures' times, inside the window. */
  failures: number[]
}

/** The next midnight UTC after `now`: OpenSubtitles.com's day. */
export function nextUtcMidnight(now: number): number {
  const d = new Date(now)
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1)
}

/** Whether the provider is waiting at `now`. */
export function throttled(state: Pick<ThrottleState, 'throttledUntil'>, now: number): boolean {
  return state.throttledUntil !== null && state.throttledUntil > now
}

/** The state after a failure. `no-account` and `invalid` answers don't throttle. */
export function afterFailure(
  state: ThrottleState,
  error: Pick<ProviderError, 'kind' | 'retryAfterMs' | 'resetsAt'>,
  provider: ProviderId,
  now: number,
): ThrottleState {
  const wait = (ms: number, reason: ThrottleReason): ThrottleState => ({
    throttledUntil: now + ms,
    throttleReason: reason,
    failures: [],
  })
  switch (error.kind) {
    case 'rate-limited':
      return wait(
        error.retryAfterMs ??
          (provider === 'opensubtitles' ? THROTTLE.openSubtitlesRateLimited : THROTTLE.rateLimited),
        'rate-limited',
      )
    case 'quota':
      return wait(Math.max((error.resetsAt ?? nextUtcMidnight(now)) - now, MINUTE), 'quota')
    case 'auth':
      return wait(THROTTLE.auth, 'auth')
    case 'unavailable': {
      const failures = [...state.failures.filter((t) => now - t < THROTTLE.window), now]
      if (failures.length >= THROTTLE.repeats) return wait(THROTTLE.unavailable, 'unavailable')
      return { ...state, failures }
    }
    default:
      return state
  }
}

/** The state after a success: the failures are forgotten; a wait already set stays. */
export function afterSuccess(state: ThrottleState): ThrottleState {
  return { ...state, failures: [] }
}
