// SPDX-License-Identifier: AGPL-3.0-only
// Backups and restore (checkpoint 8b, ADR 0047). A backup is one zip in the backups folder: the
// database as `VACUUM INTO` writes it, consistent while the server runs (ADR 0019), and a manifest
// (highsea's version, the migrations the database has, when, the kind). Never `secret.key` (the
// owner's answer 13). The folder and each zip's manifest are the record: there's no table, since a
// restore replaces the database a table would be in.
//
// Restore checks the manifest, makes a backup of what's there now, writes a marker and restarts.
// The next boot moves the database aside, puts the backup's in place and migrates it; if that boot
// fails, the moved-aside database goes back, and the boot after says why in System › Health.
import { createHash } from 'node:crypto'
import {
  createReadStream,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { isAbsolute, join, resolve } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { AppError, type Clock, type EventBus, type Logger } from '@highsea-tv/core'
import { migrations, type RawDatabase } from '@highsea-tv/db'
import type { JobQueue } from '@highsea-tv/jobs'
import { z } from 'zod'
import { extractZipEntry, readZipEntry, writeZip, ZipError, zipEntries } from './zip.ts'

export const BACKUP_KINDS = ['scheduled', 'manual', 'before-update', 'before-restore'] as const
export type BackupKind = (typeof BACKUP_KINDS)[number]

export const BACKUP_SCHEDULES = ['daily', 'weekly', 'off'] as const
export const BACKUPS_KEY = 'backups'
export const BACKUP_JOB = 'backups.scheduled'
export const BACKUPS_TOPIC = 'backups.updated'
export const MANIFEST_NAME = 'manifest.json'
export const DATABASE_NAME = 'highsea.db'
/** At boot: the backup to restore, written by `restore()`. */
export const RESTORE_MARKER = 'restore.json'
/** At boot: why the last restore was undone, for System › Health. */
export const RESTORE_FAILED = 'restore-failed.json'
const ASIDE = 'highsea.db.before-restore'
/** The database's own files: SQLite's write-ahead log and its index sit beside it in WAL mode. */
const DB_FILES = ['', '-wal', '-shm']
const ID = /^highsea-[0-9A-Za-z-]+$/

export type BackupSettings = {
  schedule: (typeof BACKUP_SCHEDULES)[number]
  /** `HH:MM`, in the server's time zone (General › Region). */
  time: string
  /** For a weekly schedule: 0 is Sunday, as `Date.getDay()` counts. */
  weekday: number
  /** Scheduled backups kept; ones made by hand stay until they're deleted. */
  keep: number
  folder: string
}

/** The prototype's: every day at 03:30, 14 kept, in `/config/backups`. */
export const defaultBackupSettings = (configDir: string): BackupSettings => ({
  schedule: 'daily',
  time: '03:30',
  weekday: 0,
  keep: 14,
  folder: join(configDir, 'backups'),
})

export const manifestSchema = z.object({
  format: z.literal(1),
  app: z.literal('highsea'),
  /** The version that wrote the database; null when it isn't known (an old migration backup). */
  version: z.string().nullable(),
  kind: z.enum(BACKUP_KINDS),
  createdAt: z.iso.datetime(),
  /** A scheduled backup's slot (`2026-10-22T03:30`), so a repeated job makes it once. */
  slot: z.string().nullable(),
  /** Every migration the database has, oldest first: a restore refuses one it doesn't know. */
  migrations: z.array(z.string()),
  database: z.object({ size: z.number().int(), sha256: z.string().regex(/^[0-9a-f]{64}$/) }),
})
export type BackupManifest = z.infer<typeof manifestSchema>

export type Backup = {
  id: string
  kind: BackupKind
  createdAt: number
  /** The zip's size, in bytes. */
  size: number
  version: string | null
  /** The newest migration the database has. */
  schema: string | null
  slot: string | null
  /** Why it can't be restored: from a newer highsea, or damaged. */
  problem: string | null
}

const known = new Set(migrations.map((m) => m.tag))

/** Why a backup with these migrations can't be restored here, or null when it can. */
export function schemaProblem(applied: string[]): string | null {
  return applied.every((tag) => known.has(tag))
    ? null
    : 'It’s from a newer version of highsea. Update highsea before restoring it.'
}

/** The migrations a database has, oldest first. */
export function appliedMigrations(raw: RawDatabase): string[] {
  try {
    return raw.all('SELECT tag FROM __migrations ORDER BY tag').map((r) => String(r.tag))
  } catch {
    return []
  }
}

async function sha256File(path: string) {
  const hash = createHash('sha256')
  await pipeline(createReadStream(path), hash)
  return hash.digest('hex')
}

const stampOf = (at: number) => new Date(at).toISOString().replace(/[:.]/g, '-')

/**
 * Zips a database file with its manifest into `folder` and deletes the file. The zip is written
 * under a hidden name and renamed when it's whole, so the list never shows half a backup.
 */
export async function packBackup(input: {
  folder: string
  database: string
  at: number
  kind: BackupKind
  version: string | null
  migrations: string[]
  slot?: string | null
}): Promise<string> {
  const { folder, database, at, kind } = input
  mkdirSync(folder, { recursive: true })
  let id = `highsea-${stampOf(at)}-${kind}`
  for (let n = 2; existsSync(join(folder, `${id}.zip`)); n++)
    id = `highsea-${stampOf(at)}-${kind}-${n}`
  const partial = join(folder, `.${id}.zip.partial`)
  try {
    const manifest: BackupManifest = {
      format: 1,
      app: 'highsea',
      version: input.version,
      kind,
      createdAt: new Date(at).toISOString(),
      slot: input.slot ?? null,
      migrations: input.migrations,
      database: { size: statSync(database).size, sha256: await sha256File(database) },
    }
    await writeZip(
      partial,
      [
        { name: MANIFEST_NAME, data: Buffer.from(JSON.stringify(manifest, null, 2)) },
        { name: DATABASE_NAME, file: database },
      ],
      new Date(at),
    )
    renameSync(partial, join(folder, `${id}.zip`))
    return id
  } finally {
    rmSync(partial, { force: true })
    rmSync(database, { force: true })
  }
}

/** A backup zip's manifest, checked. */
export async function readManifest(path: string): Promise<BackupManifest> {
  const entries = await zipEntries(path)
  const entry = entries.find((e) => e.name === MANIFEST_NAME)
  if (!entry || !entries.some((e) => e.name === DATABASE_NAME))
    throw new ZipError('It isn’t a highsea backup.')
  const parsed = manifestSchema.safeParse(
    JSON.parse((await readZipEntry(path, entry, 64 * 1024)).toString('utf8')),
  )
  if (!parsed.success) throw new ZipError('Its manifest isn’t one highsea reads.')
  return parsed.data
}

// ------------------------------------------------------------ the schedule

type Zoned = { y: number; m: number; d: number; h: number; mi: number; s: number }

/** The wall-clock time at `t` in `timeZone`, from Intl (ECMA-402's time zone support). */
function zoned(t: number, timeZone: string): Zoned {
  const parts: Record<string, number> = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
    })
      .formatToParts(new Date(t))
      .map((p) => [p.type, Number(p.value)]),
  )
  const n = (type: string) => parts[type] ?? 0
  return { y: n('year'), m: n('month'), d: n('day'), h: n('hour'), mi: n('minute'), s: n('second') }
}

