// SPDX-License-Identifier: AGPL-3.0-only
// How a device looks and sounds (C7, client-settings.md): its theme, interface sounds and volume,
// kept on the server in ADR 0027's layers. A choice made on a device is its device layer; until
// then it follows the server's defaults. Use on all my devices (client-settings.md#use-on-all-my-devices)
// is the person's own theme in the user layer, which every device they're signed in on then takes
// over its own; turned off, each device has its own again.
//
// Playback (client-settings.md › Playback, apps-catch-up.md › A.3) is the person's own: the
// languages a film starts in, Next up and intros, and a quality cap at home and away, kept in the
// user layer so every device they're signed in on plays the same way. The server applies them
// when a film starts; Settings › Playback in the admin (how it transcodes) is separate.
import type { ClientType, Preferences } from '@highsea-tv/api-contract'
import { createT, defineMessages } from '@highsea-tv/i18n'
import { languageName } from '@highsea-tv/i18n/languages'
import { useAction, useQuery } from '@highsea-tv/sdk/react'
import {
  destinationMessages,
  forgetMessages,
  shellMessages,
  signInMessages,
} from '../gate/index.ts'

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
    save.run(layer, values).then(() => prefs.refresh())
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

/** The person's playback settings, as the apps' Settings › Playback shows them. */
export type PlaybackPrefs = {
  /** `original` plays the film's own language; otherwise a language code. */
  audio: string
  /** `off`, or a language code. */
  subtitles: string
  /** Subtitles only when the audio isn't in their language. */
  onlyForeign: boolean
  autoplayNext: boolean
  skipIntros: boolean
  /** `original`, or a cap in Mbit/s. */
  qualityHome: QualityCap
  qualityAway: QualityCap
}

export type QualityCap = Preferences['values']['playback.qualityHome']

/** Each setting's key in ADR 0027's layers. */
const PLAYBACK_KEYS = {
  audio: 'playback.audio',
  subtitles: 'playback.subtitles',
  onlyForeign: 'playback.onlyForeign',
  autoplayNext: 'playback.autoplayNext',
  skipIntros: 'playback.skipIntros',
  qualityHome: 'playback.qualityHome',
  qualityAway: 'playback.qualityAway',
} as const satisfies Record<keyof PlaybackPrefs, keyof Preferences['values']>

/** Reads the resolved values into the settings' shape. */
export function playbackPrefs(p: Preferences): PlaybackPrefs {
  const v = p.values
  return {
    audio: v['playback.audio'],
    subtitles: v['playback.subtitles'],
    onlyForeign: v['playback.onlyForeign'],
    autoplayNext: v['playback.autoplayNext'],
    skipIntros: v['playback.skipIntros'],
    qualityHome: v['playback.qualityHome'],
    qualityAway: v['playback.qualityAway'],
  }
}

/** A change to the settings as the user layer's patch. */
export function playbackPatch(patch: Partial<PlaybackPrefs>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(patch))
    if (v !== undefined) out[PLAYBACK_KEYS[k as keyof PlaybackPrefs]] = v
  return out
}

export function usePlaybackPrefs() {
  const prefs = useQuery('client:preferences', (c) => c.preferences.get(), [
    'preferences.updated',
    'settings.updated',
  ])
  const save = useAction((c, values: Record<string, unknown>) =>
    c.preferences.save({ body: { layer: 'user', values } }),
  )
  return {
    prefs,
    current: prefs.data ? playbackPrefs(prefs.data) : null,
    set: (patch: Partial<PlaybackPrefs>) =>
      save.run(playbackPatch(patch)).then(() => prefs.refresh()),
    pending: save.pending,
  }
}

export const playbackMessages = defineMessages({
  original: 'Original language',
  off: 'Off',
  qualityOriginal: 'Original',
  cap: '{mbps} Mbit/s',
  capLong: '{mbps} Mbit/s · {height}p',
})

/** The languages Settings › Playback offers, as the prototype lists them. */
export const PLAYBACK_LANGUAGES = ['en', 'de', 'fr', 'es', 'ja'] as const

/** The caps, highest first, with the picture each allows (`capOf` in the server's keys). */
export const QUALITY_CAPS: readonly { value: QualityCap; height: number | null }[] = [
  { value: 'original', height: null },
  { value: '20', height: 1080 },
  { value: '8', height: 1080 },
  { value: '4', height: 720 },
  { value: '2', height: 480 },
]

