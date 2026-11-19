// SPDX-License-Identifier: AGPL-3.0-only
// An episode's subtitles (Phase 5 B): the same service as a film's, asked by the show's ids with the
// season and episode, scored on Bazarr's episode weights, and only the episode's own sidecars kept.
import { afterEach, describe, expect, test } from 'bun:test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { JOBS } from '../../src/movies/index.ts'
import { searchParams } from '../../src/providers/opensubtitles.ts'
import { forEpisode } from '../../src/providers/subsource.ts'
import { EPISODE_MAX_POINTS, scoreResult } from '../../src/shared/scoring.ts'
import type { ProviderResult } from '../../src/shared/types.ts'
import { ownSidecar } from '../../src/shows/index.ts'
import { setup } from '../movies/helpers.ts'

let t: ReturnType<typeof setup>
afterEach(() => t?.cleanup())

const SRT = '1\n00:00:01,000 --> 00:00:02,000\nHi\n'

const result = (over: Partial<ProviderResult> = {}): ProviderResult => ({
  provider: 'opensubtitles',
  ref: '1',
  language: 'en',
  releaseName: '',
  releases: [],
  forced: false,
  hi: false,
  hashMatch: false,
  idMatch: false,
  format: null,
  downloads: 0,
  rating: 0,
  translated: false,
  ...over,
})

describe('scoring an episode', () => {
  const file = {
    title: 'Game of Thrones',
    year: 2011,
    releaseName: 'Game.of.Thrones.S01E02.1080p.WEB-DL.x264-GRP',
    episode: { season: 1, episodes: [2] },
  }
  const opts = { preferReleaseMatch: true }

  test('the same release of the same episode scores on the episode weights, out of 360', () => {
    const s = scoreResult(
      result({ releases: ['Game.of.Thrones.S01E02.1080p.WEB-DL.x264-GRP'] }),
      file,
      null,
      opts,
    )
    expect(EPISODE_MAX_POINTS).toBe(360)
    expect(s.matches).toEqual(
      expect.arrayContaining(['title', 'season', 'episode', 'source', 'releaseGroup']),
    )
    expect(s.matches).not.toContain('edition')
    expect(s.score).toBeGreaterThanOrEqual(90)
  })

  test('another episode, another season or a season pack does not fit at all', () => {
    for (const name of [
      'Game.of.Thrones.S01E03.1080p.WEB-DL.x264-GRP',
      'Game.of.Thrones.S02E02.1080p.WEB-DL.x264-GRP',
      'Game.of.Thrones.S01.1080p.WEB-DL.x264-GRP',
    ])
      expect(scoreResult(result({ releases: [name] }), file, null, opts).points).toBe(0)
  })

  test('a name without numbers counts the season and episode only when matched by id', () => {
    const plain = result({ releases: ['Game of Thrones 1080p WEB-DL'] })
    expect(scoreResult(plain, file, null, opts).matches).not.toContain('season')
    expect(scoreResult({ ...plain, idMatch: true }, file, null, opts).matches).toEqual(
      expect.arrayContaining(['season', 'episode', 'title', 'year']),
    )
  })

  test('a multi-episode file takes a subtitle for any of its episodes', () => {
    const both = {
      ...file,
      releaseName: 'Show.S01E01E02.720p.HDTV',
      episode: { season: 1, episodes: [1, 2] },
    }
    expect(
      scoreResult(result({ releases: ['Game.of.Thrones.S01E01.720p.HDTV'] }), both, null, opts)
        .matches,
    ).toContain('episode')
  })
})

describe('the providers asked for an episode', () => {
  test('OpenSubtitles.com: the show’s id as parent_tmdb_id, the numbers, type=episode, no year', () => {
    const q = searchParams({
      tmdbId: 1399,
      imdbId: 'tt0944947',
      title: 'Game of Thrones',
      year: 2011,
      moviehash: null,
      languages: ['en'],
      episode: { season: 1, episode: 2 },
    })
    const p = new URLSearchParams(q)
    expect(p.get('parent_tmdb_id')).toBe('1399')
    expect(p.get('season_number')).toBe('1')
    expect(p.get('episode_number')).toBe('2')
    expect(p.get('type')).toBe('episode')
    expect(p.has('tmdb_id')).toBe(false)
    expect(p.has('year')).toBe(false)
    // sorted, as the API asks
    const keys = [...p.keys()]
    expect(keys).toEqual([...keys].sort())
  })

  test('SubSource keeps a result only when its release names give this season and episode', () => {
    const ep = { season: 1, episode: 2 }
    expect(forEpisode(['Show.S01E02.1080p.WEB'], ep)).toBe(true)
    expect(forEpisode(['Show.S01E03.1080p.WEB'], ep)).toBe(false)
    expect(forEpisode(['Show.S01.1080p.WEB'], ep)).toBe(false)
    expect(forEpisode(['Show.S01E01E02.720p'], ep)).toBe(true)
  })
})