/** How far `timeZone` is ahead of UTC at `t`, in ms. */
function offsetAt(t: number, timeZone: string) {
  const z = zoned(t, timeZone)
  return Date.UTC(z.y, z.m - 1, z.d, z.h, z.mi, z.s) - Math.floor(t / 1000) * 1000
}

/** A wall-clock time in `timeZone` as an instant; a time skipped by a DST change moves forward. */
function instant(y: number, m: number, d: number, h: number, mi: number, timeZone: string) {
  const guess = Date.UTC(y, m - 1, d, h, mi)
  const first = guess - offsetAt(guess, timeZone)
  return guess - offsetAt(first, timeZone)
}

const pad = (n: number) => String(n).padStart(2, '0')

/** The next scheduled backup after `now`: its slot, named by its local date and time, and when. */
export function nextSlot(
  now: number,
  settings: Pick<BackupSettings, 'schedule' | 'time' | 'weekday'>,
  timeZone: string,
): { slot: string; at: number } | null {
  if (settings.schedule === 'off') return null
  const [h = 0, mi = 0] = settings.time.split(':').map(Number)
  const today = zoned(now, timeZone)
  for (let i = 0; i <= 8; i++) {
    const day = new Date(Date.UTC(today.y, today.m - 1, today.d + i))
    if (settings.schedule === 'weekly' && day.getUTCDay() !== settings.weekday) continue
    const [y, m, d] = [day.getUTCFullYear(), day.getUTCMonth() + 1, day.getUTCDate()]
    const at = instant(y, m, d, h, mi, timeZone)
    if (at > now) return { slot: `${y}-${pad(m)}-${pad(d)}T${settings.time}`, at }
  }
  return null
}

// ------------------------------------------------------------ the service

export type BackupsDeps = {
  raw: RawDatabase
  jobs: JobQueue
  clock: Clock
  logger: Logger
  events: EventBus
  configDir: string
  version: string
  settings: () => BackupSettings
  timeZone: () => string
  /** Restarts the server once the marker is written; Docker's restart policy brings it back. */
  restart: () => void
}

