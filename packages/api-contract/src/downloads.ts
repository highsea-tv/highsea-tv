// SPDX-License-Identifier: AGPL-3.0-only
// Downloading and importing (checkpoint 6a; phase-3-checkpoint-6.md › API): Activity's queue,
// history and blocklist (A7), Downloads (A8), manual import (A17), a movie's files and history,
// Settings › Media management and › Download client, and System's rates. The shapes are the
// prototype's draft types (design/prototypes/src/mock/types.ts) with what real data forces: a
// movie is addressed by its TMDB id, as every other route does (ADR 0014, amended).
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

// ---------------------------------------------------------------- torrents and the queue

export const TORRENT_STATES = [
  'queued',
  'checking',
  'downloading',
  'stalled',
  'paused',
  'importing',
  'import-blocked',
  'seeding',
  'completed',
  'error',
] as const

export const FILE_PRIORITIES = ['skip', 'normal', 'high'] as const

export const TorrentFile = z
  .object({
    /** Inside the torrent's folder, its name first. */
    path: z.string(),
    size: z.number(),
    /** 0–1. */
    progress: z.number(),
    priority: z.enum(FILE_PRIORITIES),
  })
  .openapi('TorrentFile')

export const Tracker = z
  .object({
    url: z.string(),
    status: z.enum(['working', 'updating', 'not-contacted', 'error']),
    peers: z.number().int(),
    message: z.string().nullable(),
  })
  .openapi('Tracker')

/** Stop at a ratio or a time, whichever comes first; never before the minimum (private trackers). */
export const SeedingRule = z
  .object({
    ratio: z.number().nullable(),
    minutes: z.number().int().nullable(),
    minMinutes: z.number().int().nullable(),
  })
  .openapi('SeedingRule')

const Count = z.object({ connected: z.number().int(), total: z.number().int() })

export const Torrent = z
  .object({
    id: z.string(),
    name: z.string(),
    infoHash: z.string(),
    /** The movie it was grabbed for (its TMDB id); null for a torrent added by hand. */
    movieId: z.number().int().nullable(),
    category: z.string(),
    /** Added by hand or from the watch folder, not grabbed for the library (6b). */
    manual: z.boolean(),
    size: z.number(),
    downloaded: z.number(),
    uploaded: z.number(),
    /** 0–1. */
    progress: z.number(),
    /** Bytes per second. */
    downRate: z.number(),
    upRate: z.number(),
    /** Seconds left; null when unknown, as while stalled. */
    eta: z.number().nullable(),
    peers: Count,
    seeds: Count,
    ratio: z.number(),
    state: z.enum(TORRENT_STATES),
    /** Why it's stalled, blocked or failed, in plain words. */
    stateReason: z.string().nullable(),
    indexer: z.string().nullable(),
    quality: z.string().nullable(),
    addedAt: IsoDate,
    completedAt: IsoDate.nullable(),
    savePath: z.string(),
    private: z.boolean(),
    files: z.array(TorrentFile),
    trackers: z.array(Tracker),
    seedingRule: SeedingRule,
  })
  .openapi('Torrent')

/** A row in Activity › Queue: a grab seen from the movie it's for. */
export const QueueItem = z
  .object({
    id: z.string(),
    /** Null once the torrent has gone, as after a failed grab. */
    torrentId: z.string().nullable(),
    movieId: z.number().int().nullable(),
    title: z.string(),
    year: z.number().int().nullable(),
    release: z.string(),
    quality: z.string().nullable(),
    size: z.number(),
    progress: z.number(),
    downRate: z.number(),
    upRate: z.number(),
    eta: z.number().nullable(),
    ratio: z.number(),
    state: z.enum(TORRENT_STATES),
    stateReason: z.string().nullable(),
  })
  .openapi('QueueItem')

export const QueueRemoveInput = z
  .object({
    /** Delete what was downloaded. */
    deleteData: z.boolean().default(false),
    /** Put the release on the blocklist, so search and grab skip it. */
    blocklist: z.boolean().default(false),
  })
  .openapi('QueueRemoveInput')

export const SearchAlternativeInput = z
  .object({ reason: z.string().max(500).optional() })
  .openapi('SearchAlternativeInput')

