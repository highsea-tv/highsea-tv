// SPDX-License-Identifier: AGPL-3.0-only
// The end-to-end run (phase-3-checkpoint-6.md › Tests; the parent plan's exit criteria 2.3 to 2.5),
// in-process: add Sintel (2010), grab "Sintel.2010.1080p.BluRay.x264-GRP" from the fake indexer,
// follow its progress over SSE, and find the file at
// media/movies/Sintel (2010)/Sintel (2010) Bluray-1080p.mkv with history saying so. The release is
// a generated clip (ADR 0040), seeded by a second engine through a tracker, both on loopback; the
// runtime's engine is bound to loopback too, so nothing leaves the machine. Step 6 (checkpoint 7b):
// the clip speaks 52 seconds of Sintel, the fake Subdl serves its English subtitle 2.5 s late, and
// the real engine, in the worker pool, syncs the `.en.srt` it attaches.
import { afterEach, describe, expect, test } from 'bun:test'
import { existsSync, mkdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { join } from 'node:path'
import type { Fetch } from '@highsea-tv/core'
import { createFakeIndexer, FAKE_CREDENTIALS, FAKE_ORIGIN } from '@highsea-tv/indexers/fake'
import { hasFfmpeg } from '@highsea-tv/media/testing'
import { createReplayFetch } from '@highsea-tv/metadata/replay'
import {
  createFakeSubtitles,
  FAKE_ACCOUNTS,
  FAKE_OPENSUBTITLES_KEY,
} from '@highsea-tv/subtitles/fake'
import { makeSyncClip, sintel } from '@highsea-tv/subtitles/testing'
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
import { bootRuntime, cleanup, clientFor, ORIGIN, withOwner } from './helpers.ts'

const closers: (() => Promise<void> | void)[] = []
afterEach(async () => {
  for (const close of closers.splice(0).reverse()) await close()
  await cleanup()
})

const SINTEL = 45745
const RELEASE = 'Sintel.2010.1080p.BluRay.x264-GRP'
const RELEASE_ID = 101

/** An SRT's every time moved by `ms`. */
const shiftSrt = (text: string, ms: number) =>
  text.replace(/(\d\d):(\d\d):(\d\d),(\d\d\d)/g, (_, h, m, sec, milli) => {
    const t = Math.max(0, ((+h * 60 + +m) * 60 + +sec) * 1000 + +milli + ms)
    const pad = (n: number, w = 2) => String(n).padStart(w, '0')
    return `${pad(Math.floor(t / 3_600_000))}:${pad(Math.floor(t / 60_000) % 60)}:${pad(Math.floor(t / 1000) % 60)},${pad(t % 1000, 3)}`
  })

describe.skipIf(!hasFfmpeg)('Sintel, from grab to library', () => {
  test('grabbed, downloaded, imported and in history', async () => {
    // the release: a generated 1080p clip speaking Sintel, in a folder named for it, seeded on
    // loopback
    const clipDir = tempDir('clips')
    closers.push(() => rmSync(clipDir, { recursive: true, force: true }))
    const clip = new Uint8Array(
      readFileSync(
        makeSyncClip(join(clipDir, 'sintel.mkv'), { audio: 'sintel', size: '1920x1080' }),
      ),
    )
    const files = [{ path: `${RELEASE}/${RELEASE}.mkv`, data: clip }]
    const tracker = await startTracker()
    closers.push(() => tracker.close())
    const torrent = makeTorrent({ name: RELEASE, files, announce: [tracker.httpUrl] })
    const seedDir = tempDir('seed')
    closers.push(() => rmSync(seedDir, { recursive: true, force: true }))
    writeFiles(seedDir, files)
    const seeder = testEngine()
    closers.push(() => seeder.engine.close())
    await seeder.engine.start()
    await seeder.engine.setBinding(LOOPBACK)
    const seeding = await seeder.engine.add({
      source: { torrent: torrent.torrent },
      savePath: seedDir,
      category: 'movies',
    })
    await until(() => seeder.engine.get(seeding.id).state === 'seeding', 10_000, 'the seeder')

    const fake = createFakeIndexer()
    fake.serve(RELEASE_ID, torrent.torrent)
    const replay = createReplayFetch()
    const fetch: Fetch = (input, init) =>
      String(input instanceof Request ? input.url : input).startsWith(FAKE_ORIGIN)
        ? fake.fetch(input, init)
        : replay(input, init)
    // the subtitle Subdl has for the release: the official one, 2.5 s late
    const subtitles = createFakeSubtitles({ generate: false })
    subtitles.add({
      provider: 'subdl',
      tmdbId: SINTEL,
      language: 'en',
      releaseName: RELEASE,
      content: shiftSrt(sintel.srt(), 2_500),
    })
    // a short clip isn't a sample here: the movie's runtime would call it one
    const runtime = await bootRuntime({
      fetch,
      importing: { sampleSeconds: 2 },
      subtitles: { fetch: subtitles.fetch, openSubtitlesKey: FAKE_OPENSUBTITLES_KEY },
    })
    // the VPN is off in tests and the engine boots offline; loopback stands in for the tunnel
    await runtime.engine.setBinding(LOOPBACK)
    const app = createApi(runtime)
    const { token } = await withOwner(runtime)
    const api = clientFor(app, { token })
    await runtime.metadata.settings.setKey('test-tmdb-key')
    runtime.metadata.settings.update({ region: 'US' })

    const folder = join(runtime.config.dataDir, 'media', 'movies')
    mkdirSync(folder, { recursive: true })
    await api.rootFolders.add({ body: { path: folder } })
    await api.subtitles.saveProvider({
      params: { id: 'subdl' },
      body: { apiKey: FAKE_ACCOUNTS.subdl.apiKey },
    })
    await api.subtitles.toggleProvider({ params: { id: 'subdl' }, body: { enabled: true } })
    // a 52-second clip's 12 cues are less evidence than a film's: the minimum it can earn
    await api.subtitles.saveSettings({ body: { minConfidence: sintel.minConfidence } })
    const [english] = await api.subtitles.languageProfiles()
    await api.movies.add({
      body: {
        tmdbId: SINTEL,
        languageProfileId: english?.id ?? null,
        rootFolder: folder,
        monitored: true,
        minimumAvailability: 'released',
        versions: [{ label: '1080p', qualityProfileId: 'qp-hd' }],
      },
    })
    const { indexer } = await api.indexers.add({
      body: {
        definitionId: 'generic-torznab',
        settings: { baseUrl: `${FAKE_ORIGIN}/torznab`, apiKey: FAKE_CREDENTIALS.torznabKey },
      },
    })

    // progress over SSE, as the admin follows it
    const stream = await app.request(
      `${ORIGIN}/api/v1/events?topics=torrents.updated,queue.updated`,
      {
        headers: { authorization: `Bearer ${token}` },
      },
    )
    expect(stream.headers.get('content-type')).toContain('text/event-stream')
    const reader = (stream.body as ReadableStream<Uint8Array>).getReader()
    closers.push(() => reader.cancel())
    const heard: string[] = []
    void (async () => {
      const decoder = new TextDecoder()
      for (;;) {
        const { done, value } = await reader.read().catch(() => ({ done: true, value: undefined }))
        if (done) return
        heard.push(decoder.decode(value))
      }
    })()

    const found = await api.movies.interactiveSearch({ params: { id: SINTEL } })
    const release = found.releases.find((r) => r.title === RELEASE)
    expect(release?.approved).toBe(true)
    const item = await api.movies.grabRelease({
      params: { id: SINTEL, guid: release?.guid ?? '' },
      body: { indexerId: indexer.id },
    })
    expect(item).toMatchObject({ movieId: SINTEL, release: RELEASE })

    const target = join(folder, 'Sintel (2010)', 'Sintel (2010) Bluray-1080p.mkv')
    const start = Date.now()
    while (!existsSync(target)) {
      if (Date.now() - start > 30_000) {
        throw new Error('Timed out waiting for the import.')
      }
      // the finished torrent enqueues the import; the test runs the queue by hand (manualTicks)
      await runtime.jobs.tick()
      await runtime.jobs.idle()
      await new Promise((r) => setTimeout(r, 50))
    }

    // a hardlink of what the engine downloaded, byte for byte the seeder's
    expect(new Uint8Array(readFileSync(target))).toEqual(clip)
    expect(statSync(target).nlink).toBe(2)
    await until(() => heard.join('').includes('"topic":"torrents.updated"'), 5000, 'SSE')
    expect(heard.join('')).toContain('"topic":"queue.updated"')

    const movie = await api.movies.get({ params: { id: SINTEL } })
    expect(movie.status).toBe('available')
    const onDisk = await api.movies.files({ params: { id: SINTEL } })
    expect(onDisk).toHaveLength(1)
    expect(onDisk[0]?.path).toBe(target)

    const history = await api.movies.history({ params: { id: SINTEL }, query: {} })
    const types = history.items.map((h) => h.type)
    expect(types).toContain('grabbed')
    expect(types).toContain('imported')
    expect((await api.queue.list()).find((q) => q.id === item.id)?.state ?? 'gone').not.toBe(
      'import-blocked',
    )

    // step 6: the import's search attaches Subdl's `.en.srt`, and the sync moves it back
    const sidecar = join(folder, 'Sintel (2010)', 'Sintel (2010) Bluray-1080p.en.srt')
    let track: Awaited<ReturnType<typeof api.subtitles.forItem>>[number] | undefined
    const started = Date.now()
    for (;;) {
      await runtime.jobs.tick()
      await runtime.jobs.idle()
      ;[track] = await api.subtitles.forItem({ params: { id: SINTEL } })
      const status = track?.sync.status
      if (status === 'synced' || status === 'unsynced' || status === 'failed') break
      if (Date.now() - started > 30_000) throw new Error(`Timed out syncing: ${status ?? 'none'}`)
      await new Promise((r) => setTimeout(r, 50))
    }
    expect(track).toMatchObject({ language: 'en', provider: 'Subdl', path: sidecar })
    expect(track?.sync.status).toBe('synced')
    expect(track?.sync.confidence ?? 0).toBeGreaterThanOrEqual(sintel.minConfidence)
    // 2.5 s late, moved back: within the 450 ms the official timing is off the speech (ADR 0044)
    expect(Math.abs((track?.sync.offsetMs ?? 0) + 2_500)).toBeLessThan(450)
    expect(readFileSync(sidecar, 'utf8')).not.toBe(shiftSrt(sintel.srt(), 2_500))
    const synced = (await api.movies.history({ params: { id: SINTEL }, query: {} })).items
    expect(synced.map((h) => h.type)).toContain('subtitle-synced')
  }, 90_000)
})
