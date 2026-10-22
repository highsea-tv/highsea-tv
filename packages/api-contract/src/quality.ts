// SPDX-License-Identifier: AGPL-3.0-only
// Quality (checkpoint 4, ADR 0031): profiles, custom formats and sizes, written by their editors
// since checkpoint 8c; the parser, for checking a release name by hand; and
// the language profiles the add dialog offers (seeded and edited in checkpoint 7). The shapes mirror
// @highsea/parser's `ParsedRelease` and @highsea/quality's types.
import { createRoute, z } from '@hono/zod-openapi'
import { API_PREFIX, access, body, errors, IdParam, json, noContent } from './common.ts'

// ---------------------------------------------------------------- vocabulary (@highsea/parser)

export const SOURCES = [
  'unknown',
  'cam',
  'telesync',
  'telecine',
  'workprint',
  'dvd',
  'tv',
  'webdl',
  'webrip',
  'bluray',
] as const

export const MODIFIERS = ['none', 'regional', 'screener', 'rawhd', 'brdisk', 'remux'] as const

export const RESOLUTIONS = [360, 480, 540, 576, 720, 1080, 2160] as const

/** @highsea/parser's `VideoCodec`. */
export const VIDEO_CODECS = ['avc', 'hevc', 'av1', 'vc1', 'mpeg2', 'xvid', 'divx', 'vp9'] as const

/** @highsea/parser's `DynamicRange`, as TRaSH's HDR formats name them. */
export const DYNAMIC_RANGES = ['dv', 'hdr10plus', 'hdr10', 'hdr', 'hlg', 'sdr'] as const

const Source = z.enum(SOURCES).openapi('QualitySource')
const Modifier = z.enum(MODIFIERS).openapi('QualityModifier')
const Resolution = z
  .union([
    z.literal(360),
    z.literal(480),
    z.literal(540),
    z.literal(576),
    z.literal(720),
    z.literal(1080),
    z.literal(2160),
  ])
  .openapi('Resolution', { description: 'Vertical lines' })

/** A named quality ("Bluray-1080p", "WEB-2160p", "Remux-2160p"), from @highsea/quality's list. */
const QualityName = z.string().openapi({ example: 'Bluray-1080p' })

// ---------------------------------------------------------------- profiles

/**
 * One row of a profile's list: a quality on its own (a group of one, named after it) or a group of
 * qualities ranked as equals ("WEB 1080p" holds WEB-DL and WEBRip).
 */
export const QualityProfileItem = z
  .object({
    name: z.string().openapi({ example: 'WEB 1080p' }),
    qualities: z.array(QualityName).min(1),
    allowed: z.boolean(),
  })
  .openapi('QualityProfileItem')

export const QualityProfile = z
  .object({
    id: z.string(),
    name: z.string().openapi({ example: 'HD 1080p' }),
    /** Best first, as the screen lists them. */
    items: z.array(QualityProfileItem),
    /** The item upgrades stop at: the name of an allowed item. */
    cutoff: z.string(),
    upgradeAllowed: z.boolean(),
    /** A release scoring less than this is refused. */
    minFormatScore: z.number().int(),
    /** Upgrades stop once a file scores this, with the cutoff quality met. */
    cutoffFormatScore: z.number().int(),
    /** An upgrade must beat the current file's score by at least this. */
    minUpgradeFormatScore: z.number().int(),
    /** Each custom format's score here. Formats left out score 0. */
    formats: z.array(z.object({ formatId: z.string(), score: z.number().int() })),
    /** `any`, `original` for the movie's own language, or an ISO 639-1 code. */
    language: z
      .string()
      .regex(/^([a-z]{2}|original|any)$/)
      .openapi({ example: 'original' }),
    /**
     * Minutes RSS and the backlog sweep wait from a release's upload for a better one (Radarr's
     * delay profile). A release in the most preferred item goes at once; searches someone asks
     * for never wait. 0: no wait.
     */
    waitMinutes: z.number().int().min(0).max(10080),
    /** One of the profiles highsea starts with. Editable all the same. */
    builtIn: z.boolean(),
  })
  .openapi('QualityProfile')

/** A profile as the editor saves it: highsea gives a new one its id. */
export const QualityProfileInput = QualityProfile.omit({ id: true, builtIn: true })
  .extend({ waitMinutes: z.number().int().min(0).max(10080).optional() })
  .openapi('QualityProfileInput')

