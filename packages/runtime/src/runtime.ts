// SPDX-License-Identifier: AGPL-3.0-only
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { networkInterfaces } from 'node:os'
import { join, resolve } from 'node:path'
import { type Auth, createAuth, type Issued, type RequestMeta } from '@highsea/auth'
import {
  CATALOG_SETTINGS_KEY,
  type Catalog,
  createCatalog,
  createVpnProviderCatalog,
  defaultCatalogSettings,
  SEED_DIR,
  type TrustedKey,
  trustedKeys,
} from '@highsea/catalog'
import {
  AppError,
  type Clock,
  createEventBus,
  createLogger,
  createSealer,
  type EventBus,
  type Fetch,
  generateSecretKey,
  jsonSink,
  type Logger,
  type LogSink,
  type MemorySink,
  memorySink,
  newId,
  SECRET_KEY_BYTES,
  type Sealer,
  systemClock,
} from '@highsea/core'
import { type Database, type Db, migrate, openDatabase, readSetting, schema } from '@highsea/db'
import {
  createDownloads,
  createIpBlocklist,
  createWatchFolder,
  DEFAULT_DOWNLOAD_CLIENT,
  DOWNLOAD_CLIENT_KEY,
  type DownloadClientSettings,
  type Downloads,
  type WatchFolder,
} from '@highsea/downloads'
import { createQbittorrentImporter, type QbittorrentImporter } from '@highsea/importers/qbittorrent'
import { createRadarrImporter, type RadarrImporter } from '@highsea/importers/radarr'
import { createIndexers, type Indexers } from '@highsea/indexers'
import { createJobQueue, type JobQueue } from '@highsea/jobs'
import { createMovies, type Movies } from '@highsea/media/movies'
import {
  checkPath,
  createLibraryWatch,
  createMedia,
  type LibraryWatch,
  type Media,
  unarAvailable,
  unarBinary,
  vetFiles,
  type WatchFn,
} from '@highsea/media/shared'
import { createMetadata, type Metadata, TMDB_ATTRIBUTION } from '@highsea/metadata'
import type { MdnsResponder } from '@highsea/network'
import {
  type Branding,
  createPersonalization,
  type Personalization,
  type WidgetSource,
} from '@highsea/personalization'
import { createTorrentEngine, HASH_WORKER, type TorrentEngine } from '@highsea/torrent'
import { CommandFailed, createVpn, type Vpn } from '@highsea/vpn'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { type BrowseListing, browse } from './browse.ts'
import type { Config } from './config.ts'
import { homeRows } from './home-rows.ts'
import { createNetworkService, type NetworkService } from './network.ts'
import {
  checkSetup,
  FOLDERS_KEY,
  isSetupComplete,
  type MediaFolders,
  type RemoteAccessInput,
  saveSetup,
  setupDefaults,
} from './setup.ts'
import { createCpuMeter, type Disk, disks, type HealthIssue, memory } from './system.ts'
import { createWorkerPool, type WorkerPool } from './workers.ts'

/** Milestone 1 has the server, the movie library, indexers and downloads; later checkpoints add theirs. */
const SOURCES: WidgetSource[] = ['system', 'movies', 'indexers', 'downloads']

/** Searches an indexer search for a movie in the background: Search now and bulk search queue it. */
export const MOVIE_SEARCH_JOB = 'movies.search'

/** A provider's credit, in the wording its terms ask for. */
export type Attribution = { name: string; notice: string; url: string }

/**
 * TMDB's terms ask for its notice in an About or Credits section
 * (https://www.themoviedb.org/api-terms-of-use): public info carries it to every app.
 */
const ATTRIBUTIONS: Attribution[] = [
  { name: 'TMDB', notice: TMDB_ATTRIBUTION, url: 'https://www.themoviedb.org' },
]

export type ServerIdentity = { id: string; name: string; createdAt: number }

export type PublicInfo = {
  id: string
  name: string
  version: string
  /** Where this server answers on the local network (`http://192.168.1.20:3000`). */
  localAddresses: string[]
  publicUrl: string | null
  setupComplete: boolean
  auth: { local: boolean; oidc: { name: string } | null; passkeys: boolean }
  /**
   * What this server can do so far. Clients show a widget only when its source is here, so a
   * server keeps working while later milestones add the rest.
   */
  sources: WidgetSource[]
  /** The data providers to credit in each app's About. */
  attributions: Attribution[]
}