export type PlaybackOption<V extends string = string> = { value: V; label: string; short?: string }

/** Settings › Playback's choices with their words, in the person's language. */
export function playbackOptions(locale = 'en') {
  const t = createT(playbackMessages, locale)
  // From the names catalog, not Intl.DisplayNames, which Hermes lacks (packages/i18n/src/languages.ts)
  const languages = PLAYBACK_LANGUAGES.map((code) => ({ value: code, label: languageName(code) }))
  return {
    audio: [
      { value: 'original', label: t('original'), short: t('qualityOriginal') },
      ...languages,
    ] as PlaybackOption[],
    subtitles: [{ value: 'off', label: t('off') }, ...languages] as PlaybackOption[],
    quality: QUALITY_CAPS.map(({ value, height }) =>
      value === 'original'
        ? { value, label: t('qualityOriginal'), short: t('qualityOriginal') }
        : {
            value,
            label: t('capLong', { mbps: value, height: height ?? 0 }),
            short: t('cap', { mbps: value }),
          },
    ) as PlaybackOption<QualityCap>[],
  }
}

export const settingsMessages = defineMessages({
  appearance: 'Theme',
  appearanceHint: 'How this device looks.',
  sounds: 'Sounds',
  soundsHint: 'Interface sounds on this device.',
  playback: 'Playback',
  playbackHint: 'Languages, what plays next, and quality, on every device.',
  home: 'Home screen',
  homeHint: 'Reorder and hide rows, on every device.',
  servers: signInMessages.servers,
  serversHint: 'The servers you use, and signing out.',
  devices: 'Your devices',
  devicesHint: 'Where you’re signed in.',
  about: 'About',
  aboutHint: 'Versions and licences.',
})

/**
 * Settings' words (C7, client-settings.md), every app's: what each section says and asks. The
 * device it's on is `device`, `phone`, `tv` or `web`, where the words name it.
 */
export const settingsPageMessages = defineMessages({
  settings: destinationMessages.settings,
  sections: 'Settings sections',
  signOut: 'Sign out of {name}',
  signOutFailed: 'Couldn’t sign out. Try again.',
  signedOut: 'Signed out of {name}',
  signedOutBody: 'Your downloads stay on this device.',
  signOutAsk: 'Sign out of {name}?',
  signOutBody:
    '{device, select, phone {Your downloads stay on this phone. You can sign in again later.} tv {Every profile on this TV signs out. You can sign in again with a code.} other {Your downloads stay on this device. You can sign in again later.}}',
  audioLanguage: 'Audio language',
  audioLanguageHint: 'What a film starts in, when it has it.',
  subtitleLanguage: 'Subtitle language',
  onlyForeign: 'Only when the audio isn’t in my language',
  onlyForeignHint: 'Subtitles stay off when you understand what’s said.',
  qualityHome: 'Quality at home',
  qualityHomeHint: 'On the same network as the server.',
  qualityAway: 'Quality away from home',
  qualityAwayHint: 'Lower uses less data and starts sooner.',
  playbackFollows:
    'These follow you to every device you’re signed in on. A film’s own choices win over them.',
  missingTitle: 'There’s no setting here',
  missingBody: 'It may have moved.',
  loading: 'Loading…',
  failed: 'Couldn’t load this. {message}',
  saveFailed: 'Couldn’t save that. {message}',
  themeDevice: 'Only this device changes. Everyone else keeps their own.',
  themeEverywhere: 'All your devices change. Everyone else keeps their own.',
  serverDefault: '{name}’s default',
  builtIn: 'Built in',
  fromServer: 'From {name}',
  everywhere: 'Use on all my devices',
  everywhereOff: 'Off: each device keeps its own theme.',
  everywhereOn:
    'Your phone, TV and computers use this theme too. Turn it off and each keeps it until you change it there.',
  sounds: 'Interface sounds',
  followingOn:
    'Following {name}: on for {device, select, tv {the TV} web {the web} other {the phone}}.',
  followingOff:
    'Following {name}: off for {device, select, tv {the TV} web {the web} other {the phone}}.',
  setHere: 'Set on this device.',
  followAgain: 'Follow {name} again',
  homeIntro: 'The featured hero stays on top. Your order follows you to every device.',
  serverOrder: 'Use the server’s order',
  showRow: 'Show {title}',
  moveUp: 'Move {title} up',
  moveDown: 'Move {title} down',
  moveRow: 'Move {title}',
  moved: '{title} moved to {index} of {count}',
  homeRows: 'Home rows',
  'row.continue': 'Continue watching',
  'row.recent': 'Recently added',
  inUse: 'In use',
  onNetwork: 'On this network · {address}',
  remotely: 'Connected remotely · {address}',
  unreachable: 'Can’t reach it right now',
  signInServer: signInMessages.signIn,
  switchServer: 'Switch',
  serversList: settingsMessages.servers,
  addServer: shellMessages.addServer,
  devicesList: settingsMessages.devices,
  knownSignedIn: 'Signed in · last used {when}',
  knownSignedOut: 'Signed out · last used {when}',
  signInTv: 'Sign in a TV',
  thisDevice: 'This device',
  lastUsed: 'Last used {when}',
  signOutDevice: 'Sign out {name}',
  signOutDeviceAsk: 'Sign out {name}?',
  signOutDeviceBody: 'It needs a code or password to come back.',
  signOutShort: 'Sign out',
  deviceSignedOut: '{name} is signed out',
  cancel: forgetMessages.cancel,
  thisApp: 'This app',
  appVersion: 'highsea {version}{os, select, none {} other { for {os}}}',
  server: 'Server',
  licence: 'Licence',
  free: 'AGPL-3.0, free software',
  serversNote: 'Each server keeps its own sign-in. Signing out of one leaves the others alone.',
  getApps: 'Get the apps',
  licences: 'Open-source licences',
  diagnostics: 'Send diagnostics',
  soon: 'Not in this version yet.',
})

