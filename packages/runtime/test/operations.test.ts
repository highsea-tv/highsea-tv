// SPDX-License-Identifier: AGPL-3.0-only
// The owner's tools (checkpoint 8b, ADR 0047) in the booted runtime: backups by hand and on their
// schedule, kept as many as asked, a restore that puts the database back across a restart (and
// undoes itself when that boot fails), the migration's backup zipped as "Before an update", the
// log on disk and its level, crash reports, updates from the catalog's releases, and /metrics.
import { afterEach, describe, expect, test } from 'bun:test'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createFakeClock, createLogger, type ServerEvent } from '@highsea-tv/core'
import { migrate, migrations, openDatabase, readSetting, writeSetting } from '@highsea-tv/db'
import {
  BACKUP_JOB,
  beginRestore,
  boot,
  compareAppVersions,
  createRegistry,
  DATABASE_NAME,
  getRuntime,
  hasRuntime,
  loadConfig,
  nextSlot,
  packBackup,
  RESTORE_MARKER,
  type Runtime,
  readManifest,
  takeRestoreFailure,
} from '../src/index.ts'

const dirs: string[] = []
const temp = () => {
  const d = mkdtempSync(join(tmpdir(), 'highsea-rt-ops-'))
  dirs.push(d)
  return d
}
afterEach(async () => {
  if (hasRuntime()) await getRuntime().shutdown()
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
})

async function start(
  options: { dir?: string; memory?: boolean; clock?: ReturnType<typeof createFakeClock> } = {},
) {
  const dir = options.dir ?? temp()
  const restarts: number[] = []
  const rt = await boot({
    config: loadConfig({
      HIGHSEA_CONFIG_DIR: join(dir, 'config'),
      HIGHSEA_DATA_DIR: join(dir, 'data'),
    }),
    version: '0.2.0',
    quiet: true,
    memory: options.memory ?? true,
    manualTicks: true,
    torrent: { offline: true },
    clock: options.clock,
    restart: () => restarts.push(1),
  })
  const seen: ServerEvent[] = []
  rt.events.subscribe((e) => seen.push(e))
  return { rt, dir, restarts, seen }
}

const backupFolder = (rt: Runtime) => rt.operations.backups.settings().folder

describe('backups', () => {
  test('one made by hand holds the database and a manifest, never the key', async () => {
    const { rt, seen } = await start()
    const made = await rt.operations.backups.backUp()
    expect(made).toMatchObject({ kind: 'manual', version: '0.2.0', problem: null })
    expect(made.schema).toBe(migrations.at(-1)?.tag ?? null)
    expect((await rt.operations.backups.list()).map((b) => b.id)).toEqual([made.id])
    const manifest = await readManifest(rt.operations.backups.path(made.id))
    expect(manifest.migrations).toEqual(migrations.map((m) => m.tag))
    expect(manifest.database.sha256).toMatch(/^[0-9a-f]{64}$/)
    expect(seen.some((e) => e.topic === 'backups.updated')).toBe(true)
    // the folder holds the zip alone: the copy and the partial file are gone
    expect(readdirSync(backupFolder(rt))).toEqual([`${made.id}.zip`])
    await rt.operations.backups.remove(made.id)
    expect(await rt.operations.backups.list()).toEqual([])
    expect(() => rt.operations.backups.path('../secret')).toThrow('That backup is gone.')
  })

  test('run on their schedule once per slot, keeping as many as asked', async () => {
    const clock = createFakeClock(Date.UTC(2026, 9, 21, 12, 0))
    const { rt } = await start({ clock })
    rt.operations.general.update({ ...rt.operations.general.get(), timeZone: 'UTC' })
    rt.operations.backups.updateSettings({
      ...rt.operations.backups.settings(),
      schedule: 'daily',
      time: '03:30',
      keep: 2,
    })
    const manual = await rt.operations.backups.backUp()
    expect(rt.operations.backups.nextRun()).toBe(Date.UTC(2026, 9, 22, 3, 30))
    for (let day = 0; day < 3; day++) {
      clock.advance(86_400_000)
      await rt.jobs.tick()
      await rt.jobs.idle()
    }
    const list = await rt.operations.backups.list()
    // three scheduled, two kept; the one made by hand stays
    expect(list.filter((b) => b.kind === 'scheduled').map((b) => b.slot)).toEqual([
      '2026-10-24T03:30',
      '2026-10-23T03:30',
    ])
    expect(list.some((b) => b.id === manual.id)).toBe(true)
    // the same slot again (a repeated job) makes nothing new
    rt.jobs.enqueue(BACKUP_JOB, { slot: '2026-10-24T03:30' })
    await rt.jobs.tick()
    await rt.jobs.idle()
    expect((await rt.operations.backups.list()).length).toBe(3)
    // off: nothing waits
    rt.operations.backups.updateSettings({ ...rt.operations.backups.settings(), schedule: 'off' })
    expect(rt.operations.backups.nextRun()).toBeNull()
    expect(rt.jobs.list({ type: BACKUP_JOB, status: ['queued'] })).toEqual([])
  })

  test('the folder has to be one highsea can write', async () => {
    const { rt } = await start()
    expect(() =>
      rt.operations.backups.updateSettings({
        ...rt.operations.backups.settings(),
        folder: 'relative',
      }),
    ).toThrow('Give the folder’s full path.')
  })

  test('slots follow the time zone, across a change of clocks', () => {
    const daily = { schedule: 'daily' as const, time: '03:30', weekday: 0 }
    // Lisbon is UTC+1 until 25 October 2026
    expect(nextSlot(Date.UTC(2026, 9, 21, 12), daily, 'Europe/Lisbon')).toEqual({
      slot: '2026-10-22T03:30',
      at: Date.UTC(2026, 9, 22, 2, 30),
    })
    // Sunday the 25th, the clocks back at 02:00: 03:30 is UTC's
    expect(
      nextSlot(Date.UTC(2026, 9, 21, 12), { ...daily, schedule: 'weekly' }, 'Europe/Lisbon'),
    ).toEqual({
      slot: '2026-10-25T03:30',
      at: Date.UTC(2026, 9, 25, 3, 30),
    })
    expect(nextSlot(0, { ...daily, schedule: 'off' }, 'UTC')).toBeNull()
  })
})

