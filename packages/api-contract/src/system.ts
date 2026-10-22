// SPDX-License-Identifier: AGPL-3.0-only
// System routes: health for Docker, the public info clients read before signing in (connectivity
// .md), and the event stream. Checkpoint 8b adds the owner's tools (ADR 0047): backups, the log and
// crash reports, updates, and /metrics for Prometheus.
import { createRoute, z } from '@hono/zod-openapi'
import { API_PREFIX, access, errors, IdParam, IsoDate, IsoDay, json, noContent } from './common.ts'
import { Branding, WIDGET_SOURCES } from './personalization.ts'

export const Health = z
  .object({
    status: z.enum(['ok', 'degraded']),
    checks: z.array(
      z.object({ name: z.string(), ok: z.boolean(), message: z.string().optional() }),
    ),
  })
  .openapi('Health')

/** A provider's credit, in the wording its terms ask for (`TMDB_ATTRIBUTION`). */
export const Attribution = z
  .object({
    name: z.string().openapi({ example: 'TMDB' }),
    notice: z.string(),
    url: z.string().openapi({ example: 'https://www.themoviedb.org' }),
  })
  .openapi('Attribution')

export const PublicInfo = z
  .object({
    id: z.string().openapi({ example: 'srv_5k2m9x0q4r7t1v3w' }),
    name: z.string().openapi({ example: 'Harbor' }),
    version: z.string().openapi({ example: '0.1.0' }),
    localAddresses: z.array(z.string()).openapi({ example: ['http://192.168.1.20:3000'] }),
    publicUrl: z.string().nullable().openapi({ example: 'https://harbor.example.net' }),
    setupComplete: z.boolean(),
    /** What the sign-in screen offers here. Passkeys depend on the address the client used. */
    auth: z.object({
      local: z.boolean(),
      oidc: z.object({ name: z.string() }).nullable(),
      passkeys: z.boolean(),
    }),
    /** What this server can do so far: clients show a widget only when its source is here. */
    sources: z.array(z.enum(WIDGET_SOURCES)).openapi({ example: ['system', 'movies'] }),
    /**
     * The data providers whose terms ask to be credited, for each app's About (TMDB's terms).
     * Empty when absent: discovery answers leave it out to stay small.
     */
    attributions: z.array(Attribution).default([]),
  })
  .openapi('PublicInfo')

export const Server = z
  .object({
    id: z.string(),
    name: z.string(),
    version: z.string(),
    /** Inherited by every client; the owner sets it in Appearance. */
    branding: Branding,
    addresses: z.object({ local: z.array(z.string()), public: z.string().nullable() }),
    setupComplete: z.boolean(),
    /** Apps with the event stream open now. */
    clientsConnected: z.number().int(),
    /** The indexer catalog's installed version, for System › About; null before one is. */
    catalogVersion: z.string().nullable(),
  })
  .openapi('Server')

export const Disk = z
  .object({
    path: z.string(),
    label: z.string(),
    free: z.number(),
    total: z.number(),
    /** What uses the disk, in bytes: the movies, the downloads, and everything else. */
    usedBy: z.object({ movies: z.number(), downloads: z.number(), other: z.number() }),
  })
  .openapi('Disk')

export const SystemStatus = z
  .object({
    version: z.string(),
    startedAt: IsoDate,
    /** Seconds since the server started. */
    uptime: z.number().int(),
    /** Apps with the event stream open now. */
    clientsConnected: z.number().int(),
    catalogVersion: z.string().nullable(),
    addresses: z.object({ local: z.array(z.string()), public: z.string().nullable() }),
    /** Percent of every core, the last minute's average. */
    cpu: z.number(),
    memory: z.object({ used: z.number(), total: z.number() }),
    /** highsea's own share: percent of every core, and its resident memory in bytes. */
    process: z.object({ cpu: z.number(), memory: z.number() }),
    disks: z.array(Disk),
  })
  .openapi('SystemStatus')

export const BACKUP_KINDS = ['scheduled', 'manual', 'before-update', 'before-restore'] as const