describe('an episode’s own sidecars', () => {
  const video = { folder: '/s/Season 01', base: 'Show - S01E02' }
  test.each([
    ['/s/Season 01/Show - S01E02.en.srt', true],
    ['/s/Season 01/Show - S01E03.en.srt', false],
    ['/s/Season 01/Subs/Show - S01E02.en.srt', true],
    ['/s/Season 01/Subs/Show - S01E02/2_English.srt', true],
    ['/s/Season 01/Subs/Show - S01E03/2_English.srt', false],
    ['/s/Season 01/Subs/2_English.srt', false],
  ])('%s → %p', (path, own) => {
    expect(ownSidecar({ path, name: path.slice(path.lastIndexOf('/') + 1) }, video)).toBe(own)
  })
})

describe('an episode in the service', () => {
  test('the import’s hook keeps only the episode’s sidecars, beside it and in Subs', async () => {
    t = setup({ generate: false })
    const s = t.show()
    const [one, two] = s.files
    if (!one || !two) throw new Error('two files')
    writeFileSync(join(s.folder, `${one.base}.en.srt`), SRT)
    writeFileSync(join(s.folder, `${two.base}.en.srt`), SRT)
    mkdirSync(join(s.folder, 'Subs', one.base), { recursive: true })
    writeFileSync(join(s.folder, 'Subs', one.base, '3_French.srt'), SRT)
    await t.subtitles.hooks.afterImport?.({
      fileId: one.fileId,
      itemId: one.itemIds[0] as string,
      path: one.path,
      sourceFolder: s.folder,
      inPlace: true,
    })
    expect(
      t
        .rows()
        .map((r) => `${r.mediaFileId} ${r.path.slice(s.folder.length + 1)}`)
        .sort(),
    ).toEqual([`${one.fileId} ${one.base}.en.srt`, `${one.fileId} Subs/${one.base}/3_French.srt`])
    // the change is the show's, not a film's
    expect(
      t.seen.some((e) => e.topic === 'shows.updated' && e.ids?.includes(String(s.tmdbId))),
    ).toBe(true)
    expect(t.seen.some((e) => e.ids?.includes(`movie:${s.tmdbId}`))).toBe(false)
  })

  test('the episode wants its show’s profile; the search finds that episode’s subtitle', async () => {
    t = setup({ generate: false })
    const s = t.show({ files: [[2]] })
    const file = s.files[0]
    if (!file) throw new Error('a file')
    const episodeId = file.itemIds[0] as string
    for (const [episode, forced] of [
      [2, false],
      [2, true],
      [3, false],
    ] as const)
      t.fake.add({
        provider: 'opensubtitles',
        tmdbId: s.tmdbId,
        language: 'en',
        releaseName: `Game.of.Thrones.S01E0${episode}.1080p.WEB-DL.x264-GRP`,
        season: 1,
        episode,
        forced,
      })
    t.subtitles.refreshWanted(episodeId)
    expect(
      t
        .wantedRows()
        .map((r) => `${r.itemId} ${r.language}${r.forced ? '.forced' : ''}`)
        .sort(),
    ).toEqual([`${episodeId} en`, `${episodeId} en.forced`])
    t.jobs.enqueue(JOBS.search, { fileId: file.fileId })
    await t.drain()
    const rows = t.rows()
    // E03's is never taken
    expect(rows.map((r) => r.path).sort()).toEqual([
      join(s.folder, `${file.base}.en.forced.srt`),
      join(s.folder, `${file.base}.en.srt`),
    ])
    for (const r of rows) expect(r.score).toBeGreaterThanOrEqual(80)
    expect(t.wantedRows()).toEqual([])
    // the A10 count is films'
    expect(t.subtitles.wanted().total).toBe(0)
  })

  test('an episode of a show without a profile wants nothing', () => {
    t = setup({ generate: false })
    const s = t.show({ profile: null })
    t.subtitles.refreshWanted(s.files[0]?.itemIds[0] as string)
    expect(t.wantedRows()).toEqual([])
  })
})
