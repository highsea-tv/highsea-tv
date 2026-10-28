// SPDX-License-Identifier: AGPL-3.0-only
// Personalization (ADR 0027, 0028): dashboard layouts with role defaults, preferences in layers,
// the home screen's rows, and Appearance (themes, sound packs, the server's mark). The widget
// kinds and sources mirror @highsea-tv/personalization's registry; a server test keeps them equal.
import { createRoute, z } from '@hono/zod-openapi'
import { ClientType } from './accounts.ts'
import { API_PREFIX, access, body, errors, IdParam, json, noContent } from './common.ts'
import { MinimumAvailability } from './movies.ts'

export const WIDGET_KINDS = [
  'network',
  'storage',
  'indexers',
  'subtitles',
  'upcoming',
  'announcement',
  'activity',
  'recently-added',
  'calendar',
  'system-health',
  'now-playing',
] as const

/** What a widget reads. Public info lists the ones this server has so far. */
export const WIDGET_SOURCES = [
  'system',
  'movies',
  'indexers',
  'downloads',
  'subtitles',
  'curation',
  'playback',
] as const

const THEME_ID = /^[a-z0-9][a-z0-9-]{0,39}$/

// ---------------------------------------------------------------- dashboard

export const WidgetPlacement = z
  .object({
    id: z.string().min(1).max(64).openapi({ example: 'w-network' }),
    kind: z.enum(WIDGET_KINDS),
    span: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
    /** Height in 84px rows. Out-of-range sizes are brought into the widget's range. */
    rows: z.number().int().min(1).max(12),
    /** The widget's own settings, by its schema; omitted ones take its defaults. */
    settings: z.record(z.string(), z.unknown()).optional(),
  })
  .openapi('WidgetPlacement')

const Widgets = z.array(WidgetPlacement).max(WIDGET_KINDS.length)

export const WidgetRole = z.enum(['owner', 'admin'])

export const WidgetLayout = z
  .object({
    scope: z.discriminatedUnion('kind', [
      z.object({ kind: z.literal('user'), userId: z.string() }),
      z.object({ kind: z.literal('role'), role: WidgetRole }),
    ]),
    widgets: z.array(WidgetPlacement),
    /** Null while nobody has saved it: the built-in default. */
    updatedAt: z.number().int().nullable(),
    /** True while the person sees their role's default. */
    inherited: z.boolean(),
  })
  .openapi('WidgetLayout')

export const RoleDefaultSaved = WidgetLayout.extend({
  /** Widgets left out because the role can't see them. */
  dropped: z.array(z.enum(WIDGET_KINDS)),
}).openapi('RoleDefaultSaved')

const RoleParam = z.object({
  role: WidgetRole.openapi({ param: { name: 'role', in: 'path' } }),
})

export const dashboard = {
  layout: createRoute({
    method: 'get',
    path: `${API_PREFIX}/me/dashboard`,
    tags: ['Dashboard'],
    summary: 'Your dashboard',
    description:
      'Your own layout, or your role’s default until you save one. Widgets your role can’t see are never returned.',
    ...access('staff'),
    responses: { 200: json(WidgetLayout, 'The layout'), ...errors('unauthorized') },
  }),
  saveLayout: createRoute({
    method: 'put',
    path: `${API_PREFIX}/me/dashboard`,
    tags: ['Dashboard'],
    summary: 'Save your dashboard',
    description: 'Order is the layout. A widget your role can’t see is refused (403).',
    ...access('staff'),
    request: { ...body(z.object({ widgets: Widgets })) },
    responses: {
      200: json(WidgetLayout, 'Saved'),
      ...errors('invalid', 'unauthorized', 'forbidden'),
    },
  }),
  resetLayout: createRoute({
    method: 'delete',
    path: `${API_PREFIX}/me/dashboard`,
    tags: ['Dashboard'],
    summary: 'Go back to your role’s default',
    description: 'Forgets your layout, so later changes to the default reach you.',
    ...access('staff'),
    responses: { 200: json(WidgetLayout, 'The role default'), ...errors('unauthorized') },
  }),
  roleDefault: createRoute({
    method: 'get',
    path: `${API_PREFIX}/dashboard/defaults/{role}`,
    tags: ['Dashboard'],
    summary: 'A role’s default dashboard',
    ...access('staff'),
    request: { params: RoleParam },
    responses: {
      200: json(WidgetLayout, 'The default'),
      ...errors('unauthorized', 'forbidden'),
    },
  }),
  saveRoleDefault: createRoute({
    method: 'put',
    path: `${API_PREFIX}/dashboard/defaults/{role}`,
    tags: ['Dashboard'],
    summary: 'Save a role’s default dashboard',
    description: 'Widgets the role can’t see are left out and listed in `dropped`.',
    ...access('owner'),
    request: { params: RoleParam, ...body(z.object({ widgets: Widgets })) },
    responses: {
      200: json(RoleDefaultSaved, 'Saved'),
      ...errors('invalid', 'unauthorized', 'forbidden'),
    },
  }),
}

