// SPDX-License-Identifier: AGPL-3.0-only
// The one-time importers (checkpoint 6b; ADR 0041; the owner's answer 10): Settings › Migration.
// For Radarr and for qBittorrent: test a connection, preview what comes across, run the import as
// a job, read its progress (which changes on `migration.updated`). qBittorrent's torrents come
// across paused; Resume starts them once the owner has stopped qBittorrent. All the owner's: an
// importer takes another program's credentials (checkpoint 6's access table).
import { createRoute, z } from '@hono/zod-openapi'
import { API_PREFIX, access, body, errors, IsoDate, json } from './common.ts'

/** The topic an import's progress is announced on. */
export const MIGRATION_TOPIC = 'migration.updated'

const Url = z.string().trim().min(1).max(2048).openapi({ example: 'http://radarr:7878' })

export const PathMapping = z
  .object({
    /** The other program's path, as it reports it. */
    from: z.string().trim().min(1).max(4096).openapi({ example: '/movies' }),
    /** The same folder as highsea sees it. */
    to: z.string().trim().min(1).max(4096).openapi({ example: '/data/media/movies' }),
  })
  .openapi('PathMapping')

const PathMappings = z.array(PathMapping).max(20)

export const RadarrConnection = z
  .object({ url: Url, apiKey: z.string().trim().min(1).max(200) })
  .openapi('RadarrConnection')

export const RadarrPreviewInput = RadarrConnection.extend({ pathMappings: PathMappings }).openapi(
  'RadarrPreviewInput',
)

export const RadarrRunInput = RadarrPreviewInput.extend({
  /** Radarr's profile id → highsea's, or `copy` to bring it across as it is; one left out takes the nearest. */
  profiles: z.record(z.string(), z.string().min(1).max(64)).optional(),
  /** Bring Radarr's naming format and file settings across. On when left out. */
  settings: z.boolean().optional(),
}).openapi('RadarrRunInput')

export const RadarrTest = z
  .object({ version: z.string(), movies: z.number().int().nonnegative() })
  .openapi('RadarrTest')

export const RadarrPreview = z
  .object({
    version: z.string(),
    movies: z.object({
      total: z.number().int(),
      withFiles: z.number().int(),
      inLibrary: z.number().int(),
      /** Not in highsea yet, with a folder highsea may use. */
      ready: z.number().int(),
    }),
    profiles: z.array(
      z.object({
        radarrId: z.number().int(),
        name: z.string(),
        cutoff: z.string(),
        movies: z.number().int(),
        /**
         * highsea's profile ids, nearest by cutoff first; the first is the suggestion. `copy`, last,
         * brings Radarr's profile across as it is, when it can be.
         */
        options: z.array(z.string()),
      }),
    ),
    rootFolders: z.array(
      z.object({
        radarr: z.string(),
        path: z.string(),
        status: z.enum(['root-folder', 'add', 'outside']),
        movies: z.number().int(),
      }),
    ),
    tags: z.number().int(),
    blocklist: z.number().int(),
    naming: z.object({
      rename: z.boolean(),
      folderFormat: z.string(),
      fileFormat: z.string(),
      /** A token highsea doesn't know: the formats stay highsea's. */
      problem: z.string().nullable(),
    }),
    /** Radarr's API returns their credentials as `********`: they're added again in Indexers. */
    kept: z.object({ indexers: z.array(z.string()), downloadClients: z.array(z.string()) }),
    problems: z.array(z.object({ title: z.string(), message: z.string() })),
  })
  .openapi('RadarrPreview')

export const QbittorrentConnection = z
  .object({
    url: Url.openapi({ example: 'http://qbittorrent:8080' }),
    username: z.string().max(200),
    password: z.string().max(200),
  })
  .openapi('QbittorrentConnection')

export const QbittorrentPreviewInput = QbittorrentConnection.extend({
  pathMappings: PathMappings,
}).openapi('QbittorrentPreviewInput')

export const QbittorrentTest = z
  .object({ version: z.string(), webApi: z.string(), torrents: z.number().int().nonnegative() })
  .openapi('QbittorrentTest')

export const QbittorrentPreview = z
  .object({
    version: z.string(),
    webApi: z.string(),
    torrents: z.object({
      total: z.number().int(),
      ready: z.number().int(),
      inDownloads: z.number().int(),
      outside: z.number().int(),
      /** Grabbed by Radarr for a movie in the library: linked to it. */
      linked: z.number().int(),
    }),
    categories: z.array(
      z.object({ qbittorrent: z.string(), name: z.string(), folder: z.string().nullable() }),
    ),
    savePaths: z.array(
      z.object({
        qbittorrent: z.string(),
        path: z.string(),
        ok: z.boolean(),
        torrents: z.number().int(),
      }),
    ),
    list: z.array(
      z.object({
        hash: z.string(),
        name: z.string(),
        size: z.number(),
        category: z.string(),
        savePath: z.string(),
        status: z.enum(['ready', 'in-downloads', 'outside']),
        movie: z.number().int().nullable(),
      }),
    ),
  })
  .openapi('QbittorrentPreview')