// ---------------------------------------------------------------- custom formats

/** The indexer flags the Servarr wiki lists, plus Internal: @highsea/quality's `INDEXER_FLAGS`. */
export const INDEXER_FLAGS = [
  'freeleech',
  'halfleech',
  'doubleUpload',
  'golden',
  'approved',
  'internal',
  'scene',
  'freeleech75',
  'freeleech25',
] as const

/** @highsea/quality's `CONDITION_KINDS`: one vocabulary from the engine to the screen. */
export const CONDITION_KINDS = [
  'title',
  'edition',
  'releaseGroup',
  'language',
  'indexerFlag',
  'source',
  'resolution',
  'modifier',
  'size',
  'year',
] as const

/** ISO 639-1, or `original` for the movie's own language. */
const LanguageCode = z
  .string()
  .regex(/^([a-z]{2}|original)$/)
  .openapi({ example: 'original' })

const Range = (unit: string) =>
  z
    .object({
      /** Inclusive. */
      min: z.number().min(0),
      /** Inclusive. */
      max: z.number().min(0),
    })
    .openapi({ description: unit })

const condition = <K extends string, V extends z.ZodType>(kind: K, value: V) =>
  z.object({
    kind: z.literal(kind),
    /** What the condition is called in the format ("x265", "Not Remux"). */
    name: z.string(),
    value,
    /** Holds when the test fails. */
    negate: z.boolean(),
    /** Must hold on its own, not just as one of its kind's alternatives. */
    required: z.boolean(),
  })

/**
 * A custom format's test, as @highsea/quality models it (`conditionSchema`). Matching follows the
 * Servarr wiki: conditions of the same kind are alternatives; different kinds must all hold; a
 * required condition must hold on its own; `negate` inverts one. `title`, `edition` and
 * `releaseGroup` are regular expressions, matched case-insensitively.
 */
export const FormatCondition = z
  .discriminatedUnion('kind', [
    condition('title', z.string().openapi({ example: '\\b(DV|DoVi)\\b' })),
    condition('edition', z.string()),
    condition('releaseGroup', z.string()),
    /** `except`: any language but this one (TRaSH's `exceptLanguage`). */
    condition('language', z.object({ language: LanguageCode, except: z.boolean() })),
    condition('indexerFlag', z.enum(INDEXER_FLAGS)),
    condition('source', Source),
    condition('resolution', Resolution),
    condition('modifier', Modifier),
    condition('size', Range('GiB')),
    condition('year', Range('Years')),
  ])
  .openapi('FormatCondition')

export const CustomFormat = z
  .object({
    id: z.string(),
    name: z.string().openapi({ example: 'Dolby Vision' }),
    conditions: z.array(FormatCondition),
    /** A bundled TRaSH Guides preset (MIT) or the owner's own. */
    source: z.enum(['preset', 'custom']),
    /** The TRaSH Guides' id, for presets; null for the owner's own. */
    trashId: z.string().nullable(),
    /**
     * A preset the owner has changed: "Yours". highsea's updates to the bundled presets leave it
     * alone from then on.
     */
    edited: z.boolean(),
  })
  .openapi('CustomFormat')

/** A format as the editor saves it: its name and conditions. */
export const CustomFormatInput = CustomFormat.pick({ name: true, conditions: true }).openapi(
  'CustomFormatInput',
)

// ---------------------------------------------------------------- sizes

/**
 * Megabytes per minute of runtime, checked against the movie's runtime (110 minutes when unknown).
 * The megabytes are MiB, as Radarr's are.
 */
export const QualitySize = z
  .object({
    quality: QualityName,
    min: z.number().min(0),
    /** Null: no preference. */
    preferred: z.number().min(0).nullable(),
    /** Null: no limit. */
    max: z.number().min(0).nullable(),
  })
  .openapi('QualitySize')

// ---------------------------------------------------------------- language profiles