export const Backup = z
  .object({
    id: z.string().openapi({ example: 'highsea-2026-10-21T03-30-00Z-scheduled' }),
    kind: z.enum(BACKUP_KINDS),
    createdAt: IsoDate,
    /** The zip's size, in bytes. */
    size: z.number().int(),
    /** The highsea that made it; null when unknown. */
    version: z.string().nullable(),
    /** The newest database migration it has. */
    schema: z.string().nullable(),
    /** Why it can't be restored (from a newer highsea, or damaged); null when it can. */
    problem: z.string().nullable(),
  })
  .openapi('Backup')

export const BackupList = z
  .object({
    backups: z.array(Backup),
    /** When the next scheduled backup runs; null when the schedule is off. */
    nextRun: IsoDate.nullable(),
  })
  .openapi('BackupList')

export const LOG_LEVELS = ['debug', 'info', 'warn', 'error'] as const

export const LogEntry = z
  .object({
    at: IsoDate,
    level: z.enum(LOG_LEVELS),
    /** The part of the server that wrote it, e.g. `downloads`. */
    source: z.string(),
    message: z.string(),
    fields: z.record(z.string(), z.unknown()).optional(),
  })
  .openapi('LogEntry')

export const LogQuery = z.object({
  /** This level and above. */
  level: z.enum(LOG_LEVELS).optional(),
  /** In the source, the message or the fields; any case. */
  search: z.string().max(200).optional(),
  limit: z.coerce.number<number>().int().min(1).max(1000).optional(),
})

export const LogFile = z
  .object({ name: z.string(), date: IsoDay, size: z.number().int() })
  .openapi('LogFile')

export const Logs = z
  .object({
    /** Newest first, from the lines kept in memory since the server started. */
    entries: z.array(LogEntry),
    /** The files on disk, a day each, oldest first: kept 14 days. */
    files: z.array(LogFile),
  })
  .openapi('Logs')

export const CrashReport = z
  .object({
    id: z.string(),
    at: IsoDate,
    /** Where it came from: `uncaughtException`, `unhandledRejection` or `api`. */
    origin: z.string(),
    /** The error's name and first line. */
    message: z.string(),
    size: z.number().int(),
  })
  .openapi('CrashReport')

export const AppRelease = z
  .object({
    version: z.string().openapi({ example: '0.3.0' }),
    channel: z.enum(['stable', 'beta']),
    date: IsoDay,
    notes: z.array(z.string()),
    url: z.string().optional(),
  })
  .openapi('AppRelease')

export const Updates = z
  .object({
    current: z.string(),
    channel: z.enum(['stable', 'beta']),
    /** The newest release on the channel, from the signed catalog; null when it names none. */
    latest: AppRelease.nullable(),
    available: z.boolean(),
    /** When the catalog was last checked; null before it has been. */
    checkedAt: IsoDate.nullable(),
  })
  .openapi('Updates')

const BackupParam = z.object({
  id: z
    .string()
    .max(200)
    .openapi({ param: { name: 'id', in: 'path' } }),
})

const binary = (type: string, description: string) => ({
  description,
  content: { [type]: { schema: z.string().openapi({ format: 'binary' }) } },
})

export const JobInfo = z
  .object({
    id: z.string(),
    name: z.string(),
    state: z.enum(['running', 'queued', 'idle', 'failed']),
    nextRun: IsoDate.nullable(),
  })
  .openapi('JobInfo')

/** A scheduled task (System › Tasks, checkpoint 8a): a job type the server runs on a schedule. */
export const Task = z
  .object({
    /** The job type, e.g. `indexers.rss`. */
    id: z.string(),
    state: z.enum(['running', 'queued', 'idle', 'failed']),
    /** Seconds between runs. */
    interval: z.number().int(),
    lastRun: IsoDate.nullable(),
    nextRun: IsoDate.nullable(),
    /** The last run's error, when it failed. */
    lastError: z.string().nullable(),
  })
  .openapi('Task')

export const HealthCheck = z
  .object({
    id: z.string(),
    source: z.string(),
    level: z.enum(['ok', 'notice', 'warning', 'error']),
    message: z.string(),
    since: IsoDate,
  })
  .openapi('HealthCheck')

export type PublicInfo = z.infer<typeof PublicInfo>
export type Attribution = z.infer<typeof Attribution>