export function createBackups(deps: BackupsDeps) {
  const { raw, jobs, clock, events } = deps
  const log = deps.logger.child('backups')
  const folder = () => resolve(deps.settings().folder)
  const cache = new Map<string, { key: string; backup: Backup }>()

  async function describe(name: string): Promise<Backup | null> {
    const path = join(folder(), name)
    let stat: ReturnType<typeof statSync>
    try {
      stat = statSync(path)
    } catch {
      return null
    }
    const key = `${stat.size}:${stat.mtimeMs}`
    const hit = cache.get(path)
    if (hit?.key === key) return hit.backup
    const id = name.slice(0, -'.zip'.length)
    let backup: Backup
    try {
      const m = await readManifest(path)
      backup = {
        id,
        kind: m.kind,
        createdAt: Date.parse(m.createdAt),
        size: stat.size,
        version: m.version,
        schema: m.migrations.at(-1) ?? null,
        slot: m.slot,
        problem: schemaProblem(m.migrations),
      }
    } catch (e) {
      backup = {
        id,
        kind: 'manual',
        createdAt: stat.mtimeMs,
        size: stat.size,
        version: null,
        schema: null,
        slot: null,
        problem: e instanceof ZipError ? `It can’t be read: ${e.message}` : 'It can’t be read.',
      }
    }
    cache.set(path, { key, backup })
    return backup
  }

  /** Newest first. */
  async function list(): Promise<Backup[]> {
    let names: string[] = []
    try {
      names = readdirSync(folder()).filter((n) => n.startsWith('highsea-') && n.endsWith('.zip'))
    } catch {
      return []
    }
    const out: Backup[] = []
    for (const name of names) {
      const b = await describe(name)
      if (b) out.push(b)
    }
    return out.sort((a, b) => b.createdAt - a.createdAt || b.id.localeCompare(a.id))
  }

  function path(id: string) {
    if (!ID.test(id)) throw new AppError('not-found', 'That backup is gone.')
    const p = join(folder(), `${id}.zip`)
    if (!existsSync(p)) throw new AppError('not-found', 'That backup is gone.')
    return p
  }

  async function get(id: string): Promise<Backup> {
    const b = await describe(`${id}.zip`)
    if (!b || !ID.test(id)) throw new AppError('not-found', 'That backup is gone.')
    return b
  }

  async function create(kind: BackupKind, slot: string | null = null): Promise<Backup> {
    const dir = folder()
    mkdirSync(dir, { recursive: true })
    const at = clock.now()
    const copy = join(dir, `.highsea-${stampOf(at)}-${process.pid}.db`)
    rmSync(copy, { force: true })
    // consistent while the server runs: a read transaction over the whole database (ADR 0019)
    raw.run('VACUUM INTO ?', copy)
    const id = await packBackup({
      folder: dir,
      database: copy,
      at,
      kind,
      version: deps.version,
      migrations: appliedMigrations(raw),
      slot,
    })
    log.info('made a backup', { id, kind })
    events.emit({ topic: BACKUPS_TOPIC, ids: [id] })
    return get(id)
  }

  async function remove(id: string) {
    rmSync(path(id), { force: true })
    events.emit({ topic: BACKUPS_TOPIC, ids: [id] })
  }

  /** Scheduled backups past "how many to keep", oldest first; ones made by hand are never pruned. */
  async function prune() {
    const scheduled = (await list()).filter((b) => b.kind === 'scheduled')
    const extra = scheduled.slice(Math.max(0, deps.settings().keep))
    for (const b of extra) rmSync(join(folder(), `${b.id}.zip`), { force: true })
    if (extra.length) {
      log.info('removed old scheduled backups', { count: extra.length })
      events.emit({ topic: BACKUPS_TOPIC })
    }
  }

  function enqueueNext() {
    const next = nextSlot(clock.now(), deps.settings(), deps.timeZone())
    if (next)
      jobs.enqueue(BACKUP_JOB, { slot: next.slot }, { runAt: next.at, dedupeKey: next.slot })
  }

  jobs.define({
    type: BACKUP_JOB,
    payload: z.object({ slot: z.string() }),
    attempts: 3,
    timeoutMs: 60 * 60_000,
    async run({ slot }) {
      try {
        // at least once (ADR 0022): a slot already in the folder isn't backed up again
        if (deps.settings().schedule !== 'off' && !(await list()).some((b) => b.slot === slot)) {
          await create('scheduled', slot)
          await prune()
        }
      } finally {
        enqueueNext()
      }
    },
  })

  return {
    list,
    get,
    /** The zip, for Download. */
    path,
    /** Back up now ("Made by hand"). */
    backUp: () => create('manual'),
    create,
    remove,
    prune,
    /** At boot: the next scheduled backup, unless one is waiting. */
    start() {
      if (!jobs.list({ type: BACKUP_JOB, status: ['queued', 'running'] }).length) enqueueNext()
    },
    /** After the schedule or the time zone changes: the waiting backup moves to the new slot. */
    reschedule() {
      for (const j of jobs.list({ type: BACKUP_JOB, status: ['queued'] })) jobs.cancel(j.id)
      enqueueNext()
    },
    /**
     * Checks the backup, keeps what's there now as a backup, writes the marker and restarts. A
     * backup from a newer schema, or one that can't be read, is refused.
     */
    async restore(id: string) {
      const file = path(id)
      const backup = await get(id)
      if (backup.problem)
        throw new AppError('conflict', backup.problem, {
          reason: backup.schema ? 'newer-schema' : 'unreadable',
        })
      const kept = await create('before-restore')
      writeFileSync(
        join(deps.configDir, RESTORE_MARKER),
        JSON.stringify({ id, file, requestedAt: clock.now() }),
      )
      log.warn('restoring a backup: the server restarts on it', { id, kept: kept.id })
      deps.restart()
    },
  }
}

