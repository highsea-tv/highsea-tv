// SPDX-License-Identifier: AGPL-3.0-only
// What a film's folder holds (Phase 5 A1): its NFO's ids in Radarr's and Kodi's forms, the extras
// folders a real library has, a film in parts, several films in one folder, and none.
import { afterEach, describe, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  type FoundFile,
  filmIn,
  idsFromNfo,
  readFolderNfo,
  skipBeforeProbe,
  stackPart,
} from '../../src/shared/index.ts'

let dirs: string[] = []
afterEach(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true })
  dirs = []
})
const tempDir = () => {
  const d = mkdtempSync(join(tmpdir(), 'highsea-folders-'))
  dirs.push(d)
  return d
}

/** What Radarr's Kodi (XBMC) metadata writes as movie.nfo. */
const RADARR_NFO = `<?xml version="1.0" encoding="utf-8" standalone="yes"?>
<movie>
  <title>Sintel</title>
  <year>2010</year>
  <uniqueid type="imdb">tt1727587</uniqueid>
  <uniqueid type="tmdb" default="true">45745</uniqueid>
  <tmdbid>45745</tmdbid>
  <imdbid>tt1727587</imdbid>
</movie>`

/** Kodi's own, from its library export: an IMDb id as the default, and the older `<id>`. */
const KODI_NFO = `<?xml version="1.0" encoding="UTF-8" standalone="yes" ?>
<movie>
    <title>Metropolis</title>
    <uniqueid type="imdb" default="true">tt0017136</uniqueid>
    <id>tt0017136</id>
</movie>`

describe('a film’s NFO', () => {
  test('Radarr’s form: uniqueid and the provider tags', () => {
    expect(idsFromNfo(RADARR_NFO)).toEqual({ tmdb: 45745, imdb: 'tt1727587' })
  })

  test('Kodi’s form: an IMDb uniqueid, or the older id', () => {
    expect(idsFromNfo(KODI_NFO)).toEqual({ tmdb: null, imdb: 'tt0017136' })
    expect(idsFromNfo('<movie><id>tt0017136</id></movie>')).toEqual({
      tmdb: null,
      imdb: 'tt0017136',
    })
  })

  test('a link to the film’s page, and ids that aren’t ids', () => {
    expect(idsFromNfo('https://www.themoviedb.org/movie/19-metropolis')).toEqual({
      tmdb: 19,
      imdb: null,
    })
    expect(idsFromNfo('https://www.imdb.com/title/tt0017136/')).toEqual({
      tmdb: null,
      imdb: 'tt0017136',
    })
    expect(idsFromNfo('<movie><tmdbid>abc</tmdbid><imdbid>12345</imdbid></movie>')).toEqual({
      tmdb: null,
      imdb: null,
    })
    expect(idsFromNfo('release notes, no ids')).toEqual({ tmdb: null, imdb: null })
  })

  test('movie.nfo first, then one named after the video, whatever its case', async () => {
    const d = tempDir()
    expect(await readFolderNfo(d)).toBeNull()
    writeFileSync(join(d, 'Metropolis.1927.mkv.nfo'), 'not this')
    writeFileSync(join(d, 'Metropolis.1927.nfo'), KODI_NFO)
    expect(await readFolderNfo(d, [join(d, 'Metropolis.1927.mkv')])).toEqual({
      tmdb: null,
      imdb: 'tt0017136',
    })
    writeFileSync(join(d, 'MOVIE.NFO'), RADARR_NFO)
    expect(await readFolderNfo(d, [join(d, 'Metropolis.1927.mkv')])).toEqual({
      tmdb: 45745,
      imdb: 'tt1727587',
    })
  })

  test('a release’s own .nfo, with no ids, isn’t a match', async () => {
    const d = tempDir()
    writeFileSync(join(d, 'Sintel.2010.1080p.BluRay.x264-GRP.nfo'), 'release notes')
    expect(await readFolderNfo(d, [join(d, 'Sintel.2010.1080p.BluRay.x264-GRP.mkv')])).toBeNull()
  })
})

describe('extras a library has', () => {
  test('Screenshots, Proof, Plex Versions and Extra are never the film', () => {
    const root = '/data/media/movies/The Lord of the Rings (2001)'
    for (const folder of ['Screenshots', 'Proof', 'Plex Versions', 'Extra', 'Featurettes'])
      expect(skipBeforeProbe(join(root, folder, 'lotr.mkv'), root)).toBe(
        `An extra, in ${folder}. Skipped.`,
      )
    expect(skipBeforeProbe(join(root, 'lotr.mkv'), root)).toBeNull()
  })

  test('a file named only sample or trailer is one, as Jellyfin names them', () => {
    const root = '/data/media/movies/Sintel (2010)'
    expect(skipBeforeProbe(join(root, 'sample.mkv'), root)).toBe('An extra, by its name. Skipped.')
    expect(skipBeforeProbe(join(root, 'Trailer.mp4'), root)).toBe('An extra, by its name. Skipped.')
    expect(skipBeforeProbe(join(root, 'Sintel-sample.mkv'), root)).toBe(
      'An extra, by its name. Skipped.',
    )
    expect(skipBeforeProbe(join(root, 'The Sample Room (2020).mkv'), root)).toBeNull()
  })
})