export const system = {
  health: createRoute({
    method: 'get',
    path: '/api/health',
    tags: ['System'],
    summary: 'Health, for Docker and load balancers',
    ...access('public'),
    responses: {
      200: json(Health, 'The server is up'),
      ...errors('unavailable'),
    },
  }),
  publicInfo: createRoute({
    method: 'get',
    path: `${API_PREFIX}/system/info/public`,
    tags: ['System'],
    summary: 'Who this server is, without signing in',
    ...access('public'),
    responses: { 200: json(PublicInfo, 'The server’s public info') },
  }),
  events: createRoute({
    method: 'get',
    path: `${API_PREFIX}/events`,
    tags: ['System'],
    summary: 'Server events (SSE)',
    ...access('user'),
    description:
      'A `text/event-stream` of ServerEvent objects. Send `Last-Event-ID` to catch up after a reconnect.',
    request: {
      headers: z.object({ 'last-event-id': z.string().optional() }),
      query: z.object({
        topics: z
          .string()
          .optional()
          .openapi({ description: 'Comma-separated topics; all when absent' }),
      }),
    },
    responses: {
      200: {
        description: 'The event stream',
        content: { 'text/event-stream': { schema: z.string() } },
      },
    },
  }),
  server: createRoute({
    method: 'get',
    path: `${API_PREFIX}/system/server`,
    tags: ['System'],
    summary: 'The server card: name, version, branding, clients connected',
    ...access('user'),
    responses: { 200: json(Server, 'The server'), ...errors('unauthorized') },
  }),
  status: createRoute({
    method: 'get',
    path: `${API_PREFIX}/system/status`,
    tags: ['System'],
    summary: 'CPU, memory and disks, for the status bar',
    ...access('staff'),
    responses: { 200: json(SystemStatus, 'Status'), ...errors('unauthorized', 'forbidden') },
  }),
  jobs: createRoute({
    method: 'get',
    path: `${API_PREFIX}/system/jobs`,
    tags: ['System'],
    summary: 'Running and upcoming jobs',
    ...access('staff'),
    responses: { 200: json(z.array(JobInfo), 'Jobs'), ...errors('unauthorized') },
  }),
  tasks: createRoute({
    method: 'get',
    path: `${API_PREFIX}/system/tasks`,
    tags: ['System'],
    summary: 'The scheduled tasks, with their last and next runs',
    ...access('staff'),
    responses: {
      200: json(z.array(Task), 'Tasks, by id'),
      ...errors('unauthorized', 'forbidden'),
    },
  }),
  runTask: createRoute({
    method: 'post',
    path: `${API_PREFIX}/system/tasks/{id}/run`,
    tags: ['System'],
    summary: 'Run a scheduled task now',
    ...access('staff'),
    request: { params: IdParam },
    responses: { ...noContent, ...errors('unauthorized', 'forbidden', 'not-found') },
  }),
  healthChecks: createRoute({
    method: 'get',
    path: `${API_PREFIX}/system/health`,
    tags: ['System'],
    summary: 'What needs attention, for the server card’s dot and System › Health',
    ...access('staff'),
    responses: {
      200: json(z.array(HealthCheck), 'Checks'),
      ...errors('unauthorized', 'forbidden'),
    },
  }),

  // ---------------------------------------------------------------- the owner's tools (8b)

  backups: createRoute({
    method: 'get',
    path: `${API_PREFIX}/system/backups`,
    tags: ['System'],
    summary: 'The backups in the backup folder, newest first',
    ...access('owner'),
    responses: { 200: json(BackupList, 'Backups'), ...errors('unauthorized', 'forbidden') },
  }),
  backupNow: createRoute({
    method: 'post',
    path: `${API_PREFIX}/system/backups`,
    tags: ['System'],
    summary: 'Back up now',
    description: 'A copy of the database and a manifest in a zip. The secret key is never in it.',
    ...access('owner'),
    responses: {
      201: json(Backup, 'The backup'),
      ...errors('unauthorized', 'forbidden', 'unavailable'),
    },
  }),
  downloadBackup: createRoute({
    method: 'get',
    path: `${API_PREFIX}/system/backups/{id}/download`,
    tags: ['System'],
    summary: 'Download a backup',
    ...access('owner'),
    request: { params: BackupParam },
    responses: {
      200: binary('application/zip', 'The zip'),
      ...errors('unauthorized', 'forbidden', 'not-found'),
    },
  }),
  deleteBackup: createRoute({
    method: 'delete',
    path: `${API_PREFIX}/system/backups/{id}`,
    tags: ['System'],
    summary: 'Delete a backup',
    ...access('owner'),
    request: { params: BackupParam },
    responses: { ...noContent, ...errors('unauthorized', 'forbidden', 'not-found') },
  }),
  restore: createRoute({
    method: 'post',
    path: `${API_PREFIX}/system/backups/{id}/restore`,
    tags: ['System'],
    summary: 'Restore a backup: the server restarts',
    description:
      'What is there now is backed up first. The server restarts and puts the backup’s database in place, then migrates it; if that fails, the database before goes back and System › Health says why. 409 with `details.reason` `newer-schema` for a backup from a newer highsea, `unreadable` for a damaged one.',
    ...access('owner'),
    request: { params: BackupParam },
    responses: {
      202: { description: 'The server is restarting' },
      ...errors('unauthorized', 'forbidden', 'not-found', 'conflict'),
    },
  }),
  logs: createRoute({
    method: 'get',
    path: `${API_PREFIX}/system/logs`,
    tags: ['System'],
    summary: 'The log: recent lines, by level and search, and the files on disk',
    ...access('staff'),
    request: { query: LogQuery },
    responses: {
      200: json(Logs, 'The log'),
      ...errors('invalid', 'unauthorized', 'forbidden'),
    },
  }),
  downloadLogs: createRoute({
    method: 'get',
    path: `${API_PREFIX}/system/logs/download`,
    tags: ['System'],
    summary: 'Download the log files, JSON lines, oldest first',
    ...access('staff'),
    responses: {
      200: binary('application/x-ndjson', 'Every line in the files on disk'),
      ...errors('unauthorized', 'forbidden'),
    },
  }),
  crashes: createRoute({
    method: 'get',
    path: `${API_PREFIX}/system/crashes`,
    tags: ['System'],
    summary: 'Crash reports, newest first',
    description: 'Written when General › Diagnostics’ switch is on. Nothing is sent anywhere.',
    ...access('staff'),
    responses: {
      200: json(z.array(CrashReport), 'Reports'),
      ...errors('unauthorized', 'forbidden'),
    },
  }),
  crash: createRoute({
    method: 'get',
    path: `${API_PREFIX}/system/crashes/{id}`,
    tags: ['System'],
    summary: 'Download a crash report, to attach to an issue',
    ...access('staff'),
    request: { params: IdParam },
    responses: {
      200: binary('application/json', 'The report'),
      ...errors('unauthorized', 'forbidden', 'not-found'),
    },
  }),
  updates: createRoute({
    method: 'get',
    path: `${API_PREFIX}/system/updates`,
    tags: ['System'],
    summary: 'This version and the newest on the update channel',
    ...access('staff'),
    responses: { 200: json(Updates, 'Updates'), ...errors('unauthorized', 'forbidden') },
  }),
  metrics: createRoute({
    method: 'get',
    path: '/metrics',
    tags: ['System'],
    summary: 'Metrics for Prometheus (text format 0.0.4)',
    description:
      'Off until Settings › General turns it on (404 until then). Takes an API key held by the owner or an admin as a bearer token; a read-only key is enough.',
    ...access('public'),
    responses: {
      200: {
        description: 'The metrics',
        content: { 'text/plain; version=0.0.4': { schema: z.string() } },
      },
      ...errors('unauthorized', 'forbidden', 'not-found'),
    },
  }),
} as const

export type Server = z.infer<typeof Server>
export type SystemStatus = z.infer<typeof SystemStatus>
export type JobInfo = z.infer<typeof JobInfo>
export type HealthCheck = z.infer<typeof HealthCheck>
export type Task = z.infer<typeof Task>
export type Backup = z.infer<typeof Backup>
export type BackupList = z.infer<typeof BackupList>
export type LogEntry = z.infer<typeof LogEntry>
export type Logs = z.infer<typeof Logs>
export type CrashReport = z.infer<typeof CrashReport>
export type Updates = z.infer<typeof Updates>
