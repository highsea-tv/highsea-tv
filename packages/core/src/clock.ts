// SPDX-License-Identifier: AGPL-3.0-only
// Every service reads time from a Clock it's given, so tests can run the pipeline at any speed
// (as the prototype's mock does). Times are epoch milliseconds, stored and sent as UTC.

export type Clock = { now(): number }

export const systemClock: Clock = { now: () => Date.now() }

export type FakeClock = Clock & {
  /** Moves time forward by `ms`. */
  advance(ms: number): void
  set(ms: number): void
}

/** 2026-10-17 20:15 UTC by default, so test output is repeatable. */
export function createFakeClock(start = Date.UTC(2026, 9, 17, 20, 15)): FakeClock {
  let now = start
  return {
    now: () => now,
    advance(ms) {
      now += ms
    },
    set(ms) {
      now = ms
    },
  }
}

export const iso = (ms: number) => new Date(ms).toISOString()
