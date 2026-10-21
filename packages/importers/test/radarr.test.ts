// SPDX-License-Identifier: AGPL-3.0-only
// The Radarr importer against the fake Radarr: connecting (and a wrong key), the preview with its
// profile mapping nearest first, root folders and what can't come across; the run adding movies
// where they are, the file probed again, tags, naming and the blocklist; a second run skipping
// everything. The profile mapping and path mappings on their own too.
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test'
import { copyFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { schema } from '@highsea/db'
import { type Clips, hasFfmpeg, makeClips } from '@highsea/media/testing'
import { seedProfiles } from '@highsea/quality'
import { mapPath, nearestProfiles, radarrCutoff } from '../src/radarr/index.ts'
import { FAKE_RADARR_KEY, radarrLibrary, SINTEL_HASH, startFakeRadarr } from './fake/index.ts'
import { reason, setup } from './helpers.ts'

let clipsDir: string
let clips: Clips
beforeAll(() => {
  clipsDir = mkdtempSync(join(tmpdir(), 'highsea-importer-clips-'))
  if (hasFfmpeg) clips = makeClips(clipsDir)
})
afterAll(() => rmSync(clipsDir, { recursive: true, force: true }))

const cleanups: (() => Promise<void> | void)[] = []
afterEach(async () => {
  for (const c of cleanups.splice(0)) await c()
})

async function start() {
  const s = await setup()
  const fake = await startFakeRadarr(radarrLibrary('/movies', '/movies-4k'))
  cleanups.push(s.cleanup, fake.close)
  const conn = { url: fake.url, apiKey: FAKE_RADARR_KEY }
  const fourK = join(s.data, 'media', '4k')
  mkdirSync(fourK, { recursive: true })
  const pathMappings = [
    { from: '/movies', to: s.library },
    { from: '/movies-4k', to: fourK },
  ]
  return { ...s, fake, conn, fourK, pathMappings }
}

describe('path mappings', () => {
  test('the longest from wins, on a folder boundary', () => {
    const maps = [
      { from: '/movies', to: '/data/media/movies' },
      { from: '/movies/4k/', to: '/data/media/4k' },
    ]
    expect(mapPath('/movies/Sintel (2010)/a.mkv', maps)).toBe(
      '/data/media/movies/Sintel (2010)/a.mkv',
    )
    expect(mapPath('/movies/4k/Sintel (2010)', maps)).toBe('/data/media/4k/Sintel (2010)')
    expect(mapPath('/movies', maps)).toBe('/data/media/movies')
    // not a folder boundary: /movies-4k isn't inside /movies
    expect(mapPath('/movies-4k/x', maps)).toBe('/movies-4k/x')
    expect(mapPath('/elsewhere/x', [])).toBe('/elsewhere/x')
  })
})

describe('the profile mapping', () => {
  test('nearest first by cutoff, a group’s by its best member', () => {
    const ours = seedProfiles()
    const library = radarrLibrary()
    const [any, hd, uhd] = library.profiles as unknown as Parameters<typeof radarrCutoff>[0][]
    expect(radarrCutoff(hd as never)).toEqual({ name: 'Bluray-1080p', rank: expect.any(Number) })
    expect(nearestProfiles(hd as never, ours)[0]).toBe('qp-hd')
    expect(nearestProfiles(uhd as never, ours)[0]).toBe('qp-uhd')
    expect(nearestProfiles(any as never, ours)[0]).toBe('qp-any')
    expect(new Set(nearestProfiles(any as never, ours))).toEqual(new Set(ours.map((p) => p.id)))
    // a cutoff that's a group: the group's best quality
    const grouped = {
      id: 9,
      name: 'Web',
      cutoff: 1001,
      items: (hd as never as { items: [] }).items,
    }
    expect(radarrCutoff(grouped as never).name).toBe('WEB 1080p')
  })
})

describe('the Radarr importer', () => {
  test('connect: the version and how many movies; a wrong key or address is refused', async () => {
    const s = await start()
    expect(await s.radarr.connect(s.conn)).toEqual({ version: '5.14.0.9383', movies: 3 })
    expect(await reason(() => s.radarr.connect({ ...s.conn, apiKey: 'wrong' }))).toBe(
      'invalid:bad-credentials',
    )
    expect(await reason(() => s.radarr.connect({ ...s.conn, url: 'ftp://x' }))).toBe(
      'invalid:bad-url',
    )
    expect(await reason(() => s.radarr.connect({ ...s.conn, url: 'http://127.0.0.1:9' }))).toBe(
      'unavailable:unreachable',
    )
  })

  test('preview: counts, the profile mapping, root folders and what can’t come across', async () => {
    const s = await start()
    const p = await s.radarr.preview(s.conn, s.pathMappings)
    expect(p.movies).toEqual({ total: 3, withFiles: 1, inLibrary: 0, ready: 3 })
    expect(p.profiles.map((x) => [x.name, x.cutoff, x.movies, x.options[0]])).toEqual([
      ['Any', 'SDTV', 1, 'qp-any'],
      ['HD-1080p', 'Bluray-1080p', 1, 'qp-hd'],
      ['Ultra-HD', 'Remux-2160p', 1, 'qp-uhd'],
    ])
    expect(p.rootFolders).toEqual([
      { radarr: '/movies', path: s.library, status: 'root-folder', movies: 2 },
      { radarr: '/movies-4k', path: s.fourK, status: 'add', movies: 1 },
    ])
    expect(p.kept).toEqual({ indexers: ['Nyaa'], downloadClients: ['qBittorrent'] })
    expect(p.tags).toBe(2)
    expect(p.blocklist).toBe(1)
    expect(p.naming).toMatchObject({ rename: true, problem: null })
    expect(p.problems).toEqual([])

    // without the mappings Radarr's paths are outside every folder highsea may use
    const unmapped = await s.radarr.preview(s.conn, [])
    expect(unmapped.rootFolders.every((r) => r.status === 'outside')).toBe(true)
    expect(unmapped.movies.ready).toBe(0)
    expect(unmapped.problems[0]?.message).toContain('Add a path mapping')
  })

  test.skipIf(!hasFfmpeg)(
    'run: movies where they are, the file probed, tags, naming and the blocklist; a second run skips',
    async () => {
      const s = await start()
      const folder = join(s.library, 'Sintel (2010)')
      mkdirSync(folder, { recursive: true })
      const file = join(folder, 'Sintel.2010.1080p.BluRay.x264-GRP.mkv')
      copyFileSync(clips.main, file)

      const begun = s.radarr.run(s.conn, {
        pathMappings: s.pathMappings,
        // the owner moved Ultra-HD onto HD 1080p in the preview
        profiles: { '5': 'qp-hd' },
      })
      expect(begun).toMatchObject({ state: 'running', done: 0 })
      expect(await reason(() => s.radarr.run(s.conn, { pathMappings: [] }))).toBe(
        'conflict:running',
      )
      // the payload carries the key sealed, never in the clear
      const job = s.db.select().from(schema.jobs).all()
      expect(JSON.stringify(job)).not.toContain(FAKE_RADARR_KEY)

      await s.runJobs()
      expect(s.radarr.status()).toMatchObject({
        state: 'done',
        total: 3,
        done: 3,
        imported: 3,
        skipped: 0,
        failures: [],
      })

      const sintel = s.movies.get(45745)
      expect(sintel).toMatchObject({
        monitored: true,
        minimumAvailability: 'released',
        qualityProfileId: 'qp-hd',
        path: folder,
        status: 'available',
      })
      expect(s.movies.files(45745).map((f) => f.path)).toEqual([file])
      expect(s.movies.get(10378)).toMatchObject({
        monitored: false,
        minimumAvailability: 'in-cinemas',
        qualityProfileId: 'qp-hd',
        path: join(s.library, 'Big Buck Bunny (2008)'),
      })
      // Tears of Steel's root folder came across, inside the data folder
      expect(s.media.rootFolders.list().map((r) => r.path)).toEqual([s.fourK, s.library].sort())
      expect(s.movies.get(133701)).toMatchObject({
        rootFolder: s.fourK,
        minimumAvailability: 'announced',
      })

      const tags = s.db.select().from(schema.tags).all()
      expect(tags.map((t) => t.label).sort()).toEqual(['animation', 'family'])
      expect(s.db.select().from(schema.mediaItemTags).all()).toHaveLength(3)

      expect(s.media.mediaManagement.get()).toMatchObject({
        rename: true,
        folderFormat: '{Movie Title} ({Release Year}) {tmdb-{TmdbId}}',
        colonReplacement: 'space-dash',
        chmod: '775',
        recycleBinDays: 14,
        unmonitorDeleted: false,
      })
      expect(s.downloads.blocklist()).toMatchObject([
        { sourceTitle: 'Sintel.2010.1080p.WEB-DL.DD5.1.H264-BAD', reason: 'Stalled with no peers' },
      ])
      expect(s.radarr.grabs()).toEqual({ [SINTEL_HASH]: 45745 })
      // an imported blocklist entry matches a release by its title
      const itemId = s.db
        .select()
        .from(schema.mediaItems)
        .all()
        .find((r) => r.tmdbId === 45745)?.id
      expect(
        s.downloads.isBlocked(itemId as string, {
          title: 'Sintel.2010.1080p.WEB-DL.DD5.1.H264-BAD',
        }),
      ).toBe(true)

      // safe to repeat: everything is there, so everything is skipped
      s.radarr.run(s.conn, { pathMappings: s.pathMappings })
      await s.runJobs()
      expect(s.radarr.status()).toMatchObject({
        state: 'done',
        imported: 0,
        skipped: 3,
        failures: [],
      })
      expect(s.movies.files(45745)).toHaveLength(1)
      expect(s.downloads.blocklist()).toHaveLength(1)
      expect(s.db.select().from(schema.mediaItemTags).all()).toHaveLength(3)
    },
  )

  test('a movie outside every allowed folder fails with the way to fix it; the rest come', async () => {
    const s = await start()
    s.radarr.run(s.conn, { pathMappings: [{ from: '/movies', to: s.library }], settings: false })
    await s.runJobs()
    const st = s.radarr.status()
    // Sintel's file isn't on disk in this test, so it comes without it
    expect(st).toMatchObject({ state: 'done', total: 3, imported: 1 })
    expect(st.failures).toEqual([
      { name: 'Sintel (2010)', message: expect.stringContaining('Added, without its file') },
      { name: 'Tears of Steel (2012)', message: expect.stringContaining('Add a path mapping') },
    ])
    expect(s.movies.inLibrary([133701]).size).toBe(0)
    // settings off: highsea's naming stays its own
    expect(s.media.mediaManagement.get().folderFormat).toBe('{Movie Title} ({Release Year})')
  })

  test('a profile that doesn’t exist is refused before the job starts', async () => {
    const s = await start()
    expect(
      await reason(() =>
        s.radarr.run(s.conn, { pathMappings: s.pathMappings, profiles: { '4': 'qp-nope' } }),
      ),
    ).toBe('not-found:unknown-quality-profile')
  })

  test('a file that isn’t on disk: the movie comes, the file is a failure', async () => {
    const s = await start()
    s.radarr.run(s.conn, { pathMappings: s.pathMappings })
    await s.runJobs()
    const st = s.radarr.status()
    expect(st.imported).toBe(2)
    expect(st.failures).toEqual([
      { name: 'Sintel (2010)', message: expect.stringContaining('Added, without its file') },
    ])
    expect(s.movies.get(45745).status).not.toBe('available')
  })
})