export type Backups = ReturnType<typeof createBackups>

/** Checks a backups folder the owner chose: absolute, and somewhere highsea can write. */
export function checkBackupFolder(path: string) {
  if (!isAbsolute(path))
    throw new AppError('invalid', 'Give the folder’s full path.', { field: 'folder' })
  try {
    mkdirSync(path, { recursive: true })
    const probe = join(path, `.highsea-write-${process.pid}`)
    writeFileSync(probe, '')
    rmSync(probe)
  } catch {
    throw new AppError('invalid', 'highsea can’t write to that folder.', {
      field: 'folder',
      reason: 'not-writable',
    })
  }
}

// ------------------------------------------------------------ restore, at boot

export type RestoreHandle = {
  id: string
  /** The boot succeeded: the moved-aside database goes. */
  finish(): void
  /** The boot failed: the moved-aside database comes back, and the next boot says why. */
  undo(error: unknown): void
}

const moveDatabase = (from: string, to: string) => {
  for (const suffix of DB_FILES) {
    rmSync(`${to}${suffix}`, { force: true })
    if (existsSync(`${from}${suffix}`)) renameSync(`${from}${suffix}`, `${to}${suffix}`)
  }
}

/**
 * Before the database opens: puts the marked backup's database in place, the current one moved
 * aside. Returns null when there's nothing to restore, or the backup can't be (the marker goes,
 * and the next boot's health says why).
 */
export async function beginRestore(
  configDir: string,
  logger: Logger,
): Promise<RestoreHandle | null> {
  const markerPath = join(configDir, RESTORE_MARKER)
  if (!existsSync(markerPath)) return null
  const log = logger.child('backups')
  const database = join(configDir, DATABASE_NAME)
  const aside = join(configDir, ASIDE)
  const incoming = join(configDir, `${DATABASE_NAME}.restoring`)
  const failed = (id: string, message: string) => {
    writeFileSync(join(configDir, RESTORE_FAILED), JSON.stringify({ id, message, at: Date.now() }))
    rmSync(markerPath, { force: true })
    rmSync(incoming, { force: true })
    log.error('couldn’t restore a backup', { id, error: message })
  }

  let marker: { id: string; file: string }
  try {
    marker = z
      .object({ id: z.string(), file: z.string() })
      .parse(JSON.parse(readFileSync(markerPath, 'utf8')))
  } catch {
    failed('unknown', 'The restore marker couldn’t be read.')
    return null
  }
  try {
    const manifest = await readManifest(marker.file)
    const problem = schemaProblem(manifest.migrations)
    if (problem) throw new Error(problem)
    const entry = (await zipEntries(marker.file)).find((e) => e.name === DATABASE_NAME)
    if (!entry) throw new Error('It has no database.')
    await extractZipEntry(marker.file, entry, incoming)
    if ((await sha256File(incoming)) !== manifest.database.sha256)
      throw new Error('Its database doesn’t match its manifest.')
  } catch (e) {
    failed(marker.id, (e as Error).message)
    return null
  }

  moveDatabase(database, aside)
  renameSync(incoming, database)
  log.warn('restoring a backup', { id: marker.id })
  return {
    id: marker.id,
    finish() {
      for (const suffix of DB_FILES) rmSync(`${aside}${suffix}`, { force: true })
      rmSync(markerPath, { force: true })
      log.info('restored a backup', { id: marker.id })
    },
    undo(error) {
      moveDatabase(aside, database)
      failed(marker.id, (error as Error)?.message ?? String(error))
    },
  }
}

/** The last restore's failure, read once at boot and then forgotten. */
export function takeRestoreFailure(
  configDir: string,
): { id: string; message: string; at: number } | null {
  const path = join(configDir, RESTORE_FAILED)
  if (!existsSync(path)) return null
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    return null
  } finally {
    rmSync(path, { force: true })
  }
}
