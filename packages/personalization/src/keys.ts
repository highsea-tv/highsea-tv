// SPDX-License-Identifier: AGPL-3.0-only
// The preference keys (ADR 0027): a typed list, each a zod schema. An unknown key is refused, never
// stored. Layers resolve most specific first: device, then client type, then user, then the
// server's defaults from Appearance. Browser-safe: clients import it as `/keys`.
import { defaultSoundPack } from '@highsea-tv/tokens'
import { z } from 'zod'

/** The sound pack every server has (appearance.ts), "felt and wood" (docs/brand/direction.md#sound). */
export const BUILT_IN_PACK = { id: defaultSoundPack.id, name: 'Felt and wood' } as const

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

/** A language as the apps name it: ISO 639-1 or 639-2, lower case. */
const LANGUAGE = /^[a-z]{2,3}$/

/**
 * A cap on what the server sends one person (client-settings.md › Playback): the original, or a
 * bitrate in Mbit/s. The server's own limit for remote streams still applies under it.
 */
export const QUALITY_CAPS = ['original', '20', '8', '4', '2'] as const
export type QualityCap = (typeof QUALITY_CAPS)[number]

export const preferenceSchemas = {
  theme: z.string().regex(THEME_ID),
  /** Interface sounds on this device. */
  sound: z.boolean(),
  /** 0–1. */
  volume: z.number().min(0).max(1),
  'admin.addMovie.defaults': addMovieDefaults,
  /** The audio a film starts in: `original`, its own language, or a language code. */
  'playback.audio': z.union([z.literal('original'), z.string().regex(LANGUAGE)]),
  /** Subtitles a film starts with: `off`, or a language code. */
  'playback.subtitles': z.union([z.literal('off'), z.string().regex(LANGUAGE)]),
  /** Subtitles only when the audio isn't in their language. */
  'playback.onlyForeign': z.boolean(),
  /** Next up plays by itself when its count ends. */
  'playback.autoplayNext': z.boolean(),
  /** Skip intro is pressed by itself. */
  'playback.skipIntros': z.boolean(),
  'playback.qualityHome': z.enum(QUALITY_CAPS),
  'playback.qualityAway': z.enum(QUALITY_CAPS),
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
  'playback.audio': preferenceSchemas['playback.audio'].optional(),
  'playback.subtitles': preferenceSchemas['playback.subtitles'].optional(),
  'playback.onlyForeign': preferenceSchemas['playback.onlyForeign'].optional(),
  'playback.autoplayNext': preferenceSchemas['playback.autoplayNext'].optional(),
  'playback.skipIntros': preferenceSchemas['playback.skipIntros'].optional(),
  'playback.qualityHome': preferenceSchemas['playback.qualityHome'].optional(),
  'playback.qualityAway': preferenceSchemas['playback.qualityAway'].optional(),
})
export type PreferenceLayer = z.output<typeof preferenceLayer>

/** A change to a layer: a value sets the key, `null` clears it so the next layer shows through. */
export const preferencePatch = z.strictObject({
  theme: preferenceSchemas.theme.nullable().optional(),
  sound: preferenceSchemas.sound.nullable().optional(),
  volume: preferenceSchemas.volume.nullable().optional(),
  'admin.addMovie.defaults': addMovieDefaults.nullable().optional(),
  'playback.audio': preferenceSchemas['playback.audio'].nullable().optional(),
  'playback.subtitles': preferenceSchemas['playback.subtitles'].nullable().optional(),
  'playback.onlyForeign': preferenceSchemas['playback.onlyForeign'].nullable().optional(),
  'playback.autoplayNext': preferenceSchemas['playback.autoplayNext'].nullable().optional(),
  'playback.skipIntros': preferenceSchemas['playback.skipIntros'].nullable().optional(),
  'playback.qualityHome': preferenceSchemas['playback.qualityHome'].nullable().optional(),
  'playback.qualityAway': preferenceSchemas['playback.qualityAway'].nullable().optional(),
})
export type PreferencePatch = z.output<typeof preferencePatch>

/** The playback keys' defaults until a layer sets them (client-settings.md › Playback). */
export const PLAYBACK_DEFAULTS = {
  'playback.audio': 'original',
  'playback.subtitles': 'off',
  'playback.onlyForeign': true,
  'playback.autoplayNext': true,
  'playback.skipIntros': false,
  'playback.qualityHome': 'original',
  'playback.qualityAway': 'original',
} as const satisfies Partial<Preferences>

/** Height and bitrate under a person's cap, to lay under the server's own (ADR 0052). */
export function capOf(cap: QualityCap): { bitrate: number; height: number } | null {
  if (cap === 'original') return null
  const mbps = Number(cap)
  return { bitrate: mbps * 1_000_000, height: mbps <= 2 ? 480 : mbps <= 4 ? 720 : 1080 }
}

export const LAYERS = ['device', 'client', 'user', 'server'] as const
export type Layer = (typeof LAYERS)[number]

/** The kinds of app with their own sound default (sound.md › Defaults). */
export type AppKind = 'tv' | 'phone' | 'web'

const TV = new Set(['tvos', 'androidtv', 'webos', 'tizen'])
const PHONE = new Set(['ios', 'android'])

/** TVs, phones and tablets, or the web and desktop (the admin included). */
export const appKind = (client: string | null): AppKind =>
  client && TV.has(client) ? 'tv' : client && PHONE.has(client) ? 'phone' : 'web'

// ---------------------------------------------------------------- resolving

/** The layers a person or an app changes, most specific first. */
export const EDITABLE_LAYERS = ['device', 'client', 'user'] as const
export type EditableLayer = (typeof EDITABLE_LAYERS)[number]
export type PreferenceLayers = Record<EditableLayer, PreferenceLayer>

/** The scope a layer is stored under: `user`, `client:tvos`, `device:{id}`. */
export const scopeFor = (layer: EditableLayer, target?: string) =>
  layer === 'user' ? 'user' : `${layer}:${target}`

/** The server's defaults for one kind of app, from Appearance's theme and sounds. */
export const serverPreferences = (
  appearance: { defaultTheme: string; sound: Record<AppKind, boolean> & { volume: number } },
  client: string | null,
): Preferences => ({
  theme: appearance.defaultTheme,
  sound: appearance.sound[appKind(client)],
  volume: appearance.sound.volume,
  'admin.addMovie.defaults': null,
  ...PLAYBACK_DEFAULTS,
})

/**
 * Each key from the most specific layer that sets it, or the server's default. `usable` passes a
 * value over when it no longer works (a theme deleted since), so the next layer shows through.
 */
export function resolveLayers(
  server: Preferences,
  layers: PreferenceLayers,
  usable: (key: PreferenceKey, value: unknown) => boolean,
): { values: Preferences; from: Record<PreferenceKey, Layer> } {
  const values = { ...server }
  const from = Object.fromEntries(PREFERENCE_KEYS.map((k) => [k, 'server'])) as Record<
    PreferenceKey,
    Layer
  >
  for (const key of PREFERENCE_KEYS)
    for (const layer of EDITABLE_LAYERS) {
      const value = layers[layer][key]
      if (value !== undefined && usable(key, value)) {
        ;(values as Record<string, unknown>)[key] = value
        from[key] = layer
        break
      }
    }
  return { values, from }
}

/** A layer with a change applied: a value sets its key, `null` clears it. */
export function patchLayer(layer: PreferenceLayer, patch: PreferencePatch): PreferenceLayer {
  const next: Record<string, unknown> = { ...layer }
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue
    if (v === null) delete next[k]
    else next[k] = v
  }
  return next as PreferenceLayer
}
