// SPDX-License-Identifier: AGPL-3.0-only
// The preference keys (ADR 0027): a typed list, each a zod schema. An unknown key is refused, never
// stored. Layers resolve most specific first: device, then client type, then user, then the
// server's defaults from Appearance. Browser-safe: clients import it as `/keys`.
import { z } from 'zod'

/** A theme id: a built-in one (`default`, `oled`, `high-contrast`) or one of the server's. */
export const THEME_ID = /^[a-z0-9][a-z0-9-]{0,39}$/

export const preferenceSchemas = {
  theme: z.string().regex(THEME_ID),
  /** Interface sounds on this device. */
  sound: z.boolean(),
  /** 0–1. */
  volume: z.number().min(0).max(1),
} as const

export type PreferenceKey = keyof typeof preferenceSchemas
export const PREFERENCE_KEYS = Object.keys(preferenceSchemas) as PreferenceKey[]

export type Preferences = { [K in PreferenceKey]: z.output<(typeof preferenceSchemas)[K]> }

/** A layer's values: any of the keys. */
export const preferenceLayer = z.strictObject({
  theme: preferenceSchemas.theme.optional(),
  sound: preferenceSchemas.sound.optional(),
  volume: preferenceSchemas.volume.optional(),
})
export type PreferenceLayer = z.output<typeof preferenceLayer>

/** A change to a layer: a value sets the key, `null` clears it so the next layer shows through. */
export const preferencePatch = z.strictObject({
  theme: preferenceSchemas.theme.nullable().optional(),
  sound: preferenceSchemas.sound.nullable().optional(),
  volume: preferenceSchemas.volume.nullable().optional(),
})
export type PreferencePatch = z.output<typeof preferencePatch>

export const LAYERS = ['device', 'client', 'user', 'server'] as const
export type Layer = (typeof LAYERS)[number]

/** The kinds of app with their own sound default (sound.md › Defaults). */
export type AppKind = 'tv' | 'phone' | 'web'

const TV = new Set(['tvos', 'androidtv', 'webos', 'tizen'])
const PHONE = new Set(['ios', 'android'])

/** TVs, phones and tablets, or the web and desktop (the admin included). */
export const appKind = (client: string | null): AppKind =>
  client && TV.has(client) ? 'tv' : client && PHONE.has(client) ? 'phone' : 'web'