describe('what a folder holds', () => {
  const GB = 1024 ** 3
  const video = (path: string, size = 8 * GB): FoundFile => ({ path, size, mtimeMs: 0 })
  const title = (path: string) =>
    (path.split('/').pop() ?? '')
      .replace(/\.[^.]+$/, '')
      .replace(/[ ._-]?(cd|part|pt|disc|disk|dvd)[ ._-]?\d+$/i, '')
      .split(/[ .(]\d{4}/)[0]
      ?.toLowerCase() ?? ''

  test('parts, as Jellyfin stacks them', () => {
    expect(stackPart('/m/Movie Name-cd1.mkv')).toEqual({ name: 'movie name', part: 1 })
    expect(stackPart('/m/Movie Name - Part 2.mkv')).toEqual({ name: 'movie name', part: 2 })
    expect(stackPart('/m/Movie.Name.disc.b.mkv')).toEqual({ name: 'movie.name', part: 2 })
    expect(stackPart('/m/Movie Name_pt3.avi')).toEqual({ name: 'movie name', part: 3 })
    expect(stackPart('/m/Movie Name (1999).mkv')).toBeNull()
    // a part in the middle of a release name isn't a stack
    expect(stackPart('/m/Harry.Potter.Deathly.Hallows.Part.1.2010.1080p.mkv')).toBeNull()
  })

  test('a film in parts is one film, its first part first', () => {
    const parts = [
      video('/m/Movie Name (1999)/Movie Name-cd2.avi', 0.7 * GB),
      video('/m/Movie Name (1999)/Movie Name-cd1.avi', 0.7 * GB),
    ]
    const film = filmIn(parts, [], title)
    expect(film).toMatchObject({
      kind: 'film',
      main: { path: '/m/Movie Name (1999)/Movie Name-cd1.avi' },
    })
    expect(film.kind === 'film' && film.parts.map((p) => p.path)).toEqual([
      '/m/Movie Name (1999)/Movie Name-cd1.avi',
      '/m/Movie Name (1999)/Movie Name-cd2.avi',
    ])
  })

  test('two copies of one film are one, the largest; a sample by its size isn’t another', () => {
    const film = filmIn(
      [
        video('/m/Sintel (2010)/Sintel.2010.720p.mkv', 4 * GB),
        video('/m/Sintel (2010)/Sintel.2010.1080p.mkv', 9 * GB),
        video('/m/Sintel (2010)/Other.Thing.2010.mkv', 0.1 * GB),
      ],
      [],
      title,
    )
    expect(film).toMatchObject({
      kind: 'film',
      main: { path: '/m/Sintel (2010)/Sintel.2010.1080p.mkv' },
      parts: [],
    })
  })

  test('two films in one folder wait, with that reason', () => {
    expect(
      filmIn(
        [
          video('/m/HP/Harry.Potter.and.the.Deathly.Hallows.Part.1.2010.mkv'),
          video('/m/HP/Harry.Potter.and.the.Deathly.Hallows.Part.2.2011.mkv'),
        ],
        [],
        (p) => (p.includes('Part.1') ? 'part 1' : 'part 2'),
      ),
    ).toEqual({ kind: 'several', count: 2 })
  })

  test('no film, and an archive left as it is', () => {
    expect(filmIn([], ['/m/X/movie.nfo'], title)).toEqual({ kind: 'none', archive: null })
    expect(filmIn([], ['/m/X/x.part01.rar', '/m/X/x.nfo'], title)).toEqual({
      kind: 'none',
      archive: 'x.part01.rar',
    })
  })

  test('a folder’s NFO beside parts and Subs reads as before', async () => {
    const d = tempDir()
    mkdirSync(join(d, 'Subs'))
    writeFileSync(join(d, 'Subs', 'English.srt'), '1\n00:00:01,000 --> 00:00:02,000\nHi\n')
    writeFileSync(join(d, 'movie.nfo'), RADARR_NFO)
    expect(await readFolderNfo(d)).toEqual({ tmdb: 45745, imdb: 'tt1727587' })
  })
})