describe('restore', () => {
  test('puts the backup’s database back across a restart', async () => {
    const first = await start({ memory: false })
    first.rt.rename('Before')
    const made = await first.rt.operations.backups.backUp()
    first.rt.rename('After')
    await first.rt.operations.backups.restore(made.id)
    // the marker is written, the restart asked for, and what was there kept as a backup
    expect(existsSync(join(first.rt.config.configDir, RESTORE_MARKER))).toBe(true)
    await new Promise((r) => setTimeout(r, 300))
    expect(first.restarts).toEqual([1])
    expect((await first.rt.operations.backups.list()).map((b) => b.kind).sort()).toEqual([
      'before-restore',
      'manual',
    ])
    await first.rt.shutdown()

    const second = await start({ dir: first.dir, memory: false })
    expect(second.rt.identity().name).toBe('Before')
    const files = readdirSync(second.rt.config.configDir)
    expect(files).not.toContain(RESTORE_MARKER)
    expect(files.some((f) => f.includes('before-restore'))).toBe(false)
    expect(second.rt.issues().some((i) => i.id === 'restore-failed')).toBe(false)
  })

  test('a backup from a newer highsea is refused', async () => {
    const { rt } = await start()
    const folder = backupFolder(rt)
    mkdirSync(folder, { recursive: true })
    const db = join(folder, 'future.db')
    writeFileSync(db, 'not really a database')
    const id = await packBackup({
      folder,
      database: db,
      at: rt.clock.now(),
      kind: 'manual',
      version: '9.0.0',
      migrations: [...migrations.map((m) => m.tag), '9999_future'],
    })
    expect((await rt.operations.backups.get(id)).problem).toContain('newer version of highsea')
    expect(rt.operations.backups.restore(id)).rejects.toMatchObject({
      code: 'conflict',
      details: { reason: 'newer-schema' },
    })
  })

  test('a boot that fails puts the old database back, and says why', async () => {
    const dir = temp()
    const configDir = join(dir, 'config')
    mkdirSync(configDir, { recursive: true })
    writeFileSync(join(configDir, DATABASE_NAME), 'the database before')
    const backupDb = join(dir, 'restored.db')
    writeFileSync(backupDb, 'the backup')
    const id = await packBackup({
      folder: join(configDir, 'backups'),
      database: backupDb,
      at: Date.now(),
      kind: 'manual',
      version: '0.2.0',
      migrations: migrations.map((m) => m.tag),
    })
    writeFileSync(
      join(configDir, RESTORE_MARKER),
      JSON.stringify({ id, file: join(configDir, 'backups', `${id}.zip`) }),
    )
    const handle = await beginRestore(configDir, createLogger({ sinks: [] }))
    if (!handle) throw new Error('nothing to restore')
    expect(Bun.file(join(configDir, DATABASE_NAME)).text()).resolves.toBe('the backup')
    handle.undo(new Error('the boot failed'))
    expect(await Bun.file(join(configDir, DATABASE_NAME)).text()).toBe('the database before')
    expect(existsSync(join(configDir, RESTORE_MARKER))).toBe(false)
    expect(takeRestoreFailure(configDir)).toMatchObject({ id, message: 'the boot failed' })
    // read once
    expect(takeRestoreFailure(configDir)).toBeNull()
  })
})

