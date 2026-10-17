// SPDX-License-Identifier: AGPL-3.0-only
// docs/design-language/motion.md

export type SpringParams = { stiffness: number; damping: number; mass: number }

/** Normalized step response (0 → 1) of a damped spring released from rest. */
export function springPosition({ stiffness, damping, mass }: SpringParams, t: number): number {
  const w0 = Math.sqrt(stiffness / mass)
  const zeta = damping / (2 * Math.sqrt(stiffness * mass))
  if (zeta < 1) {
    const wd = w0 * Math.sqrt(1 - zeta * zeta)
    return 1 - Math.exp(-zeta * w0 * t) * (Math.cos(wd * t) + ((zeta * w0) / wd) * Math.sin(wd * t))
  }
  return 1 - Math.exp(-w0 * t) * (1 + w0 * t)
}

export type SpringMetrics = {
  zeta: number
  /** Time to reach 90% of the travel, ms. */
  t90: number
  /** Time after which it stays within ±0.2%, ms. */
  settle: number
  /** Peak overshoot, % of travel. */
  overshoot: number
}

export function springMetrics(p: SpringParams): SpringMetrics {
  const dt = 1 / 2400
  let last = 0
  let peak = 0
  let t90 = 0
  for (let t = 0; t < 4; t += dt) {
    const v = springPosition(p, t)
    if (Math.abs(v - 1) > 0.002) last = t
    peak = Math.max(peak, v)
    if (!t90 && v >= 0.9) t90 = t
  }
  return {
    zeta: p.damping / (2 * Math.sqrt(p.stiffness * p.mass)),
    t90: Math.round(t90 * 1000),
    settle: Math.round(last * 1000),
    overshoot: Math.max(0, (peak - 1) * 100),
  }
}

/**
 * Samples a spring into a CSS `linear()` easing with 49 points and a matching duration. This is
 * the reference board's sampler, so web motion matches what was signed off.
 */
export function springToCss(p: SpringParams): { easing: string; duration: number } {
  const dt = 1 / 240
  let last = 0
  for (let t = 0; t < 4; t += dt) if (Math.abs(springPosition(p, t) - 1) > 0.002) last = t
  const T = last + dt
  const N = 48
  const pts: number[] = []
  for (let i = 0; i <= N; i++) pts.push(Number(springPosition(p, (T * i) / N).toFixed(4)))
  pts[0] = 0
  pts[N] = 1
  return { easing: `linear(${pts.join(', ')})`, duration: Math.round(T * 1000) }
}

export const springs = {
  /** Locked. Layout, focus moves, rows and tracks, sheets, entrances. */
  base: { stiffness: 120, damping: 20, mass: 1 },
  /** Press feedback, toggles, segmented controls, checkboxes. */
  quick: { stiffness: 300, damping: 30, mass: 1 },
} as const satisfies Record<string, SpringParams>

/** No spring in the system may overshoot more than this (%). */
export const MAX_OVERSHOOT = 1

/** Non-spring durations, ms. */
export const durations = {
  color: 180,
  fadeOut: 140,
  dwell: 220,
  pulse: 280,
  /** Opacity changes up to this long survive reduced motion. */
  reducedFade: 150,
} as const

export const choreography = {
  stagger: 45,
  staggerCap: 8,
  enterY: 14,
  enterScale: 0.98,
  /** Content swap: old copy leaves downward, new copy enters from above. */
  swapOutY: 4,
  swapInY: -6,
  pulseBrightness: 1.35,
  dialogScale: 0.98,
} as const