export const LanguageProfile = z
  .object({
    id: z.string(),
    name: z.string().openapi({ example: 'English and Portuguese' }),
    /** In order of preference. */
    languages: z.array(
      z.object({
        /** ISO 639-1. */
        code: z.string(),
        forced: z.enum(['no', 'also', 'only']),
        hi: z.enum(['no', 'also', 'only']),
      }),
    ),
    /** Stop upgrading once this language is found; null to keep looking. */
    cutoff: z.string().nullable(),
    minScore: z.number().int(),
  })
  .openapi('LanguageProfile')

// ---------------------------------------------------------------- the parser

/** @highsea/parser's `ParsedRelease`. */
export const ParsedRelease = z
  .object({
    name: z.string(),
    title: z.string(),
    year: z.number().int().nullable(),
    /** As written in the name ("Director's Cut"); null when there's none. */
    edition: z.string().nullable(),
    quality: z.object({
      source: Source,
      resolution: Resolution.nullable(),
      modifier: Modifier,
      revision: z.object({
        /** 1, or 2 and up for each PROPER, REPACK or v2. */
        version: z.number().int(),
        /** REAL tags, counted apart. */
        real: z.number().int(),
        proper: z.boolean(),
        repack: z.boolean(),
      }),
    }),
    /** ISO 639-1, in the order they appear. */
    languages: z.array(z.string()),
    /** The name says MULTi or Dual audio, without saying which languages. */
    multi: z.boolean(),
    /** Subtitle languages the name tags (`SWESUB`, `VOSTFR`), ISO 639-1. */
    subtitles: z.array(z.string()),
    releaseGroup: z.string().nullable(),
    /** The hardcoded subtitles' language or tag; null when there are none. */
    hardcodedSubs: z.string().nullable(),
    ids: z.object({ imdb: z.string().nullable(), tmdb: z.number().int().nullable() }),
    /** Null when the name doesn't say. */
    codec: z.enum(VIDEO_CODECS).nullable(),
    /** In the order they appear. */
    hdr: z.array(z.enum(DYNAMIC_RANGES)),
    threeD: z.boolean(),
  })
  .openapi('ParsedRelease')

export const ParseResult = z
  .object({
    release: ParsedRelease,
    /** The named quality the source, resolution and modifier make. */
    quality: QualityName,
    /** The custom formats the name matches. Size and indexer flags need a real release, so those conditions don't hold here. */
    formats: z.array(z.object({ id: z.string(), name: z.string() })),
    /** What the matched formats score in each profile. */
    scores: z.array(z.object({ profileId: z.string(), name: z.string(), score: z.number().int() })),
    /** The library movie the name points to, by an id in the name or its title and year. */
    movie: z
      .object({ id: z.number().int(), title: z.string(), year: z.number().int().nullable() })
      .nullable(),
  })
  .openapi('ParseResult')

// ---------------------------------------------------------------- routes

