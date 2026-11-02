// SPDX-License-Identifier: AGPL-3.0-only
// Motion tokens as `motion/react` transitions: docs/design-language/motion.md
import { choreography, durations, springs } from '@highsea-tv/tokens'
import type { Transition } from 'motion/react'

/** `spring.base`: layout, focus moves, rows and tracks, sheets, entrances. */
export const springBase: Transition = { type: 'spring', ...springs.base }

/** `spring.quick`: press feedback, toggles, segmented controls. */
export const springQuick: Transition = { type: 'spring', ...springs.quick }

/** Content leaving before a swap, and overlays leaving. */
export const fadeOut: Transition = { duration: durations.fadeOut / 1000, ease: 'linear' }

/** Delay for the nth item of an entrance; items after the cap enter with the last one. */
export function staggerDelay(index: number): number {
  return (Math.min(index, choreography.staggerCap - 1) * choreography.stagger) / 1000
}

/**
 * `spring.quick` as a CSS duration and easing, for the Web Animations API (dnd-kit's sortable and
 * the widget editor's reflow). Read from the theme, so reduced motion's 1ms applies.
 */
export function quickSpringTiming() {
  const root = getComputedStyle(document.documentElement)
  const duration = Number.parseFloat(root.getPropertyValue('--duration-spring-quick'))
  const easing = root.getPropertyValue('--ease-spring-quick').trim()
  return { duration: Number.isFinite(duration) ? duration : 300, easing: easing || 'ease-out' }
}