// ---------------------------------------------------------------- preferences

/** The admin's add dialog remembers its last-used values here (movies.md › Decisions). */
export const AddMovieDefaults = z
  .strictObject({
    rootFolder: z.string().min(1).max(4096),
    qualityProfileId: z.string().min(1).max(64),
    languageProfileId: z.string().max(64).nullable().optional(),
    minimumAvailability: MinimumAvailability,
    searchNow: z.boolean(),
  })
  .openapi('AddMovieDefaults')

const PreferenceLayer = z
  .object({
    theme: z.string().regex(THEME_ID).optional(),
    sound: z.boolean().optional(),
    volume: z.number().min(0).max(1).optional(),
    'admin.addMovie.defaults': AddMovieDefaults.optional(),
  })
  .openapi('PreferenceLayer')

const LayerName = z.enum(['device', 'client', 'user', 'server'])

export const Preferences = z
  .object({
    /** What this device uses. */
    values: z.object({
      theme: z.string(),
      sound: z.boolean(),
      volume: z.number(),
      /** Null until the person has added a movie. */
      'admin.addMovie.defaults': AddMovieDefaults.nullable(),
    }),
    /** Which layer each value came from. */
    from: z.object({
      theme: LayerName,
      sound: LayerName,
      volume: LayerName,
      'admin.addMovie.defaults': LayerName,
    }),
    layers: z.object({ device: PreferenceLayer, client: PreferenceLayer, user: PreferenceLayer }),
    client: ClientType.nullable(),
    deviceId: z.string().nullable(),
  })
  .openapi('Preferences')

export const PreferencePatch = z
  .object({
    /** `device` is the calling device; `client` every app of one kind (`client` required). */
    layer: z.enum(['device', 'client', 'user']),
    client: ClientType.optional(),
    /** A value sets the key; null clears it so the next layer shows through. */
    values: z.strictObject({
      theme: z.string().regex(THEME_ID).nullable().optional(),
      sound: z.boolean().nullable().optional(),
      volume: z.number().min(0).max(1).nullable().optional(),
      'admin.addMovie.defaults': AddMovieDefaults.nullable().optional(),
    }),
  })
  .openapi('PreferencePatch')

export const preferences = {
  get: createRoute({
    method: 'get',
    path: `${API_PREFIX}/me/preferences`,
    tags: ['Preferences'],
    summary: 'This device’s preferences',
    description:
      'Resolved most specific first: this device, then every app of its kind, then you, then the server’s defaults.',
    ...access('user'),
    responses: { 200: json(Preferences, 'The preferences'), ...errors('unauthorized') },
  }),
  save: createRoute({
    method: 'patch',
    path: `${API_PREFIX}/me/preferences`,
    tags: ['Preferences'],
    summary: 'Change one layer of your preferences',
    ...access('user'),
    request: { ...body(PreferencePatch) },
    responses: {
      200: json(Preferences, 'The preferences now'),
      ...errors('invalid', 'unauthorized', 'forbidden'),
    },
  }),
  device: createRoute({
    method: 'get',
    path: `${API_PREFIX}/devices/{id}/preferences`,
    tags: ['Preferences'],
    summary: 'A device’s preferences',
    description: 'Why a device behaves as it does: its values and the layer each came from.',
    ...access('staff'),
    request: { params: IdParam },
    responses: {
      200: json(Preferences, 'The preferences'),
      ...errors('unauthorized', 'forbidden', 'not-found'),
    },
  }),
}

// ---------------------------------------------------------------- home

export const HomeLayout = z
  .object({
    order: z.array(z.string().max(64)).max(200),
    hidden: z.array(z.string().max(64)).max(200),
  })
  .openapi('HomeLayout')

