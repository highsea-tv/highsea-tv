// SPDX-License-Identifier: AGPL-3.0-only
// Client settings (C7, docs/product/client-settings.md), shared by web, mobile and TV: the
// sections, the themes a device can pick, the person's home layout, and their own devices.
import { builtInThemes } from '@highsea/tokens'
import type { IconName } from '@highsea/ui-web'
import { useAction, useQuery } from '../mock/hooks.tsx'
import type { HomeLayout } from '../mock/types.ts'
import { useServer } from './data.ts'
import { useAppearance } from './prefs.tsx'

export type SettingsSectionId = 'appearance' | 'sounds' | 'home' | 'servers' | 'devices' | 'about'

export const settingsSections: {
  id: SettingsSectionId
  label: string
  icon: IconName
  hint: string
}[] = [
  { id: 'appearance', label: 'Theme', icon: 'palette', hint: 'How this device looks.' },
  { id: 'sounds', label: 'Sounds', icon: 'sound', hint: 'Interface sounds on this device.' },
  {
    id: 'home',
    label: 'Home screen',
    icon: 'home',
    hint: 'Reorder and hide rows, on every device.',
  },
  {
    id: 'servers',
    label: 'Servers',
    icon: 'server',
    hint: 'The servers you use, and signing out.',
  },
  { id: 'devices', label: 'Your devices', icon: 'phone', hint: 'Where you’re signed in.' },
  { id: 'about', label: 'About', icon: 'info', hint: 'Versions and licences.' },
]

/** Themes a device can pick: the server's default first, then built-ins, then the server's own. */
export function useThemeChoices() {
  const appearance = useAppearance()
  const server = useServer()
  const a = appearance.data
  const name = server.data?.name ?? 'Harbor'
  const builtIn = Object.values(builtInThemes)
  const defaultName =
    builtIn.find((t) => t.id === a?.defaultTheme)?.name ??
    a?.themes.find((t) => t.id === a?.defaultTheme)?.name ??
    'Abyss Neutral'
  return [
    { id: 'server', name: `${name}’s default`, detail: defaultName },
    ...builtIn.map((t) => ({ id: t.id, name: t.name, detail: 'Built in' })),
    ...(a?.themes ?? []).map((t) => ({ id: t.id, name: t.name, detail: `From ${name}` })),
  ]
}

/** The person's home rows: order and visibility, saved on the server so every device follows. */
export function useHomeLayout() {
  const layout = useQuery('client:home-layout', (c) => c.home.layout(), ['curation.updated'])
  const save = useAction((c, l: HomeLayout) => c.home.saveLayout(l))
  const rows = layout.data?.rows ?? []
  const hidden = layout.data?.hidden ?? []
  const write = (order: string[], hide: string[]) => save.run({ order, hidden: hide })
  return {
    status: layout.status,
    rows,
    hidden,
    move: (id: string, by: -1 | 1) => {
      const order = rows.map((r) => r.id)
      const i = order.indexOf(id)
      const j = i + by
      if (i < 0 || j < 0 || j >= order.length) return
      order.splice(i, 1)
      order.splice(j, 0, id)
      return write(order, hidden)
    },
    toggle: (id: string, show: boolean) =>
      write(
        rows.map((r) => r.id),
        show ? hidden.filter((h) => h !== id) : [...hidden, id],
      ),
    reset: () => write([], []),
    pending: save.pending,
  }
}

/** This person's devices, and signing one out. */
export function useMyDevices() {
  const devices = useQuery('client:devices', (c) => c.devices.mine(), ['users.updated'])
  const revoke = useAction((c, id: string) => c.devices.revoke(id))
  return { devices, revoke: revoke.run }
}

export const APP_VERSION = '1.0.0'
