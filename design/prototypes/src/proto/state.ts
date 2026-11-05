// SPDX-License-Identifier: AGPL-3.0-only
// The prototype toolbar's state. The chrome (toolbar and frame) owns it and persists it; the
// screen inside the frame receives it over postMessage, or from URL parameters when opened alone.
// Its shape and defaults are the mock's (@highsea-tv/mock/state), which answers by them; the
// toolbar's labels and its storage are here.
import type { StreamState } from '@highsea-tv/client/player'
import {
  type AirPlay,
  type AppUpdate,
  CONNECTIONS,
  type Connection,
  DATA_STATES,
  type DataState,
  type DesktopOs,
  defaultState,
  LANS,
  type LocalNetwork,
  type MusicState,
  type PhoneDownloads,
  PLATFORMS,
  type Platform,
  type ProtoState,
  ROLES,
  type Role,
  THEMES,
  type ThemeId,
  TIMES,
  type TimeMode,
  type WebApp,
  type Width,
} from '@highsea-tv/mock/state'

export type {
  AirPlay,
  AppUpdate,
  Connection,
  DataState,
  DesktopOs,
  LocalNetwork,
  MusicState,
  PhoneDownloads,
  Platform,
  ProtoState,
  Role,
  ThemeId,
  TimeMode,
  WebApp,
  Width,
}
export { defaultState }

/** Labels each value of one of the mock's lists, in its order: the list itself stays the mock's. */
const labelled = <T extends string>(ids: readonly T[], labels: Record<T, string>) =>
  ids.map((id) => ({ id, label: labels[id] }))

export const platforms: { id: Platform; label: string }[] = labelled(PLATFORMS, {
  admin: 'Admin',
  web: 'Web/desktop',
  mobile: 'Mobile',
  tv: 'TV',
})

export const widths: Width[] = ['fluid', 1440, 1024, 768, 390]

export const themes: { id: ThemeId; label: string }[] = labelled(THEMES, {
  default: 'Abyss Neutral',
  oled: 'OLED black',
  'high-contrast': 'High contrast',
  harbor: 'Harbor (custom)',
})

export const dataStates: { id: DataState; label: string }[] = labelled(DATA_STATES, {
  populated: 'Populated',
  empty: 'Empty',
  loading: 'Loading',
  error: 'Error',
})

export const roles: { id: Role; label: string }[] = labelled(ROLES, {
  owner: 'Owner',
  admin: 'Admin',
  user: 'User',
})

export const connections: { id: Connection; label: string }[] = labelled(CONNECTIONS, {
  local: 'On the LAN',
  remote: 'Remote',
  offline: 'Unreachable',
})

export const webApps: { id: WebApp; label: string }[] = [
  { id: 'browser', label: 'Browser' },
  { id: 'desktop', label: 'Desktop app' },
]

export const desktopOses: { id: DesktopOs; label: string }[] = [
  { id: 'mac', label: 'macOS' },
  { id: 'windows', label: 'Windows' },
  { id: 'linux', label: 'Linux' },
]

export const appUpdates: { id: AppUpdate; label: string }[] = [
  { id: 'none', label: 'Up to date' },
  { id: 'ready', label: 'Ready to restart' },
]

export const localNetworks: { id: LocalNetwork; label: string }[] = labelled(LANS, {
  allowed: 'Allowed',
  asking: 'Asking',
  refused: 'Refused',
})

export const airplays: { id: AirPlay; label: string }[] = [
  { id: 'off', label: 'On the phone' },
  { id: 'on', label: 'Living room TV' },
]

export const musicStates: { id: MusicState; label: string }[] = [
  { id: 'none', label: 'Nothing playing' },
  { id: 'playing', label: 'A song playing' },
]

export const phoneDownloads: { id: PhoneDownloads; label: string }[] = [
  { id: 'built', label: 'Built (4.6)' },
  { id: 'later', label: 'Not yet' },
]

