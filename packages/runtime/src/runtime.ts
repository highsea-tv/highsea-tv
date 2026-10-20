// SPDX-License-Identifier: AGPL-3.0-only
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { networkInterfaces } from 'node:os'
import { join } from 'node:path'
import {
  type Clock,
  createEventBus,
  createLogger,
  createSealer,
  type EventBus,
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
import { eq } from 'drizzle-orm'
import type { Config } from './config.ts'
import { createWorkerPool, type WorkerPool } from './workers.ts'

export type ServerIdentity = { id: string; name: string; createdAt: number }

export type PublicInfo = {
  id: string
  name: string
  version: string
  /** Where this server answers on the local network (`http://192.168.1.20:3000`). */
  localAddresses: string[]
  publicUrl: string | null
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
  identity(): ServerIdentity
  publicInfo(): PublicInfo
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
    identity,
    publicInfo() {
      const { id, name } = identity()
      return {
        id,
        name,
        version,
        localAddresses: localAddresses(config.port),
        publicUrl: config.publicUrl ?? null,
      }
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
      await jobs.drain()
      await workers.close()
      database.raw.close()
      if (g.__highsea === runtime) g.__highsea = undefined
    },
  }
  g.__highsea = runtime
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
