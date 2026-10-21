// SPDX-License-Identifier: AGPL-3.0-only
// The qBittorrent importer against the fake qBittorrent: signing in (and a wrong password), the
// version refusal below 4.5.0, the preview, and the run: each torrent added paused where its data
// is, with its category, limits, totals and file priorities, checked once in the background, never
// started until Resume; a torrent Radarr grabbed linked to its movie; a second run skipping.
import { afterEach, describe, expect, test } from 'bun:test'
import { join } from 'node:path'
import { schema, writeSetting } from '@highsea/db'
import { makeTorrent, randomData, until, writeFiles } from '@highsea/torrent/testing'
import { categoryName, priorityOf, versionAtLeast } from '../src/qbittorrent/index.ts'
import { RADARR_GRABS_KEY } from '../src/radarr/index.ts'
import {
  FAKE_QBT_PASSWORD,
  FAKE_QBT_USER,
  type FakeQbtTorrent,
  qbtState,
  startFakeQbittorrent,
} from './fake/index.ts'
import { reason, setup } from './helpers.ts'

const cleanups: (() => Promise<void> | void)[] = []
afterEach(async () => {
  for (const c of cleanups.splice(0)) await c()
})

function torrentOf(
  name: string,
  savePath: string,
  patch: Partial<FakeQbtTorrent> = {},
): { t: FakeQbtTorrent; files: { path: string; data: Uint8Array }[] } {
  // whole pieces each (32 KiB), so a skipped file shares no piece with the one kept
  const files = [
    { path: `${name}/${name}.mkv`, data: randomData(96 * 1024) },
    { path: `${name}/sample.mkv`, data: randomData(32 * 1024) },
  ]
  const made = makeTorrent({ name, files })
  return {
    files,
    t: {
      hash: made.infoHash,
      name,
      size: made.length,
      category: 'radarr',
      save_path: savePath,
      progress: 1,
      state: 'stalledUP',
      ratio_limit: 1.5,
      seeding_time_limit: -1,
      uploaded: 300_000,
      downloaded: made.length,
      seeding_time: 3600,
      torrent: new Uint8Array(made.torrent),
      files: files.map((f, i) => ({
        name: f.path,
        size: f.data.length,
        priority: i === 1 ? 0 : 1,
      })),
      ...patch,
    },
  }
}

async function start(state = qbtState()) {
  const s = await setup()
  const fake = await startFakeQbittorrent(state)
  cleanups.push(s.cleanup, fake.close)
  const conn = { url: fake.url, username: FAKE_QBT_USER, password: FAKE_QBT_PASSWORD }
  const pathMappings = [{ from: '/downloads', to: s.downloadsFolder }]
  return { ...s, fake, conn, pathMappings }
}

describe('qBittorrent’s pieces', () => {
  test('versions, category names and priorities', () => {
    expect(versionAtLeast('2.8.18', '2.8.18')).toBe(true)
    expect(versionAtLeast('2.11.2', '2.8.18')).toBe(true)
    expect(versionAtLeast('2.8.5', '2.8.18')).toBe(false)
    expect(categoryName('radarr')).toBe('radarr')
    expect(categoryName('linux/isos')).toBe('linux-isos')
    expect(categoryName('movies')).toBe('movies-qbittorrent')
    expect(categoryName('')).toBe('manual')
    expect([0, 1, 6, 7].map(priorityOf)).toEqual(['skip', 'normal', 'high', 'high'])
  })
})