export const HomeArrangement = HomeLayout.extend({
  /** The rows below the hero, in your order. Built-in rows have no title: apps name them by id. */
  rows: z.array(z.object({ id: z.string(), title: z.string().nullable() })),
}).openapi('HomeArrangement')

export const home = {
  layout: createRoute({
    method: 'get',
    path: `${API_PREFIX}/me/home`,
    tags: ['Home'],
    summary: 'How your home screen is arranged',
    ...access('user'),
    responses: { 200: json(HomeArrangement, 'The arrangement'), ...errors('unauthorized') },
  }),
  saveLayout: createRoute({
    method: 'put',
    path: `${API_PREFIX}/me/home`,
    tags: ['Home'],
    summary: 'Arrange your home screen',
    description: 'Row ids not offered yet are kept, so a row that goes live later keeps its place.',
    ...access('user'),
    request: { ...body(HomeLayout) },
    responses: {
      200: json(HomeArrangement, 'Saved'),
      ...errors('invalid', 'unauthorized'),
    },
  }),
}

// ---------------------------------------------------------------- appearance

const ThemeBase = z.enum(['default', 'oled', 'high-contrast'])

export const CustomTheme = z
  .object({
    id: z.string().regex(THEME_ID),
    name: z.string().min(1).max(40),
    base: ThemeBase,
    accent: z.string().max(60).openapi({ example: '#3d8bfd' }),
    /** Overrides for single color roles, checked by the same audit. */
    colors: z.record(z.string(), z.string().max(60)).optional(),
  })
  .openapi('CustomTheme')

export const ThemeInput = CustomTheme.omit({ id: true }).openapi('ThemeInput')

export const SoundDefaults = z
  .object({
    tv: z.boolean(),
    phone: z.boolean(),
    web: z.boolean(),
    volume: z.number().min(0).max(1),
    pack: z.string().max(40),
  })
  .openapi('SoundDefaults')

export const Branding = z
  .object({
    name: z.string(),
    accent: z.string().nullable(),
    customMark: z.boolean(),
    /** Where the mark is served, versioned by its content; null for the highsea mark. */
    mark: z.string().nullable().openapi({ example: '/api/v1/appearance/mark?v=3f2a9c01b7de' }),
  })
  .openapi('Branding')

export const Appearance = z
  .object({
    defaultTheme: z.string(),
    themes: z.array(CustomTheme),
    sound: SoundDefaults,
    packs: z.array(z.object({ id: z.string(), name: z.string(), builtIn: z.boolean() })),
    branding: Branding,
  })
  .openapi('Appearance')

export const AppearancePatch = z
  .object({
    name: z.string().max(200),
    /** Null lets each theme keep its own. */
    accent: z.string().max(60).nullable(),
    defaultTheme: z.string().regex(THEME_ID),
    sound: SoundDefaults,
  })
  .partial()
  .openapi('AppearancePatch')

/** 1 MB, base64-encoded: four characters for every three bytes. */
export const MARK_UPLOAD_MAX = Math.ceil(1_000_000 / 3) * 4

export const MarkUpload = z.object({ data: z.base64().max(MARK_UPLOAD_MAX) }).openapi('MarkUpload')

export const SoundPackSummary = z
  .object({ id: z.string(), name: z.string(), builtIn: z.boolean() })
  .openapi('SoundPackSummary')

/** A sound pack's recipe (@highsea-tv/tokens `SoundPack`), checked by the sound rules on upload. */
export const SoundPack = z
  .object({ id: z.string().regex(THEME_ID), name: z.string().min(1).max(40) })
  .catchall(z.unknown())
  .openapi('SoundPack')

const APPEARANCE = `${API_PREFIX}/appearance`

