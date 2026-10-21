// SPDX-License-Identifier: AGPL-3.0-only
// Downloads on a real engine: grabbing by guid from the last search, the import job, replacing a
// release that stalls or carries an executable, seeding rules, and manual torrents.
import { afterEach, describe, expect, test } from 'bun:test'
import { randomBytes } from 'node:crypto'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { schema } from '@highsea/db'
import { MOVIES } from '@highsea/indexers/fake'
import { makeTorrent } from '@highsea/torrent/testing'
import { REPLACE_MS, STALL_MS } from '../src/index.ts'
import { ITEM, setup, sintelSearch, until, VERSION } from './helpers.ts'

type T = Awaited<ReturnType<typeof setup>>
const open: T[] = []
afterEach(async () => {
  for (const t of open.splice(0)) await t.close()
})
async function start(options?: Parameters<typeof setup>[0]) {
  const t = await setup(options)
  open.push(t)
  return t
}

const data = (n: number) => new Uint8Array(randomBytes(n))
const BEST = 'fake-json:101'

describe('grabbing', () => {
  test('grabs from the last search, downloads, imports, and lets go after a move', async () => {
    const t = await start({ importer: async () => ({ ok: true, transfer: 'move' }) })
    const files = [{ path: 'Sintel.2010.1080p.BluRay.x264-GRP.mkv', data: data(600_000) }]
    await t.seed(101, files, 'Sintel.2010.1080p.BluRay.x264-GRP.mkv')
    await t.indexers.search(sintelSearch())

    const item = await t.downloads.grab({
      itemId: ITEM,
      versionId: VERSION,
      indexerId: t.indexer.id,
      guid: BEST,
    })
    expect(item).toMatchObject({
      movieId: MOVIES.sintel.tmdbId,
      title: 'Sintel',
      year: 2010,
      release: 'Sintel.2010.1080p.BluRay.x264-GRP',
      quality: 'Bluray-1080p',
    })
    expect(t.history[0]).toMatchObject({ type: 'grabbed', indexer: 'Fake JSON', message: null })
    expect(t.indexers.get(t.indexer.id).stats.grabs24h).toBe(1)
    expect(t.seen.some((e) => e.topic === 'queue.updated')).toBe(true)

    await until(() => t.downloads.queue()[0]?.state === 'importing', 20_000, 'the download')
    await t.drain()
    expect(t.imports).toHaveLength(1)
    expect(t.imports[0]).toMatchObject({
      itemId: ITEM,
      versionId: VERSION,
      path: join(t.downloadsDir, 'movies', 'Sintel.2010.1080p.BluRay.x264-GRP.mkv'),
      force: false,
    })
    const row = t.db.select().from(schema.downloads).get()
    expect(row?.state).toBe('completed')
    expect(row?.transfer).toBe('move')
    // a moved import lets the torrent go at once
    expect(row?.torrentId).toBeNull()
    expect(t.engine.list()).toEqual([])
    expect(t.downloads.queue()).toEqual([])
  }, 30_000)

  test('a hardlinked import keeps seeding under the indexer’s rules', async () => {
    const t = await start()
    t.indexers.setSeeding(t.indexer.id, { ratio: 1.5, minutes: null, minMinutes: 7200 })
    const files = [{ path: 'Sintel.mkv', data: data(300_000) }]
    await t.seed(101, files, 'Sintel.mkv')
    await t.indexers.search(sintelSearch())
    await t.downloads.grab({
      itemId: ITEM,
      versionId: VERSION,
      indexerId: t.indexer.id,
      guid: BEST,
    })
    const torrent = t.engine.list()[0]
    expect(torrent?.rule).toEqual({ ratio: 1.5, minutes: null, minMinutes: 7200 })
    expect(torrent?.category).toBe('movies')
    await until(() => t.downloads.queue()[0]?.state === 'importing', 20_000, 'the download')
    await t.drain()
    const [queued] = t.downloads.queue()
    expect(queued?.state).toBe('seeding')
    expect(t.downloads.torrents()[0]?.state).toBe('seeding')
    // a seeded event before the rule is met lets nothing go
    const id = torrent?.id as string
    t.downloads.onEngineEvent({ type: 'seeded', id })
    await t.drain()
    expect(t.engine.list()).toHaveLength(1)
    // once the rule is met the engine stops, and the torrent goes with its data
    t.engine.setRule(id, { ratio: 0, minutes: null, minMinutes: null })
    await until(() => t.engine.get(id).state === 'completed', 15_000, 'the rule to be met')
    await until(() => t.jobs.list({ status: ['queued'] }).length > 0, 2_000, 'the settle job')
    await t.drain()
    expect(t.engine.list()).toEqual([])
    expect(existsSync(join(t.downloadsDir, 'movies', 'Sintel.mkv'))).toBe(false)
    expect(t.downloads.queue()).toEqual([])
  }, 30_000)

  test('an indexer without its own rule seeds to the global default', async () => {
    const t = await start()
    await t.indexers.search(sintelSearch())
    await t.downloads.grab({
      itemId: ITEM,
      versionId: VERSION,
      indexerId: t.indexer.id,
      guid: BEST,
    })
    expect(t.engine.list()[0]?.rule).toEqual({ ratio: 2, minutes: 10_080, minMinutes: null })
  })

  test('a rejected release needs Grab anyway, and says so in the history', async () => {
    const t = await start()
    const { releases } = await t.indexers.search(sintelSearch())
    const rejected = releases.find((r) => !r.approved)
    expect(rejected).toBeDefined()
    const grab = (force?: boolean) =>
      t.downloads.grab({
        itemId: ITEM,
        versionId: VERSION,
        indexerId: t.indexer.id,
        guid: rejected?.guid ?? '',
        force,
      })
    await expect(grab()).rejects.toThrow('That release was rejected: 0 seeders; the minimum is 1')
    const item = await grab(true)
    expect(item.release).toBe(rejected?.title ?? '')
    expect(t.history.at(-1)?.message).toStartWith('Grabbed anyway; the decision engine rejected it')
  })

  test('a release that left the cache, or one already downloading, is refused', async () => {
    const t = await start()
    await expect(
      t.downloads.grab({ itemId: ITEM, versionId: VERSION, indexerId: t.indexer.id, guid: BEST }),
    ).rejects.toThrow('That release is no longer in the search results. Search again.')
    await t.indexers.search(sintelSearch())
    await t.downloads.grab({
      itemId: ITEM,
      versionId: VERSION,
      indexerId: t.indexer.id,
      guid: BEST,
    })
    await expect(
      t.downloads.grab({ itemId: ITEM, versionId: VERSION, indexerId: t.indexer.id, guid: BEST }),
    ).rejects.toThrow('That release is already downloading.')
  })
})