describe('before an update', () => {
  test('the migration’s backup is a zip of that kind, with the migrations it had', async () => {
    const dir = temp()
    const configDir = join(dir, 'config')
    mkdirSync(configDir, { recursive: true })
    const older = migrations.slice(0, -1)
    const database = openDatabase(join(configDir, DATABASE_NAME))
    migrate(database.raw, { all: older })
    writeSetting(database.db, 'runtime.version', { version: '0.1.0' }, 0)
    database.raw.close()

    const { rt } = await start({ dir, memory: false })
    const [backup] = await rt.operations.backups.list()
    expect(backup).toMatchObject({
      kind: 'before-update',
      version: '0.1.0',
      schema: older.at(-1)?.tag,
      problem: null,
    })
    expect(readdirSync(backupFolder(rt)).filter((f) => f.endsWith('.db'))).toEqual([])
    expect(readSetting(rt.db, 'runtime.version', { version: '' }).version).toBe('0.2.0')
  })
})

describe('logs', () => {
  test('go to a file a day; the level changes while it runs; old files go', async () => {
    const clock = createFakeClock(Date.UTC(2026, 9, 21, 12))
    const { rt, seen } = await start({ clock })
    const log = rt.logger.child('test')
    log.debug('hidden at info')
    rt.operations.general.update({ ...rt.operations.general.get(), logLevel: 'debug' })
    log.debug('shown at debug', { title: 'Sintel' })
    log.warn('a warning')
    const logsDir = join(rt.config.configDir, 'logs')
    expect(rt.operations.logs.files().map((f) => f.name)).toEqual(['highsea-2026-10-21.jsonl'])
    const lines = (await Bun.file(join(logsDir, 'highsea-2026-10-21.jsonl')).text())
      .trim()
      .split('\n')
    expect(lines.some((l) => l.includes('shown at debug'))).toBe(true)
    expect(lines.some((l) => l.includes('hidden at info'))).toBe(false)

    expect(rt.operations.logs.query({ level: 'warn' }).map((e) => e.message)).toEqual(['a warning'])
    expect(rt.operations.logs.query({ search: 'SINTEL' }).map((e) => e.message)).toEqual([
      'shown at debug',
    ])
    // new lines are announced, at most once a second
    await new Promise((r) => setTimeout(r, 1100))
    expect(seen.filter((e) => e.topic === 'logs.appended').length).toBe(1)

    writeFileSync(join(logsDir, 'highsea-2026-10-01.jsonl'), '{}\n')
    writeFileSync(join(logsDir, 'highsea-2026-10-08.jsonl'), '{}\n')
    rt.jobs.enqueue('logs.prune', {})
    await rt.jobs.tick()
    await rt.jobs.idle()
    expect(rt.operations.logs.files().map((f) => f.date)).toEqual(['2026-10-08', '2026-10-21'])
  })
})

describe('crash reports', () => {
  test('are written only with the switch on, without the log’s fields', async () => {
    const { rt } = await start()
    rt.logger.info('a line', { password: 'never in a report' })
    expect(rt.operations.crashes.record(new Error('off'), 'api')).toBeNull()
    rt.operations.general.update({ ...rt.operations.general.get(), crashReports: true })
    const id = rt.operations.crashes.record(new TypeError('boom'), 'uncaughtException')
    expect(id).toMatch(/^crash-/)
    const [summary] = rt.operations.crashes.list()
    expect(summary).toMatchObject({ id, origin: 'uncaughtException', message: 'TypeError: boom' })
    const text = await Bun.file(rt.operations.crashes.path(id ?? '')).text()
    expect(text).toContain('"version": "0.2.0"')
    expect(text).toContain('a line')
    expect(text).not.toContain('never in a report')
    expect(() => rt.operations.crashes.path('../secret')).toThrow('That crash report is gone.')
  })
})