export const appearance = {
  get: createRoute({
    method: 'get',
    path: APPEARANCE,
    tags: ['Appearance'],
    summary: 'The server’s appearance',
    description: 'Everyone signed in reads it: clients start from its theme and sound defaults.',
    ...access('user'),
    responses: { 200: json(Appearance, 'The appearance'), ...errors('unauthorized') },
  }),
  save: createRoute({
    method: 'patch',
    path: APPEARANCE,
    tags: ['Appearance'],
    summary: 'Change the name, accent, default theme or sound defaults',
    ...access('staff'),
    request: { ...body(AppearancePatch) },
    responses: {
      200: json(Appearance, 'Saved'),
      ...errors('invalid', 'unauthorized', 'forbidden'),
    },
  }),
  saveTheme: createRoute({
    method: 'put',
    path: `${APPEARANCE}/themes/{id}`,
    tags: ['Appearance'],
    summary: 'Add or replace a theme',
    description: 'The theme must pass the contrast audit; the failing pairs come back otherwise.',
    ...access('staff'),
    request: { params: IdParam, ...body(ThemeInput) },
    responses: {
      200: json(CustomTheme, 'Saved'),
      ...errors('invalid', 'unauthorized', 'forbidden', 'conflict'),
    },
  }),
  deleteTheme: createRoute({
    method: 'delete',
    path: `${APPEARANCE}/themes/{id}`,
    tags: ['Appearance'],
    summary: 'Delete a theme',
    description: 'If it was the default, the default goes back to Abyss Neutral.',
    ...access('staff'),
    request: { params: IdParam },
    responses: { ...noContent, ...errors('unauthorized', 'forbidden', 'not-found') },
  }),
  mark: createRoute({
    method: 'get',
    path: `${APPEARANCE}/mark`,
    tags: ['Appearance'],
    summary: 'The server’s mark',
    description:
      'The SVG or PNG the owner uploaded, for an `<img>`. Anyone may read it: apps show it before signing in.',
    ...access('public'),
    responses: {
      200: {
        description: 'The mark',
        content: {
          'image/svg+xml': { schema: z.string().openapi({ format: 'binary' }) },
          'image/png': { schema: z.string().openapi({ format: 'binary' }) },
        },
      },
      304: { description: 'Not modified' },
      ...errors('not-found'),
    },
  }),
  uploadMark: createRoute({
    method: 'put',
    path: `${APPEARANCE}/mark`,
    tags: ['Appearance'],
    summary: 'Upload the server’s mark',
    description:
      'A square SVG or PNG, at least 256 px, at most 1 MB, base64-encoded. The type is read from the file itself.',
    ...access('staff'),
    request: { ...body(MarkUpload) },
    responses: {
      200: json(Branding, 'Saved'),
      ...errors('invalid', 'unauthorized', 'forbidden'),
    },
  }),
  removeMark: createRoute({
    method: 'delete',
    path: `${APPEARANCE}/mark`,
    tags: ['Appearance'],
    summary: 'Go back to the highsea mark',
    ...access('staff'),
    responses: { 200: json(Branding, 'Removed'), ...errors('unauthorized', 'forbidden') },
  }),
  soundPack: createRoute({
    method: 'get',
    path: `${APPEARANCE}/sound-packs/{id}`,
    tags: ['Appearance'],
    summary: 'A sound pack’s recipe',
    ...access('user'),
    request: { params: IdParam },
    responses: {
      200: json(SoundPack, 'The recipe'),
      ...errors('unauthorized', 'not-found'),
    },
  }),
  uploadSoundPack: createRoute({
    method: 'post',
    path: `${APPEARANCE}/sound-packs`,
    tags: ['Appearance'],
    summary: 'Add a sound pack',
    description:
      'It must meet the sound rules (length and loudness). Uploading a pack with the same id replaces it.',
    ...access('staff'),
    request: { ...body(SoundPack) },
    responses: {
      200: json(SoundPackSummary, 'Saved'),
      ...errors('invalid', 'unauthorized', 'forbidden', 'conflict'),
    },
  }),
  deleteSoundPack: createRoute({
    method: 'delete',
    path: `${APPEARANCE}/sound-packs/{id}`,
    tags: ['Appearance'],
    summary: 'Delete a sound pack',
    description: 'If it was the default, the default goes back to Felt and wood.',
    ...access('staff'),
    request: { params: IdParam },
    responses: { ...noContent, ...errors('unauthorized', 'forbidden', 'not-found', 'conflict') },
  }),
}

export type WidgetPlacement = z.infer<typeof WidgetPlacement>
export type WidgetLayout = z.infer<typeof WidgetLayout>
export type Preferences = z.infer<typeof Preferences>
export type AddMovieDefaults = z.infer<typeof AddMovieDefaults>
export type HomeArrangement = z.infer<typeof HomeArrangement>
export type Appearance = z.infer<typeof Appearance>
export type AppearancePatch = z.infer<typeof AppearancePatch>
export type CustomTheme = z.infer<typeof CustomTheme>
export type Branding = z.infer<typeof Branding>
export type SoundDefaults = z.infer<typeof SoundDefaults>
