// SPDX-License-Identifier: AGPL-3.0-only
// What each device remembers for itself (C7): its theme and its sound. Until someone changes
// them, a device follows the server's defaults (A12). In the prototype the toolbar's theme and
// sound stand in for those defaults, and a choice made here wins over them on that platform.
import { createTheme, themeCss } from '@highsea-tv/tokens'
import { useSoundPlayer } from '@highsea-tv/ui-web'
import { useEffect, useState } from 'react'
import { useQuery } from '../mock/hooks.tsx'
import { useProto } from '../screen/screen.tsx'
import type { ClientPlatform } from './data.ts'

export type DevicePrefs = {
  /** 'server' follows the server's default theme; otherwise a theme id. */
  theme: string
  /** null follows the server's default for this kind of app. */
  sound: boolean | null
  volume: number
}

const fallback: DevicePrefs = { theme: 'server', sound: null, volume: 0.8 }
const key = (p: ClientPlatform) => `highsea-proto:prefs:${p}`
const listeners = new Set<() => void>()

function load(p: ClientPlatform): DevicePrefs {
  try {
    const raw = localStorage.getItem(key(p))
    return raw ? { ...fallback, ...(JSON.parse(raw) as Partial<DevicePrefs>) } : fallback
  } catch {
    return fallback
  }
}

export function useDevicePrefs(platform: ClientPlatform) {
  const [prefs, setPrefs] = useState(() => load(platform))
  useEffect(() => {
    const on = () => setPrefs(load(platform))
    listeners.add(on)
    return () => {
      listeners.delete(on)
    }
  }, [platform])
  const set = (patch: Partial<DevicePrefs>) => {
    const next = { ...load(platform), ...patch }
    try {
      localStorage.setItem(key(platform), JSON.stringify(next))
    } catch {
      // still applies for this session
    }
    setPrefs(next)
    for (const l of listeners) l()
  }
  return [prefs, set] as const
}

/** The server's appearance: the default theme, custom themes and sound defaults. */
export const useAppearance = () =>
  useQuery('client:appearance', (c) => c.appearance.get(), ['server.updated'])

/** Applies this device's theme and sound to the document, over the toolbar's defaults. */
export function ApplyDevicePrefs({ platform }: { platform: ClientPlatform }) {
  const [prefs] = useDevicePrefs(platform)
  const proto = useProto()
  const appearance = useAppearance()
  const player = useSoundPlayer()
  const custom = appearance.data?.themes.find((t) => t.id === prefs.theme)

  useEffect(() => {
    const root = document.documentElement
    if (prefs.theme === 'server') {
      root.dataset.theme = proto.theme
      return
    }
    let style: HTMLStyleElement | null = null
    if (custom) {
      style = document.createElement('style')
      style.textContent = themeCss(createTheme({ ...custom }).theme, `[data-theme="${custom.id}"]`)
      document.head.append(style)
    }
    root.dataset.theme = prefs.theme
    return () => {
      style?.remove()
      root.dataset.theme = proto.theme
    }
  }, [prefs.theme, proto.theme, custom])

  useEffect(() => {
    if (!player) return
    player.setEnabled(prefs.sound ?? proto.sound[platform])
    player.setVolume(prefs.volume)
  }, [player, prefs.sound, prefs.volume, proto.sound, platform])
  return null
}