describe('updates', () => {
  test('come from the catalog’s releases, on the chosen channel, announced once', async () => {
    const { rt, seen } = await start()
    expect(rt.operations.updates()).toMatchObject({
      current: '0.2.0',
      latest: null,
      available: false,
    })
    const state = readSetting(rt.db, 'catalog.state', {})
    writeSetting(
      rt.db,
      'catalog.state',
      {
        ...state,
        releases: [
          { version: '0.3.0-beta.1', channel: 'beta', date: '2026-10-20', notes: ['Beta.'] },
          { version: '0.2.1', channel: 'stable', date: '2026-10-19', notes: ['Fixes.'] },
        ],
      },
      0,
    )
    rt.events.emit({ topic: 'catalog.updated' })
    rt.events.emit({ topic: 'catalog.updated' })
    expect(rt.operations.updates()).toMatchObject({
      channel: 'stable',
      available: true,
      latest: { version: '0.2.1' },
    })
    expect(seen.filter((e) => e.topic === 'updates.available').map((e) => e.ids)).toEqual([
      ['0.2.1'],
    ])
    rt.operations.general.update({ ...rt.operations.general.get(), updateChannel: 'beta' })
    expect(rt.operations.updates().latest?.version).toBe('0.3.0-beta.1')
  })

  test('versions compare as SemVer says', () => {
    expect(compareAppVersions('1.0.1', '1.0.0')).toBeGreaterThan(0)
    expect(compareAppVersions('1.0.0-beta.2', '1.0.0')).toBeLessThan(0)
    expect(compareAppVersions('1.0.0-beta.11', '1.0.0-beta.2')).toBeGreaterThan(0)
    expect(compareAppVersions('1.0.0-alpha', '1.0.0-alpha.1')).toBeLessThan(0)
    expect(compareAppVersions('1.0.0-rc.1', '1.0.0-beta.2')).toBeGreaterThan(0)
  })
})

describe('metrics', () => {
  test('the registry writes the 0.0.4 text format', () => {
    const r = createRegistry()
    const c = r.counter('test_requests_total', 'Requests.\nTwo lines.')
    c.inc({ route: '/a"b\\c' })
    c.inc({ route: '/a"b\\c' }, 2)
    const h = r.histogram('test_seconds', 'Durations.', [0.1, 1])
    h.observe({}, 0.5)
    r.collect('test_gauge', 'A gauge.', 'gauge', () => 7)
    expect(r.render()).toBe(
      [
        '# HELP test_requests_total Requests.\\nTwo lines.',
        '# TYPE test_requests_total counter',
        'test_requests_total{route="/a\\"b\\\\c"} 3',
        '# HELP test_seconds Durations.',
        '# TYPE test_seconds histogram',
        'test_seconds_bucket{le="0.1"} 0',
        'test_seconds_bucket{le="1"} 1',
        'test_seconds_bucket{le="+Inf"} 1',
        'test_seconds_sum 0.5',
        'test_seconds_count 1',
        '# HELP test_gauge A gauge.',
        '# TYPE test_gauge gauge',
        'test_gauge 7',
        '',
      ].join('\n'),
    )
  })

  test('the runtime’s families read the server', async () => {
    const { rt } = await start()
    rt.operations.metrics.observe({
      method: 'GET',
      route: '/api/v1/movies',
      status: 200,
      seconds: 0.02,
    })
    const text = rt.operations.metrics.render()
    for (const family of [
      'highsea_info{version="0.2.0"} 1',
      'highsea_movies 0',
      'highsea_http_requests_total{method="GET",route="/api/v1/movies",status="200"} 1',
      '# TYPE process_cpu_seconds_total counter',
      '# TYPE nodejs_eventloop_lag_p99_seconds gauge',
      '# TYPE highsea_job_runs_total counter',
    ])
      expect(text).toContain(family)
  })
})

describe('status', () => {
  test('uptime, apps, the catalog, resources, addresses and disks with what uses them', async () => {
    const { rt } = await start()
    const s = rt.status()
    expect(s).toMatchObject({ version: '0.2.0', clientsConnected: 0, uptime: expect.any(Number) })
    expect(s.process.memory).toBeGreaterThan(0)
    expect(s.addresses.public).toBeNull()
    expect(s.disks.length).toBeGreaterThan(0)
    for (const d of s.disks)
      expect(d.usedBy).toEqual(expect.objectContaining({ movies: 0, downloads: 0 }))
  })
})
