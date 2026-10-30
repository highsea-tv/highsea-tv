// SPDX-License-Identifier: AGPL-3.0-only
// The theme the native components draw with (ADR 0008): `@highsea-tv/tokens/native`'s resolved
// colours, chosen by the app from the person's preferences (`@highsea-tv/client/prefs`), and the
// type scale for the platform. The TV's sizes are screen units, so they're scaled by the window's
// width here once (tv.md › Units).
import { type NativeTheme, nativeTokens, tvUnit } from '@highsea-tv/tokens/native'
import { createContext, type ReactNode, useContext, useMemo } from 'react'
import { useWindowDimensions } from 'react-native'

export type Platform = 'mobile' | 'tv'

export type Theme = NativeTheme & {
  platform: Platform
  /** 1u in points: the TV's unit, 1 on the phone. */
  u: number
}

const ThemeContext = createContext<Theme | null>(null)

export function ThemeProvider({
  theme = nativeTokens.themes.default,
  platform = 'mobile',
  children,
}: {
  theme?: NativeTheme
  platform?: Platform
  children: ReactNode
}) {
  const { width } = useWindowDimensions()
  const u = platform === 'tv' ? tvUnit(width) : 1
  const value = useMemo(() => ({ ...theme, platform, u }), [theme, platform, u])
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme(): Theme {
  const theme = useContext(ThemeContext)
  if (!theme) throw new Error('useTheme needs a ThemeProvider')
  return theme
}

export const tokens = nativeTokens
