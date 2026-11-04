// SPDX-License-Identifier: AGPL-3.0-only
// The theme the native components draw with (ADR 0008): `@highsea-tv/tokens/native`'s resolved
// colours, chosen by the app from the person's preferences (`@highsea-tv/client/prefs`), and the
// form factor they're drawn at (controls.md › The form factor), resolved here once. The TV's sizes
// are screen units, so they're scaled by the window's width here once too (tv.md › Units). Controls
// take their sizes from the control spec through `useControl`, by the form factor's input: the
// pointer's rule with a mouse, touch's on a phone or a coarse pointer, and the TV's on a TV.
// Two of the person's accessibility settings can be set here too, for a preview that draws them
// whatever the device says: `fontScale`, which the type scale's sizes multiply by (as iOS's
// Dynamic Type and Android's font scale do, mobile.md › Type), and `reducedMotion`, which
// `useMotionReduced` gives in place of the OS's own (Reanimated's useReducedMotion,
// https://docs.swmansion.com/react-native-reanimated/docs/device/useReducedMotion/, which reads
// `prefers-reduced-motion` on the web). An inner provider without them keeps the outer one's.
import {
  type ControlSize,
  FORM_FACTORS,
  type FormFactor,
  type FormFactorSetting,
  formFactorName,
  formFactorOf,
  type Input,
  REGULAR_WIDTH,
  TV_REFERENCE,
} from '@highsea-tv/tokens'
import { type NativeTheme, nativeTokens, tvUnit } from '@highsea-tv/tokens/native'
import { createContext, type ReactNode, useContext, useMemo, useSyncExternalStore } from 'react'
import { Dimensions } from 'react-native'
import { useReducedMotion } from 'react-native-reanimated'
import { useDeviceInput } from './input.ts'
import { type ControlPoints, controlPoints } from './metrics.ts'

export type Theme = NativeTheme & {
  /** The form factor the theme draws at, as `useFormFactor` gives it. */
  formFactor: FormFactor
  /** 1u in points: the TV's unit, and 1 off the TV. */
  u: number
  /** What the type scale's sizes multiply by: 1, or the provider's `fontScale`. */
  fontScale: number
  /** The provider's reduced motion, which wins over the OS's; undefined to follow the OS. */
  reducedMotion: boolean | undefined
}

const ThemeContext = createContext<Theme | null>(null)

/** The nearest ThemeProvider's settings, which an inner one without its own keeps. */
type Settings = {
  formFactor: FormFactorSetting | null
  fontScale: number | undefined
  reducedMotion: boolean | undefined
}
const SettingContext = createContext<Settings>({
  formFactor: null,
  fontScale: undefined,
  reducedMotion: undefined,
})

/** A setting as one of `FORM_FACTORS` (or an input), so it's the same from render to render. */
const settled = (setting: FormFactorSetting | null) =>
  setting === null || typeof setting === 'string' ? setting : FORM_FACTORS[formFactorName(setting)]

// The window's width through Dimensions (https://reactnative.dev/docs/dimensions), read as only
// what the theme needs: the TV's width for its unit, and elsewhere which side of 768 it's on, so a
// resize within a width class renders nothing. Without a DOM, react-native-web's window is 0 by 0,
// so a page rendered ahead of time takes the server snapshot (a regular window, and the TV at its
// 1080p reference, tv.md › Units), and the browser corrects it after hydrating
// (https://react.dev/reference/react/useSyncExternalStore#adding-support-for-server-rendering).
const SERVER_WIDTH = { regular: REGULAR_WIDTH, tv: TV_REFERENCE.width } as const

function subscribeWindow(change: () => void) {
  const subscription = Dimensions.addEventListener('change', change)
  return () => subscription.remove()
}

const windowWidth = () => Dimensions.get('window').width

/** The window's width on the TV, and anywhere else the least width of its width class. */
function useWidth(tv: boolean): number {
  return useSyncExternalStore(
    subscribeWindow,
    () => (tv ? windowWidth() : windowWidth() >= REGULAR_WIDTH ? REGULAR_WIDTH : 0),
    () => (tv ? SERVER_WIDTH.tv : SERVER_WIDTH.regular),
  )
}

