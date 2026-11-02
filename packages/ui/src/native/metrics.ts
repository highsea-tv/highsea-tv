// SPDX-License-Identifier: AGPL-3.0-only
// The control spec's platform rule in points (controls.md › One rule per platform), with no React
// Native in it so Bun can test it. The phone is the touch rule, already in points; the TV's values
// are screen units, multiplied here by 1u in points (the ThemeProvider's `u`).
import type { ControlMetrics, ControlSize } from '@highsea-tv/tokens'
import { nativeTokens } from '@highsea-tv/tokens/native'

const spec = nativeTokens.controls

/** A control's measurements in points, for the platform the theme is on. */
export type ControlPoints = Omit<ControlMetrics, 'unit'>

/** `controlMetrics` for the phone (touch) or the TV (its units times `u`). */
export function controlPoints(
  platform: 'mobile' | 'tv',
  u: number,
  size: ControlSize = 'md',
): ControlPoints {
  if (platform !== 'tv') {
    const { unit: _, ...m } = spec.touch[size]
    return m
  }
  const { unit: _, ...m } = spec.tv[size]
  const pt = (n: number) => Number((n * u).toFixed(2))
  return {
    ...m,
    height: pt(m.height),
    pad: pt(m.pad),
    fieldPad: pt(m.fieldPad),
    gap: pt(m.gap),
    icon: pt(m.icon),
    inset: pt(m.inset),
    radius: pt(m.radius),
    rowGap: pt(m.rowGap),
    text: pt(m.text),
  }
}

export type Insets = { top: number; bottom: number; left: number; right: number }

/**
 * The invisible box that takes a touch control's target to `hit` without changing its size
 * (Pressable's `hitSlop`, https://reactnative.dev/docs/pressable#hitslop): half the shortfall on
 * each side, across only where the width is known and short (an icon button, a checkbox).
 * Nothing when the rule has no hit area (the TV) or the control already reaches it.
 */
export function hitSlopFor(hit: number, height: number, width?: number): Insets | undefined {
  const v = Math.max(0, (hit - height) / 2)
  const h = width === undefined ? 0 : Math.max(0, (hit - width) / 2)
  if (!v && !h) return undefined
  return { top: v, bottom: v, left: h, right: h }
}

/** Vertical padding that centres one line of `text` in `height`, and lets a label grown by Dynamic Type push the control taller. */
export function centredPadding(m: Pick<ControlPoints, 'height' | 'text' | 'leading'>) {
  return Math.max(0, (m.height - Math.round(m.text * m.leading)) / 2)
}
