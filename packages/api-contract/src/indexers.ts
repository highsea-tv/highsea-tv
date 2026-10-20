// SPDX-License-Identifier: AGPL-3.0-only
// Indexers and the catalog (checkpoint 5, indexers.md). The catalog serves signed definitions
// (ADR 0034); an indexer is a definition with the owner's settings (ADR 0033), with its health and
// stats (ADR 0035). Secret settings are never returned: a read says whether each is set.
// Everything here is staff, except the catalog's settings, which are the owner's (ADR 0032's
// answers of 2026-10-20).
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

// ---------------------------------------------------------------- vocabulary

export const INDEXER_PRIVACY = ['public', 'semi-private', 'private'] as const
export const INDEXER_KINDS = ['torznab', 'newznab', 'json', 'html', 'rss'] as const
export const INDEXER_PROTOCOLS = ['torrent', 'usenet'] as const
export const INDEXER_HEALTH = ['healthy', 'backoff', 'failing', 'disabled'] as const
export const CATALOG_CHANNELS = ['stable', 'beta'] as const
/** @highsea/quality's `INDEXER_FLAGS`. */
export const RELEASE_FLAGS = [
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

/** The lowest and highest priority; lower is asked first and wins ties. */
export const INDEXER_PRIORITY = { min: 1, max: 50, default: 25 } as const

// ---------------------------------------------------------------- shapes

const SettingValue = z.union([z.string(), z.number(), z.boolean()])

/** One field of a definition's settings form (ADR 0033). */
export const SettingField = z
  .object({
    key: z.string(),
    label: z.string(),
    type: z.enum(['text', 'password', 'select', 'checkbox', 'number', 'url']),
    required: z.boolean(),
    /** Encrypted at rest and never returned. */
    secret: z.boolean(),
    /** "Where to find this". */
    help: z.string().nullable(),
    default: SettingValue.optional(),
    options: z.array(z.object({ value: z.string(), label: z.string() })).optional(),
  })
  .openapi('IndexerSettingField')

export const CatalogIndexer = z
  .object({
    id: z.string(),
    version: z.string(),
    name: z.string(),
    description: z.string(),
    privacy: z.enum(INDEXER_PRIVACY),
    /** BCP 47, or `multi`. */
    language: z.string(),
    kind: z.enum(INDEXER_KINDS),
    protocol: z.enum(INDEXER_PROTOCOLS),
    categories: z.array(z.string()),
    settings: z.array(SettingField),
    /** Who wrote the definition and the documentation it follows; the prototype's `source.name`. */
    source: z.object({ author: z.string(), documentation: z.string() }),
    /** The definition's own SPDX licence. */
    license: z.string(),
    minEngineVersion: z.string(),
    /** In setup's starter pack. */
    starter: z.boolean(),
    links: z.array(z.string()),
    /** A data URL from the bundle. */
    logo: z.string().nullable(),
    /** From `/config/definitions`, marked Local. */
    local: z.boolean(),
    /** `main`, `local` or `extra:{url}`. */
    origin: z.string(),
    /** How many installed indexers use it. */
    installed: z.number().int(),
  })
  .openapi('CatalogIndexer')

export const IndexerStats = z
  .object({
    queries24h: z.number().int(),
    grabs24h: z.number().int(),
    /** Null before the first query. */
    avgResponseMs: z.number().nullable(),
    /** 0 to 1; null before the first query. */
    successRate: z.number().nullable(),
  })
  .openapi('IndexerStats')

export const Indexer = z
  .object({
    id: z.string(),
    definitionId: z.string(),
    name: z.string(),
    /** Null when the definition is gone from every catalog. */
    privacy: z.enum(INDEXER_PRIVACY).nullable(),
    kind: z.enum(INDEXER_KINDS).nullable(),
    protocol: z.enum(INDEXER_PROTOCOLS).nullable(),
    enabled: z.boolean(),
    /** 1 to 50, lower first. */
    priority: z.number().int(),
    health: z.enum(INDEXER_HEALTH),
    backoffUntil: IsoDate.nullable(),
    failingSince: IsoDate.nullable(),
    lastError: z.string().nullable(),
    /** A new definition version needs a setting, or the definition is gone. */
    needsAttention: z.boolean(),
    missing: z.boolean(),
    local: z.boolean(),
    definitionVersion: z.string(),
    logo: z.string().nullable(),
    /** Plain settings' values, and whether each secret one is set. */
    settings: z.object({
      values: z.record(z.string(), SettingValue),
      secrets: z.record(z.string(), z.boolean()),
    }),
    stats: IndexerStats,
    addedAt: IsoDate,
  })
  .openapi('Indexer')

export const IndexerTestResult = z
  .object({ ok: z.boolean(), message: z.string(), latencyMs: z.number() })
  .openapi('IndexerTestResult')

const Settings = z.record(z.string(), SettingValue.nullable())

export const AddIndexerInput = z
  .object({
    definitionId: z.string(),
    /** Secret fields left empty keep nothing; required ones must be filled. */
    settings: Settings.optional(),
    name: z.string().max(60).optional(),
    priority: z.number().int().min(INDEXER_PRIORITY.min).max(INDEXER_PRIORITY.max).optional(),
  })
  .openapi('AddIndexerInput')

export const TestIndexerInput = z
  .object({
    /** An installed indexer's id, or a definition's before it's added. */
    id: z.string(),
    /** Unsaved settings to test; an empty secret keeps the saved one. */
    settings: Settings.optional(),
  })
  .openapi('TestIndexerInput')

export const IndexerPatch = z
  .object({
    name: z.string().max(60).optional(),
    enabled: z.boolean().optional(),
    priority: z.number().int().min(INDEXER_PRIORITY.min).max(INDEXER_PRIORITY.max).optional(),
    settings: Settings.optional(),
  })
  .openapi('IndexerPatch')

export const CatalogChange = z
  .object({ version: z.string(), date: z.string(), notes: z.array(z.string()) })
  .openapi('CatalogChange')

export const CatalogStatus = z
  .object({
    /** The main catalog's installed version; null before one is installed. */
    version: z.string().nullable(),
    channel: z.enum(CATALOG_CHANNELS),
    autoUpdate: z.boolean(),
    engineVersion: z.string(),
    lastCheck: z
      .object({ at: IsoDate, ok: z.boolean(), message: z.string().nullable() })
      .nullable(),
    /** A verified version waiting, when updates ask first. */
    available: z.object({ version: z.string(), changes: z.array(CatalogChange) }).nullable(),
    /** What changed, newest first, for A9's What changed. */
    changes: z.array(CatalogChange),
    extras: z.array(
      z.object({ url: z.string(), keyId: z.string(), version: z.string().nullable() }),
    ),
    /** Local definitions that didn't validate. */
    brokenLocal: z.array(z.object({ file: z.string(), message: z.string() })),
  })
  .openapi('CatalogStatus')

export const ExtraCatalog = z
  .object({ url: z.string(), keyId: z.string(), publicKey: z.string() })
  .openapi('ExtraCatalog')

export const CatalogSettings = z
  .object({
    channel: z.enum(CATALOG_CHANNELS),
    /** Install new versions on their own; false is "Ask first". */
    autoUpdate: z.boolean(),
    extras: z.array(ExtraCatalog),
  })
  .openapi('CatalogSettings')

export const CatalogSettingsPatch = CatalogSettings.partial().openapi('CatalogSettingsPatch')

export const Release = z
  .object({
    guid: z.string(),
    title: z.string(),
    indexerId: z.string(),
    indexer: z.string(),
    protocol: z.enum(INDEXER_PROTOCOLS),
    /** Bytes; null when the indexer didn't say. */
    size: z.number().nullable(),
    seeders: z.number().int().nullable(),
    leechers: z.number().int().nullable(),
    grabs: z.number().int().nullable(),
    publishedAt: IsoDate.nullable(),
    ageHours: z.number().nullable(),
    /** The release's page on the site. */
    details: z.string().nullable(),
    quality: z.string(),
    customFormats: z.array(z.string()),
    formatScore: z.number(),
    flags: z.array(z.enum(RELEASE_FLAGS)),
    languages: z.array(z.string()),
    approved: z.boolean(),
    reasons: z.array(
      z.object({ kind: z.enum(['accepted', 'rejected', 'warning']), message: z.string() }),
    ),
  })
  .openapi('Release')

export const ReleaseSearch = z
  .object({
    /** Approved first, then by the profile's ranking. */
    releases: z.array(Release),
    /** How many indexers were asked. */
    searched: z.number().int(),
    /** The indexers that didn't answer, with why. */
    failed: z.array(z.object({ indexerId: z.string(), indexer: z.string(), message: z.string() })),
  })
  .openapi('ReleaseSearch')

// ---------------------------------------------------------------- routes

const CATALOG = `${API_PREFIX}/catalog`
const INDEXERS = `${API_PREFIX}/indexers`

export const catalog = {
  status: createRoute({
    method: 'get',
    path: CATALOG,
    tags: ['Indexers'],
    summary: 'The catalog’s version, channel, last check and what changed',
    ...access('staff'),
    responses: {
      200: json(CatalogStatus, 'The catalog'),
      ...errors('unauthorized', 'forbidden'),
    },
  }),
  check: createRoute({
    method: 'post',
    path: `${CATALOG}/check`,
    tags: ['Indexers'],
    summary: 'Check for a new catalog version now',
    description:
      'Verifies what it finds before using it. A failed check keeps the installed version and says why in `lastCheck`.',
    ...access('staff'),
    responses: {
      200: json(CatalogStatus, 'The catalog after the check'),
      ...errors('unauthorized', 'forbidden'),
    },
  }),
  install: createRoute({
    method: 'post',
    path: `${CATALOG}/install`,
    tags: ['Indexers'],
    summary: 'Install the version waiting, when updates ask first',
    ...access('staff'),
    responses: {
      200: json(CatalogStatus, 'The catalog'),
      ...errors('unauthorized', 'forbidden'),
    },
  }),
  indexers: createRoute({
    method: 'get',
    path: `${CATALOG}/indexers`,
    tags: ['Indexers'],
    summary: 'Every indexer definition the server can use',
    description: 'Local definitions first, then the main catalog’s, then extra catalogs’.',
    ...access('staff'),
    request: {
      query: z.object({
        /** Setup's starter pack: public starters only. */
        starter: z.enum(['true', 'false']).optional(),
      }),
    },
    responses: {
      200: json(z.array(CatalogIndexer), 'Definitions'),
      ...errors('unauthorized', 'forbidden'),
    },
  }),
  settings: createRoute({
    method: 'get',
    path: `${CATALOG}/settings`,
    tags: ['Indexers'],
    summary: 'The channel, automatic updates and extra catalogs',
    ...access('owner'),
    responses: {
      200: json(CatalogSettings, 'The settings'),
      ...errors('unauthorized', 'forbidden'),
    },
  }),
  updateSettings: createRoute({
    method: 'patch',
    path: `${CATALOG}/settings`,
    tags: ['Indexers'],
    summary: 'Change the channel, automatic updates or extra catalogs',
    description:
      'A removed extra catalog’s definitions go with it. Changing the channel installs the seed for that channel if it’s newer.',
    ...access('owner'),
    request: body(CatalogSettingsPatch),
    responses: {
      200: json(CatalogSettings, 'The settings'),
      ...errors('unauthorized', 'forbidden', 'invalid'),
    },
  }),
}

export const indexers = {
  list: createRoute({
    method: 'get',
    path: INDEXERS,
    tags: ['Indexers'],
    summary: 'Installed indexers, with health and 24-hour stats',
    ...access('staff'),
    responses: {
      200: json(z.array(Indexer), 'Indexers'),
      ...errors('unauthorized', 'forbidden'),
    },
  }),
  add: createRoute({
    method: 'post',
    path: INDEXERS,
    tags: ['Indexers'],
    summary: 'Add an indexer from the catalog',
    description:
      'Tests the settings first and adds the indexer only if the test passes. A failed test answers 400 with the test result in `details.test`.',
    ...access('staff'),
    request: body(AddIndexerInput),
    responses: {
      201: json(
        z.object({ indexer: Indexer, test: IndexerTestResult }).openapi('AddedIndexer'),
        'Added',
      ),
      ...errors('unauthorized', 'forbidden', 'invalid', 'not-found'),
    },
  }),
  test: createRoute({
    method: 'post',
    path: `${INDEXERS}/test`,
    tags: ['Indexers'],
    summary: 'Test an indexer, or a definition with settings before adding it',
    description:
      'Testing a saved indexer without settings records its health; testing unsaved settings doesn’t.',
    ...access('staff'),
    request: body(TestIndexerInput),
    responses: {
      200: json(IndexerTestResult, 'The result'),
      ...errors('unauthorized', 'forbidden', 'invalid', 'not-found', 'conflict'),
    },
  }),
  update: createRoute({
    method: 'patch',
    path: `${INDEXERS}/{id}`,
    tags: ['Indexers'],
    summary: 'Rename, enable or disable, reprioritize or change settings',
    description: 'New settings start over: no backoff and no saved sign-in.',
    ...access('staff'),
    request: { params: IdParam, ...body(IndexerPatch) },
    responses: {
      200: json(Indexer, 'The indexer'),
      ...errors('unauthorized', 'forbidden', 'invalid', 'not-found', 'conflict'),
    },
  }),
  retry: createRoute({
    method: 'post',
    path: `${INDEXERS}/{id}/retry`,
    tags: ['Indexers'],
    summary: 'Retry now: clear the backoff',
    ...access('staff'),
    request: { params: IdParam },
    responses: {
      200: json(Indexer, 'The indexer'),
      ...errors('unauthorized', 'forbidden', 'not-found'),
    },
  }),
  remove: createRoute({
    method: 'delete',
    path: `${INDEXERS}/{id}`,
    tags: ['Indexers'],
    summary: 'Remove an indexer',
    ...access('staff'),
    request: { params: IdParam },
    responses: { ...noContent, ...errors('unauthorized', 'forbidden', 'not-found') },
  }),
}

/** Release search, in the movies group: the SDK's `movies.interactiveSearch` and `releases`. */
export const releaseRoutes = {
  interactiveSearch: createRoute({
    method: 'post',
    path: `${API_PREFIX}/movies/{id}/search`,
    tags: ['Movies'],
    summary: 'Search every usable indexer for a library movie now',
    description:
      'Judged by the movie’s first version’s profile, approved releases first. A `POST` because it costs every indexer a query. 409 `no-indexers` while no indexer is enabled. The results are kept for 30 minutes.',
    ...access('staff'),
    request: { params: TmdbIdParam },
    responses: {
      200: json(ReleaseSearch, 'The releases'),
      ...errors('unauthorized', 'forbidden', 'not-found', 'conflict'),
    },
  }),
  releases: createRoute({
    method: 'get',
    path: `${API_PREFIX}/movies/{id}/releases`,
    tags: ['Movies'],
    summary: 'The last search’s releases, while they’re fresh',
    description:
      'Best first, from a search in the last 30 minutes; empty when there’s none, or it found nothing.',
    ...access('staff'),
    request: { params: TmdbIdParam },
    responses: {
      200: json(z.array(Release), 'The releases'),
      ...errors('unauthorized', 'forbidden', 'not-found'),
    },
  }),
}

export type CatalogIndexer = z.infer<typeof CatalogIndexer>
export type Indexer = z.infer<typeof Indexer>
export type IndexerStats = z.infer<typeof IndexerStats>
export type IndexerTestResult = z.infer<typeof IndexerTestResult>
export type AddIndexerInput = z.infer<typeof AddIndexerInput>
export type TestIndexerInput = z.infer<typeof TestIndexerInput>
export type IndexerPatch = z.infer<typeof IndexerPatch>
export type CatalogChange = z.infer<typeof CatalogChange>
export type CatalogStatus = z.infer<typeof CatalogStatus>
export type CatalogSettings = z.infer<typeof CatalogSettings>
export type CatalogSettingsPatch = z.infer<typeof CatalogSettingsPatch>
export type ExtraCatalog = z.infer<typeof ExtraCatalog>
export type Release = z.infer<typeof Release>
export type ReleaseSearch = z.infer<typeof ReleaseSearch>
export type SettingField = z.infer<typeof SettingField>
