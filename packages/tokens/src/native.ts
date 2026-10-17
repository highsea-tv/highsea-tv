// SPDX-License-Identifier: AGPL-3.0-only
// Tokens shaped for React Native (Expo, react-native-tvos): plain numbers, hex colors with alpha,
// raw spring parameters for Reanimated, and box-shadow strings (RN ≥ 0.76).
import { formatHex, parseColor } from './color.ts'
import { choreography, durations, springs } from './motion.ts'
import { COLOR_ROLES, type ColorRole } from './roles.ts'
import {
  aspect,
  elevation,
  focus,
  icon,
  mobile,
  radius,
  type Shadow,
  shadowCss,
  space,
  targets,
  tv,
} from './scales.ts'
import { defaultSoundPack } from './sound/pack.ts'
import { NAVIGATE_THROTTLE_MS } from './sound/rules.ts'
import { type ResolvedTheme, resolveTheme } from './theme.ts'
import { type BuiltInThemeId, builtInThemes } from './themes.ts'
import { fonts, mobileText, tracking, tvText, weights } from './typography.ts'

export type NativeTheme = {
  id: string
  name: string
  colors: Record<ColorRole, string>
  focusRingScale: number
}

/** Converts a resolved theme (including custom ones) to RN-safe values. */
export function toNativeTheme(theme: ResolvedTheme): NativeTheme {
  const colors = Object.fromEntries(
    COLOR_ROLES.map((r) => [r, formatHex(parseColor(theme.colors[r]))]),
  ) as Record<ColorRole, string>
  return { id: theme.id, name: theme.name, colors, focusRingScale: theme.focusRingScale }
}

const nativeShadow = (s: Shadow) => ({ ...s, boxShadow: shadowCss(s) })

export const nativeTokens = {
  themes: Object.fromEntries(
    Object.entries(builtInThemes).map(([id, spec]) => [id, toNativeTheme(resolveTheme(spec))]),
  ) as Record<BuiltInThemeId, NativeTheme>,
  space,
  radius,
  fonts,
  weights,
  tracking,
  text: { mobile: mobileText, tv: tvText },
  springs,
  durations,
  choreography,
  elevation: {
    2: nativeShadow(elevation[2].shadow),
    3: nativeShadow(elevation[3].shadow),
    4: nativeShadow(elevation[4].shadow),
  },
  focus,
  icon,
  targets,
  aspect,
  mobile,
  /** TV values are screen units: multiply by `width / 100`. */
  tv,
  sound: { pack: defaultSoundPack, navigateThrottleMs: NAVIGATE_THROTTLE_MS },
} as const

/** 1u in px/dp for a TV window of the given width. */
export const tvUnit = (windowWidth: number) => windowWidth / 100