/** The server card and status bar's server. */
export type ServerView = {
  id: string
  name: string
  version: string
  branding: Branding
  addresses: { local: string[]; public: string | null }
  setupComplete: boolean
  clientsConnected: number
  /** The main catalog's installed version; null before one is installed. */
  catalogVersion: string | null
}

export type SystemStatus = {
  version: string
  startedAt: number
  cpu: number
  memory: { used: number; total: number }
  disks: Disk[]
}

export type SetupInput = {
  serverName: string
  owner: { username: string; displayName: string; password: string }
  folders: MediaFolders
  remoteAccess: RemoteAccessInput
  cloudLink: boolean
  /** The TMDB key step: the key (skipped when absent), the metadata language and the region. */
  metadata?: { key?: string; language?: string; region?: string }
  /** The indexer step: definition ids from the starter pack. */
  indexers?: string[]
}

export type HealthReport = {
  status: 'ok' | 'degraded'
  checks: { name: string; ok: boolean; message?: string }[]
}

export type Runtime = {
  config: Config
  version: string
  startedAt: number
  clock: Clock
  logger: Logger
  /** The last log entries, for System › Logs. */
  logs: MemorySink
  events: EventBus
  database: Database
  db: Db
  jobs: JobQueue
  sealer: Sealer
  workers: WorkerPool
  auth: Auth
  network: NetworkService
  personalization: Personalization
  /** TMDB, the metadata cache and images (ADR 0029, 0030). */
  metadata: Metadata
  /** What every media type shares: profiles, formats, quality sizes and root folders (ADR 0036). */
  media: Media
  /** The movie library. */
  movies: Movies
  /** Signed definitions: the seed, the main catalog, extra catalogs and local ones (ADR 0034). */
  catalog: Catalog
  /** Indexers, their health and release search (ADR 0035). */
  indexers: Indexers
  /** The BitTorrent engine (ADR 0037). */
  engine: TorrentEngine
  /** Grabs, the queue, the monitor and the blocklist (ADR 0038); categories (6b). */
  downloads: Downloads
  /** The watch folder (6b): `tick()` looks once; the runtime looks every 10 seconds. */
  watchFolder: WatchFolder
  /** VPN connections: the mode, the tunnel, the checks and the binding (ADR 0040). */
  vpn: Vpn
  /** The one-time importers from Radarr and qBittorrent: Settings › Migration (ADR 0041). */
  importers: { radarr: RadarrImporter; qbittorrent: QbittorrentImporter }
  /**
   * Watching the root folders (6b): a change asks for a scan of its title folder. `sync()` after
   * root folders change; a root that can't be watched is a health note, and the 12-hourly scan
   * covers it.
   */
  libraryWatch: Pick<LibraryWatch, 'problems' | 'watching'> & { sync(): void }
  /** Setup's movies and downloads folders. */
  folders(): MediaFolders
  /** A folder inside the data root, a root folder or the downloads folder (A17's Browse). */
  browse(path?: string): BrowseListing
  /** A library movie's row id, from its TMDB id; not-found when it isn't in the library. */
  itemId(tmdbId: number): string
  identity(): ServerIdentity
  rename(name: string): void
  /** `origin` is the browser's, when known: passkeys depend on it. */
  publicInfo(origin?: string): PublicInfo
  setupComplete(): boolean
  /** Setup's indexer step: public starters that need no setting, so each adds in a click. */
  starterPack(): ReturnType<Indexers['catalog']>
  /** Setup's last step: the owner, the server's name and choices, and the owner signed in. */
  completeSetup(input: SetupInput, meta: RequestMeta): Promise<Issued>
  server(): ServerView
  status(): SystemStatus
  /** What needs attention, for the server card and System › Health. */
  issues(): HealthIssue[]
  health(): HealthReport
  /** Runs `fn` on shutdown, before the database closes (last registered, first run). */
  onShutdown(fn: () => Promise<void> | void): void
  shutdown(): Promise<void>
}