/**
 * Settings' words that only the TV says, where the remote's keys stand in for the phone's and the
 * web's controls: the playback rows' short names, Up and Down to move a home row, and the theme's
 * and sounds' buttons, which say their state as the prototype's tv/settings.tsx does.
 */
export const tvSettingsMessages = defineMessages({
  audio: 'Audio',
  subtitles: 'Subtitles',
  atHome: 'At home',
  away: 'Away',
  homeIntro:
    'OK shows or hides a row. Up and Down on Move change its place. It follows you to every device.',
  up: 'Up',
  down: 'Down',
  everywhereOff: 'Use on all my devices: Off',
  everywhereOn: 'Use on all my devices: On',
  onlyThisTv: 'Only this TV changes.',
  everywhereTv: 'Your phone and computers use this theme too.',
  soundsOff: 'Interface sounds: Off',
  soundsOn: 'Interface sounds: On',
})

/** Where highsea's source code is: About's link in the apps that still have one. */
export const SOURCE = 'https://github.com/highsea-tv/highsea-tv'

/** A device's icon in @highsea-tv/ui's set, by its kind of app, as Settings › Devices lists it. */
export const deviceIcon = (c: ClientType) =>
  c === 'ios' || c === 'android'
    ? ('phone' as const)
    : c === 'tvos' || c === 'androidtv' || c === 'webos' || c === 'tizen'
      ? ('tv' as const)
      : ('laptop' as const)

/** Settings' sections (C7, client-settings.md), the same in every app and in this order. */
export const SETTINGS_SECTIONS = [
  'appearance',
  'sounds',
  'playback',
  'home',
  'servers',
  'devices',
  'about',
] as const
export type SettingsSectionId = (typeof SETTINGS_SECTIONS)[number]

/** Each section's icon in @highsea-tv/ui's set. */
const SECTION_ICONS = {
  appearance: 'palette',
  sounds: 'sound',
  playback: 'play',
  home: 'home',
  servers: 'server',
  devices: 'phone',
  about: 'info',
} as const satisfies Record<SettingsSectionId, string>

/** The sections with their names, icons and hints, in the person's language. */
export function settingsSections(locale = 'en') {
  const t = createT(settingsMessages, locale)
  return SETTINGS_SECTIONS.map((id) => ({
    id,
    label: t(id),
    icon: SECTION_ICONS[id],
    hint: t(`${id}Hint`),
  }))
}
