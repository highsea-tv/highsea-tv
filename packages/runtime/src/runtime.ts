// SPDX-License-Identifier: AGPL-3.0-only
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { networkInterfaces } from 'node:os'
import { join, resolve } from 'node:path'
import { type Auth, createAuth, type Issued, type RequestMeta } from '@highsea/auth'
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
import { type Database, type Db, migrate, openDatabase, schema } from '@highsea/db'
import { createJobQueue, type JobQueue } from '@highsea/jobs'
import { createMovies, type Movies } from '@highsea/media-movies'
import { createMetadata, type Metadata, TMDB_ATTRIBUTION } from '@highsea/metadata'
import type { MdnsResponder } from '@highsea/network'
import {
  type Branding,
  createPersonalization,
  type Personalization,
  type WidgetSource,
} from '@highsea/personalization'
import { eq } from 'drizzle-orm'
import type { Config } from './config.ts'
import { homeRows } from './home-rows.ts'
import { createNetworkService, type NetworkService } from './network.ts'
import {
  checkSetup,
  isSetupComplete,
  type MediaFolders,
  type RemoteAccessInput,
  saveSetup,
} from './setup.ts'
import { createCpuMeter, type Disk, disks, type HealthIssue, memory } from './system.ts'
import { createWorkerPool, type WorkerPool } from './workers.ts'

/** Milestone 1 has the server itself and the movie library; each later checkpoint adds its own. */
const SOURCES: WidgetSource[] = ['system', 'movies']

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
  /** The movie library. */
  movies: Movies
  identity(): ServerIdentity
  rename(name: string): void
  /** `origin` is the browser's, when known: passkeys depend on it. */
  publicInfo(origin?: string): PublicInfo
  setupComplete(): boolean
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

  const movies = createMovies({ db, jobs, clock, events, logger, metadata })
  movies.seed()
  movies.jobs.schedule(clock.now())

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
    movies,
    identity,
    rename,
    publicInfo,
    setupComplete: () => isSetupComplete(db),
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
        if (!movies.rootFolders.list().some((f) => f.path === folder))
          movies.rootFolders.add(folder)
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
      movies.close()
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