describe('the qBittorrent importer', () => {
  test('connect signs in and reads the version; a wrong password is refused', async () => {
    const s = await start()
    expect(await s.qbittorrent.connect(s.conn)).toEqual({
      version: '5.0.2',
      webApi: '2.11.2',
      torrents: 0,
    })
    expect(await reason(() => s.qbittorrent.connect({ ...s.conn, password: 'nope' }))).toBe(
      'invalid:bad-credentials',
    )
  })

  test('below qBittorrent 4.5.0 it’s refused with the version needed', async () => {
    const s = await start(qbtState({ version: 'v4.4.5', webApi: '2.8.5' }))
    expect(await reason(() => s.qbittorrent.connect(s.conn))).toBe('invalid:too-old')
    await s.qbittorrent.connect(s.conn).catch((e: Error) => {
      expect(e.message).toContain('qBittorrent 4.5.0 or later')
      expect(e.message).toContain('This one is 4.4.5 (Web API 2.8.5)')
    })
  })

  test('preview: counts, categories and save paths through the mappings', async () => {
    const s = await start()
    const a = torrentOf('Ubuntu.24.04', '/downloads/radarr')
    const b = torrentOf('Elsewhere', '/srv/torrents', { category: '' })
    s.fake.state.torrents.push(a.t, b.t)
    const p = await s.qbittorrent.preview(s.conn, s.pathMappings)
    expect(p.torrents).toEqual({ total: 2, ready: 1, inDownloads: 0, outside: 1, linked: 0 })
    expect(p.categories).toEqual([
      { qbittorrent: 'linux/isos', name: 'linux-isos', folder: null },
      { qbittorrent: 'radarr', name: 'radarr', folder: join(s.downloadsFolder, 'radarr') },
    ])
    expect(p.savePaths).toEqual([
      {
        qbittorrent: '/downloads/radarr',
        path: join(s.downloadsFolder, 'radarr'),
        ok: true,
        torrents: 1,
      },
      { qbittorrent: '/srv/torrents', path: '/srv/torrents', ok: false, torrents: 1 },
    ])
    expect(p.list.map((x) => [x.name, x.status, x.category])).toEqual([
      ['Ubuntu.24.04', 'ready', 'radarr'],
      ['Elsewhere', 'outside', 'manual'],
    ])
  })

  test('run: paused where the data is, checked once, limits and totals kept; resume starts them', async () => {
    const s = await start()
    const a = torrentOf('Ubuntu.24.04', '/downloads/radarr')
    const outside = torrentOf('Elsewhere', '/srv/torrents')
    s.fake.state.torrents.push(a.t, outside.t)
    const saved = join(s.downloadsFolder, 'radarr')
    writeFiles(saved, a.files)

    expect(s.qbittorrent.run(s.conn, { pathMappings: s.pathMappings })).toMatchObject({
      state: 'running',
    })
    await s.runJobs()
    const st = s.qbittorrent.status()
    expect(st).toMatchObject({ state: 'done', total: 2, imported: 1, skipped: 0 })
    expect(st.failures).toEqual([
      { name: 'Elsewhere', message: expect.stringContaining('Add a path mapping') },
    ])
    expect(st.torrentIds).toHaveLength(1)

    const id = st.torrentIds[0] as string
    // checked once in the background, and still paused: qBittorrent may still be running
    await until(
      () => s.engine.get(id).files[0]?.progress === 1 && s.engine.get(id).state === 'paused',
    )
    const t = s.downloads.torrent(id)
    expect(t).toMatchObject({
      name: 'Ubuntu.24.04',
      category: 'radarr',
      manual: true,
      savePath: saved,
      uploaded: 300_000,
      seedingRule: { ratio: 1.5, minutes: null, minMinutes: null },
    })
    expect(t.files.map((f) => f.priority)).toEqual(['normal', 'skip'])
    expect(s.qbittorrent.status()).toMatchObject({ paused: 1 })
    // the categories came across, a subcategory's slash made a dash
    expect(s.downloads.categories().map((c) => c.name)).toEqual([
      'movies',
      'manual',
      'linux-isos',
      'radarr',
    ])

    // safe to repeat: the torrent is in Downloads, so it's skipped
    s.qbittorrent.run(s.conn, { pathMappings: s.pathMappings })
    await s.runJobs()
    expect(s.qbittorrent.status()).toMatchObject({ imported: 0, skipped: 1, torrentIds: [id] })
    expect(s.engine.list()).toHaveLength(1)

    // the owner stopped qBittorrent: resume
    const after = s.qbittorrent.resume()
    expect(after.resumedAt).toEqual(expect.any(Number))
    expect(s.engine.get(id).state).not.toBe('paused')
  })

  test('a torrent Radarr grabbed for a movie in the library is linked to it', async () => {
    const s = await start()
    const a = torrentOf('Sintel.2010.1080p.BluRay.x264-GRP', '/downloads/radarr')
    s.fake.state.torrents.push(a.t)
    writeFiles(join(s.downloadsFolder, 'radarr'), a.files)
    await s.movies.add({
      tmdbId: 45745,
      rootFolder: s.library,
      monitored: true,
      minimumAvailability: 'released',
      versions: [{ label: 'HD', qualityProfileId: 'qp-hd' }],
    })
    writeSetting(s.db, RADARR_GRABS_KEY, { [a.t.hash]: 45745 }, s.clock.now())
    expect((await s.qbittorrent.preview(s.conn, s.pathMappings)).torrents.linked).toBe(1)
    s.qbittorrent.run(s.conn, { pathMappings: s.pathMappings })
    await s.runJobs()
    const [row] = s.db.select().from(schema.downloads).all()
    expect(row).toMatchObject({
      infoHash: a.t.hash,
      state: 'completed',
      releaseTitle: 'Sintel.2010.1080p.BluRay.x264-GRP',
    })
    const item = s.db.select().from(schema.mediaItems).all()[0]
    expect(row?.itemId).toBe(item?.id as string)
    expect(s.downloads.torrent(row?.torrentId as string).manual).toBe(false)
  })
})
