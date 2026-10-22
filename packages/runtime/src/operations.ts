// SPDX-License-Identifier: AGPL-3.0-only
// The owner's tools (checkpoint 8b, ADR 0047): General's settings (region, updates, diagnostics),
// the log on disk and its level, crash reports, backups, updates from the signed catalog, and
// `/metrics`. The runtime joins them to the services they read.
import { monitorEventLoopDelay } from 'node:perf_hooks'
import type { Catalog, HighseaRelease } from '@highsea/catalog'
import {
  AppError,
  type Clock,
  type EventBus,
  LEVELS,
  type Level,
  type Logger,
  type MemorySink,
} from '@highsea/core'
import { type Db, type RawDatabase, readSetting, writeSetting } from '@highsea/db'
import type { JobQueue } from '@highsea/jobs'
import { z } from 'zod'
import {
  BACKUP_SCHEDULES,
  BACKUPS_KEY,
  type BackupSettings,
  type Backups,
  checkBackupFolder,
  createBackups,
  defaultBackupSettings,
} from './backups.ts'
import { createCrashReports } from './crashes.ts'
import { LOGS_PRUNE_JOB, LOGS_TOPIC, type LogFiles, type LogQuery, queryLogs } from './logs.ts'
import { createRegistry, type Labels } from './metrics.ts'

export const GENERAL_KEY = 'general'
export const METRICS_KEY = 'metrics'
const UPDATES_STATE_KEY = 'updates.state'
export const SETTINGS_TOPIC = 'settings.updated'
/** A newer highsea than this one is in the catalog; ids hold its version. Notifications hear it. */
export const UPDATES_TOPIC = 'updates.available'
const DAY = 86_400_000
const MINUTE = 60_000

export type GeneralSettings = {
  /** BCP 47: the server's language, for notifications and emails. */
  language: string
  /** IANA: scheduled backups' times are in it. */
  timeZone: string
  updateChannel: 'stable' | 'beta'
  logLevel: Level
  /** Write a report to `/config/crashes/` on an unhandled error; nothing is sent (answer 12). */
  crashReports: boolean
}

export type MetricsSettings = { enabled: boolean }

export type UpdatesView = {
  current: string
  channel: 'stable' | 'beta'
  latest: HighseaRelease | null
  available: boolean
  /** The catalog's last check, when highsea last learned of releases. */
  checkedAt: number | null
}

/** The time zone Docker's `TZ` or the host gives, else UTC. */
export function hostTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}

export function isTimeZone(value: string) {
  if (value === 'UTC') return true
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value })
    return true
  } catch {
    return false
  }
}

const generalInput = z.object({
  language: z.string().regex(/^[a-z]{2,3}(-[A-Z]{2})?$/),
  timeZone: z.string().refine(isTimeZone, 'Choose a time zone from the list.'),
  updateChannel: z.enum(['stable', 'beta']),
  logLevel: z.enum(LEVELS),
  crashReports: z.boolean(),
})

const backupInput = z.object({
  schedule: z.enum(BACKUP_SCHEDULES),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  weekday: z.number().int().min(0).max(6),
  keep: z.number().int().min(1).max(365),
  folder: z.string().min(1).max(4000),
})

const APP_VERSION = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/

/** SemVer 2.0.0 § 11's precedence, without build metadata. Negative when `a` is older. */
export function compareAppVersions(a: string, b: string): number {
  const pa = APP_VERSION.exec(a)
  const pb = APP_VERSION.exec(b)
  if (!pa || !pb) return 0
  for (let i = 1; i <= 3; i++) {
    const d = Number(pa[i]) - Number(pb[i])
    if (d) return d
  }
  const [ra, rb] = [pa[4], pb[4]]
  if (ra === rb) return 0
  if (ra === undefined) return 1
  if (rb === undefined) return -1
  const xa = ra.split('.')
  const xb = rb.split('.')
  for (let i = 0; i < Math.max(xa.length, xb.length); i++) {
    const [x, y] = [xa[i], xb[i]]
    if (x === undefined) return -1
    if (y === undefined) return 1
    const [nx, ny] = [/^\d+$/.test(x), /^\d+$/.test(y)]
    if (nx && ny && Number(x) !== Number(y)) return Number(x) - Number(y)
    if (nx !== ny) return nx ? -1 : 1
    if (x !== y) return x < y ? -1 : 1
  }
  return 0
}