export function ThemeProvider({
  theme = nativeTokens.themes.default,
  formFactor,
  fontScale,
  reducedMotion,
  children,
}: {
  theme?: NativeTheme
  /**
   * The form factor to draw at, whatever the device: an input, with the width class from the
   * window (the prototypes' phone frame passes `touch` and the TV's `tv`, each an iframe with its
   * own viewport; the web's passes nothing), or a whole form factor. Without it, the outer
   * provider's, if any.
   */
  formFactor?: FormFactorSetting
  /**
   * What the type scale's sizes multiply by (2 for 200% text), whatever the OS's text size. The OS's
   * own still applies on top on a phone, up to Text's cap. Without it, the outer provider's, or 1.
   */
  fontScale?: number
  /** Reduced motion, whatever the OS says. Without it, the outer provider's, or the OS's. */
  reducedMotion?: boolean
  children: ReactNode
}) {
  const inherited = useContext(SettingContext)
  const setting = settled(formFactor ?? inherited.formFactor)
  const scale = fontScale ?? inherited.fontScale
  const motion = reducedMotion ?? inherited.reducedMotion
  const device = useDeviceInput()
  const whole = setting !== null && typeof setting === 'object' ? setting : null
  const input = whole?.input ?? (setting as Input | null) ?? device
  const width = useWidth(input === 'tv')
  const resolved = whole ?? formFactorOf(width, input)
  const u = resolved.input === 'tv' ? tvUnit(width) : 1
  const value = useMemo(
    () => ({ ...theme, formFactor: resolved, u, fontScale: scale ?? 1, reducedMotion: motion }),
    [theme, resolved, u, scale, motion],
  )
  const settings = useMemo(
    () => ({ formFactor: setting, fontScale: scale, reducedMotion: motion }),
    [setting, scale, motion],
  )
  return (
    <SettingContext.Provider value={settings}>
      <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
    </SettingContext.Provider>
  )
}

export function useTheme(): Theme {
  const theme = useContext(ThemeContext)
  if (!theme) throw new Error('useTheme needs a ThemeProvider')
  return theme
}

/**
 * The form factor this screen is drawn at (controls.md › The form factor), as its ThemeProvider
 * resolved it: the provider's setting if there is one, and otherwise the device's input and the
 * window's width class, followed as they change. Screens lay out by it and never ask the OS.
 */
export function useFormFactor(): FormFactor {
  return useTheme().formFactor
}

export const tokens = nativeTokens

/** What React Native's Text and TextInput default `maxFontSizeMultiplier` to here: 200%. */
export const MAX_FONT_MULTIPLIER = 2

/**
 * The provider's `fontScale` for one element, held to its `maxFontSizeMultiplier` as the OS's own
 * scale is (https://reactnative.dev/docs/text#maxfontsizemultiplier): 0 is no limit, and a cap
 * under 1 counts as 1. So a frame at 200% draws a tab label capped at 1.4 at 1.4, as Dynamic Type
 * would.
 */
export function fontScaleFor(theme: Pick<Theme, 'fontScale'>, cap = MAX_FONT_MULTIPLIER): number {
  return cap === 0 ? theme.fontScale : Math.min(theme.fontScale, Math.max(1, cap))
}

/**
 * Whether motion should be reduced: the ThemeProvider's `reducedMotion` if it sets one, and
 * otherwise the OS's (Reanimated's useReducedMotion). Components ask this, never Reanimated.
 */
export function useMotionReduced(): boolean {
  const os = useReducedMotion()
  return useTheme().reducedMotion ?? os
}

/**
 * A control's measurements in points, by the form factor's input (controls.md): never a screen's
 * own.
 */
export function useControl(size: ControlSize = 'md'): ControlPoints {
  const { formFactor, u } = useTheme()
  return useMemo(() => controlPoints(formFactor.input, u, size), [formFactor.input, u, size])
}

export type { ControlPoints, FormFactor, FormFactorSetting }
