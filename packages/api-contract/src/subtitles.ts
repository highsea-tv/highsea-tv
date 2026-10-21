// SPDX-License-Identifier: AGPL-3.0-only
// Subtitles (docs/product/subtitles.md, checkpoint 7a): the wanted list, a movie's tracks, search
// and Use, the providers and their accounts, language profiles and the settings. All staff's,
// except saving and testing a provider's account, which holds the owner's own credentials with a
// third party (checkpoint 7's plan, "API"). The sync and the offset arrive with 7b.
import { createRoute, z } from '@hono/zod-openapi'
import {
  API_PREFIX,
  access,
  body,
  errors,
  IdParam,
  IsoDate,
  json,
  noContent,
  TmdbIdParam,
} from './common.ts'
import { LanguageProfile } from './quality.ts'

export const SUBTITLE_PROVIDERS = ['opensubtitles', 'subdl', 'subsource'] as const
export const SYNC_STATUSES = [
  'synced',
  'syncing',
  'queued',
  'unsynced',
  'failed',
  'not-needed',
] as const
export const THROTTLE_REASONS = ['rate-limited', 'quota', 'auth', 'unavailable'] as const
export const SUBTITLE_MATCHES = [
  'hash',
  'title',
  'year',
  'source',
  'edition',
  'releaseGroup',
  'resolution',
  'videoCodec',
  'audioCodec',
  'streamingService',
  'hearingImpaired',
] as const

/**
 * Subtitle events (checkpoint 7): `subtitles.updated`, with `movie:{tmdbId}` ids where one title
 * changed and none for the providers, profiles or settings. Tracks coming and going also announce
 * `item.updated` and `history.updated`.
 */
export const SUBTITLE_TOPICS = { subtitles: 'subtitles.updated' } as const

export const SubtitleStats = z
  .object({
    /** Synced since midnight, the server's UTC day. */
    syncedToday: z.number().int(),
    /** Tracks waiting to sync. */
    waiting: z.number().int(),
    avgOffsetMs: z.number().int(),
    avgConfidence: z.number(),
  })
  .openapi('SubtitleStats')

export const WantedSubtitles = z
  .object({
    movie: z.object({
      id: z.number().int(),
      title: z.string(),
      year: z.number().int().nullable(),
      path: z.string(),
    }),
    /** The profile's codes still missing, in the profile's order. */
    missingLanguages: z.array(z.string()),
  })
  .openapi('WantedSubtitles')

export const WantedSubtitlesPage = z
  .object({
    items: z.array(WantedSubtitles),
    next: z.string().nullable(),
    /** Movies wanting something, on every page. */
    total: z.number().int(),
  })
  .openapi('WantedSubtitlesPage')

export const SubtitleTrack = z
  .object({
    id: z.string(),
    /** The movie's TMDB id. */
    itemId: z.number().int(),
    fileId: z.string(),
    language: z.string().openapi({ example: 'en' }),
    /** Embedded streams come from `movies.files`. */
    kind: z.enum(['external', 'bundled']),
    format: z.string().openapi({ example: 'srt' }),
    forced: z.boolean(),
    hi: z.boolean(),
    /** The provider's name; null for a bundled track. */
    provider: z.string().nullable(),
    releaseName: z.string().nullable(),
    /** 0–100: a hash match scores 99, a bundled track 100. */
    score: z.number().int().nullable(),
    matches: z.array(z.string()),
    /** Chosen with Use: never upgraded. */
    chosen: z.boolean(),
    sync: z.object({
      status: z.enum(SYNC_STATUSES),
      confidence: z.number().nullable(),
      offsetMs: z.number().int(),
    }),
    path: z.string(),
    addedAt: IsoDate,
  })
  .openapi('SubtitleTrack')

export const SubtitleSearchResult = z
  .object({
    /** Its id in the server's cache, for Use; good for 30 minutes. */
    id: z.string(),
    language: z.string(),
    releaseName: z.string(),
    provider: z.string(),
    score: z.number().int(),
    matches: z.array(z.enum(SUBTITLE_MATCHES)),
    forced: z.boolean(),
    hi: z.boolean(),
    format: z.string().nullable(),
    /** The line the provider's terms ask for where its subtitles are picked. */
    attribution: z.string().nullable(),
  })
  .openapi('SubtitleSearchResult')

