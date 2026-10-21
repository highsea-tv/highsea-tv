// SPDX-License-Identifier: AGPL-3.0-only
import { afterEach, describe, expect, test } from 'bun:test'
import { existsSync, mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createFakeClock } from '@highsea/core'
import { schema } from '@highsea/db'
import { DOWNLOADS_STALL_JOB } from '@highsea/downloads'
import { boot, createWorkerPool, getRuntime, hasRuntime, loadConfig } from '../src/index.ts'

// the engine opens no socket: a file-backed boot would otherwise listen on 6881 and join the DHT
const torrent = { offline: true }
const dirs: string[] = []
const temp = () => {
  const d = mkdtempSync(join(tmpdir(), 'highsea-rt-'))
  dirs.push(d)
  return d
}
afterEach(async () => {
  if (hasRuntime()) await getRuntime().shutdown()
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
})

const configFor = (dir: string) =>
  loadConfig({ HIGHSEA_CONFIG_DIR: join(dir, 'config'), HIGHSEA_DATA_DIR: join(dir, 'data') })

describe('config', () => {
  test('defaults to /config, /data, port 3000 and discovery on 7368', () => {
    expect(loadConfig({})).toMatchObject({
      configDir: '/config',
      dataDir: '/data',
      port: 3000,
      discoveryPort: 7368,
      logLevel: 'info',
      dev: false,
    })
  })

  test('trusts the catalog’s development key unless it’s production, or told', () => {
    expect(loadConfig({}).catalogDevKey).toBe(true)
    expect(loadConfig({ NODE_ENV: 'production' }).catalogDevKey).toBe(false)
    expect(loadConfig({ NODE_ENV: 'production', HIGHSEA_CATALOG_DEV_KEY: '1' }).catalogDevKey).toBe(
      true,
    )
    expect(loadConfig({ HIGHSEA_CATALOG_DEV_KEY: '0' }).catalogDevKey).toBe(false)
    expect(loadConfig({}).catalogUrl).toBeUndefined()
  })

  test('reads the OpenSubtitles.com key from the variable, or from its file', () => {
    const file = join(temp(), 'key')
    writeFileSync(file, 'from-file\n')
    expect(loadConfig({}).opensubtitlesKey).toBeUndefined()
    expect(loadConfig({ HIGHSEA_OPENSUBTITLES_KEY_FILE: file }).opensubtitlesKey).toBe('from-file')
    expect(
      loadConfig({ HIGHSEA_OPENSUBTITLES_KEY: ' given ', HIGHSEA_OPENSUBTITLES_KEY_FILE: file })
        .opensubtitlesKey,
    ).toBe('given')
    // a release built without the secret has no file
    expect(
      loadConfig({ HIGHSEA_OPENSUBTITLES_KEY_FILE: join(temp(), 'missing') }).opensubtitlesKey,
    ).toBeUndefined()
  })

  test('says which setting is wrong', () => {
    expect(() => loadConfig({ PORT: 'eighty' })).toThrow('port')
    expect(() => loadConfig({ HIGHSEA_PUBLIC_URL: 'not a url' })).toThrow('publicUrl')
  })
})

describe('runtime', () => {
  test('boots: secret key, migrated database, a stable server id, health', async () => {
    const dir = temp()
    const config = configFor(dir)
    const rt = await boot({ config, version: '0.1.0', quiet: true, manualTicks: true, torrent })
    expect(getRuntime()).toBe(rt)
    const key = join(config.configDir, 'secret.key')
    expect(statSync(key).size).toBe(32)
    expect(statSync(key).mode & 0o777).toBe(0o600)
    expect(existsSync(join(config.configDir, 'highsea.db'))).toBe(true)
    const id = rt.identity().id
    expect(id).toMatch(/^srv_/)
    expect(rt.health()).toEqual({ status: 'ok', checks: [{ name: 'database', ok: true }] })
    expect(rt.publicInfo()).toMatchObject({
      id,
      name: 'highsea',
      version: '0.1.0',
      publicUrl: null,
    })
    const sealed = rt.sealer.seal('x')
    await rt.shutdown()
    expect(hasRuntime()).toBe(false)

    // the second boot keeps the id and the key, and has nothing to migrate or back up
    const again = await boot({ config, version: '0.1.0', quiet: true, manualTicks: true, torrent })
    expect(again.identity().id).toBe(id)
    expect(again.sealer.open(sealed)).toBe('x')
    expect(readdirSync(join(config.configDir, 'backups'))).toEqual([])
  })

  test('logs go to the memory sink, with the boot recorded', async () => {
    const clock = createFakeClock()
    const rt = await boot({
      config: configFor(temp()),
      torrent,
      version: '0.1.0',
      quiet: true,
      memory: true,
      manualTicks: true,
      clock,
    })
    expect(rt.logs.entries().some((e) => e.source === 'runtime' && e.message === 'booted')).toBe(
      true,
    )
  })

  test('shutdown hooks run last-first, before the database closes', async () => {
    const rt = await boot({
      config: configFor(temp()),
      torrent,
      version: '0.1.0',
      quiet: true,
      memory: true,
      manualTicks: true,
    })
    const order: string[] = []
    rt.onShutdown(() => void order.push('torrents'))
    rt.onShutdown(() => {
      order.push('discovery')
      expect(rt.health().status).toBe('ok')
    })
    await rt.shutdown()
    expect(order).toEqual(['discovery', 'torrents'])
  })
})

