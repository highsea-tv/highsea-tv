// SPDX-License-Identifier: AGPL-3.0-only
// The dark glass a part lays over artwork: Badge's overlay pill and StillFrame's note (the
// prototype's glass-badge), and the player's chips on the TV. It's `art.glass`, the theme's `bg`
// at 0.62 (elevation.md › Over artwork), so a theme that changes `bg` changes the glass.
import { art } from '@highsea-tv/tokens'
import { alpha } from './alpha.ts'

/** The glass in a theme's colours: `bg` at 0.62. */
export const glassOf = (colors: Record<'bg', string>) =>
  alpha(colors[art.glass.role], art.glass.alpha)

/** The hairline inside artwork's edge in a theme's colours: `text` at 0.04. */
export const artEdgeOf = (colors: Record<'text', string>) =>
  alpha(colors[art.edge.role], art.edge.alpha)

/** A scrim over artwork: black at one of `art.alpha`'s steps. */
export const scrimOf = (step: keyof typeof art.alpha) => alpha(art.black, art.alpha[step])