describe('protection and replacement', () => {
  test('a release with an executable is stopped before it downloads, blocklisted and replaced', async () => {
    const t = await start()
    const bad = makeTorrent({
      name: 'Sintel.2010.1080p.BluRay.x264-GRP',
      files: [
        { path: 'Sintel.2010.1080p.BluRay.x264-GRP/Sintel.mkv', data: data(40_000) },
        { path: 'Sintel.2010.1080p.BluRay.x264-GRP/Sintel.exe', data: data(1_000) },
      ],
    })
    t.fake.serve(101, bad.torrent)
    await t.indexers.search(sintelSearch())
    await t.downloads.grab({
      itemId: ITEM,
      versionId: VERSION,
      indexerId: t.indexer.id,
      guid: BEST,
    })
    await t.drain()

    const rows = t.db.select().from(schema.downloads).all()
    const first = rows.find((r) => r.guid === BEST)
    expect(first?.state).toBe('failed')
    expect(first?.stateReason).toBe(
      'The release contains an executable file (Sintel.exe). It wasn’t downloaded, and it has been blocklisted.',
    )
    expect(t.downloads.blocklist().map((b) => b.sourceTitle)).toEqual([
      'Sintel.2010.1080p.BluRay.x264-GRP',
    ])
    // nothing of it was written
    expect(existsSync(join(t.downloadsDir, 'movies', 'Sintel.2010.1080p.BluRay.x264-GRP'))).toBe(
      false,
    )
    // the next best approved release took its place
    const queue = t.downloads.queue()
    expect(queue).toHaveLength(1)
    expect(queue[0]?.release).not.toBe('Sintel.2010.1080p.BluRay.x264-GRP')
    expect(t.history.map((h) => h.type)).toEqual(['grabbed', 'blocklisted', 'grabbed'])
    // a blocklisted release needs Grab anyway
    await expect(
      t.downloads.grab({ itemId: ITEM, versionId: VERSION, indexerId: t.indexer.id, guid: BEST }),
    ).rejects.toThrow('That release is blocklisted. Grab anyway takes it.')
  })

  test('stalled at 2 hours, replaced at 3, safe to run the check again', async () => {
    const t = await start()
    await t.indexers.search(sintelSearch())
    // nobody seeds the made-up torrent, so nothing ever arrives
    await t.downloads.grab({
      itemId: ITEM,
      versionId: VERSION,
      indexerId: t.indexer.id,
      guid: BEST,
    })
    await until(() => t.engine.list()[0]?.state === 'downloading', 5_000, 'the torrent to start')
    const check = async () => {
      t.jobs.enqueue('downloads.stall', {})
      await t.drain()
    }
    await check()
    expect(t.downloads.queue()[0]?.state).toBe('downloading')
    t.clock.advance(STALL_MS)
    await check()
    await check()
    expect(t.downloads.queue()[0]).toMatchObject({
      state: 'stalled',
      eta: null,
      stateReason: 'No seeds for 2 hours. highsea will search for another release at 3 hours.',
    })
    t.clock.advance(REPLACE_MS - STALL_MS)
    await check()
    await check()
    expect(t.downloads.blocklist()).toHaveLength(1)
    expect(t.downloads.blocklist()[0]?.reason).toBe('No seeds for 3 hours.')
    const queue = t.downloads.queue()
    expect(queue).toHaveLength(1)
    expect(queue[0]?.release).not.toBe('Sintel.2010.1080p.BluRay.x264-GRP')
  })

  test('Find another blocklists and grabs again from a new search when the cache is spent', async () => {
    const t = await start()
    await t.indexers.search(sintelSearch())
    const first = await t.downloads.grab({
      itemId: ITEM,
      versionId: VERSION,
      indexerId: t.indexer.id,
      guid: BEST,
    })
    // the cache runs out: the next grab comes from a new search
    t.db.delete(schema.releases).run()
    const { replaced } = await t.downloads.searchAlternative(first.id)
    expect(t.searches).toEqual([ITEM])
    expect(replaced?.release).not.toBe(first.release)
    expect(t.downloads.blocklist()[0]?.reason).toBe('Replaced from Activity.')
  })

  test('with nothing left, the history says so', async () => {
    const t = await start()
    await t.indexers.search(sintelSearch())
    const first = await t.downloads.grab({
      itemId: ITEM,
      versionId: VERSION,
      indexerId: t.indexer.id,
      guid: BEST,
    })
    t.fake.misbehave({ kind: 'empty' })
    t.db.delete(schema.releases).run()
    const { replaced } = await t.downloads.searchAlternative(first.id)
    expect(replaced).toBeNull()
    expect(t.history.at(-1)).toMatchObject({
      type: 'download-failed',
      message: 'No other approved release was found. highsea will try again on the next search.',
    })
  })
})

