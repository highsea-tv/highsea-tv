// SPDX-License-Identifier: AGPL-3.0-only
// Importing a library already on disk, end to end on generated clips with TMDB replayed: each
// folder read by name and matched, the confirmed ones added where they are by a job, safe to run
// twice, and Rename to my format renaming the folder and the file. Plus the matcher on its own.
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { DiscoverMovie } from '@highsea/metadata'
import { bestMatch } from '../../src/movies/index.ts'
import { type Clips, hasFfmpeg, makeClips } from '../clips.ts'
import { METROPOLIS, NOSFERATU, reason, SINTEL, setup } from './helpers.ts'

let clipsDir: string
let clips: Clips
beforeAll(() => {
  clipsDir = mkdtempSync(join(tmpdir(), 'highsea-library-clips-'))
  if (hasFfmpeg) clips = makeClips(clipsDir)
})
afterAll(() => rmSync(clipsDir, { recursive: true, force: true }))

let cleanups: (() => void)[] = []
afterEach(() => {
  for (const c of cleanups) c()
  cleanups = []
})

/** A root folder with movies already in it, none in the library yet. */
async function start(folders: Record<string, Record<string, keyof Clips>>) {
  const s = await setup({ importing: { downloadDirs: () => [], sampleSeconds: 2 } })
  cleanups.push(s.cleanup)
  const root = s.folder.path
  for (const [folder, files] of Object.entries(folders)) {
    mkdirSync(join(root, folder), { recursive: true })
    for (const [file, clip] of Object.entries(files))
      copyFileSync(clips[clip], join(root, folder, file))
  }
  const runJob = async () => {
    await s.jobs.tick()
    await s.jobs.idle()
  }
  return { ...s, root, runJob }
}

describe.skipIf(!hasFfmpeg)('importing an existing library', () => {
  test('scan reads each folder’s name and matches it on TMDB', async () => {
    const s = await start({
      'Sintel (2010)': { 'Sintel.2010.1080p.BluRay.x264-GRP.mkv': 'main', 'sample.mkv': 'sample' },
      'Metropolis {tmdb-19}': { 'metropolis.mkv': 'main' },
      'Nosferatu (1922)': { 'Nosferatu.1922.720p.WEB-DL.mkv': 'main' },
      'Empty (2000)': {},
    })
    const found = await s.movies.libraryImport.scan(s.root)
    expect(found.map((c) => [c.name, c.match?.tmdbId ?? null, c.skip])).toEqual([
      ['Empty (2000)', null, 'No video file in the folder.'],
      ['Metropolis {tmdb-19}', METROPOLIS, null],
      ['Nosferatu (1922)', NOSFERATU, null],
      ['Sintel (2010)', SINTEL, null],
    ])
    const sintel = found.find((c) => c.name === 'Sintel (2010)')
    expect(sintel).toMatchObject({
      file: join(s.root, 'Sintel (2010)', 'Sintel.2010.1080p.BluRay.x264-GRP.mkv'),
      quality: 'Bluray-1080p',
      inLibrary: false,
      match: { title: 'Sintel', year: 2010 },
    })
  })

  test('the confirmed movies are added where they are, by a job, safe to run twice', async () => {
    const s = await start({
      'Sintel (2010)': { 'Sintel.2010.1080p.BluRay.x264-GRP.mkv': 'main' },
      'Metropolis {tmdb-19}': { 'metropolis.mkv': 'main' },
    })
    const items = [
      { folder: join(s.root, 'Sintel (2010)'), tmdbId: SINTEL },
      { folder: join(s.root, 'Metropolis {tmdb-19}'), tmdbId: METROPOLIS },
    ]
    s.seen.length = 0
    const started = s.movies.libraryImport.run(items)
    expect(started).toMatchObject({ state: 'running', total: 2, done: 0, rename: false })
    // one run at a time
    expect(await reason(() => s.movies.libraryImport.run(items))).toBe('conflict:running')
    await s.runJob()

    expect(s.movies.libraryImport.status()).toMatchObject({
      state: 'done',
      total: 2,
      done: 2,
      imported: 2,
      failures: [],
    })
    expect(s.seen.some((e) => e.topic === 'import.updated')).toBe(true)
    const sintel = s.movies.get(SINTEL)
    expect(sintel).toMatchObject({ status: 'available', path: join(s.root, 'Sintel (2010)') })
    expect(s.movies.files(SINTEL)[0]).toMatchObject({
      path: join(s.root, 'Sintel (2010)', 'Sintel.2010.1080p.BluRay.x264-GRP.mkv'),
      transfer: null,
      quality: { name: 'Bluray-1080p' },
    })
    expect(s.movies.get(METROPOLIS).path).toBe(join(s.root, 'Metropolis {tmdb-19}'))
    expect(readdirSync(join(s.root, 'Metropolis {tmdb-19}'))).toEqual(['metropolis.mkv'])
    expect(s.movies.history(SINTEL).items[0]?.message).toBe(
      'Imported from the existing library, where it was.',
    )
    // the version is labelled with its profile's name, as the add dialog does
    expect(sintel.versions[0]?.label).toBe(s.media.profiles.list()[0]?.name as string)

    // a second run of the same folders changes nothing
    s.movies.libraryImport.run(items)
    await s.runJob()
    expect(s.movies.libraryImport.status()).toMatchObject({ state: 'done', imported: 2 })
    expect(s.movies.files(SINTEL)).toHaveLength(1)
    expect(s.movies.history(SINTEL).items).toHaveLength(1)

    // scanned again, they're in the library
    const again = await s.movies.libraryImport.scan(s.root)
    expect(again.every((c) => c.inLibrary && c.skip === 'Already in the library.')).toBe(true)
  })

  test('Rename to my format renames the folder and the file', async () => {
    const s = await start({
      'nosferatu.1922.1080p': { 'nosferatu.1922.1080p.bluray.x264.mkv': 'main' },
    })
    s.movies.libraryImport.run(
      [{ folder: join(s.root, 'nosferatu.1922.1080p'), tmdbId: NOSFERATU }],
      { rename: true },
    )
    await s.runJob()
    expect(s.movies.libraryImport.status()).toMatchObject({ state: 'done', imported: 1 })
    const folder = join(s.root, 'Nosferatu (1922)')
    expect(existsSync(join(s.root, 'nosferatu.1922.1080p'))).toBe(false)
    expect(readdirSync(folder)).toEqual(['Nosferatu (1922) Bluray-1080p.mkv'])
    expect(s.movies.get(NOSFERATU).path).toBe(folder)
    expect(s.movies.files(NOSFERATU)[0]?.path).toBe(
      join(folder, 'Nosferatu (1922) Bluray-1080p.mkv'),
    )
    // run again, the renamed folder is found under its new name
    s.movies.libraryImport.run(
      [{ folder: join(s.root, 'nosferatu.1922.1080p'), tmdbId: NOSFERATU }],
      { rename: true },
    )
    await s.runJob()
    expect(s.movies.libraryImport.status()).toMatchObject({ imported: 1, failures: [] })
    expect(s.movies.files(NOSFERATU)).toHaveLength(1)
  })

  test('a folder without a usable video is a failure that says why; the rest go on', async () => {
    const s = await start({
      'Sintel (2010)': { 'sintel-sample.mkv': 'sample' },
      'Metropolis {tmdb-19}': { 'metropolis.mkv': 'main' },
    })
    s.movies.libraryImport.run([
      { folder: join(s.root, 'Sintel (2010)'), tmdbId: SINTEL },
      { folder: join(s.root, 'Metropolis {tmdb-19}'), tmdbId: METROPOLIS },
    ])
    await s.runJob()
    const status = s.movies.libraryImport.status()
    expect(status).toMatchObject({ state: 'done', done: 2, imported: 1 })
    expect(status.failures.map((f) => f.folder)).toEqual([join(s.root, 'Sintel (2010)')])
  })
})