export const streamStates: { id: StreamState; label: string }[] = [
  { id: 'normal', label: 'Playing' },
  { id: 'preparing', label: 'Getting it ready' },
  { id: 'buffering', label: 'Buffering' },
  { id: 'failed', label: 'Didn’t start' },
  { id: 'stopped', label: 'Stopped by the server' },
  { id: 'next-up', label: 'Next up' },
]

export const timeModes: { id: TimeMode; label: string }[] = labelled(TIMES, {
  play: 'Play',
  pause: 'Pause',
  fast: '10×',
})

/** The platform a route belongs to: `#/admin/…`, `#/web/…`, `#/mobile/…`, `#/tv/…`. */
export function platformOf(path: string): Platform | null {
  const first = path.split('/')[1]
  return first === 'admin' || first === 'web' || first === 'mobile' || first === 'tv' ? first : null
}

const KEY = 'highsea:prototypes'

/** Reads the saved state. Storage can be missing or blocked (private windows, file://). */
export function loadState(): ProtoState {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return defaultState
    const saved = JSON.parse(raw) as Partial<ProtoState>
    return { ...defaultState, ...saved, sound: { ...defaultState.sound, ...saved.sound } }
  } catch {
    return defaultState
  }
}

export function saveState(state: ProtoState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(state))
  } catch {
    // the toolbar still works; it just won't remember
  }
}

/**
 * URL parameters override the state, so a screen can be opened on its own at a known state:
 * `?screen&data=empty&theme=oled&role=admin&motion=reduced&text=200&time=pause&connection=remote`
 * (and `&stream=buffering` on a player, `&app=desktop` for the desktop app, with `&os=windows`,
 * `&update=ready` and `&lan=refused`; on the phone `&lan=asking`, `&airplay=on` and
 * `&downloads=later`; on the TV `&nav=band`; on any client `&music=playing`);
 * `&preview` marks a client preview inside the admin.
 */
export function stateFromParams(params: URLSearchParams, base: ProtoState): ProtoState {
  const pick = <T extends string>(key: string, allowed: readonly T[]): T | undefined => {
    const v = params.get(key)
    return v && (allowed as readonly string[]).includes(v) ? (v as T) : undefined
  }
  const sound = params.get('sound')
  return {
    ...base,
    data: pick('data', DATA_STATES) ?? base.data,
    theme: pick('theme', THEMES) ?? base.theme,
    role: pick('role', ROLES) ?? base.role,
    time: pick('time', TIMES) ?? base.time,
    connection: pick('connection', CONNECTIONS) ?? base.connection,
    stream:
      pick(
        'stream',
        streamStates.map((x) => x.id),
      ) ?? base.stream,
    app:
      pick(
        'app',
        webApps.map((x) => x.id),
      ) ?? base.app,
    os:
      pick(
        'os',
        desktopOses.map((x) => x.id),
      ) ?? base.os,
    update:
      pick(
        'update',
        appUpdates.map((x) => x.id),
      ) ?? base.update,
    lan: pick('lan', LANS) ?? base.lan,
    airplay:
      pick(
        'airplay',
        airplays.map((x) => x.id),
      ) ?? base.airplay,
    downloads:
      pick(
        'downloads',
        phoneDownloads.map((x) => x.id),
      ) ?? base.downloads,
    music:
      pick(
        'music',
        musicStates.map((x) => x.id),
      ) ?? base.music,
    reducedMotion: params.has('motion') ? params.get('motion') === 'reduced' : base.reducedMotion,
    largeText: params.has('text') ? params.get('text') === '200' : base.largeText,
    preview: params.has('preview'),
    sound:
      sound === 'on' || sound === 'off'
        ? { admin: sound === 'on', web: sound === 'on', mobile: sound === 'on', tv: sound === 'on' }
        : base.sound,
  }
}

/** A tiny observable store: the chrome's single source of toolbar state. */
export function createStore<T>(initial: T, onChange?: (value: T) => void) {
  let value = initial
  const listeners = new Set<() => void>()
  return {
    get: () => value,
    set(next: T | ((prev: T) => T)) {
      value = typeof next === 'function' ? (next as (prev: T) => T)(value) : next
      onChange?.(value)
      for (const l of listeners) l()
    },
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}