describe('imports', () => {
  test('a blocked import waits for the owner, and Import without the blocked file runs it again', async () => {
    let calls = 0
    const t = await start({
      importer: async (input) =>
        ++calls === 1 && !input.force
          ? { ok: false, reason: 'The release contains an executable file (setup.exe).' }
          : { ok: true, transfer: 'hardlink' },
    })
    const files = [{ path: 'Sintel.mkv', data: data(200_000) }]
    await t.seed(101, files, 'Sintel.mkv')
    await t.indexers.search(sintelSearch())
    const item = await t.downloads.grab({
      itemId: ITEM,
      versionId: VERSION,
      indexerId: t.indexer.id,
      guid: BEST,
    })
    await until(() => t.downloads.queue()[0]?.state === 'importing', 20_000, 'the download')
    await t.drain()
    expect(t.downloads.queue()[0]).toMatchObject({
      state: 'import-blocked',
      stateReason: 'The release contains an executable file (setup.exe).',
    })
    expect(t.downloads.issues().map((i) => i.id)).toEqual([`import-blocked-${item.id}`])
    t.downloads.forceImport(item.id)
    await t.drain()
    expect(t.imports.map((i) => i.force)).toEqual([false, true])
    expect(t.db.select().from(schema.downloads).get()?.state).toBe('completed')
    // running the job again does nothing more
    t.jobs.enqueue('downloads.import', { downloadId: item.id, force: false })
    await t.drain()
    expect(t.imports).toHaveLength(2)
  }, 30_000)
})

describe('Downloads', () => {
  test('a manual magnet goes to the manual folder and isn’t in the queue', async () => {
    const t = await start()
    const view = await t.downloads.add({
      source: { magnet: 'magnet:?xt=urn:btih:0123456789abcdef0123456789abcdef01234567&dn=Notes' },
      paused: true,
    })
    expect(view).toMatchObject({
      name: 'Notes',
      category: 'manual',
      movieId: null,
      state: 'paused',
      savePath: join(t.downloadsDir, 'manual'),
    })
    expect(t.downloads.queue()).toEqual([])
    await expect(
      t.downloads.add({
        source: { magnet: 'magnet:?xt=urn:btih:0123456789abcdef0123456789abcdef01234567' },
      }),
    ).rejects.toThrow('That torrent is already in Downloads.')
    await t.downloads.deleteTorrent(view.id, true)
    expect(t.downloads.torrents()).toEqual([])
  })

  test('limits and settings reach the engine', async () => {
    const t = await start()
    t.downloads.setLimits({ downloadRate: 1_000_000 })
    expect(t.engine.limits()).toMatchObject({
      downloadRate: 1_000_000,
      uploadRate: 0,
      maxActive: 3,
    })
    await t.downloads.saveSettings({ ...t.downloads.settings(), maxActive: 5 })
    expect(t.engine.limits().maxActive).toBe(5)
    expect(t.downloads.limits()).toEqual({ downloadRate: 1_000_000, uploadRate: 0 })
  })

  test('an import cut short by a restart runs again on start', async () => {
    const t = await start()
    await t.indexers.search(sintelSearch())
    const item = await t.downloads.grab({
      itemId: ITEM,
      versionId: VERSION,
      indexerId: t.indexer.id,
      guid: BEST,
    })
    t.db.update(schema.downloads).set({ state: 'importing' }).run()
    const stop = t.downloads.start()
    stop()
    expect(t.jobs.list({ status: ['queued'] }).map((j) => j.payload)).toContainEqual({
      downloadId: item.id,
      force: false,
    })
  })
})