describe('worker pool', () => {
  test('runs tasks off the main thread', async () => {
    const pool = createWorkerPool(2)
    const module = new URL('./fixtures/double.ts', import.meta.url).href
    const results = await Promise.all(
      [1, 2, 3, 4].map((n) => pool.run<number>({ module, fn: 'double', input: n })),
    )
    expect(results).toEqual([2, 4, 6, 8])
    await pool.close()
    await expect(pool.run({ module, fn: 'double', input: 1 })).rejects.toThrow('closed')
  })

  // the Node tests run on is the one in .nvmrc, so their results match CI's and production's
  test('`node` is the version in .nvmrc', () => {
    const run = Bun.spawnSync([
      'node',
      new URL('../../../scripts/check-node.ts', import.meta.url).pathname,
    ])
    expect(run.stderr.toString()).toBe('')
    expect(run.exitCode).toBe(0)
  })

  // the server runs the pool on Node; Bun's worker_threads are documented as not battle-tested
  test('under Node, reports a task’s error and keeps the worker', () => {
    const run = Bun.spawnSync([
      'node',
      new URL('./fixtures/pool-under-node.ts', import.meta.url).pathname,
    ])
    expect(run.stderr.toString()).toBe('')
    expect(JSON.parse(run.stdout.toString())).toEqual({
      results: [2, 4, 6, 8],
      errors: ['nope', 'nope', expect.stringContaining('no function missing')],
      after: 10,
    })
  })
})

describe('the catalog and indexers', () => {
  test('a development boot installs the signed seed; no indexer is a health warning', async () => {
    const rt = await boot({
      config: configFor(temp()),
      torrent,
      version: '0.1.0',
      quiet: true,
      manualTicks: true,
    })
    expect(rt.catalog.version()).not.toBeNull()
    expect(rt.server().catalogVersion).toBe(rt.catalog.version())
    expect(rt.indexers.catalog().length).toBeGreaterThan(0)
    expect(rt.issues()).toContainEqual(
      expect.objectContaining({ id: 'indexers-none', source: 'Indexers', level: 'warning' }),
    )
    expect(rt.publicInfo().sources).toContain('indexers')
  })

  test('boot schedules the indexers’ and the downloads’ recurring jobs', async () => {
    const rt = await boot({
      config: configFor(temp()),
      torrent,
      version: '0.1.0',
      quiet: true,
      manualTicks: true,
    })
    const types = rt.database.db
      .select()
      .from(schema.jobSchedules)
      .all()
      .map((s) => s.type)
    // the stall check (ADR 0038) once went unscheduled outside tests
    expect(types).toContain(DOWNLOADS_STALL_JOB)
  })

  test('a production boot trusts no development key, so the seed isn’t installed', async () => {
    const config = loadConfig({
      HIGHSEA_CONFIG_DIR: join(temp(), 'config'),
      HIGHSEA_DATA_DIR: join(temp(), 'data'),
      NODE_ENV: 'production',
    })
    const rt = await boot({ config, version: '0.1.0', quiet: true, manualTicks: true, torrent })
    expect(rt.catalog.version()).toBeNull()
    expect(rt.indexers.catalog()).toEqual([])
  })
})