/** What the HTTP layer hands the registry for each request. */
export type HttpObservation = { method: string; route: string; status: number; seconds: number }

export type OperationsDeps = {
  db: Db
  raw: RawDatabase
  jobs: JobQueue
  clock: Clock
  logger: Logger
  events: EventBus
  configDir: string
  version: string
  startedAt: number
  /** The level the config gives, until General saves one. */
  defaultLogLevel: Level
  setLogLevel: (level: Level) => void
  logs: MemorySink
  logFiles: LogFiles
  catalog: Pick<Catalog, 'releases' | 'status'>
  restart: () => void
  /** For `/metrics`. */
  sources: {
    clientsConnected: () => number
    engine: () => { downRate: number; upRate: number }
  }
}

export function createOperations(deps: OperationsDeps) {
  const { db, raw, jobs, clock, events } = deps
  const log = deps.logger.child('operations')

  // ------------------------------------------------------------ General

  const generalDefaults = (): GeneralSettings => ({
    language: 'en',
    timeZone: hostTimeZone(),
    updateChannel: 'stable',
    logLevel: deps.defaultLogLevel,
    crashReports: false,
  })
  const general = () => readSetting(db, GENERAL_KEY, generalDefaults())

  // ------------------------------------------------------------ backups

  const backupSettings = () => readSetting(db, BACKUPS_KEY, defaultBackupSettings(deps.configDir))
  const backups: Backups = createBackups({
    raw,
    jobs,
    clock,
    logger: deps.logger,
    events,
    configDir: deps.configDir,
    version: deps.version,
    settings: backupSettings,
    timeZone: () => general().timeZone,
    restart: deps.restart,
  })

  // ------------------------------------------------------------ logs and crash reports

  let appendTimer: ReturnType<typeof setTimeout> | null = null
  /** Tells System › Logs there's more, at most once a second, so a busy log isn't a busy stream. */
  const announceLogs = () => {
    if (appendTimer) return
    appendTimer = setTimeout(() => {
      appendTimer = null
      events.emit({ topic: LOGS_TOPIC })
    }, 1000)
    appendTimer.unref?.()
  }

  jobs.define({
    type: LOGS_PRUNE_JOB,
    payload: z.object({}),
    attempts: 1,
    async run() {
      const removed = deps.logFiles.prune(clock.now())
      if (removed) log.info('removed old log files', { count: removed })
    },
  })

  const crashes = createCrashReports({
    dir: `${deps.configDir}/crashes`,
    version: deps.version,
    clock,
    enabled: () => general().crashReports,
    recentLog: () => deps.logs.entries(),
  })

  // ------------------------------------------------------------ updates

  function updates(): UpdatesView {
    const channel = general().updateChannel
    const latest =
      deps.catalog
        .releases()
        .filter((r) => channel === 'beta' || r.channel === 'stable')
        .sort((a, b) => compareAppVersions(b.version, a.version))[0] ?? null
    return {
      current: deps.version,
      channel,
      latest,
      available: latest !== null && compareAppVersions(latest.version, deps.version) > 0,
      checkedAt: deps.catalog.status().lastCheck?.at ?? null,
    }
  }

  /** Announces a newer version once, however many checks see it (8b's `update` notification). */
  function announceUpdate() {
    const u = updates()
    if (!u.available || !u.latest) return
    const state = readSetting(db, UPDATES_STATE_KEY, { announced: null as string | null })
    if (state.announced === u.latest.version) return
    writeSetting(db, UPDATES_STATE_KEY, { announced: u.latest.version }, clock.now())
    log.info('a new version of highsea is out', {
      version: u.latest.version,
      current: deps.version,
    })
    events.emit({ topic: UPDATES_TOPIC, ids: [u.latest.version] })
  }

  // ------------------------------------------------------------ metrics

  const metricsSettings = () => readSetting<MetricsSettings>(db, METRICS_KEY, { enabled: false })
  const registry = createRegistry()
  const requests = registry.counter(
    'highsea_http_requests_total',
    'HTTP requests, by route and status.',
  )
  const durations = registry.histogram(
    'highsea_http_request_duration_seconds',
    'How long HTTP requests took, by route.',
  )
  const loopDelay = monitorEventLoopDelay({ resolution: 20 })
  loopDelay.enable()
  const one = (sql: string) => Number(raw.all(sql)[0]?.n ?? 0)
  const rows = (sql: string, ...params: unknown[]) => raw.all(sql, ...params)
  const labelled = (
    sql: string,
    label: (r: Record<string, unknown>) => Labels,
    ...params: unknown[]
  ) => rows(sql, ...params).map((r) => ({ labels: label(r), value: Number(r.n ?? 0) }))

  registry.collect('highsea_info', 'This server’s version.', 'gauge', () => [
    { labels: { version: deps.version }, value: 1 },
  ])
  registry.collect(
    'process_cpu_seconds_total',
    'User and system CPU time spent, in seconds.',
    'counter',
    () => {
      const u = process.cpuUsage()
      return (u.user + u.system) / 1e6
    },
  )
  registry.collect('process_resident_memory_bytes', 'Resident memory, in bytes.', 'gauge', () =>
    process.memoryUsage.rss(),
  )
  registry.collect(
    'process_start_time_seconds',
    'When the process started, in Unix seconds.',
    'gauge',
    () => Math.floor(deps.startedAt / 1000),
  )
  registry.collect(
    'nodejs_heap_size_used_bytes',
    'The V8 heap in use, in bytes.',
    'gauge',
    () => process.memoryUsage().heapUsed,
  )
  // read and reset each scrape, as prom-client's collector does: the delay since the last scrape
  registry.collect(
    'nodejs_eventloop_lag_mean_seconds',
    'The event loop’s mean delay.',
    'gauge',
    () => (Number.isNaN(loopDelay.mean) ? 0 : loopDelay.mean / 1e9),
  )
  registry.collect(
    'nodejs_eventloop_lag_p99_seconds',
    'The event loop’s 99th percentile delay.',
    'gauge',
    () => {
      const v = loopDelay.percentile(99) / 1e9
      loopDelay.reset()
      return v
    },
  )
  registry.collect('highsea_clients_connected', 'Apps with the event stream open.', 'gauge', () =>
    deps.sources.clientsConnected(),
  )
  registry.collect('highsea_jobs', 'Jobs waiting or running, by status.', 'gauge', () =>
    labelled(
      `SELECT status, count(*) AS n FROM jobs WHERE status IN ('queued', 'running') GROUP BY status`,
      (r) => ({ status: String(r.status) }),
    ),
  )
  registry.collect(
    'highsea_job_runs_total',
    'Job runs finished since the server started, by type and outcome.',
    'counter',
    () =>
      labelled(
        `SELECT type, outcome, count(*) AS n FROM job_runs
         WHERE outcome IS NOT NULL AND started_at >= ? GROUP BY type, outcome`,
        (r) => ({ type: String(r.type), outcome: String(r.outcome) }),
        deps.startedAt,
      ),
  )
  registry.collect('highsea_downloads', 'Downloads in the queue, by state.', 'gauge', () =>
    labelled(`SELECT state, count(*) AS n FROM downloads GROUP BY state`, (r) => ({
      state: String(r.state),
    })),
  )
  registry.collect(
    'highsea_download_rate_bytes',
    'Download speed, in bytes a second.',
    'gauge',
    () => deps.sources.engine().downRate,
  )
  registry.collect(
    'highsea_upload_rate_bytes',
    'Upload speed, in bytes a second.',
    'gauge',
    () => deps.sources.engine().upRate,
  )
  registry.collect(
    'highsea_torrent_downloaded_bytes',
    'Bytes downloaded by the torrents in the list.',
    'gauge',
    () => one('SELECT coalesce(sum(downloaded), 0) AS n FROM torrents'),
  )
  registry.collect(
    'highsea_torrent_uploaded_bytes',
    'Bytes uploaded by the torrents in the list.',
    'gauge',
    () => one('SELECT coalesce(sum(uploaded), 0) AS n FROM torrents'),
  )
  const indexerStat = (column: 'queries' | 'failures' | 'grabs') => () =>
    labelled(
      `SELECT i.name AS name, coalesce(sum(s.${column}), 0) AS n FROM indexers i
       LEFT JOIN indexer_stats s ON s.indexer_id = i.id AND s.hour >= ? GROUP BY i.id`,
      (r) => ({ indexer: String(r.name) }),
      clock.now() - DAY,
    )
  registry.collect(
    'highsea_indexer_queries_last_day',
    'Indexer queries in the last 24 hours.',
    'gauge',
    indexerStat('queries'),
  )
  registry.collect(
    'highsea_indexer_failures_last_day',
    'Failed indexer queries in the last 24 hours.',
    'gauge',
    indexerStat('failures'),
  )
  registry.collect(
    'highsea_indexer_grabs_last_day',
    'Grabs from each indexer in the last 24 hours.',
    'gauge',
    indexerStat('grabs'),
  )
  registry.collect('highsea_movies', 'Movies in the library.', 'gauge', () =>
    one(`SELECT count(*) AS n FROM media_items WHERE type = 'movie'`),
  )
  registry.collect('highsea_movie_files', 'Movie files in the library.', 'gauge', () =>
    one('SELECT count(*) AS n FROM media_files'),
  )
  registry.collect(
    'highsea_movie_files_bytes',
    'The size of the library’s movie files, in bytes.',
    'gauge',
    () => one('SELECT coalesce(sum(size), 0) AS n FROM media_files'),
  )

  // ------------------------------------------------------------ the service

  return {
    general: {
      get: general,
      update(input: GeneralSettings) {
        const parsed = generalInput.safeParse(input)
        if (!parsed.success)
          throw new AppError('invalid', 'Those settings aren’t valid.', parsed.error.issues)
        const before = general()
        const next = writeSetting(db, GENERAL_KEY, parsed.data, clock.now())
        deps.setLogLevel(next.logLevel)
        if (before.timeZone !== next.timeZone) backups.reschedule()
        if (before.updateChannel !== next.updateChannel) announceUpdate()
        if (before.logLevel !== next.logLevel)
          log.info('the log level changed', { from: before.logLevel, to: next.logLevel })
        events.emit({ topic: SETTINGS_TOPIC, ids: [GENERAL_KEY] })
        return next
      },
    },

    backups: Object.assign(backups, {
      settings: backupSettings,
      updateSettings(input: BackupSettings) {
        const parsed = backupInput.safeParse(input)
        if (!parsed.success)
          throw new AppError('invalid', 'Those settings aren’t valid.', parsed.error.issues)
        checkBackupFolder(parsed.data.folder)
        const next = writeSetting(db, BACKUPS_KEY, parsed.data, clock.now())
        backups.reschedule()
        void backups
          .prune()
          .catch((e) => log.warn('couldn’t remove old backups', { error: (e as Error).message }))
        events.emit({ topic: SETTINGS_TOPIC, ids: [BACKUPS_KEY] })
        return next
      },
      /** When the next scheduled backup runs; null when the schedule is off. */
      nextRun(): number | null {
        const next = jobs.list({ type: 'backups.scheduled', status: ['queued'], limit: 1 })[0]
        return backupSettings().schedule === 'off' ? null : (next?.runAt ?? null)
      },
    }),

    logs: {
      query: (q: LogQuery) => queryLogs(deps.logs.entries(), q),
      files: () => deps.logFiles.files(),
      paths: () => deps.logFiles.paths(),
      /** A log sink: the event stream hears about new lines. */
      announce: announceLogs,
    },

    crashes,
    updates,
    announceUpdate,

    metrics: {
      settings: metricsSettings,
      updateSettings(input: MetricsSettings) {
        const next = writeSetting(db, METRICS_KEY, { enabled: input.enabled === true }, clock.now())
        events.emit({ topic: SETTINGS_TOPIC, ids: [METRICS_KEY] })
        return next
      },
      enabled: () => metricsSettings().enabled,
      render: () => registry.render(),
      observe(o: HttpObservation) {
        requests.inc({ method: o.method, route: o.route, status: String(o.status) })
        durations.observe({ method: o.method, route: o.route }, o.seconds)
      },
    },

    /** At boot, once everything's defined: the schedules, and what the catalog already says. */
    start(now: number) {
      jobs.schedule(LOGS_PRUNE_JOB, DAY, { firstRunAt: now + 10 * MINUTE })
      backups.start()
      announceUpdate()
      // the catalog's check emits `catalog.updated`; releases ride its manifest
      return events.subscribe((e) => {
        if (e.topic === 'catalog.updated') announceUpdate()
      })
    },

    stop() {
      loopDelay.disable()
      if (appendTimer) clearTimeout(appendTimer)
      appendTimer = null
    },
  }
}

export type Operations = ReturnType<typeof createOperations>