describe('the library import’s checks', () => {
  test('without a TMDB key nothing can be matched', async () => {
    const s = await setup({ key: false })
    cleanups.push(s.cleanup)
    mkdirSync(join(s.folder.path, 'Sintel (2010)'))
    expect(await reason(() => s.movies.libraryImport.scan(s.folder.path))).toBe(
      'unavailable:no-tmdb-key',
    )
  })

  test('only a root folder can be scanned, and folders come from one', async () => {
    const s = await setup()
    cleanups.push(s.cleanup)
    expect(await reason(() => s.movies.libraryImport.scan(join(s.folder.path, 'x')))).toBe(
      'invalid:unknown-root-folder',
    )
    expect(await reason(() => s.movies.libraryImport.scan('/etc'))).toBe('invalid:outside-roots')
    expect(
      await reason(() =>
        s.movies.libraryImport.run([{ folder: join(s.folder.path, 'a', 'b'), tmdbId: SINTEL }]),
      ),
    ).toBe('invalid:unknown-root-folder')
    expect(
      await reason(() =>
        s.movies.libraryImport.run([
          { folder: join(s.folder.path, 'a'), tmdbId: SINTEL },
          { folder: join(s.folder.path, 'b'), tmdbId: SINTEL },
        ]),
      ),
    ).toBe('invalid:duplicate-movie')
    expect(s.movies.libraryImport.status().state).toBe('idle')
  })
})

describe('matching a folder to TMDB’s results', () => {
  const movie = (id: number, title: string, year: number | null): DiscoverMovie => ({
    id,
    title,
    originalTitle: title,
    year,
    releaseDate: null,
    runtimeMinutes: null,
    genres: [],
    synopsis: '',
    rating: 0,
    voteCount: 0,
    art: {} as DiscoverMovie['art'],
  })
  const results = [
    movie(426063, 'Nosferatu', 2024),
    movie(653, 'Nosferatu', 1922),
    movie(6404, 'Nosferatu the Vampyre', 1979),
  ]

  test('the same title and year first, a year off by one next', () => {
    expect(bestMatch(results, 'Nosferatu', 1922)?.id).toBe(653)
    expect(bestMatch(results, 'Nosferatu', 1923)?.id).toBe(653)
    expect(bestMatch(results, 'The Nosferatu the Vampyre', 1979)?.id).toBe(6404)
  })

  test('without a year, the same title, else TMDB’s first', () => {
    expect(bestMatch(results, 'nosferatu', null)?.id).toBe(426063)
    expect(bestMatch(results, 'Something else', null)?.id).toBe(426063)
  })

  test('with a year, nothing like it is no match', () => {
    expect(bestMatch(results, 'Something else', 1950)).toBeNull()
    expect(bestMatch([], 'Nosferatu', 1922)).toBeNull()
  })
})
