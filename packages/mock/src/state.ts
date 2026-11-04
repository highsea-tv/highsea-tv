// SPDX-License-Identifier: AGPL-3.0-only
// The prototype toolbar's state, its shape and defaults: the chrome (toolbar and frame) owns it and
// persists it (design/prototypes/src/proto/state.ts), the screen inside the frame receives it over
// postMessage, and the mock and its transport answer by it.
import type { StreamState } from '@highsea-tv/client/player'

// Each list of values is here once, as an array, with its type from it: the frame channel checks
// messages against them (./frame.ts), and the toolbar labels them and reads them from the address
// (design/prototypes/src/proto/state.ts).
export const PLATFORMS = ['admin', 'web', 'mobile', 'tv'] as const
export type Platform = (typeof PLATFORMS)[number]
export const DATA_STATES = ['populated', 'empty', 'loading', 'error'] as const
export type DataState = (typeof DATA_STATES)[number]
export type Width = 'fluid' | 1440 | 1024 | 768 | 390
export const THEMES = ['default', 'oled', 'high-contrast', 'harbor'] as const
export type ThemeId = (typeof THEMES)[number]
/** Who's signed in: the owner, an admin, or a user (whom the admin sends to the web client). */
export const ROLES = ['owner', 'admin', 'user'] as const
export type Role = (typeof ROLES)[number]
export const TIMES = ['play', 'pause', 'fast'] as const
export type TimeMode = (typeof TIMES)[number]
/** How a client reaches its server (connectivity.md): on the LAN, failed over to remote, or not. */
export const CONNECTIONS = ['local', 'remote', 'offline'] as const
export type Connection = (typeof CONNECTIONS)[number]
/**
 * The player's stream (player.md#states, checkpoint 4.0b): as it should be, a first transcode
 * getting ready, buffering, failed, stopped from Now playing, or at the film's end with Next up.
 */
/** The web platform as a browser, or inside the desktop app (Tauri), which keeps downloads (C8). */
export type WebApp = 'browser' | 'desktop'
/** The desktop app's computer (checkpoint 4.4a): its window chrome and folders differ by OS. */
export type DesktopOs = 'mac' | 'windows' | 'linux'
/** The desktop app's own update: none waiting, or downloaded and ready for a restart. */
export type AppUpdate = 'none' | 'ready'
/**
 * The local network permission (Apple TN3179) for the desktop app on macOS and the phone app on
 * iOS: granted, asking, refused.
 */
export const LANS = ['allowed', 'asking', 'refused'] as const
export type LocalNetwork = (typeof LANS)[number]
/** The phone's player sent to an AirPlay screen (checkpoint 4.5a), or playing on the phone. */
export const AIRPLAYS = ['off', 'on'] as const
export type AirPlay = (typeof AIRPLAYS)[number]
/** The player's stream states, as `@highsea-tv/client/player`'s StreamState lists them. */
export const STREAMS = [
  'normal',
  'preparing',
  'buffering',
  'failed',
  'stopped',
  'next-up',
] as const satisfies readonly StreamState[]
/** Downloads on the phone: built (4.6), or not yet, as the app has them until then (4.5a). */
export type PhoneDownloads = 'built' | 'later'
/**
 * The music player (the universal player): nothing playing, or a song from Sintel's score playing
 * from wherever the screen is, so every page can be reviewed with the bar showing.
 */
export type MusicState = 'none' | 'playing'

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
  stream: StreamState
  app: WebApp
  os: DesktopOs
  update: AppUpdate
  lan: LocalNetwork
  airplay: AirPlay
  downloads: PhoneDownloads
  music: MusicState
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
  stream: 'normal',
  app: 'browser',
  os: 'mac',
  update: 'none',
  lan: 'allowed',
  airplay: 'off',
  downloads: 'built',
  music: 'none',
  preview: false,
}
