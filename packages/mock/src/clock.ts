// SPDX-License-Identifier: AGPL-3.0-only
// The mock server's simulated clock and event emitter. One clock drives every simulation
// (downloads, jobs, health); the emitter stands in for SSE `/api/v1/events`.
import type { ServerEvent } from './types.ts'

/** Simulated time starts here, so screenshots and tests are repeatable. */
export const EPOCH = new Date(2026, 9, 17, 20, 15, 0).getTime()

export type Clock = {
  now(): number
  /** Advances simulated time by `seconds` and notifies listeners. */
  advance(seconds: number): void
  onAdvance(listener: (dt: number, now: number) => void): () => void
}

export function createClock(start = EPOCH): Clock {
  let now = start
  const listeners = new Set<(dt: number, now: number) => void>()
  return {
    now: () => now,
    advance(seconds) {
      now += seconds * 1000
      for (const l of listeners) l(seconds, now)
    },
    onAdvance(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}

/**
 * Runs the clock in real time: one tick a second, advancing 1s (play) or 10s (10×). Returns a
 * stop function.
 */
export function runClock(clock: Clock, speed: () => number): () => void {
  const timer = setInterval(() => {
    const s = speed()
    if (s > 0) clock.advance(s)
  }, 1000)
  return () => clearInterval(timer)
}

export type Emitter = {
  emit(event: ServerEvent): void
  subscribe(listener: (event: ServerEvent) => void): () => void
}

export function createEmitter(): Emitter {
  const listeners = new Set<(event: ServerEvent) => void>()
  return {
    emit(event) {
      for (const l of listeners) l(event)
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}

/** A small seeded random generator (mulberry32), so the simulation is repeatable. */
export function createRandom(seed = 0x5eed): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export const iso = (ms: number) => new Date(ms).toISOString()
