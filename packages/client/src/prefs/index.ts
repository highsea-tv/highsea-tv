// SPDX-License-Identifier: AGPL-3.0-only
// How a device looks and sounds (C7, client-settings.md): its theme, interface sounds and volume,
// kept on the server in ADR 0027's layers. A choice made on a device is its device layer; until
// then it follows the server's defaults. Use on all my devices (client-settings.md#use-on-all-my-devices)
// is the person's own theme in the user layer, which every device they're signed in on then takes
// over its own; turned off, each device has its own again.
import type { Preferences } from '@highsea-tv/api-contract'
import { useAction, useQuery } from '@highsea-tv/sdk/react'

/** The device's own theme before it chose one, as the server's default is named in the picker. */
export const SERVER_THEME = 'server'

/** What a device shows and plays, and where each came from. */
export type DevicePrefs = {
  /** The theme in use. */
  theme: string
  /** The device's choice, or `server` while it follows the server's default. */
  chosen: string
  /** The person's theme for every device, or null when each keeps its own. */
  everywhere: string | null
  sound: boolean
  /** Whether sound is the device's own choice, not the server's default for this kind of app. */
  soundChosen: boolean
  volume: number
}

/** Reads ADR 0027's layers into what a device uses; the user layer's theme wins when it's set. */
export function devicePrefs(p: Preferences): DevicePrefs {
  const everywhere = p.layers.user.theme ?? null
  return {
    theme: everywhere ?? p.values.theme,
    chosen: everywhere ?? p.layers.device.theme ?? SERVER_THEME,
    everywhere,
    sound: p.values.sound,
    soundChosen: p.layers.device.sound !== undefined,
    volume: p.values.volume,
  }
}

type Patch = { theme?: string | null; sound?: boolean | null; volume?: number | null }

export function useDevicePrefs() {
  const prefs = useQuery('client:preferences', (c) => c.preferences.get(), [
    'preferences.updated',
    'settings.updated',
  ])
  const save = useAction((c, layer: 'device' | 'user', values: Patch) =>
    c.preferences.save({ body: { layer, values } }),
  )
  const write = (layer: 'device' | 'user', values: Patch) =>
    save.run(layer, values).then(() => prefs.refetch())
  const current = prefs.data ? devicePrefs(prefs.data) : null
  return {
    prefs,
    current,
    /** A theme for this device, or for every device while Use on all my devices is on. */
    setTheme: (theme: string) =>
      current?.everywhere
        ? write('user', { theme: theme === SERVER_THEME ? null : theme })
        : write('device', { theme: theme === SERVER_THEME ? null : theme }),
    /**
     * Turned on, this device's theme becomes the person's and its own is cleared (the spec's
     * "user layer, with the device layer cleared"); turned off, this device keeps the theme as its
     * own and the person's is cleared.
     */
    setEverywhere: async (on: boolean) => {
      if (!current) return
      if (on) {
        await save.run('user', { theme: current.theme })
        await write('device', { theme: null })
      } else {
        await save.run('device', { theme: current.theme })
        await write('user', { theme: null })
      }
    },
    setSound: (sound: boolean | null) => write('device', { sound }),
    setVolume: (volume: number) => write('device', { volume }),
    pending: save.pending,
  }
}
