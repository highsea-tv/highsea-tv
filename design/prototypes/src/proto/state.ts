// SPDX-License-Identifier: AGPL-3.0-only
// The prototype toolbar's state. The chrome (toolbar and frame) owns it and persists it; the
// screen inside the frame receives it over postMessage, or from URL parameters when opened alone.

export type Platform = 'admin' | 'web' | 'mobile' | 'tv'
export type DataState = 'populated' | 'empty' | 'loading' | 'error'
export type Width = 'fluid' | 1440 | 1024 | 768 | 390
export type ThemeId = 'default' | 'oled' | 'high-contrast' | 'harbor'
export type Role = 'owner' | 'member'
export type TimeMode = 'play' | 'pause' | 'fast'
/** How a client reaches its server (connectivity.md): on the LAN, failed over to remote, or not. */
export type Connection = 'local' | 'remote' | 'offline'

export type ProtoState = {
  width: Width
  theme: ThemeId
  data: DataState
  role: Role
  reducedMotion: boolean
  /** Root font size at 200%, to test reflow. */
  largeText: boolean
  /** Sound per platform: on for TV, off elsewhere (sound.md#defaults). */
  sound: Record<Platform, boolean>
  time: TimeMode
  connection: Connection
  /** A client preview inside the admin (`?preview`): no prototype affordances. */
  preview: boolean
}

export const defaultState: ProtoState = {
  width: 'fluid',
  theme: 'default',
  data: 'populated',
  role: 'owner',
  reducedMotion: false,
  largeText: false,
  sound: { admin: false, web: false, mobile: false, tv: true },
  time: 'play',
  connection: 'local',
  preview: false,
}

export const platforms: { id: Platform; label: string }[] = [
  { id: 'admin', label: 'Admin' },
  { id: 'web', label: 'Web/desktop' },
  { id: 'mobile', label: 'Mobile' },
  { id: 'tv', label: 'TV' },
]

export const widths: Width[] = ['fluid', 1440, 1024, 768, 390]

export const themes: { id: ThemeId; label: string }[] = [
  { id: 'default', label: 'Abyss Neutral' },
  { id: 'oled', label: 'OLED black' },
  { id: 'high-contrast', label: 'High contrast' },
  { id: 'harbor', label: 'Harbor (custom)' },
]

export const dataStates: { id: DataState; label: string }[] = [
  { id: 'populated', label: 'Populated' },
  { id: 'empty', label: 'Empty' },
  { id: 'loading', label: 'Loading' },
  { id: 'error', label: 'Error' },
]

export const roles: { id: Role; label: string }[] = [
  { id: 'owner', label: 'Owner' },
  { id: 'member', label: 'Member' },
]

export const connections: { id: Connection; label: string }[] = [
  { id: 'local', label: 'On the LAN' },
  { id: 'remote', label: 'Remote' },
  { id: 'offline', label: 'Unreachable' },
]

export const timeModes: { id: TimeMode; label: string }[] = [
  { id: 'play', label: 'Play' },
  { id: 'pause', label: 'Pause' },
  { id: 'fast', label: '10×' },
]

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
 * `?screen&data=empty&theme=oled&role=member&motion=reduced&text=200&time=pause&connection=remote`;
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
    data: pick('data', ['populated', 'empty', 'loading', 'error']) ?? base.data,
    theme: pick('theme', ['default', 'oled', 'high-contrast', 'harbor']) ?? base.theme,
    role: pick('role', ['owner', 'member']) ?? base.role,
    time: pick('time', ['play', 'pause', 'fast']) ?? base.time,
    connection: pick('connection', ['local', 'remote', 'offline']) ?? base.connection,
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
