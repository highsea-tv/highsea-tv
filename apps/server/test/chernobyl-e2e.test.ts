// SPDX-License-Identifier: AGPL-3.0-only
// A show's episodes from grab to library (Phase 5 C1), in-process as Sintel's run is
// (sintel-e2e.test.ts): add Chernobyl (2019) from TMDB's recordings into an empty shows root folder,
// search the fake indexer for a season or an episode over `t=tvsearch`, grab, and find each file in
// "Chernobyl (2019)/Season 01" under the show's episode naming, hardlinked, with history saying so.
// One run grabs a single episode and then a two-episode file (one file for both); the other the
// season pack, whose five files each go to their own episode. The releases are a generated clip,
// seeded by a second engine through a tracker, both on loopback, so nothing leaves the machine.
import { afterEach, describe, expect, test } from 'bun:test'
import { mkdirSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { join } from 'node:path'
import type { Fetch } from '@highsea-tv/core'
import { createFakeIndexer, FAKE_CREDENTIALS, FAKE_ORIGIN } from '@highsea-tv/indexers/fake'
import { hasFfmpeg } from '@highsea-tv/media/testing'
import { createReplayFetch } from '@highsea-tv/metadata/replay'
import { makeSyncClip } from '@highsea-tv/subtitles/testing'
import {
  LOOPBACK,
  makeTorrent,
  startTracker,
  tempDir,
  testEngine,
  until,
  writeFiles,
} from '@highsea-tv/torrent/testing'
import { createApi } from '../src/api/app.ts'
import { bootRuntime, cleanup, clientFor, withOwner } from './helpers.ts'

const closers: (() => Promise<void> | void)[] = []
afterEach(async () => {
  for (const close of closers.splice(0).reverse()) await close()
  await cleanup()
})

const CHERNOBYL = '87108'
/** The fake indexer's Chernobyl releases (packages/indexers/test/fake/fixtures.ts). */
const SINGLE = { id: 201, name: 'Chernobyl.S01E01.1080p.WEB-DL.DDP5.1.H.264-GRP' }
const DOUBLE = { id: 202, name: 'Chernobyl.S01E02E03.1080p.WEB-DL.DDP5.1.H.264-GRP' }
const PACK = { id: 203, name: 'Chernobyl.S01.1080p.BluRay.x264-GRP' }

/** One clip, made once: every release's files are copies of it. */
let clipBytes: Uint8Array | null = null
function clip(): Uint8Array {
  if (clipBytes) return clipBytes
  const dir = tempDir('clips')
  closers.push(() => rmSync(dir, { recursive: true, force: true }))
  clipBytes = new Uint8Array(
    readFileSync(makeSyncClip(join(dir, 'episode.mkv'), { audio: 'sine', size: '1920x1080' })),
  )
  return clipBytes
}

/** The runtime with Chernobyl added, the fake indexer enabled, and a seeder for `releases`. */
async function setup(releases: { id: number; name: string; files: string[] }[]) {
  const tracker = await startTracker()
  closers.push(() => tracker.close())
  const seeder = testEngine()
  closers.push(() => seeder.engine.close())
  await seeder.engine.start()
  await seeder.engine.setBinding(LOOPBACK)
  const fake = createFakeIndexer()
  for (const r of releases) {
    const files = r.files.map((f) => ({ path: `${r.name}/${f}`, data: clip() }))
    const torrent = makeTorrent({ name: r.name, files, announce: [tracker.httpUrl] })
    const seedDir = tempDir('seed')
    closers.push(() => rmSync(seedDir, { recursive: true, force: true }))
    writeFiles(seedDir, files)
    const seeding = await seeder.engine.add({
      source: { torrent: torrent.torrent },
      savePath: seedDir,
      category: 'shows',
    })
    await until(() => seeder.engine.get(seeding.id).state === 'seeding', 10_000, 'the seeder')
    fake.serve(r.id, torrent.torrent)
  }
  const replay = createReplayFetch()
  const fetch: Fetch = (input, init) =>
    String(input instanceof Request ? input.url : input).startsWith(FAKE_ORIGIN)
      ? fake.fetch(input, init)
      : replay(input, init)
  // a short clip isn't a sample here: an episode's runtime would call it one
  const runtime = await bootRuntime({ fetch, importing: { sampleSeconds: 2 } })
  await runtime.engine.setBinding(LOOPBACK)
  const app = createApi(runtime)
  const { token } = await withOwner(runtime)
  const api = clientFor(app, { token })
  await runtime.metadata.settings.setKey('test-key-for-replay-0001')

  const root = join(runtime.config.dataDir, 'media', 'shows')
  mkdirSync(root, { recursive: true })
  runtime.media.rootFolders.add({ path: root, kind: 'shows' })
  await api.series.add({
    body: {
      tmdbId: Number(CHERNOBYL),
      qualityProfileId: 'qp-hd',
      rootFolder: root,
      monitor: 'all',
      seasonFolders: true,
      search: false,
    },
  })
  const { indexer } = await api.indexers.add({
    body: {
      definitionId: 'generic-torznab',
      settings: { baseUrl: `${FAKE_ORIGIN}/torznab`, apiKey: FAKE_CREDENTIALS.torznabKey },
    },
  })
  const season = join(root, 'Chernobyl (2019)', 'Season 01')
  /** The episode ids as the admin names them, by number. */
  const show = await api.series.get({ params: { id: CHERNOBYL } })
  const episodeId = (n: number) =>
    show.seasonList.find((s) => s.number === 1)?.episodes.find((e) => e.number === n)?.id ?? ''

  /** Runs the queue until `count` files are in the season folder. */
  const imported = async (count: number) => {
    const start = Date.now()
    const files = () => {
      try {
        return readdirSync(season).sort()
      } catch {
        return []
      }
    }
    while (files().length < count) {
      if (Date.now() - start > 45_000) throw new Error(`Timed out: ${files().join(', ')}`)
      // the finished torrent enqueues the import; the test runs the queue by hand
      await runtime.jobs.tick()
      await runtime.jobs.idle()
      await new Promise((r) => setTimeout(r, 50))
    }
    return files()
  }
  return { runtime, api, indexer, season, episodeId, imported }
}

describe.skipIf(!hasFfmpeg)('Chernobyl’s episodes, from grab to library', () => {
  test('a single episode, then two in one file', async () => {
    const { api, indexer, season, episodeId, imported } = await setup([
      { ...SINGLE, files: [`${SINGLE.name}.mkv`] },
      { ...DOUBLE, files: [`${DOUBLE.name}.mkv`] },
    ])

    // the first episode's search: tvsearch with season and ep, judged by the HD profile
    const one = await api.series.interactiveSearch({
      params: { id: CHERNOBYL },
      body: { season: 1, episode: episodeId(1) },
    })
    const single = one.releases.find((r) => r.title === SINGLE.name)
    expect(single).toMatchObject({ approved: true, season: 1, episodes: [1], pack: false })
    const item = await api.series.grabRelease({
      params: { id: CHERNOBYL, guid: single?.guid ?? '' },
      body: { indexerId: indexer.id, season: 1, episode: episodeId(1) },
    })
    expect(item).toMatchObject({
      release: SINGLE.name,
      show: { id: CHERNOBYL, season: 1, episodes: [1] },
    })
    // a second grab for the same episode while it downloads is refused
    const again = await api.series
      .grabRelease({
        params: { id: CHERNOBYL, guid: single?.guid ?? '' },
        body: { indexerId: indexer.id, season: 1, episode: episodeId(1) },
      })
      .then(
        () => null,
        (e: { status: number }) => e.status,
      )
    expect(again).toBe(409)
    const first = await imported(1)
    expect(first).toHaveLength(1)
    expect(first[0]).toMatch(/^Chernobyl - S01E01 - .+ WEBDL-1080p\.mkv$/)
    const path = join(season, first[0] ?? '')
    // byte for byte the seeder's
    expect(Buffer.compare(readFileSync(path), clip())).toBe(0)
    // hardlinked from the download (ADR 0039)
    expect(statSync(path).nlink).toBe(2)

    // the season's search: the double release brings two wanted episodes; the pack isn't served
    const s1 = await api.series.interactiveSearch({
      params: { id: CHERNOBYL },
      body: { season: 1 },
    })
    const double = s1.releases.find((r) => r.title === DOUBLE.name)
    expect(double).toMatchObject({ approved: true, episodes: [2, 3], pack: false })
    // the season pack would bring S01E01 again, which has a file: rejected
    const pack = s1.releases.find((r) => r.title === PACK.name)
    expect(pack?.approved).toBe(false)
    await api.series.grabRelease({
      params: { id: CHERNOBYL, guid: double?.guid ?? '' },
      body: { indexerId: indexer.id, season: 1 },
    })
    const both = await imported(2)
    const multi = both.find((f) => f.includes('S01E02'))
    // one file for both, named once with both numbers
    expect(multi).toMatch(/^Chernobyl - S01E02-E03 - .+\.mkv$/)

    const show = await api.series.get({ params: { id: CHERNOBYL } })
    const eps = show.seasonList.find((s) => s.number === 1)?.episodes ?? []
    expect(eps.filter((e) => e.status === 'available').map((e) => e.number)).toEqual([1, 2, 3])
    const two = eps.find((e) => e.number === 2)
    expect(two?.file?.episodes).toEqual([2, 3])

    // Activity: a show's grab and import, named by the show and its episodes
    const history = await api.history.list({ query: {} })
    const ours = history.items.filter((h) => h.show?.id === CHERNOBYL)
    expect(ours.map((h) => h.type)).toEqual(expect.arrayContaining(['grabbed', 'imported']))
    expect(ours.find((h) => h.type === 'grabbed' && h.sourceTitle === DOUBLE.name)?.show).toEqual({
      id: CHERNOBYL,
      season: 1,
      episodes: [2, 3],
    })
  }, 120_000)

  test('a season pack: each file to its own episode', async () => {
    const files = [1, 2, 3, 4, 5].map((n) => `Chernobyl.S01E0${n}.1080p.BluRay.x264-GRP.mkv`)
    const { api, indexer, imported } = await setup([{ ...PACK, files }])

    const found = await api.series.interactiveSearch({
      params: { id: CHERNOBYL },
      body: { season: 1 },
    })
    const pack = found.releases.find((r) => r.title === PACK.name)
    // every episode is monitored, aired and missing: the pack is accepted
    expect(pack).toMatchObject({ approved: true, pack: true, episodes: [1, 2, 3, 4, 5] })
    const item = await api.series.grabRelease({
      params: { id: CHERNOBYL, guid: pack?.guid ?? '' },
      body: { indexerId: indexer.id, season: 1 },
    })
    expect(item.show).toEqual({ id: CHERNOBYL, season: 1, episodes: [1, 2, 3, 4, 5] })
    const all = await imported(5)
    expect(all.map((f) => /S01E0(\d)/.exec(f)?.[1])).toEqual(['1', '2', '3', '4', '5'])
    for (const f of all) expect(f).toMatch(/ Bluray-1080p\.mkv$/)
    const show = await api.series.get({ params: { id: CHERNOBYL } })
    expect(show.episodes.have).toBe(5)
  }, 120_000)
})