export const AddTorrentInput = z
  .object({
    /** A magnet link or a `.torrent`'s address. */
    urlOrMagnet: z.string().max(10_000).optional(),
    /** A `.torrent` file's bytes, base64. */
    torrent: z.base64().max(14_000_000).optional(),
    /** Add it paused. */
    paused: z.boolean().optional(),
    /** One of `categories()` other than `movies` (6b); `manual` when left out. */
    category: z.string().min(1).max(40).optional(),
  })
  .refine((v) => (v.urlOrMagnet ? 1 : 0) + (v.torrent ? 1 : 0) === 1, {
    message: 'Give a magnet link, an address or a .torrent file.',
  })
  .openapi('AddTorrentInput')

export const DeleteTorrentInput = z
  .object({ deleteData: z.boolean().default(false) })
  .openapi('DeleteTorrentInput')

export const FilePriorityInput = z
  .object({ path: z.string().max(4096), priority: z.enum(FILE_PRIORITIES) })
  .openapi('FilePriorityInput')

/**
 * A category (6b, answer 5): `movies` holds the library's grabs and `manual` torrents added
 * without one; the owner adds their own, each with a folder.
 */
export const TorrentCategory = z
  .object({
    name: z.string(),
    /** Where its torrents save. */
    folder: z.string(),
    /** `movies` and `manual`: built in, never removed. */
    fixed: z.boolean(),
    /** Torrents in Downloads that use it now; a category in use can't be removed. */
    torrents: z.number().int(),
  })
  .openapi('TorrentCategory')

export const TorrentCategoryInput = z
  .object({
    name: z.string().min(1).max(40),
    /** Inside the data folder or the downloads folder; empty for `{downloads}/{name}`. */
    folder: z.string().max(4096).nullable().optional(),
  })
  .openapi('TorrentCategoryInput')

const CategoryParam = z.object({
  name: z.string().openapi({ param: { name: 'name', in: 'path' } }),
})

/** Every torrent together, bytes per second; 0 is no limit. */
export const TorrentLimits = z
  .object({ downloadRate: z.number().int().min(0), uploadRate: z.number().int().min(0) })
  .openapi('TorrentLimits')

// ---------------------------------------------------------------- history and the blocklist

export const HISTORY_TYPES = [
  'grabbed',
  'imported',
  'import-failed',
  'download-failed',
  'deleted',
  'renamed',
  'blocklisted',
  'subtitle-downloaded',
  'subtitle-synced',
] as const

export const HistoryEvent = z
  .object({
    id: z.string(),
    movieId: z.number().int(),
    title: z.string(),
    year: z.number().int().nullable(),
    type: z.enum(HISTORY_TYPES),
    date: IsoDate,
    sourceTitle: z.string(),
    quality: z.string().nullable(),
    indexer: z.string().nullable(),
    message: z.string().nullable(),
  })
  .openapi('HistoryEvent')

export const HistoryPage = z
  .object({
    items: z.array(HistoryEvent),
    /** Pass back as `cursor` for the next page; null on the last. */
    next: z.string().nullable(),
  })
  .openapi('HistoryPage')

const HistoryQuery = z.object({ cursor: z.string().max(500).optional() })

export const BlocklistEntry = z
  .object({
    id: z.string(),
    movieId: z.number().int().nullable(),
    /** The movie's, when it's still in the library. */
    title: z.string().nullable(),
    year: z.number().int().nullable(),
    sourceTitle: z.string(),
    indexer: z.string().nullable(),
    quality: z.string().nullable(),
    reason: z.string(),
    date: IsoDate,
  })
  .openapi('BlocklistEntry')

// ---------------------------------------------------------------- files and importing

const Stream = z.discriminatedUnion('type', [
  z.object({
    index: z.number().int(),
    type: z.literal('video'),
    codec: z.string(),
    width: z.number().int(),
    height: z.number().int(),
    hdr: z.enum(['none', 'hdr10', 'dolby-vision', 'hlg']),
    bitrate: z.number(),
  }),
  z.object({
    index: z.number().int(),
    type: z.literal('audio'),
    codec: z.string(),
    language: z.string(),
    channels: z.string(),
    title: z.string().nullable(),
    default: z.boolean(),
  }),
  z.object({
    index: z.number().int(),
    type: z.literal('subtitle'),
    codec: z.string(),
    language: z.string(),
    forced: z.boolean(),
    hi: z.boolean(),
    default: z.boolean(),
  }),
])

