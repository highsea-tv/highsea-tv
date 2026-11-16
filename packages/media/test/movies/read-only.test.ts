// SPDX-License-Identifier: AGPL-3.0-only
// A library highsea only reads (Phase 5 A1, ADR 0063): added read-only, or refused when it can't be
// written to and the owner didn't ask; scanned and imported in place with nothing on disk changed;
// every write path refused. And Library import's reading of a real library: NFOs, a film in parts,
// several films in a folder, and none.
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test'
import {
  chmodSync,
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { schema } from '@highsea-tv/db'
import { eq } from 'drizzle-orm'
import { nfoDisagrees } from '../../src/movies/library-import.ts'
import { type Clips, hasFfmpeg, makeClips } from '../clips.ts'
import { METROPOLIS, NOSFERATU, reason, SINTEL, setup } from './helpers.ts'

let clipsDir: string
let clips: Clips
beforeAll(() => {
  clipsDir = mkdtempSync(join(tmpdir(), 'highsea-read-only-clips-'))
  if (hasFfmpeg) clips = makeClips(clipsDir)
})
afterAll(() => rmSync(clipsDir, { recursive: true, force: true }))

let cleanups: (() => void)[] = []
afterEach(() => {
  for (const c of cleanups) c()
  cleanups = []
})

/** Root can write anywhere, so a folder without the write bit is only read-only for others. */
const asRoot = process.getuid?.() === 0

/** Every file and folder under `dir`, with its size and modification time. */
function listing(dir: string): string[] {
  const out: string[] = []
  const walk = (d: string) => {
    for (const e of readdirSync(d, { withFileTypes: true }).sort((a, b) =>
      a.name.localeCompare(b.name),
    )) {
      const p = join(d, e.name)
      const st = statSync(p)
      out.push(`${p} ${e.isDirectory() ? 'dir' : st.size} ${st.mtimeMs}`)
      if (e.isDirectory()) walk(p)
    }
  }
  walk(dir)
  return out
}

/** A movie's row in the library, by TMDB id. */
const itemOf = (s: { db: Awaited<ReturnType<typeof setup>>['db'] }, tmdbId: number) =>
  s.db.select().from(schema.mediaItems).where(eq(schema.mediaItems.tmdbId, tmdbId)).get()

/** A second root folder, `library`, with the owner's films in it, and a downloads folder. */
async function start(films: Record<string, Record<string, string>>) {
  let downloads = ''
  const s = await setup({ importing: { downloadDirs: () => [downloads], sampleSeconds: 2 } })
  cleanups.push(s.cleanup)
  const library = join(s.dir, 'library')
  downloads = join(s.dir, 'downloads')
  mkdirSync(downloads)
  for (const [folder, files] of Object.entries(films)) {
    mkdirSync(join(library, folder), { recursive: true })
    for (const [file, from] of Object.entries(files)) {
      mkdirSync(join(library, folder, file, '..'), { recursive: true })
      if (from in (clips ?? {}))
        copyFileSync(clips[from as keyof Clips], join(library, folder, file))
      else writeFileSync(join(library, folder, file), from)
    }
  }
  if (!Object.keys(films).length) mkdirSync(library, { recursive: true })
  return { ...s, library, downloads }
}

describe('adding a folder highsea only reads', () => {
  test('the owner’s choice: read-only, and stays that way until switched', async () => {
    const s = await start({})
    const folder = s.media.rootFolders.add({ path: s.library, readOnly: true })
    expect(folder).toMatchObject({
      kind: 'movies',
      readOnly: true,
      mountedReadOnly: false,
      accessible: true,
    })
    expect(s.media.rootFolders.readOnlyAt(join(s.library, 'Sintel (2010)', 'x.mkv'))).toBe(
      s.library,
    )
    expect(s.media.rootFolders.readOnlyAt(join(s.folder.path, 'x.mkv'))).toBeNull()
    // a writable folder can be switched to managed, and back
    expect(s.media.rootFolders.setReadOnly(folder.id, false).readOnly).toBe(false)
    expect(s.media.rootFolders.setReadOnly(folder.id, true).readOnly).toBe(true)
  })

  test.skipIf(asRoot)('one highsea can’t write to: refused unless read-only', async () => {
    const s = await start({})
    chmodSync(s.library, 0o555)
    cleanups.unshift(() => chmodSync(s.library, 0o755))
    expect(await reason(() => s.media.rootFolders.add(s.library))).toBe('invalid:not-writable')
    const folder = s.media.rootFolders.add({ path: s.library, readOnly: true })
    expect(folder).toMatchObject({ readOnly: true, accessible: true })
    // and it can't be managed while highsea can't write to it
    expect(await reason(() => s.media.rootFolders.setReadOnly(folder.id, false))).toBe(
      'invalid:not-writable',
    )
  })

  test('shows’ and music’s folders are kept, and the movies’ list leaves them out', async () => {
    const s = await start({})
    const shows = join(s.dir, 'tv')
    mkdirSync(shows)
    s.media.rootFolders.add({ path: shows, kind: 'shows', readOnly: true })
    expect(s.media.rootFolders.list('movies').map((f) => f.path)).toEqual([s.folder.path])
    expect(s.media.rootFolders.list().map((f) => f.kind)).toEqual(['movies', 'shows'])
    expect(await reason(() => s.add(SINTEL, { rootFolder: shows }))).toBe(
      'invalid:unknown-root-folder',
    )
  })
})

describe('every write path refuses a folder highsea only reads', () => {
  test('the one check: assertWritable', async () => {
    const s = await start({ 'Sintel (2010)': { 'Sintel.2010.mkv': 'not a film' } })
    s.media.rootFolders.add({ path: s.library, readOnly: true })
    const file = join(s.library, 'Sintel (2010)', 'Sintel.2010.mkv')
    expect(await reason(() => s.media.rootFolders.assertWritable(file, 'rename files'))).toBe(
      'conflict:read-only',
    )
    expect(() =>
      s.media.rootFolders.assertWritable(join(s.folder.path, 'x.mkv'), 'x'),
    ).not.toThrow()
  })

  test('Library import’s Rename to my format is refused', async () => {
    const s = await start({ 'Sintel (2010)': { 'Sintel.2010.mkv': 'not a film' } })
    s.media.rootFolders.add({ path: s.library, readOnly: true })
    expect(
      await reason(() =>
        s.movies.libraryImport.run([{ folder: join(s.library, 'Sintel (2010)'), tmdbId: SINTEL }], {
          rename: true,
        }),
      ),
    ).toBe('conflict:read-only')
  })
})

describe('Library import reads a real library', () => {
  test('NFOs match for sure with no search; parts, several films and none', async () => {
    const s = await start({
      // Radarr's movie.nfo, in a folder named without a year
      Metropolis: {
        'film.mkv': 'not a film',
        'movie.nfo': '<movie><tmdbid>19</tmdbid><imdbid>tt0017136</imdbid></movie>',
      },
      // Kodi's form, named after the video
      'Nosferatu (1922)': {
        'Nosferatu.1922.mkv': 'not a film',
        'Nosferatu.1922.nfo': '<movie><uniqueid type="tmdb" default="true">653</uniqueid></movie>',
      },
      // an NFO an app wrote for another film: the name's id is offered, and it waits for a check
      'Nosferatu Again (1922) [tmdb-653]': {
        'Nosferatu.mkv': 'not a film',
        'movie.nfo': '<movie><tmdbid>19</tmdbid></movie>',
      },
      'Movie Name (1999)': { 'Movie Name-cd1.avi': 'part one', 'Movie Name-cd2.avi': 'part two' },
      'Two Films': { 'First.Film.2010.mkv': 'a film', 'Second.Film.2011.mkv': 'a film' },
      'Only An Archive': { 'x.rar': 'archive', 'x.nfo': 'notes' },
      'Sintel (2010)': {
        'Sintel.2010.mkv': 'not a film',
        'Subs/English.srt': '1\n00:00:01,000 --> 00:00:02,000\nHi\n',
        'Screenshots/shot.mkv': 'not the film',
      },
    })
    s.media.rootFolders.add({ path: s.library, readOnly: true })
    s.fetch.requests.length = 0
    const found = await s.movies.libraryImport.scan(s.library)
    const by = Object.fromEntries(found.map((c) => [c.name, c]))
    expect(by.Metropolis).toMatchObject({
      match: { tmdbId: METROPOLIS },
      matchedBy: 'nfo',
      check: null,
    })
    expect(by['Nosferatu (1922)']).toMatchObject({
      match: { tmdbId: NOSFERATU },
      matchedBy: 'nfo',
      check: null,
    })
    expect(by['Nosferatu Again (1922) [tmdb-653]']).toMatchObject({
      match: { tmdbId: NOSFERATU },
      matchedBy: 'name',
      skip: null,
    })
    expect(by['Nosferatu Again (1922) [tmdb-653]']?.check).toMatch(
      /^Its NFO names Metropolis \(1927\), which isn’t the film the folder’s name says\./,
    )
    // the NFOs' films were fetched by id, never searched for
    expect(s.fetch.requests.filter((r) => r.includes('/search/')).length).toBeLessThanOrEqual(2)
    expect(by['Movie Name (1999)']).toMatchObject({
      file: join(s.library, 'Movie Name (1999)', 'Movie Name-cd1.avi'),
      parts: [
        join(s.library, 'Movie Name (1999)', 'Movie Name-cd1.avi'),
        join(s.library, 'Movie Name (1999)', 'Movie Name-cd2.avi'),
      ],
    })
    expect(by['Two Films']).toMatchObject({
      match: null,
      skip: 'This folder holds 2 films. Library import takes one film per folder.',
    })
    expect(by['Only An Archive']).toMatchObject({
      file: null,
      skip: 'No film in this folder, only x.rar, which highsea leaves as it is.',
    })
    expect(by['Sintel (2010)']).toMatchObject({
      file: join(s.library, 'Sintel (2010)', 'Sintel.2010.mkv'),
      match: { tmdbId: SINTEL },
      matchedBy: 'search',
    })
  })
})

describe('an NFO that names another film than its folder', () => {
  const film = (tmdbId: number, title: string, year: number | null, originalTitle = title) => ({
    tmdbId,
    title,
    originalTitle,
    year,
  })

  // the names and NFOs an owner's library really held (HT-22's read-only run, 2026-11-16)
  test('wrong NFOs are caught: another year, another title, another id', () => {
    expect(nfoDisagrees('Blair Witch (2016)', film(2667, 'The Blair Witch Project', 1999))).toMatch(
      /^Its NFO names The Blair Witch Project \(1999\)/,
    )
    expect(nfoDisagrees('The King (2019)', film(420818, 'The Lion King', 2019))).not.toBeNull()
    expect(
      nfoDisagrees('The Circle (2017)', film(343668, 'Kingsman: The Golden Circle', 2017)),
    ).not.toBeNull()
    expect(nfoDisagrees('The Way (2010)', film(46528, 'The Warrior’s Way', 2010))).not.toBeNull()
    expect(
      nfoDisagrees('Colony (2026) [tmdb-1375646]', film(1316092, '“Wuthering Heights”', 2026)),
    ).not.toBeNull()
  })

  test('the spellings folder names use agree: apostrophes, &, numerals, Vol., a longer title', () => {
    for (const [name, title, year] of [
      ['Oceans Eleven (2001)', 'Ocean’s Eleven', 2001],
      ['Starsky and Hutch (2004)', 'Starsky & Hutch', 2004],
      ['Frozen 2 (2019)', 'Frozen II', 2019],
      ['Alien³ (1992)', 'Alien³', 1992],
      ['Guardians of the Galaxy Volume 3 (2023)', 'Guardians of the Galaxy Vol. 3', 2023],
      ['The Lion King 2 (1998)', 'The Lion King II: Simba’s Pride', 1998],
      [
        'Pirates of the Caribbean - At Worlds End (2007)',
        'Pirates of the Caribbean: At World’s End',
        2007,
      ],
      ['Sintel (2011)', 'Sintel', 2010],
    ] as const)
      expect(nfoDisagrees(name, film(1, title, year))).toBeNull()
    // the original title counts, and an id in the name that's the NFO's own
    expect(
      nfoDisagrees(
        'Sen to Chihiro (2001)',
        film(129, 'Spirited Away', 2001, 'Sen to Chihiro no Kamikakushi'),
      ),
    ).toBeNull()
    expect(nfoDisagrees('Colony (2026) [tmdb-1375646]', film(1375646, 'Colony', 2026))).toBeNull()
  })
})

describe.skipIf(!hasFfmpeg)('a library highsea only reads, end to end', () => {
  test('scanned and imported in place, with nothing on disk changed', async () => {
    const s = await start({
      'Sintel (2010)': {
        'Sintel.2010.1080p.BluRay.x264-GRP.mkv': 'main',
        'movie.nfo': '<movie><tmdbid>45745</tmdbid></movie>',
        'Subs/English.srt': '1\n00:00:01,000 --> 00:00:02,000\nHi\n',
      },
    })
    s.media.rootFolders.add({ path: s.library, readOnly: true })
    const before = listing(s.library)
    await s.movies.libraryScan.scan({})
    expect(itemOf(s, SINTEL)).toBeDefined()
    const [file] = s.movies.files(SINTEL)
    expect(file?.path).toBe(
      join(s.library, 'Sintel (2010)', 'Sintel.2010.1080p.BluRay.x264-GRP.mkv'),
    )
    // a second scan, and a library import of the same folder, change nothing either
    await s.movies.libraryScan.scan({})
    expect(listing(s.library)).toEqual(before)
  })

  test('an import from downloads into it is refused, with the reason', async () => {
    const s = await start({})
    s.media.rootFolders.add({ path: s.library, readOnly: true })
    await s.add(SINTEL, { rootFolder: s.library })
    const row = itemOf(s, SINTEL)
    const name = 'Sintel.2010.1080p.BluRay.x264-GRP'
    const folder = join(s.downloads, name)
    mkdirSync(folder)
    copyFileSync(clips.main, join(folder, `${name}.mkv`))
    const before = listing(s.library)
    const result = await s.movies.importDownload({
      itemId: row?.id as string,
      folder,
      releaseTitle: name,
      quality: 'Bluray-1080p',
      indexer: 'Fake',
      downloadId: 'dl-1',
    })
    expect(result).toMatchObject({ status: 'blocked' })
    expect(JSON.stringify(result)).toContain('only reads')
    expect(listing(s.library)).toEqual(before)
  })
})
