// SPDX-License-Identifier: AGPL-3.0-only
// First-run setup (setup.md). Open only until setup is complete, then every route here answers
// 404. The indexer step arrived with checkpoint 5; the subtitle step arrives with its package.
import { createRoute, z } from '@hono/zod-openapi'
import { Session } from './accounts.ts'
import { API_PREFIX, access, body, errors, json, noContent } from './common.ts'
import { CatalogIndexer } from './indexers.ts'
import { MetadataInput, MetadataKey } from './settings.ts'
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
    cloudLink: z.boolean(),
    /**
     * The TMDB key step (checkpoint 4): the key, checked already with `checkMetadataKey`, and the
     * owner's locale for the metadata language and region. Omitted or without a key when skipped.
     */
    metadata: MetadataInput.optional(),
    /**
     * The indexer step (checkpoint 5): definition ids from the starter pack. Each is added and
     * tested once the owner exists; one that fails is skipped and can be added later.
     */
    indexers: z.array(z.string().max(100)).max(50).optional(),
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
export type FsEntry = z.infer<typeof FsEntry>
export type HardlinkCheck = z.infer<typeof HardlinkCheck>