/** A file on disk with its probe's streams (`media_files`). */
export const MediaFile = z
  .object({
    id: z.string(),
    movieId: z.number().int(),
    versionId: z.string().nullable(),
    path: z.string(),
    size: z.number(),
    quality: z.object({
      name: z.string().nullable(),
      resolution: z.string().nullable(),
      source: z.string().nullable(),
      codec: z.string().nullable(),
    }),
    releaseGroup: z.string().nullable(),
    sceneName: z.string().nullable(),
    edition: z.string().nullable(),
    /** How it arrived: `hardlink`, `copy` or `move`. */
    transfer: z.string().nullable(),
    addedAt: IsoDate,
    streams: z.array(Stream),
  })
  .openapi('MediaFile')

export const GrabReleaseInput = z
  .object({
    indexerId: z.string(),
    /** The version to fill; the movie's first by default. */
    versionId: z.string().nullable().optional(),
    /** Grab anyway: a release the decision engine rejected, or one on the blocklist. */
    force: z.boolean().optional(),
  })
  .openapi('GrabReleaseInput')

/** A file manual import found, and what highsea thinks it is. */
export const ImportCandidate = z
  .object({
    path: z.string(),
    size: z.number(),
    quality: z.string(),
    language: z.string(),
    /** The movie it matched (its TMDB id); null when nothing did. */
    movieId: z.number().int().nullable(),
    versionId: z.string().nullable(),
    /** Why it would be skipped, when it would. */
    skip: z.string().nullable(),
    /** `{movie folder}/{file}`, as the naming format makes it; null until a movie is chosen. */
    becomes: z.string().nullable(),
  })
  .openapi('ImportCandidate')

export const ImportScanInput = z
  .object({ path: z.string().min(1).max(4096) })
  .openapi('ImportScanInput')

export const ImportRunInput = z
  .object({
    files: z
      .array(
        z.object({
          path: z.string().max(4096),
          movieId: z.number().int().positive(),
          versionId: z.string().nullable().optional(),
        }),
      )
      .min(1)
      .max(500),
    /** Hardlink (copy when it can't) keeps the source for seeding; move doesn't. */
    mode: z.enum(['hardlink', 'move']),
  })
  .openapi('ImportRunInput')

export const ImportRunResult = z
  .object({
    results: z.array(
      z.object({
        path: z.string(),
        ok: z.boolean(),
        /** Where it went, or why it didn't. */
        message: z.string(),
      }),
    ),
  })
  .openapi('ImportRunResult')

export const FsItem = z
  .object({
    name: z.string(),
    path: z.string(),
    kind: z.enum(['folder', 'file']),
    size: z.number().optional(),
  })
  .openapi('FsItem')

export const FsListing = z
  .object({
    path: z.string(),
    /** The folder above, while it's still inside an allowed folder; else null. */
    parent: z.string().nullable(),
    entries: z.array(FsItem),
  })
  .openapi('FsListing')

const FsQuery = z.object({ path: z.string().max(4096).optional() })

export const SpeedSample = z
  .object({ at: IsoDate, down: z.number(), up: z.number() })
  .openapi('SpeedSample')

// ---------------------------------------------------------------- settings

export const COLON_REPLACEMENTS = [
  'delete',
  'dash',
  'space-dash',
  'space-dash-space',
  'smart',
] as const

/** Settings › Media management: naming and importing (settings.md). */
export const MediaManagementSettings = z
  .object({
    rename: z.boolean(),
    folderFormat: z.string().trim().min(1).max(500),
    fileFormat: z.string().trim().min(1).max(500),
    colonReplacement: z.enum(COLON_REPLACEMENTS),
    hardlinks: z.boolean(),
    nfo: z.boolean(),
    unmonitorDeleted: z.boolean(),
    permissions: z.boolean(),
    chmod: z.string().regex(/^[0-7]{3}$/),
    recycleBin: z.string().trim().max(4096),
    recycleBinDays: z.number().int().min(0).max(3650),
  })
  .openapi('MediaManagementSettings')