export const SubtitleProvider = z
  .object({
    id: z.enum(SUBTITLE_PROVIDERS),
    name: z.string(),
    url: z.string(),
    enabled: z.boolean(),
    requiresAuth: z.boolean(),
    /** The username or a masked key; null until an account is added. */
    account: z.string().nullable(),
    /** Downloads (OpenSubtitles.com) or requests left today; null when unknown. */
    rateLimitRemaining: z.number().int().nullable(),
    rateLimitMax: z.number().int().nullable(),
    throttledUntil: IsoDate.nullable(),
    throttleReason: z.enum(THROTTLE_REASONS).nullable(),
    /** What the Edit dialog asks for. A secret's value is never returned. */
    fields: z.array(
      z.object({
        key: z.enum(['username', 'password', 'apiKey']),
        secret: z.boolean(),
        set: z.boolean(),
        value: z.string().nullable(),
      }),
    ),
    attribution: z.string().nullable(),
    /** Why it can't be used in this build, or null. */
    unavailable: z.string().nullable(),
  })
  .openapi('SubtitleProvider')

/** A blank secret keeps the stored one. */
export const SubtitleProviderCredentials = z
  .object({
    username: z.string().max(200).optional(),
    password: z.string().max(500).optional(),
    apiKey: z.string().max(500).optional(),
  })
  .openapi('SubtitleProviderCredentials')

export const SubtitleProviderTest = z
  .object({ ok: z.boolean(), message: z.string(), account: z.string().nullable() })
  .openapi('SubtitleProviderTest')

export const SubtitleSettings = z
  .object({
    /** Never download below this score, 0–100. Profiles can raise it. */
    minScore: z.number().int().min(0).max(100),
    /** Sync every download to the audio (7b). */
    autoSync: z.boolean(),
    /** Below this, keep the original timing and mark it for review, 0–1 (7b). */
    minConfidence: z.number().min(0).max(1),
    /** Look for a better match for this many days after a download. */
    upgradeDays: z.number().int().min(0).max(365),
    preferReleaseMatch: z.boolean(),
  })
  .openapi('SubtitleSettings')

export const Language = z
  .object({ code: z.string().openapi({ example: 'pt-BR' }), name: z.string() })
  .openapi('Language')

const LanguageProfileInput = LanguageProfile.omit({ id: true }).openapi('LanguageProfileInput')

const SUBS = `${API_PREFIX}/subtitles`
const MOVIE_SUBS = `${API_PREFIX}/movies/{id}/subtitles`
const ProviderParam = z.object({
  id: z.enum(SUBTITLE_PROVIDERS).openapi({ param: { name: 'id', in: 'path' } }),
})

