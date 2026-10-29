// SPDX-License-Identifier: AGPL-3.0-only
// First-run setup (setup.md). Open only until setup is complete, then every route here answers
// 404. The indexer step arrived with checkpoint 5, the subtitle step with checkpoint 7a. In 4.3c
// setup shrank to the owner and a review of what highsea found (`detect`; install-simplicity.md B).
import { createRoute, z } from '@hono/zod-openapi'
import { Session } from './accounts.ts'
import { API_PREFIX, access, body, errors, json, noContent } from './common.ts'
import { CatalogIndexer } from './indexers.ts'
import { ACCELERATION_PATHS } from './playback-settings.ts'
import { MetadataInput, MetadataKey } from './settings.ts'
import { Language } from './subtitles.ts'
import { Server } from './system.ts'

export const FsEntry = z
  .object({ name: z.string(), path: z.string(), kind: z.literal('folder') })
  .openapi('FsEntry')

export const HardlinkCheck = z
  .object({
    ok: z.boolean(),
    /** Same filesystem: imports hardlink, so seeding takes no extra space. */
    sameDevice: z.boolean(),
    message: z.string(),
  })
  .openapi('HardlinkCheck')

export const RemoteAccessInput = z
  .discriminatedUnion('kind', [
    z.object({ kind: z.literal('local-only') }),
    z.object({ kind: z.literal('reverse-proxy'), url: z.string().max(2000) }),
    z.object({ kind: z.literal('port-forward'), port: z.number().int() }),
  ])
  .openapi('RemoteAccessInput')

export const SetupInput = z
  .object({
    serverName: z.string().max(60),
    owner: z.object({
      username: z.string().max(32),
      displayName: z.string().max(100),
      password: z.string().max(256),
    }),
    folders: z.object({ movies: z.string().max(4096), downloads: z.string().max(4096) }),
    remoteAccess: RemoteAccessInput,
    /** Remembered for when highsea cloud exists. Off when omitted. */
    cloudLink: z.boolean().optional(),
    /**
     * The owner's locale for the metadata language and region, and their own TMDB key if they
     * added one on Review (4.3c): without it, the key built into highsea is used. A key is checked
     * with TMDB before the owner is made: 400 `tmdb-key-rejected` when TMDB refuses it.
     */
    metadata: MetadataInput.optional(),
    /** An IANA time zone, the browser's unless changed on Review (4.3c). Omitted keeps the host's. */
    timeZone: z.string().max(100).optional(),
    /**
     * The address apps on the network use, `host:port` (4.3c; ADR 0020): the host's when highsea
     * could see it, else the one the browser opened setup at. `HIGHSEA_PUBLISHED_URL` wins over it.
     */
    address: z.string().max(260).optional(),
    /**
     * The indexer step (checkpoint 5): definition ids from the starter pack. Each is added and
     * tested once the owner exists; one that fails is skipped and can be added later.
     */
    indexers: z.array(z.string().max(100)).max(50).optional(),
    /**
     * The subtitle step (checkpoint 7): profile codes in order, written into the seeded profile,
     * each as Regular and forced, Without SDH. Omitted keeps English.
     */
    subtitleLanguages: z.array(z.string().max(10)).max(20).optional(),
  })
  .openapi('SetupInput')

export const SetupDefaults = z
  .object({
    /** The media root: folders are chosen inside it, so hardlinks work. */
    dataDir: z.string(),
    folders: z.object({ movies: z.string(), downloads: z.string() }),
    serverName: z.string(),
  })
  .openapi('SetupDefaults')

export const SetupDetected = z
  .object({
    /** The host's name as a server name; null when the container's hostname is only its id. */
    serverName: z.string().nullable(),
    /** A movies and a downloads folder under the media root, or null when setup asks. */
    folders: z.object({ movies: z.string(), downloads: z.string() }).nullable(),
    /** The address apps on the network use, `host:port`; null in a bridge network. */
    address: z.string().nullable().openapi({ example: '192.168.1.20:3000' }),
    /** The graphics chip whose check passed, or null for the processor. */
    graphics: z.object({ name: z.string(), path: z.enum(ACCELERATION_PATHS) }).nullable(),
  })
  .openapi('SetupDetected')