/** Settings › Download client (settings.md), with A8's limits and the default seeding rule. */
export const DownloadClientSettings = z
  .object({
    port: z.number().int().min(1024).max(65_535),
    encryption: z.enum(['require', 'prefer', 'allow']),
    upnp: z.boolean(),
    /** uTP (BEP 29) for peers, beside TCP. */
    utp: z.boolean(),
    maxActive: z.number().int().min(1).max(20),
    downloadRate: z.number().int().min(0),
    uploadRate: z.number().int().min(0),
    seedRatio: z.number().min(0).max(100).nullable(),
    seedMinutes: z
      .number()
      .int()
      .min(0)
      .max(60 * 24 * 365)
      .nullable(),
    /** The watch folder (6b): a `.torrent` dropped there is added, then renamed `.torrent.added`. Null is off. */
    watchFolder: z.string().min(1).max(4096).nullable(),
    /** The category the watch folder's torrents go in: `manual` or one of the owner's. */
    watchCategory: z.string().min(1).max(40),
    /**
     * The IP blocklist (6b): an http(s) address, fetched daily, or a file in the config folder, in
     * P2P, DAT or P2B format. Empty is off.
     */
    blocklistUrl: z
      .string()
      .trim()
      .max(2048)
      .refine(
        (s) => !s || (/^https?:\/\//i.test(s) ? URL.canParse(s) : !/^[a-z][a-z0-9+.-]*:/i.test(s)),
        'Use an http or https address, or a file in the config folder.',
      )
      .default(''),
  })
  .openapi('DownloadClientSettings')

// ---------------------------------------------------------------- routes

const QUEUE = `${API_PREFIX}/queue`
const TORRENTS = `${API_PREFIX}/torrents`
const SETTINGS = `${API_PREFIX}/settings`

const queueAction = (action: 'pause' | 'resume' | 'forceImport', summary: string) =>
  createRoute({
    method: 'post',
    path: `${QUEUE}/{id}/${action}`,
    tags: ['Activity'],
    summary,
    ...access('staff'),
    request: { params: IdParam },
    responses: {
      200: json(QueueItem, 'The item'),
      ...errors('unauthorized', 'forbidden', 'not-found', 'conflict'),
    },
  })

export const queue = {
  list: createRoute({
    method: 'get',
    path: QUEUE,
    tags: ['Activity'],
    summary: 'What’s downloading or importing, newest first',
    ...access('staff'),
    responses: {
      200: json(z.array(QueueItem), 'The queue'),
      ...errors('unauthorized', 'forbidden'),
    },
  }),
  pause: queueAction('pause', 'Pause a download'),
  resume: queueAction('resume', 'Resume a download'),
  forceImport: queueAction('forceImport', 'Import a blocked download anyway'),
  searchAlternative: createRoute({
    method: 'post',
    path: `${QUEUE}/{id}/searchAlternative`,
    tags: ['Activity'],
    summary: 'Blocklist the release and grab the best other one',
    description:
      'The torrent and its data are removed. When no other approved release is found, history says so and the next search tries again.',
    ...access('staff'),
    request: { params: IdParam, ...body(SearchAlternativeInput) },
    responses: {
      ...noContent,
      ...errors('invalid', 'unauthorized', 'forbidden', 'not-found'),
    },
  }),
  remove: createRoute({
    method: 'delete',
    path: `${QUEUE}/{id}`,
    tags: ['Activity'],
    summary: 'Remove a download, optionally with its data and onto the blocklist',
    ...access('staff'),
    request: { params: IdParam, ...body(QueueRemoveInput) },
    responses: {
      ...noContent,
      ...errors('invalid', 'unauthorized', 'forbidden', 'not-found'),
    },
  }),
} as const

export const history = {
  list: createRoute({
    method: 'get',
    path: `${API_PREFIX}/history`,
    tags: ['Activity'],
    summary: 'Everything that happened to the library’s titles, newest first',
    description: 'Cursor-paged, 50 to a page.',
    ...access('staff'),
    request: { query: HistoryQuery },
    responses: {
      200: json(HistoryPage, 'A page'),
      ...errors('invalid', 'unauthorized', 'forbidden'),
    },
  }),
  clear: createRoute({
    method: 'delete',
    path: `${API_PREFIX}/history`,
    tags: ['Activity'],
    summary: 'Clear the history',
    ...access('staff'),
    responses: { ...noContent, ...errors('unauthorized', 'forbidden') },
  }),
} as const

export const blocklist = {
  list: createRoute({
    method: 'get',
    path: `${API_PREFIX}/blocklist`,
    tags: ['Activity'],
    summary: 'Releases search and grab skip, newest first',
    ...access('staff'),
    responses: {
      200: json(z.array(BlocklistEntry), 'The blocklist'),
      ...errors('unauthorized', 'forbidden'),
    },
  }),
  remove: createRoute({
    method: 'delete',
    path: `${API_PREFIX}/blocklist/{id}`,
    tags: ['Activity'],
    summary: 'Take a release off the blocklist',
    ...access('staff'),
    request: { params: IdParam },
    responses: { ...noContent, ...errors('unauthorized', 'forbidden', 'not-found') },
  }),
} as const

const torrentAction = (action: 'pause' | 'resume', summary: string) =>
  createRoute({
    method: 'post',
    path: `${TORRENTS}/{id}/${action}`,
    tags: ['Downloads'],
    summary,
    ...access('staff'),
    request: { params: IdParam },
    responses: {
      200: json(Torrent, 'The torrent'),
      ...errors('unauthorized', 'forbidden', 'not-found'),
    },
  })

const allAction = (action: 'pauseAll' | 'resumeAll', summary: string) =>
  createRoute({
    method: 'post',
    path: `${TORRENTS}/${action}`,
    tags: ['Downloads'],
    summary,
    ...access('staff'),
    responses: { ...noContent, ...errors('unauthorized', 'forbidden') },
  })

/** The SDK's `downloads`: every torrent, grabbed or added by hand (A8). */
export const downloads = {
  list: createRoute({
    method: 'get',
    path: TORRENTS,
    tags: ['Downloads'],
    summary: 'Every torrent, newest first',
    ...access('staff'),
    responses: {
      200: json(z.array(Torrent), 'The torrents'),
      ...errors('unauthorized', 'forbidden'),
    },
  }),
  limits: createRoute({
    method: 'get',
    path: `${TORRENTS}/limits`,
    tags: ['Downloads'],
    summary: 'The speed limits, every torrent together',
    description: 'Whether torrents go through the VPN comes from `vpn.status()`.',
    ...access('staff'),
    responses: {
      200: json(TorrentLimits, 'The limits'),
      ...errors('unauthorized', 'forbidden'),
    },
  }),
  setLimits: createRoute({
    method: 'patch',
    path: `${TORRENTS}/limits`,
    tags: ['Downloads'],
    summary: 'Set the speed limits',
    ...access('staff'),
    request: { ...body(TorrentLimits.partial()) },
    responses: {
      200: json(TorrentLimits, 'Saved'),
      ...errors('invalid', 'unauthorized', 'forbidden'),
    },
  }),
  pauseAll: allAction('pauseAll', 'Pause every torrent'),
  resumeAll: allAction('resumeAll', 'Resume every torrent'),
  categories: createRoute({
    method: 'get',
    path: `${TORRENTS}/categories`,
    tags: ['Downloads'],
    summary: 'The categories: movies, manual, then the owner’s, by name',
    ...access('staff'),
    responses: {
      200: json(z.array(TorrentCategory), 'The categories'),
      ...errors('unauthorized', 'forbidden'),
    },
  }),
  saveCategory: createRoute({
    method: 'post',
    path: `${TORRENTS}/categories`,
    tags: ['Downloads'],
    summary: 'Add a category, or change its folder',
    description:
      'Managed in Settings › Download client, so the owner’s, like it. Torrents already in the category stay where they are. A reserved name (movies, manual, shows, music) or a folder outside the data folder and the downloads folder is 400 with `details.field`.',
    ...access('owner'),
    request: { ...body(TorrentCategoryInput) },
    responses: {
      200: json(TorrentCategory, 'Saved'),
      ...errors('invalid', 'unauthorized', 'forbidden'),
    },
  }),
  removeCategory: createRoute({
    method: 'delete',
    path: `${TORRENTS}/categories/{name}`,
    tags: ['Downloads'],
    summary: 'Remove a category',
    description:
      '409 while a torrent or the watch folder uses it, and for movies and manual, which are built in.',
    ...access('owner'),
    request: { params: CategoryParam },
    responses: {
      ...noContent,
      ...errors('unauthorized', 'forbidden', 'not-found', 'conflict'),
    },
  }),
  get: createRoute({
    method: 'get',
    path: `${TORRENTS}/{id}`,
    tags: ['Downloads'],
    summary: 'A torrent, with its files, trackers and seeding rule',
    ...access('staff'),
    request: { params: IdParam },
    responses: {
      200: json(Torrent, 'The torrent'),
      ...errors('unauthorized', 'forbidden', 'not-found'),
    },
  }),
  add: createRoute({
    method: 'post',
    path: TORRENTS,
    tags: ['Downloads'],
    summary: 'Add a torrent by hand: a magnet, an address or a .torrent',
    description:
      'It downloads to its category’s folder (`manual` by default) and isn’t imported. 409 when it’s already in Downloads; 400 for an unknown category or `movies`.',
    ...access('staff'),
    request: { ...body(AddTorrentInput) },
    responses: {
      201: json(Torrent, 'Added'),
      ...errors('invalid', 'unauthorized', 'forbidden', 'conflict', 'unavailable'),
    },
  }),
  delete: createRoute({
    method: 'delete',
    path: `${TORRENTS}/{id}`,
    tags: ['Downloads'],
    summary: 'Remove a torrent, optionally with its data',
    ...access('staff'),
    request: { params: IdParam, ...body(DeleteTorrentInput) },
    responses: { ...noContent, ...errors('invalid', 'unauthorized', 'forbidden', 'not-found') },
  }),
  pause: torrentAction('pause', 'Pause a torrent'),
  resume: torrentAction('resume', 'Resume a torrent'),
  setFilePriority: createRoute({
    method: 'patch',
    path: `${TORRENTS}/{id}/files`,
    tags: ['Downloads'],
    summary: 'Skip a file, or download it first',
    ...access('staff'),
    request: { params: IdParam, ...body(FilePriorityInput) },
    responses: {
      200: json(Torrent, 'The torrent'),
      ...errors('invalid', 'unauthorized', 'forbidden', 'not-found'),
    },
  }),
} as const

export const fs = {
  list: createRoute({
    method: 'get',
    path: `${API_PREFIX}/fs`,
    tags: ['Import'],
    summary: 'A folder’s contents, inside the data root, a root folder or the downloads folder',
    description:
      'Without `path`, the downloads folder (the data root when it doesn’t exist yet). A path outside those folders is 403.',
    ...access('staff'),
    request: { query: FsQuery },
    responses: {
      200: json(FsListing, 'The folder'),
      ...errors('invalid', 'unauthorized', 'forbidden', 'not-found'),
    },
  }),
} as const

export const manualImport = {
  scan: createRoute({
    method: 'post',
    path: `${API_PREFIX}/import/scan`,
    tags: ['Import'],
    summary: 'Look through a folder for files to import, and match them to movies',
    ...access('staff'),
    request: { ...body(ImportScanInput) },
    responses: {
      200: json(z.array(ImportCandidate), 'What was found'),
      ...errors('invalid', 'unauthorized', 'forbidden', 'not-found'),
    },
  }),
  run: createRoute({
    method: 'post',
    path: `${API_PREFIX}/import`,
    tags: ['Import'],
    summary: 'Import the chosen files into their movies',
    ...access('staff'),
    request: { ...body(ImportRunInput) },
    responses: {
      200: json(ImportRunResult, 'What happened to each'),
      ...errors('invalid', 'unauthorized', 'forbidden'),
    },
  }),
} as const

/** A movie's downloads side: grab, files and history (joined to `movies` in `routes`). */
export const movieDownloadRoutes = {
  grabRelease: createRoute({
    method: 'post',
    path: `${API_PREFIX}/movies/{id}/releases/{guid}/grab`,
    tags: ['Movies'],
    summary: 'Grab a release from the last search',
    description:
      'The guid is the release’s, URL-encoded. 409 when the decision engine rejected it or it’s on the blocklist, unless `force`; 404 when the search results have expired; 503 when the indexer couldn’t send it.',
    ...access('staff'),
    request: {
      params: TmdbIdParam.extend({
        guid: z.string().openapi({ param: { name: 'guid', in: 'path' } }),
      }),
      ...body(GrabReleaseInput),
    },
    responses: {
      200: json(QueueItem, 'Grabbed'),
      ...errors('invalid', 'unauthorized', 'forbidden', 'not-found', 'conflict', 'unavailable'),
    },
  }),
  files: createRoute({
    method: 'get',
    path: `${API_PREFIX}/movies/{id}/files`,
    tags: ['Movies'],
    summary: 'A movie’s files, with their streams',
    ...access('staff'),
    request: { params: TmdbIdParam },
    responses: {
      200: json(z.array(MediaFile), 'The files'),
      ...errors('unauthorized', 'forbidden', 'not-found'),
    },
  }),
  history: createRoute({
    method: 'get',
    path: `${API_PREFIX}/movies/{id}/history`,
    tags: ['Movies'],
    summary: 'What happened to a movie, newest first',
    ...access('staff'),
    request: { params: TmdbIdParam, query: HistoryQuery },
    responses: {
      200: json(HistoryPage, 'A page'),
      ...errors('invalid', 'unauthorized', 'forbidden', 'not-found'),
    },
  }),
} as const

export const downloadSettingsRoutes = {
  mediaManagement: createRoute({
    method: 'get',
    path: `${SETTINGS}/mediaManagement`,
    tags: ['Settings'],
    summary: 'Media management: naming and importing',
    ...access('staff'),
    responses: {
      200: json(MediaManagementSettings, 'The settings'),
      ...errors('unauthorized', 'forbidden'),
    },
  }),
  saveMediaManagement: createRoute({
    method: 'put',
    path: `${SETTINGS}/mediaManagement`,
    tags: ['Settings'],
    summary: 'Save media management',
    description: 'A naming format with an unknown token is 400 with `details.field`.',
    ...access('staff'),
    request: { ...body(MediaManagementSettings) },
    responses: {
      200: json(MediaManagementSettings, 'Saved'),
      ...errors('invalid', 'unauthorized', 'forbidden'),
    },
  }),
  downloadClient: createRoute({
    method: 'get',
    path: `${SETTINGS}/downloadClient`,
    tags: ['Settings'],
    summary: 'Download client: the port, encryption, limits and the default seeding rule',
    ...access('owner'),
    responses: {
      200: json(DownloadClientSettings, 'The settings'),
      ...errors('unauthorized', 'forbidden'),
    },
  }),
  saveDownloadClient: createRoute({
    method: 'put',
    path: `${SETTINGS}/downloadClient`,
    tags: ['Settings'],
    summary: 'Save the download client',
    description: 'A new port is listened on at once.',
    ...access('owner'),
    request: { ...body(DownloadClientSettings) },
    responses: {
      200: json(DownloadClientSettings, 'Saved'),
      ...errors('invalid', 'unauthorized', 'forbidden'),
    },
  }),
} as const

export const speedRoutes = {
  speeds: createRoute({
    method: 'get',
    path: `${API_PREFIX}/system/speeds`,
    tags: ['System'],
    summary: 'The last 10 minutes of download and upload rates, a sample a second',
    ...access('staff'),
    responses: {
      200: json(z.array(SpeedSample), 'Oldest first'),
      ...errors('unauthorized', 'forbidden'),
    },
  }),
} as const

export type TorrentFile = z.infer<typeof TorrentFile>
export type Tracker = z.infer<typeof Tracker>
export type SeedingRule = z.infer<typeof SeedingRule>
export type Torrent = z.infer<typeof Torrent>
export type TorrentState = (typeof TORRENT_STATES)[number]
export type QueueItem = z.infer<typeof QueueItem>
export type QueueRemoveInput = z.input<typeof QueueRemoveInput>
export type AddTorrentInput = z.infer<typeof AddTorrentInput>
export type TorrentLimits = z.infer<typeof TorrentLimits>
export type TorrentCategory = z.infer<typeof TorrentCategory>
export type TorrentCategoryInput = z.infer<typeof TorrentCategoryInput>
export type HistoryEvent = z.infer<typeof HistoryEvent>
export type HistoryPage = z.infer<typeof HistoryPage>
export type BlocklistEntry = z.infer<typeof BlocklistEntry>
export type MediaFile = z.infer<typeof MediaFile>
export type GrabReleaseInput = z.infer<typeof GrabReleaseInput>
export type ImportCandidate = z.infer<typeof ImportCandidate>
export type ImportRunInput = z.infer<typeof ImportRunInput>
export type ImportRunResult = z.infer<typeof ImportRunResult>
export type FsItem = z.infer<typeof FsItem>
export type FsListing = z.infer<typeof FsListing>
export type SpeedSample = z.infer<typeof SpeedSample>
export type MediaManagementSettings = z.infer<typeof MediaManagementSettings>
export type DownloadClientSettings = z.infer<typeof DownloadClientSettings>
