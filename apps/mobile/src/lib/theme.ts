// SPDX-License-Identifier: AGPL-3.0-only
// This device's theme (C7, client-settings.md): the person's choice from the server's preference
// layers (ADR 0027, `@highsea-tv/client/prefs`), a built-in theme or one of the server's own,
// made with the theme engine and converted for React Native. Until the preferences load, and
// before anyone signs in, the default theme.
import { useAppearance } from '@highsea-tv/client/data'
import { useDevicePrefs } from '@highsea-tv/client/prefs'
import { createTheme } from '@highsea-tv/tokens'
import { type NativeTheme, nativeTokens, toNativeTheme } from '@highsea-tv/tokens/native'
import { useMemo } from 'react'

export function useAppTheme(): NativeTheme {
  const { current } = useDevicePrefs()
  const appearance = useAppearance()
  const id = current?.theme
  const custom = appearance.data?.themes
  return useMemo(() => {
    if (!id) return nativeTokens.themes.default
    const builtIn = (nativeTokens.themes as Record<string, NativeTheme>)[id]
    if (builtIn) return builtIn
    const spec = custom?.find((t) => t.id === id)
    return spec ? toNativeTheme(createTheme({ ...spec }).theme) : nativeTokens.themes.default
  }, [id, custom])
}