const SETUP = `${API_PREFIX}/setup`

export const setup = {
  defaults: createRoute({
    method: 'get',
    path: `${SETUP}/defaults`,
    tags: ['Setup'],
    summary: 'Where setup starts: the media root and suggested folders',
    ...access('public'),
    responses: { 200: json(SetupDefaults, 'Defaults'), ...errors('not-found') },
  }),
  detect: createRoute({
    method: 'get',
    path: `${SETUP}/detect`,
    tags: ['Setup'],
    summary: 'What highsea found by itself: a name, folders, an address and graphics',
    description:
      'The defaults setup shows on Review (4.3c). Each is null when highsea couldn’t find it: setup then asks for folders, and offers the address the browser used.',
    ...access('public'),
    responses: { 200: json(SetupDetected, 'What was found'), ...errors('not-found') },
  }),
  listFolders: createRoute({
    method: 'get',
    path: `${SETUP}/fs`,
    tags: ['Setup'],
    summary: 'The folders inside a folder of the media root',
    ...access('public'),
    request: { query: z.object({ path: z.string().max(4096) }) },
    responses: { 200: json(z.array(FsEntry), 'Folders'), ...errors('invalid', 'not-found') },
  }),
  checkHardlinks: createRoute({
    method: 'get',
    path: `${SETUP}/fs/hardlinks`,
    tags: ['Setup'],
    summary: 'Whether imports from downloads to movies can be hardlinked',
    ...access('public'),
    request: { query: z.object({ a: z.string().max(4096), b: z.string().max(4096) }) },
    responses: { 200: json(HardlinkCheck, 'The check'), ...errors('invalid', 'not-found') },
  }),
  checkMetadataKey: createRoute({
    method: 'post',
    path: `${SETUP}/metadata-key`,
    tags: ['Setup'],
    summary: 'Check a TMDB key with TMDB, without saving it',
    description:
      'The key step’s Continue. 400 with `details.reason` `tmdb-key-rejected` when TMDB doesn’t accept it; 503 (`tmdb-unreachable`) when TMDB can’t be reached.',
    ...access('public'),
    request: { ...body(z.object({ key: MetadataKey })) },
    responses: {
      ...noContent,
      ...errors('invalid', 'not-found', 'rate-limited', 'unavailable'),
    },
  }),
  starterPack: createRoute({
    method: 'get',
    path: `${SETUP}/indexers`,
    tags: ['Setup'],
    summary: 'The indexer step’s starter pack',
    description:
      'The catalog’s public starters that need no setting to add: `GET /api/v1/catalog/indexers?starter=true` without the ones asking for an account or an address.',
    ...access('public'),
    responses: { 200: json(z.array(CatalogIndexer), 'Definitions'), ...errors('not-found') },
  }),
  languages: createRoute({
    method: 'get',
    path: `${SETUP}/languages`,
    tags: ['Setup'],
    summary: 'The subtitle step’s languages',
    description:
      'The languages a subtitle profile can ask for, as `GET /api/v1/subtitles/languages` lists them for staff.',
    ...access('public'),
    responses: { 200: json(z.array(Language), 'Languages'), ...errors('not-found') },
  }),
  complete: createRoute({
    method: 'post',
    path: SETUP,
    tags: ['Setup'],
    summary: 'Finish setup: name the server, make the owner, and sign them in',
    ...access('public'),
    request: { ...body(SetupInput) },
    responses: {
      200: json(z.object({ server: Server, session: Session }).openapi('SetupResult'), 'Set up'),
      ...errors('invalid', 'not-found', 'conflict'),
    },
  }),
} as const

export type SetupInput = z.infer<typeof SetupInput>
export type SetupDetected = z.infer<typeof SetupDetected>
export type FsEntry = z.infer<typeof FsEntry>
export type HardlinkCheck = z.infer<typeof HardlinkCheck>