export type BootOptions = {
  config: Config
  version: string
  clock?: Clock
  /** Extra log sinks; stdout gets JSON lines unless `quiet`. */
  sinks?: LogSink[]
  quiet?: boolean
  /** An in-memory database, for tests. */
  memory?: boolean
  /** Don't tick the job queue on a timer (tests tick it by hand). */
  manualTicks?: boolean
  /** Answer LAN discovery and advertise over mDNS. Off unless asked: the server entry turns it on. */
  discovery?: boolean
  mdns?: () => Promise<MdnsResponder>
  /**
   * Every outside request: single sign-on's provider and TMDB (ADR 0029). Tests, the sweeps and
   * the replay mode pass `createReplayFetch()` from `@highsea/metadata/replay`.
   */
  fetch?: Fetch
  /**
   * Where the catalog comes from. By default the seed shipped in `@highsea/catalog`, the keys the
   * config trusts, and `config.catalogUrl`. Tests and the sweeps pass a locally signed one.
   */
  catalog?: {
    seedDir?: string | null
    trustedKeys?: readonly TrustedKey[]
    mainUrl?: string | null
  }
  /** Each indexer's time to answer; tests shorten it. */
  indexerTimeoutMs?: number
  /**
   * The torrent engine's listening port and DHT. By default Settings › Download client's port and
   * the DHT on; an in-memory runtime (tests) takes any free port and no DHT. `offline` never hands
   * the engine a binding, so no torrent opens a socket: tests that don't download pass it.
   */
  torrent?: { port?: number; dht?: boolean; offline?: boolean }
  /** ffprobe, the downloads folder and the rest the import pipeline takes; tests pass clips. */
  importing?: Parameters<typeof createMovies>[0]['importing']
  /** `fs.watch` for the root folders; tests pass one that fails. */
  watch?: WatchFn
}

const g = globalThis as typeof globalThis & { __highsea?: Runtime }

/** The booted runtime. Next-rendered code and API handlers read it here. */
export function getRuntime(): Runtime {
  if (!g.__highsea) throw new Error('The highsea runtime hasn’t booted.')
  return g.__highsea
}

export const hasRuntime = () => g.__highsea !== undefined

/**
 * Boots in order: folders and the secret key, the database (backed up, then migrated), events,
 * jobs (recovering interrupted ones), workers. Later checkpoints add the torrent engine, the
 * download monitor, catalog sync, discovery and the filesystem watcher.
 */