const statusFields = {
  state: z.enum(['idle', 'running', 'done', 'failed']),
  total: z.number().int().nonnegative(),
  done: z.number().int().nonnegative(),
  imported: z.number().int().nonnegative(),
  /** Already in highsea: a second run skips them. */
  skipped: z.number().int().nonnegative(),
  failures: z.array(z.object({ name: z.string(), message: z.string() })),
  startedAt: IsoDate.nullable(),
  finishedAt: IsoDate.nullable(),
}

export const ImportStatus = z.object(statusFields).openapi('ImportStatus')

export const QbittorrentImportStatus = z
  .object({
    ...statusFields,
    /** Brought across and still paused, waiting for Resume. */
    paused: z.number().int().nonnegative(),
    /** Having their data checked. */
    checking: z.number().int().nonnegative(),
    resumedAt: IsoDate.nullable(),
  })
  .openapi('QbittorrentImportStatus')

const failuresOf = errors('invalid', 'unauthorized', 'forbidden', 'unavailable')

export const importers = {
  radarrTest: createRoute({
    method: 'post',
    path: `${API_PREFIX}/importers/radarr/test`,
    tags: ['Migration'],
    summary: 'Check Radarr’s address and API key',
    description:
      'A wrong key is 400 with `bad-credentials`; an address that doesn’t answer is 503 with `unreachable`.',
    ...access('owner'),
    request: { ...body(RadarrConnection) },
    responses: { 200: json(RadarrTest, 'Radarr answered'), ...failuresOf },
  }),
  radarrPreview: createRoute({
    method: 'post',
    path: `${API_PREFIX}/importers/radarr/preview`,
    tags: ['Migration'],
    summary: 'What would come across from Radarr, with the profile mapping',
    ...access('owner'),
    request: { ...body(RadarrPreviewInput) },
    responses: { 200: json(RadarrPreview, 'The preview'), ...failuresOf },
  }),
  radarrRun: createRoute({
    method: 'post',
    path: `${API_PREFIX}/importers/radarr/run`,
    tags: ['Migration'],
    summary: 'Import from Radarr, as a job',
    description: 'One run at a time (409 `running`). Safe to run again: what’s there is skipped.',
    ...access('owner'),
    request: { ...body(RadarrRunInput) },
    responses: {
      200: json(ImportStatus, 'The job started'),
      ...errors('invalid', 'unauthorized', 'forbidden', 'not-found', 'conflict'),
    },
  }),
  radarrStatus: createRoute({
    method: 'get',
    path: `${API_PREFIX}/importers/radarr`,
    tags: ['Migration'],
    summary: 'The Radarr import’s progress',
    ...access('owner'),
    responses: {
      200: json(ImportStatus, 'The last or current run'),
      ...errors('unauthorized', 'forbidden'),
    },
  }),
  qbittorrentTest: createRoute({
    method: 'post',
    path: `${API_PREFIX}/importers/qbittorrent/test`,
    tags: ['Migration'],
    summary: 'Sign in to qBittorrent and check its version',
    description:
      'A wrong username or password is 400 with `bad-credentials`; below qBittorrent 4.5.0 (Web API 2.8.18) it’s 400 with `too-old`.',
    ...access('owner'),
    request: { ...body(QbittorrentConnection) },
    responses: { 200: json(QbittorrentTest, 'qBittorrent answered'), ...failuresOf },
  }),
  qbittorrentPreview: createRoute({
    method: 'post',
    path: `${API_PREFIX}/importers/qbittorrent/preview`,
    tags: ['Migration'],
    summary: 'What would come across from qBittorrent',
    ...access('owner'),
    request: { ...body(QbittorrentPreviewInput) },
    responses: { 200: json(QbittorrentPreview, 'The preview'), ...failuresOf },
  }),
  qbittorrentRun: createRoute({
    method: 'post',
    path: `${API_PREFIX}/importers/qbittorrent/run`,
    tags: ['Migration'],
    summary: 'Import qBittorrent’s torrents, paused, as a job',
    ...access('owner'),
    request: { ...body(QbittorrentPreviewInput) },
    responses: {
      200: json(QbittorrentImportStatus, 'The job started'),
      ...errors('invalid', 'unauthorized', 'forbidden', 'conflict'),
    },
  }),
  qbittorrentStatus: createRoute({
    method: 'get',
    path: `${API_PREFIX}/importers/qbittorrent`,
    tags: ['Migration'],
    summary: 'The qBittorrent import’s progress, and how many torrents wait paused',
    ...access('owner'),
    responses: {
      200: json(QbittorrentImportStatus, 'The last or current run'),
      ...errors('unauthorized', 'forbidden'),
    },
  }),
  qbittorrentResume: createRoute({
    method: 'post',
    path: `${API_PREFIX}/importers/qbittorrent/resume`,
    tags: ['Migration'],
    summary: 'Resume the torrents brought across, once qBittorrent is stopped',
    ...access('owner'),
    responses: {
      200: json(QbittorrentImportStatus, 'Resumed'),
      ...errors('unauthorized', 'forbidden', 'conflict'),
    },
  }),
}

export type PathMapping = z.infer<typeof PathMapping>
export type RadarrPreview = z.infer<typeof RadarrPreview>
export type QbittorrentPreview = z.infer<typeof QbittorrentPreview>
export type ImportStatus = z.infer<typeof ImportStatus>
export type QbittorrentImportStatus = z.infer<typeof QbittorrentImportStatus>
