// SPDX-License-Identifier: AGPL-3.0-only
// The bloom behind Home's featured card, on the TV and the web (the owner, 2026-10-30), and behind
// the TV's who's watching: a glow in one colour, fading into the background.
import type { CSSProperties } from 'react'

/** Home's bloom (the owner, 2026-10-30): a glow colour for each featured card, the one focus is on, and whether it shows. */
export type Bloom = { colors: (string | null)[]; active: number; shown: boolean }

/**
 * The bloom, the size of what holds it: the focused card's colour as a glow from where the cards sit,
 * fading into the background. One element: its colour is `--bloom`, registered as a <color>
 * (prototypes.css), so moving between cards turns it from one colour to the next in place.
 */
export function BloomGlow({
  bloom,
  at = '42% 45%',
}: {
  bloom: Bloom
  /** Where the glow comes from: the featured card, or the centre of the TV's who's watching. */
  at?: string
}) {
  const color = bloom.colors[bloom.active]
  return (
    <div
      className="absolute inset-0 transition-[--bloom,opacity] duration-700 ease-out motion-reduce:transition-none"
      style={
        {
          '--bloom': color ?? 'transparent',
          opacity: bloom.shown && color ? 1 : 0,
          background: `radial-gradient(ellipse 75% 85% at ${at}, color-mix(in oklab, var(--bloom) 70%, transparent), color-mix(in oklab, var(--bloom) 30%, transparent) 50%, transparent 85%)`,
        } as CSSProperties
      }
    />
  )
}