export const quality = {
  profiles: createRoute({
    method: 'get',
    path: `${API_PREFIX}/qualityprofiles`,
    tags: ['Quality'],
    summary: 'Quality profiles',
    description: 'In the owner’s order: the add dialog suggests the first.',
    ...access('staff'),
    responses: { 200: json(z.array(QualityProfile), 'Profiles'), ...errors('unauthorized') },
  }),
  profile: createRoute({
    method: 'get',
    path: `${API_PREFIX}/qualityprofiles/{id}`,
    tags: ['Quality'],
    summary: 'A quality profile',
    ...access('staff'),
    request: { params: IdParam },
    responses: {
      200: json(QualityProfile, 'The profile'),
      ...errors('unauthorized', 'not-found'),
    },
  }),
  addProfile: createRoute({
    method: 'post',
    path: `${API_PREFIX}/qualityprofiles`,
    tags: ['Quality'],
    summary: 'Add a quality profile',
    description:
      'It goes last in the order. 400 when the profile doesn’t hold together (the cutoff must be a quality it wants); 409 `name-taken` when another profile has the name.',
    ...access('staff'),
    request: { ...body(QualityProfileInput) },
    responses: {
      201: json(QualityProfile, 'Added'),
      ...errors('invalid', 'unauthorized', 'forbidden', 'conflict'),
    },
  }),
  orderProfiles: createRoute({
    method: 'put',
    path: `${API_PREFIX}/qualityprofiles/order`,
    tags: ['Quality'],
    summary: 'Put the quality profiles in order',
    description: 'Every profile’s id, once, first to last.',
    ...access('staff'),
    request: { ...body(z.object({ ids: z.array(z.string()).min(1) })) },
    responses: {
      200: json(z.array(QualityProfile), 'The profiles, in the new order'),
      ...errors('invalid', 'unauthorized', 'forbidden'),
    },
  }),
  saveProfile: createRoute({
    method: 'put',
    path: `${API_PREFIX}/qualityprofiles/{id}`,
    tags: ['Quality'],
    summary: 'Save a quality profile',
    description:
      'Movies using it are judged by it from the next search on. Scores for formats that don’t exist are dropped.',
    ...access('staff'),
    request: { params: IdParam, ...body(QualityProfileInput) },
    responses: {
      200: json(QualityProfile, 'Saved'),
      ...errors('invalid', 'unauthorized', 'forbidden', 'not-found', 'conflict'),
    },
  }),
  removeProfile: createRoute({
    method: 'delete',
    path: `${API_PREFIX}/qualityprofiles/{id}`,
    tags: ['Quality'],
    summary: 'Delete a quality profile',
    description:
      '409 `in-use` while a movie uses it, with `details.movies`, as Radarr refuses; 409 `last-profile` for the only one left.',
    ...access('staff'),
    request: { params: IdParam },
    responses: { ...noContent, ...errors('unauthorized', 'forbidden', 'not-found', 'conflict') },
  }),
  customFormats: createRoute({
    method: 'get',
    path: `${API_PREFIX}/customformats`,
    tags: ['Quality'],
    summary: 'Custom formats',
    ...access('staff'),
    responses: {
      200: json(z.array(CustomFormat), 'Formats'),
      ...errors('unauthorized', 'forbidden'),
    },
  }),
  addFormat: createRoute({
    method: 'post',
    path: `${API_PREFIX}/customformats`,
    tags: ['Quality'],
    summary: 'Add a custom format',
    description:
      'It scores 0 in every profile until one scores it. 400 with the first problem when a condition doesn’t hold together (a pattern that isn’t a regular expression, a range the wrong way round).',
    ...access('staff'),
    request: { ...body(CustomFormatInput) },
    responses: {
      201: json(CustomFormat, 'Added'),
      ...errors('invalid', 'unauthorized', 'forbidden', 'conflict'),
    },
  }),
  saveFormat: createRoute({
    method: 'put',
    path: `${API_PREFIX}/customformats/{id}`,
    tags: ['Quality'],
    summary: 'Save a custom format',
    description: 'Saving a preset marks it `edited`, so highsea’s preset updates leave it alone.',
    ...access('staff'),
    request: { params: IdParam, ...body(CustomFormatInput) },
    responses: {
      200: json(CustomFormat, 'Saved'),
      ...errors('invalid', 'unauthorized', 'forbidden', 'not-found', 'conflict'),
    },
  }),
  removeFormat: createRoute({
    method: 'delete',
    path: `${API_PREFIX}/customformats/{id}`,
    tags: ['Quality'],
    summary: 'Delete a custom format',
    description: 'Its scores go from every profile, as Radarr removes them.',
    ...access('staff'),
    request: { params: IdParam },
    responses: { ...noContent, ...errors('unauthorized', 'forbidden', 'not-found') },
  }),
  parse: createRoute({
    method: 'get',
    path: `${API_PREFIX}/parse`,
    tags: ['Quality'],
    summary: 'Read a release name: its parts, quality and the custom formats it matches',
    ...access('staff'),
    request: { query: z.object({ title: z.string().min(1).max(500) }) },
    responses: {
      200: json(ParseResult, 'What the name says'),
      ...errors('invalid', 'unauthorized', 'forbidden'),
    },
  }),
} as const

export type QualityProfileItem = z.infer<typeof QualityProfileItem>
export type QualityProfile = z.infer<typeof QualityProfile>
export type QualityProfileInput = z.input<typeof QualityProfileInput>
export type FormatCondition = z.infer<typeof FormatCondition>
export type CustomFormat = z.infer<typeof CustomFormat>
export type CustomFormatInput = z.infer<typeof CustomFormatInput>
export type QualitySize = z.infer<typeof QualitySize>
export type LanguageProfile = z.infer<typeof LanguageProfile>
export type ParsedRelease = z.infer<typeof ParsedRelease>
export type ParseResult = z.infer<typeof ParseResult>