export async function boot(options: BootOptions): Promise<Runtime> {
  const { config, version, clock = systemClock } = options
  const logs = memorySink()
  const sinks = [logs, ...(options.sinks ?? [])]
  if (!options.quiet) sinks.push(jsonSink())
  const logger = createLogger({ level: config.logLevel, sinks, clock })
  const log = logger.child('runtime')

  for (const dir of [config.configDir, join(config.configDir, 'backups')])
    mkdirSync(dir, { recursive: true })

  const sealer = createSealer(loadSecretKey(join(config.configDir, 'secret.key')))

  const database = openDatabase(options.memory ? ':memory:' : join(config.configDir, 'highsea.db'))
  const { applied, backup } = migrate(database.raw, {
    backupDir: join(config.configDir, 'backups'),
    now: clock.now(),
  })
  if (applied.length) log.info('migrated the database', { applied, backup })
  const db = database.db

  const events = createEventBus({ now: () => clock.now() })
  const jobs = createJobQueue({ db, clock, logger, events })
  jobs.recover()
  if (!options.manualTicks) jobs.startTicking()

  const workers = createWorkerPool()
  const shutdownHooks: (() => Promise<void> | void)[] = []
  const startedAt = clock.now()

  const identity = (): ServerIdentity => {
    const row = db.select().from(schema.settings).where(eq(schema.settings.key, 'server')).get()
    if (row) return row.value as ServerIdentity
    const created: ServerIdentity = { id: newId('srv'), name: 'highsea', createdAt: clock.now() }
    db.insert(schema.settings)
      .values({ key: 'server', value: created, updatedAt: created.createdAt })
      .run()
    return created
  }
  identity()

  const rename = (name: string) => {
    const current = identity()
    db.update(schema.settings)
      .set({ value: { ...current, name }, updatedAt: clock.now() })
      .where(eq(schema.settings.key, 'server'))
      .run()
    events.emit({ topic: 'server.updated' })
  }

  const publicInfo = (origin?: string): PublicInfo => {
    const { id, name } = identity()
    return {
      id,
      name,
      version,
      localAddresses: localAddresses(config.port),
      publicUrl: network.externalUrl(),
      setupComplete: isSetupComplete(db),
      auth: auth.methods(origin),
      sources: SOURCES,
      attributions: ATTRIBUTIONS,
    }
  }

  const network = createNetworkService({
    db,
    config,
    clock,
    events,
    logger,
    answer: () => publicInfo(),
    mdnsInfo: () => ({ ...identity(), version }),
    responder: options.mdns,
    discovery: options.discovery ?? false,
  })

  const auth = createAuth({
    db,
    clock,
    sealer,
    events,
    logger: logger.child('auth'),
    version,
    serverName: () => identity().name,
    addresses: () => ({
      externalUrl: network.externalUrl(),
      localOrigins: [...localAddresses(config.port), `http://localhost:${config.port}`],
    }),
    fetch: options.fetch,
  })

  const metadata = createMetadata({
    db,
    jobs,
    clock,
    logger,
    events,
    sealer,
    fetch: options.fetch ?? globalThis.fetch,
    imagesDir: join(config.dataDir, 'images'),
  })
  metadata.jobs.schedule(clock.now())

  const outside = options.fetch ?? globalThis.fetch
  const catalog = createCatalog({
    db,
    jobs,
    clock,
    logger,
    events,
    fetch: outside,
    configDir: config.configDir,
    trustedKeys: options.catalog?.trustedKeys ?? trustedKeys(config.catalogDevKey ?? false),
    seedDir: options.catalog?.seedDir === undefined ? SEED_DIR : options.catalog.seedDir,
    mainUrl:
      options.catalog?.mainUrl === undefined
        ? (config.catalogUrl ?? null)
        : options.catalog.mainUrl,
  })
  catalog.defineJobs()
  catalog.start()
  catalog.schedule(clock.now())

  // the VPN providers, the catalog's `vpn-providers` kind (ADR 0042 › 6b), on its channel
  const vpnProviders = createVpnProviderCatalog({
    logger,
    clock,
    jobs,
    fetch: outside,
    configDir: config.configDir,
    trustedKeys: options.catalog?.trustedKeys ?? trustedKeys(config.catalogDevKey ?? false),
    seedDir: join(SEED_DIR, 'vpn-providers'),
    mainUrl:
      options.catalog?.mainUrl === undefined
        ? (config.catalogUrl ?? null)
        : options.catalog.mainUrl,
    settings: () => {
      const s = readSetting(db, CATALOG_SETTINGS_KEY, defaultCatalogSettings)
      return { channel: s.channel, autoUpdate: s.autoUpdate }
    },
  })
  vpnProviders.defineJobs()
  vpnProviders.start()
  vpnProviders.schedule(clock.now())

  // indexer searches and .torrent downloads go through the VPN when its switch is on (answer V6);
  // the VPN is created after the engine, so they reach it through this
  let vpnRef: Vpn | null = null
  const indexerFetch: Fetch = (input, init) =>
    vpnRef ? vpnRef.indexerFetch(input, init) : outside(input, init)

  const indexers = createIndexers({
    db,
    jobs,
    clock,
    logger,
    events,
    sealer,
    fetch: indexerFetch,
    definitions: catalog,
    timeoutMs: options.indexerTimeoutMs,
  })
  indexers.defineJobs()
  indexers.schedule()
  const stopIndexers = indexers.start()

  const folders = (): MediaFolders => readSetting(db, FOLDERS_KEY, setupDefaults(config).folders)
  const { mediaItems } = schema
  const movieRow = (tmdbId: number) =>
    db
      .select()
      .from(mediaItems)
      .where(and(eq(mediaItems.type, 'movie'), eq(mediaItems.tmdbId, tmdbId)))
      .get()
  /** A library row's movie, as downloads names it. */
  const movieOf = (itemId: string) => {
    const row = db
      .select({ tmdbId: mediaItems.tmdbId, title: mediaItems.title, year: mediaItems.year })
      .from(mediaItems)
      .where(eq(mediaItems.id, itemId))
      .get()
    return row?.tmdbId != null ? { tmdbId: row.tmdbId, title: row.title, year: row.year } : null
  }

  // what every media type shares: profiles, formats, sizes and root folders
  const media = createMedia({ db, clock, logger })
  media.seed()
  const movies = createMovies(
    {
      db,
      jobs,
      clock,
      events,
      logger,
      metadata,
      // the owner's categories may keep their torrents outside the downloads folder (6b)
      importing: {
        ...options.importing,
        downloadDirs: () => [folders().downloads, ...downloads.categoryFolders()],
      },
      search: {
        canSearch: () => indexers.hasEnabled(),
        queue(tmdbIds) {
          for (const tmdbId of tmdbIds)
            jobs.enqueue(MOVIE_SEARCH_JOB, { tmdbId }, { dedupeKey: `movie:${tmdbId}` })
        },
      },
    },
    media,
  )
  // safe to repeat: a search replaces the movie's cached results; a removed movie is skipped
  jobs.define({
    type: MOVIE_SEARCH_JOB,
    payload: z.object({ tmdbId: z.number().int() }),
    attempts: 2,
    async run({ tmdbId }) {
      let input: ReturnType<Movies['searchInput']>
      try {
        input = movies.searchInput(tmdbId)
      } catch (e) {
        if (e instanceof AppError && e.code === 'not-found') return
        throw e
      }
      const result = await indexers.search(input)
      log.info('searched for a movie', {
        tmdbId,
        releases: result.releases.length,
        approved: result.releases.filter((r) => r.approved).length,
        searched: result.searched,
      })
      // a monitored movie without a file grabs the best approved release; grabBest skips a
      // version that's already downloading, so a repeated job grabs nothing twice
      const row = movieRow(tmdbId)
      if (row?.monitored && row.status !== 'available' && result.releases.some((r) => r.approved))
        await downloads.grabBest(row.id, null)
    },
  })
  movies.jobs.schedule(clock.now())

  // watching only speeds the library scan up: a change asks for its title folder's scan
  const watch = createLibraryWatch({
    onChange: (folder) => movies.libraryScan.queue(folder),
    watch: options.watch,
    log: logger.child('watch'),
  })
  const syncWatch = () => watch.sync(media.rootFolders.list().map((f) => f.path))
  syncWatch()
  // root folders added or removed announce `settings.updated` (the root folder routes)
  const stopWatchSync = events.subscribe((e) => {
    if (e.topic === 'settings.updated') syncWatch()
  })
  // unar, found as ffprobe is: missing is a health note and a clear reason on each archive's import
  let unarMissing = false
  void unarAvailable(unarBinary()).then((ok) => {
    unarMissing = !ok
    if (!ok) log.warn('unar isn’t installed, so downloads in archives can’t be imported')
  })

  // the torrent engine: hashing in the worker pool, every torrent's files vetted before a byte
  // downloads, and no networking until the VPN hands it a binding (ADR 0037, 0040)
  const client = readSetting<DownloadClientSettings>(
    db,
    DOWNLOAD_CLIENT_KEY,
    DEFAULT_DOWNLOAD_CLIENT,
  )
  const torrentLog = logger.child('downloads')
  let onEngineEvent: Parameters<typeof createTorrentEngine>[0]['emit'] = () => {}
  const engine = createTorrentEngine({
    db,
    logger,
    clock,
    hash: (data) => workers.run<string>({ module: HASH_WORKER, fn: 'sha1', input: data }),
    vet: (files) => vetFiles(files.map((f) => f.path)),
    port: options.torrent?.port ?? (options.memory ? 0 : client.port),
    dht: (options.torrent?.dht ?? !options.memory) ? { enabled: true } : undefined,
    utp: client.utp,
    emit: (e) => onEngineEvent?.(e),
    encryption: client.encryption,
    // 6b: the router opens the port only with the UPnP switch on and no VPN set: a mapping on the
    // home router does nothing for a tunnel (the plan's Production features)
    portMapping: {
      wanted: () =>
        readSetting<DownloadClientSettings>(db, DOWNLOAD_CLIENT_KEY, DEFAULT_DOWNLOAD_CLIENT)
          .upnp && vpn.settings().mode === 'off',
    },
  })
  await engine.start()

  const downloads = createDownloads({
    db,
    clock,
    logger: torrentLog,
    events,
    jobs,
    engine,
    indexers,
    fetch: indexerFetch,
    movie: movieOf,
    async search(itemId) {
      const movie = movieOf(itemId)
      if (!movie) return []
      return (await indexers.search(movies.searchInput(movie.tmdbId))).releases
    },
    downloadsFolder: () => folders().downloads,
    history: (entry) => {
      media.history.write(entry)
    },
    async importer(input) {
      const result = await movies.importDownload({
        itemId: input.itemId,
        versionId: input.versionId,
        folder: input.path,
        releaseTitle: input.releaseTitle,
        quality: input.quality,
        indexer: input.indexer,
        downloadId: input.downloadId,
      })
      if (result.status === 'imported') return { ok: true, transfer: result.transfer }
      return result.status === 'blocked' && result.replace
        ? { ok: false, reason: result.reason, replace: true }
        : { ok: false, reason: result.reason }
    },
    // a category's folder and the watch folder: inside the data root or the downloads folder,
    // checked the way the importer checks paths (symlinks resolved first)
    checkFolder: (path) => checkPath(path, [resolve(config.dataDir), folders().downloads]),
  })
  onEngineEvent = downloads.onEngineEvent
  downloads.defineJobs()
  // the stall check every few minutes (ADR 0038), as indexers.schedule() does for its jobs
  downloads.schedule()
  const stopDownloads = downloads.start()
  // the watch folder (6b): a timer the runtime owns; tests tick it by hand
  const watchFolder = createWatchFolder({
    clock,
    logger: torrentLog,
    settings: downloads.settings,
    checkFolder: (path) => checkPath(path, [resolve(config.dataDir), folders().downloads]),
    add: (input) => downloads.add(input),
  })
  const stopWatching = options.manualTicks ? () => {} : watchFolder.start()

  // the IP blocklist (6b): fetched daily through the fetch seam, kept in the config folder
  const ipBlocklist = createIpBlocklist({
    db,
    jobs,
    clock,
    logger: torrentLog,
    events,
    fetch: outside,
    engine,
    configDir: config.configDir,
  })
  ipBlocklist.defineJobs()
  const stopIpBlocklist = ipBlocklist.start()

  const vpn = createVpn({
    db,
    sealer,
    logger,
    clock,
    events,
    fetch: outside,
    providers: () => vpnProviders.providers(),
    // an in-memory runtime (tests, the sweeps) never changes the host's network
    ...(options.memory
      ? {
          runner: async (cmd) => {
            throw new CommandFailed(cmd.op, 'platform', 'Not in an in-memory runtime.')
          },
        }
      : {}),
    onBinding: (binding) => (options.torrent?.offline ? undefined : engine.setBinding(binding)),
    // a forwarded port becomes the engine's listening port (6b); none keeps the one it has
    onForwardedPort: (port) => {
      if (port !== null && !options.torrent?.offline)
        engine.setPort(port).catch((e) =>
          torrentLog.warn('couldn’t listen on the forwarded port', {
            error: (e as Error).message,
          }),
        )
    },
    listeningPort: () => engine.status().port,
  })
  vpnRef = vpn
  vpn.start()

  // the one-time importers (ADR 0041): Radarr and qBittorrent through the fetch seam, credentials
  // sealed in the job's payload, root folders added only inside the data root
  const migrationLog = logger.child('migration')
  const radarr = createRadarrImporter({
    db,
    jobs,
    clock,
    events,
    logger: migrationLog,
    fetch: outside,
    sealer,
    media,
    movies,
    downloads,
    allowedRoots: () => [resolve(config.dataDir)],
  })
  const qbittorrent = createQbittorrentImporter({
    db,
    jobs,
    clock,
    events,
    logger: migrationLog,
    fetch: outside,
    sealer,
    downloads,
    engine,
    checkFolder: (path) => checkPath(path, [resolve(config.dataDir), folders().downloads]),
    grabs: radarr.grabs,
  })

  const personalization = createPersonalization(
    {
      db,
      clock,
      events,
      serverName: () => identity().name,
      rename,
    },
    { homeRows: () => homeRows(db) },
  )

  const cpu = createCpuMeter()

  const runtime: Runtime = {
    config,
    version,
    startedAt,
    clock,
    logger,
    logs,
    events,
    database,
    db,
    jobs,
    sealer,
    workers,
    auth,
    network,
    personalization,
    metadata,
    media,
    movies,
    catalog,
    indexers,
    engine,
    downloads,
    watchFolder,
    vpn,
    importers: { radarr, qbittorrent },
    libraryWatch: { sync: syncWatch, problems: watch.problems, watching: watch.watching },
    folders,
    // starts in the downloads folder, where stray files usually are (A17), else the data root
    browse: (path) =>
      browse(
        [
          resolve(config.dataDir),
          ...media.rootFolders.list().map((f) => f.path),
          folders().downloads,
          ...downloads.categoryFolders(),
        ],
        path ?? (existsSync(folders().downloads) ? folders().downloads : undefined),
      ),
    itemId(tmdbId) {
      const row = movieRow(tmdbId)
      if (!row) throw new AppError('not-found', 'That movie isn’t in the library.')
      return row.id
    },
    identity,
    rename,
    publicInfo,
    setupComplete: () => isSetupComplete(db),
    starterPack: () =>
      indexers
        .catalog({ starter: true })
        .filter((d) => d.settings.every((f) => !f.required || f.default !== undefined)),
    async completeSetup(input, meta) {
      if (isSetupComplete(db)) throw new AppError('not-found', 'Setup is already complete.')
      // everything that can be checked before the owner exists, so a mistake leaves nothing behind
      checkSetup(config, input)
      const md = input.metadata ?? {}
      const key = md.key?.trim()
      // the key step checked the key already; checking again keeps a bad one from being stored
      if (key) await metadata.settings.checkKey(key)
      const owner = await auth.createOwner(input.owner, meta)
      saveSetup({ db, config, clock, events }, input, rename, input.serverName)
      // the contract checked their shape; the owner's locale when the step sent them
      if (md.language !== undefined || md.region !== undefined)
        metadata.settings.update({ language: md.language, region: md.region })
      // setup's movies folder is the first root folder (setup.ts › MediaFolders); saveSetup made it
      const folder = resolve(input.folders.movies)
      try {
        if (!media.rootFolders.list().some((f) => f.path === folder)) media.rootFolders.add(folder)
        syncWatch()
      } catch (e) {
        log.warn('couldn’t add the movies folder as a root folder', { error: (e as Error).message })
      }
      if (key)
        try {
          await metadata.settings.setKey(key)
        } catch (e) {
          // the owner exists now: setup finishes, and the key is added in Settings › General
          log.warn('couldn’t save the TMDB key at setup', { error: (e as Error).message })
        }
      // the indexer step: added once the owner exists, each tested first. Not awaited, so a slow
      // or unreachable site doesn't hold up Finish for its 30 seconds; they appear on the
      // dashboard as they pass, and one that fails is logged and can be added from Indexers
      const pack = new Set(runtime.starterPack().map((d) => d.id))
      const chosen = [...new Set(input.indexers ?? [])].filter((id) => pack.has(id))
      if (chosen.length)
        void Promise.allSettled(
          chosen.map((id) =>
            indexers.add(id).catch((e) => {
              log.warn('couldn’t add an indexer at setup', {
                definition: id,
                error: (e as Error).message,
              })
            }),
          ),
        )
      log.info('setup complete', { owner: owner.username })
      return auth.signInAfterSetup(owner.id, meta)
    },
    server() {
      const { id, name } = identity()
      return {
        id,
        name,
        version,
        branding: personalization.appearance.branding(),
        addresses: { local: localAddresses(config.port), public: network.externalUrl() },
        setupComplete: isSetupComplete(db),
        clientsConnected: network.clientsConnected(),
        catalogVersion: catalog.version(),
      }
    },
    status() {
      return {
        version,
        startedAt,
        cpu: cpu(),
        memory: memory(),
        disks: disks([
          { label: 'Media', path: config.dataDir },
          { label: 'Config', path: config.configDir },
        ]),
      }
    },
    issues() {
      const out: HealthIssue[] = []
      const report = runtime.health()
      for (const c of report.checks)
        if (!c.ok)
          out.push({
            id: c.name,
            source: c.name,
            level: 'error',
            message: c.message ?? '',
            since: startedAt,
          })
      const tls = network.tlsProblem()
      if (tls)
        out.push({ id: 'tls', source: 'Network', level: 'error', message: tls, since: startedAt })
      const discovery = network.discoveryProblem()
      if (discovery)
        out.push({
          id: 'discovery',
          source: 'Network',
          level: 'warning',
          message: discovery,
          since: startedAt,
        })
      const net = network.settings()
      if (net.remoteAccess !== 'local-only' && net.externalUrl.startsWith('http:'))
        out.push({
          id: 'external-url',
          source: 'Network',
          level: 'warning',
          message:
            'The external URL isn’t HTTPS: passwords cross the internet unencrypted, and passkeys can’t work there.',
          since: startedAt,
        })
      for (const i of catalog.issues()) out.push({ ...i, source: 'Catalog', since: startedAt })
      for (const i of indexers.issues()) out.push({ ...i, source: 'Indexers' })
      for (const i of downloads.issues()) out.push({ ...i, source: 'Downloads' })
      for (const i of ipBlocklist.issues()) out.push({ ...i, source: 'Downloads' })
      for (const i of vpn.issues()) out.push({ ...i, source: 'VPN' })
      if (unarMissing)
        out.push({
          id: 'unar-missing',
          source: 'Import',
          level: 'warning',
          message:
            'unar isn’t installed, so downloads that come as archives can’t be imported. Install unar, or set HIGHSEA_UNAR to its path.',
          since: startedAt,
        })
      for (const p of watch.problems())
        out.push({
          id: `watch:${p.root}`,
          source: 'Library',
          level: 'notice',
          message: `${p.root} isn’t watched for changes (${p.message}). The library scan still finds them every 12 hours.`,
          since: startedAt,
        })
      return out
    },
    health() {
      const checks: HealthReport['checks'] = []
      try {
        database.raw.all('SELECT 1')
        checks.push({ name: 'database', ok: true })
      } catch (e) {
        checks.push({ name: 'database', ok: false, message: (e as Error).message })
      }
      return { status: checks.every((c) => c.ok) ? 'ok' : 'degraded', checks }
    },
    onShutdown(fn) {
      shutdownHooks.push(fn)
    },
    async shutdown() {
      log.info('shutting down')
      for (const fn of shutdownHooks.reverse()) {
        try {
          await fn()
        } catch (e) {
          log.error('a shutdown step failed', { error: (e as Error).message })
        }
      }
      await vpn.stop()
      stopWatching()
      stopWatchSync()
      watch.stop()
      stopDownloads()
      stopIpBlocklist()
      await engine.close()
      movies.close()
      stopIndexers()
      await network.stopDiscovery()
      await jobs.drain()
      await workers.close()
      database.raw.close()
      if (g.__highsea === runtime) g.__highsea = undefined
    },
  }
  g.__highsea = runtime
  await network.startDiscovery()
  log.info('booted', { version, database: database.driver, configDir: config.configDir })
  return runtime
}

/** Reads `/config/secret.key`, creating it (readable by this user only) on first boot. */
function loadSecretKey(path: string): Uint8Array {
  if (existsSync(path)) {
    const key = readFileSync(path)
    if (key.length !== SECRET_KEY_BYTES)
      throw new Error(
        `${path} isn’t a highsea secret key (${key.length} bytes, not ${SECRET_KEY_BYTES}).`,
      )
    return key
  }
  const key = generateSecretKey()
  writeFileSync(path, key, { mode: 0o600 })
  chmodSync(path, 0o600)
  return key
}

/** Non-internal IPv4 addresses, as URLs on `port`. */
export function localAddresses(port: number): string[] {
  return Object.values(networkInterfaces())
    .flat()
    .filter((a) => a && a.family === 'IPv4' && !a.internal)
    .map((a) => `http://${a?.address}:${port}`)
}
