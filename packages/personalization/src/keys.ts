// SPDX-License-Identifier: AGPL-3.0-only
// The preference keys (ADR 0027): a typed list, each a zod schema. An unknown key is refused, never
// stored. Layers resolve most specific first: device, then client type, then user, then the
// server's defaults from Appearance. Browser-safe: clients import it as `/keys`.
import { z } from 'zod'

/** A theme id: a built-in one (`default`, `oled`, `high-contrast`) or one of the server's. */
export const THEME_ID = /^[a-z0-9][a-z0-9-]{0,39}$/

/**
 * The add dialog's last-used values (movies.md › Decisions: "the product should remember the
 * last-used values"), saved on the person's layer each time they add a movie.
 */
export const addMovieDefaults = z.strictObject({
  rootFolder: z.string().min(1).max(4096),
  qualityProfileId: z.string().min(1).max(64),
  languageProfileId: z.string().max(64).nullable().optional(),
  minimumAvailability: z.enum(['announced', 'in-cinemas', 'released']),
  searchNow: z.boolean(),
})
export type AddMovieDefaults = z.output<typeof addMovieDefaults>

export const preferenceSchemas = {
  theme: z.string().regex(THEME_ID),
  /** Interface sounds on this device. */
  sound: z.boolean(),
  /** 0–1. */
  volume: z.number().min(0).max(1),
  'admin.addMovie.defaults': addMovieDefaults,
} as const

export type PreferenceKey = keyof typeof preferenceSchemas
export const PREFERENCE_KEYS = Object.keys(preferenceSchemas) as PreferenceKey[]

/** Keys the server has no default for: they resolve to null until a layer sets them. */
type NoDefault = 'admin.addMovie.defaults'

export type Preferences = {
  [K in PreferenceKey]:
    | z.output<(typeof preferenceSchemas)[K]>
    | (K extends NoDefault ? null : never)
}

/** A layer's values: any of the keys. */
export const preferenceLayer = z.strictObject({
  theme: preferenceSchemas.theme.optional(),
  sound: preferenceSchemas.sound.optional(),
  volume: preferenceSchemas.volume.optional(),
  'admin.addMovie.defaults': addMovieDefaults.optional(),
})
export type PreferenceLayer = z.output<typeof preferenceLayer>

/** A change to a layer: a value sets the key, `null` clears it so the next layer shows through. */
export const preferencePatch = z.strictObject({
  theme: preferenceSchemas.theme.nullable().optional(),
  sound: preferenceSchemas.sound.nullable().optional(),
  volume: preferenceSchemas.volume.nullable().optional(),
  'admin.addMovie.defaults': addMovieDefaults.nullable().optional(),
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