export const subtitles = {
  stats: createRoute({
    method: 'get',
    path: `${SUBS}/stats`,
    tags: ['Subtitles'],
    summary: 'Synced today, waiting, and the day’s average offset and confidence',
    ...access('staff'),
    responses: { 200: json(SubtitleStats, 'The stats'), ...errors('unauthorized', 'forbidden') },
  }),
  wanted: createRoute({
    method: 'get',
    path: `${SUBS}/wanted`,
    tags: ['Subtitles'],
    summary: 'Movies missing a language their profile asks for',
    description: 'Cursor-paged by sort title, 50 to a page.',
    ...access('staff'),
    request: {
      query: z.object({
        cursor: z.string().max(500).optional(),
        limit: z.coerce.number<number>().int().min(1).max(200).optional(),
      }),
    },
    responses: {
      200: json(WantedSubtitlesPage, 'A page'),
      ...errors('invalid', 'unauthorized', 'forbidden'),
    },
  }),
  searchAllMissing: createRoute({
    method: 'post',
    path: `${SUBS}/wanted/search`,
    tags: ['Subtitles'],
    summary: 'Search for every movie on the wanted list',
    description: 'Queues a search per file and answers at once.',
    ...access('staff'),
    responses: {
      200: json(z.object({ queued: z.number().int() }), 'Searches queued'),
      ...errors('unauthorized', 'forbidden'),
    },
  }),
  forItem: createRoute({
    method: 'get',
    path: MOVIE_SUBS,
    tags: ['Subtitles'],
    summary: 'A movie’s external and bundled tracks',
    ...access('staff'),
    request: { params: TmdbIdParam },
    responses: {
      200: json(z.array(SubtitleTrack), 'Tracks'),
      ...errors('unauthorized', 'forbidden', 'not-found'),
    },
  }),
  search: createRoute({
    method: 'post',
    path: `${MOVIE_SUBS}/search`,
    tags: ['Subtitles'],
    summary: 'Ask the providers for a language now',
    description:
      'A POST, because it spends provider requests. Results are kept for 30 minutes for Use. 409 `no-providers` when none is on; 503 `providers-failed` when none answered.',
    ...access('staff'),
    request: {
      params: TmdbIdParam,
      ...body(z.object({ language: z.string().max(10), fileId: z.string().max(100).optional() })),
    },
    responses: {
      200: json(z.array(SubtitleSearchResult), 'Results, best first'),
      ...errors(
        'invalid',
        'unauthorized',
        'forbidden',
        'not-found',
        'conflict',
        'rate-limited',
        'unavailable',
      ),
    },
  }),
  download: createRoute({
    method: 'post',
    path: MOVIE_SUBS,
    tags: ['Subtitles'],
    summary: 'Use a search result: download it and keep it',
    description: '404 `result-expired` when the result is older than 30 minutes.',
    ...access('staff'),
    request: { params: TmdbIdParam, ...body(z.object({ resultId: z.string().max(100) })) },
    responses: {
      200: json(SubtitleTrack, 'The track'),
      ...errors('invalid', 'unauthorized', 'forbidden', 'not-found', 'rate-limited', 'unavailable'),
    },
  }),
  delete: createRoute({
    method: 'delete',
    path: `${SUBS}/{id}`,
    tags: ['Subtitles'],
    summary: 'Delete a track and its sidecar',
    ...access('staff'),
    request: { params: IdParam },
    responses: { ...noContent, ...errors('unauthorized', 'forbidden', 'not-found') },
  }),
  providers: createRoute({
    method: 'get',
    path: `${SUBS}/providers`,
    tags: ['Subtitles'],
    summary: 'The providers, their accounts, today’s counts and throttles',
    ...access('staff'),
    responses: {
      200: json(z.array(SubtitleProvider), 'Providers'),
      ...errors('unauthorized', 'forbidden'),
    },
  }),
  toggleProvider: createRoute({
    method: 'patch',
    path: `${SUBS}/providers/{id}`,
    tags: ['Subtitles'],
    summary: 'Turn a provider on or off',
    description:
      '409 `no-account` while its account is missing; `no-app-key` for OpenSubtitles.com in a build without highsea’s key.',
    ...access('staff'),
    request: { params: ProviderParam, ...body(z.object({ enabled: z.boolean() })) },
    responses: {
      200: json(SubtitleProvider, 'The provider'),
      ...errors('invalid', 'unauthorized', 'forbidden', 'not-found', 'conflict'),
    },
  }),
  saveProvider: createRoute({
    method: 'put',
    path: `${SUBS}/providers/{id}`,
    tags: ['Subtitles'],
    summary: 'Save a provider’s account',
    ...access('owner'),
    request: { params: ProviderParam, ...body(SubtitleProviderCredentials) },
    responses: {
      200: json(SubtitleProvider, 'The provider'),
      ...errors('invalid', 'unauthorized', 'forbidden', 'not-found'),
    },
  }),
  testProvider: createRoute({
    method: 'post',
    path: `${SUBS}/providers/{id}/test`,
    tags: ['Subtitles'],
    summary: 'Sign in with an account, given or saved, without saving it',
    ...access('owner'),
    request: { params: ProviderParam, ...body(SubtitleProviderCredentials) },
    responses: {
      200: json(SubtitleProviderTest, 'The result'),
      ...errors('invalid', 'unauthorized', 'forbidden', 'not-found'),
    },
  }),
  languages: createRoute({
    method: 'get',
    path: `${SUBS}/languages`,
    tags: ['Subtitles'],
    summary: 'The languages a profile can ask for',
    description: 'ISO 639-1, plus `pt-BR`, `zh-Hans` and `zh-Hant`.',
    ...access('staff'),
    responses: {
      200: json(z.array(Language), 'Languages'),
      ...errors('unauthorized', 'forbidden'),
    },
  }),
  languageProfiles: createRoute({
    method: 'get',
    path: `${API_PREFIX}/languageprofiles`,
    tags: ['Subtitles'],
    summary: 'Subtitle language profiles',
    ...access('staff'),
    responses: {
      200: json(z.array(LanguageProfile), 'Profiles'),
      ...errors('unauthorized', 'forbidden'),
    },
  }),
  createLanguageProfile: createRoute({
    method: 'post',
    path: `${API_PREFIX}/languageprofiles`,
    tags: ['Subtitles'],
    summary: 'Add a language profile',
    ...access('staff'),
    request: { ...body(LanguageProfileInput) },
    responses: {
      200: json(LanguageProfile, 'The profile'),
      ...errors('invalid', 'unauthorized', 'forbidden', 'conflict'),
    },
  }),
  saveLanguageProfile: createRoute({
    method: 'put',
    path: `${API_PREFIX}/languageprofiles/{id}`,
    tags: ['Subtitles'],
    summary: 'Change a language profile',
    description: 'Movies using it look again for what it now asks.',
    ...access('staff'),
    request: { params: IdParam, ...body(LanguageProfileInput) },
    responses: {
      200: json(LanguageProfile, 'The profile'),
      ...errors('invalid', 'unauthorized', 'forbidden', 'not-found', 'conflict'),
    },
  }),
  deleteLanguageProfile: createRoute({
    method: 'delete',
    path: `${API_PREFIX}/languageprofiles/{id}`,
    tags: ['Subtitles'],
    summary: 'Delete a language profile',
    description: '409 `in-use` while movies use it; 409 `last-profile` for the last one.',
    ...access('staff'),
    request: { params: IdParam },
    responses: { ...noContent, ...errors('unauthorized', 'forbidden', 'not-found', 'conflict') },
  }),
  settings: createRoute({
    method: 'get',
    path: `${API_PREFIX}/settings/subtitles`,
    tags: ['Subtitles'],
    summary: 'Scoring and sync',
    ...access('staff'),
    responses: {
      200: json(SubtitleSettings, 'The settings'),
      ...errors('unauthorized', 'forbidden'),
    },
  }),
  saveSettings: createRoute({
    method: 'patch',
    path: `${API_PREFIX}/settings/subtitles`,
    tags: ['Subtitles'],
    summary: 'Change scoring and sync',
    ...access('staff'),
    request: { ...body(SubtitleSettings.partial()) },
    responses: {
      200: json(SubtitleSettings, 'The settings'),
      ...errors('invalid', 'unauthorized', 'forbidden'),
    },
  }),
} as const

export type SubtitleStats = z.infer<typeof SubtitleStats>
export type WantedSubtitles = z.infer<typeof WantedSubtitles>
export type WantedSubtitlesPage = z.infer<typeof WantedSubtitlesPage>
export type SubtitleTrack = z.infer<typeof SubtitleTrack>
export type SubtitleSearchResult = z.infer<typeof SubtitleSearchResult>
export type SubtitleProvider = z.infer<typeof SubtitleProvider>
export type SubtitleProviderCredentials = z.infer<typeof SubtitleProviderCredentials>
export type SubtitleProviderTest = z.infer<typeof SubtitleProviderTest>
export type SubtitleSettings = z.infer<typeof SubtitleSettings>
export type Language = z.infer<typeof Language>
