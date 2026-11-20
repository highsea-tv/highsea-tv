// SPDX-License-Identifier: AGPL-3.0-only
// A show's search (Phase 5 C1): releases matched to the show and its episodes, the season-pack rule,
// what an automatic search takes, and the cache a grab reads. Upgrades (HT-109): a pack against
// single episodes when files are in, approved only when it upgrades every file it would replace.
import { describe, expect, test } from 'bun:test'
import { parseEpisode } from '@highsea-tv/parser'
import { defaultEpisodeSizes, type ExistingFile, seedFormats } from '@highsea-tv/quality'
import {
  chooseReleases,
  type EpisodeFacts,
  type EpisodeReleaseView,
  episodeReasons,
  episodesOf,
  matchesShow,
  runtimeOf,
  type ShowSearchInput,
} from '../src/episode-search.ts'
import { FAKE_CREDENTIALS, FAKE_ORIGIN, madeUpTorrent, SHOWS } from './fake/index.ts'
import { catalogDefinition, hd, setup } from './helpers.ts'

const torznabSettings = { baseUrl: `${FAKE_ORIGIN}/torznab`, apiKey: FAKE_CREDENTIALS.torznabKey }

/** Chernobyl's five episodes as TMDB lists them, all aired, monitored and missing unless said. */
function chernobyl(change: (e: EpisodeFacts) => Partial<EpisodeFacts> = () => ({})) {
  return [61, 66, 64, 67, 73].map((runtimeMinutes, i) => {
    const e: EpisodeFacts = {
      id: `ep${i + 1}`,
      season: 1,
      episode: i + 1,
      runtimeMinutes,
      monitored: true,
      hasFile: false,
      aired: true,
    }
    return { ...e, ...change(e) }
  })
}

function input(
  scope: ShowSearchInput['scope'],
  episodes: EpisodeFacts[] = chernobyl(),
): ShowSearchInput {
  return {
    tmdbId: SHOWS.chernobyl.tmdbId,
    tvdbId: SHOWS.chernobyl.tvdbId,
    imdbId: SHOWS.chernobyl.imdbId,
    title: SHOWS.chernobyl.title,
    year: SHOWS.chernobyl.year,
    originalLanguage: 'en',
    scope,
    episodes,
    profile: hd,
    formats: seedFormats(),
    sizes: defaultEpisodeSizes(),
  }
}

const parsed = (name: string) => {
  const p = parseEpisode(name)
  if (!p) throw new Error(name)
  return p
}

describe('matching a release to the show and its episodes', () => {
  test('by TVDB id when the feed has one, else by title and year', () => {
    const show = { tvdbId: 360893, imdbId: null, title: 'Chernobyl', year: 2019 }
    const p = parsed('Chernobyl.S01E01.1080p.WEB-DL-GRP')
    expect(matchesShow({ tvdbId: 360893, imdbId: null }, p, show)).toBe(true)
    expect(matchesShow({ tvdbId: 1, imdbId: null }, p, show)).toBe(false)
    expect(matchesShow({ tvdbId: null, imdbId: null }, p, show)).toBe(true)
    expect(matchesShow({ tvdbId: null, imdbId: null }, parsed('Chernobyl.2019.S01E01'), show)).toBe(
      true,
    )
    expect(matchesShow({ tvdbId: null, imdbId: null }, parsed('Chernobyl.1986.S01E01'), show)).toBe(
      false,
    )
    expect(
      matchesShow({ tvdbId: null, imdbId: null }, parsed('Chernobyl.Diaries.S01E01'), show),
    ).toBe(false)
  })

  test('an episode, several, and a pack bring the episodes they number', () => {
    const eps = chernobyl()
    expect(episodesOf(parsed('Chernobyl.S01E02'), eps).covered.map((e) => e.id)).toEqual(['ep2'])
    expect(episodesOf(parsed('Chernobyl.S01E02E03'), eps).covered.map((e) => e.id)).toEqual([
      'ep2',
      'ep3',
    ])
    expect(episodesOf(parsed('Chernobyl.S01.1080p'), eps).covered).toHaveLength(5)
    expect(episodesOf(parsed('Chernobyl.S01E05-07'), eps)).toMatchObject({
      unknown: ['S01E06', 'S01E07'],
    })
  })

  test('sizes are for every episode a release brings', () => {
    expect(runtimeOf(chernobyl())).toBe(331)
    expect(runtimeOf(chernobyl((e) => (e.episode === 1 ? { runtimeMinutes: null } : {})))).toBe(
      331 - 61 + 45,
    )
  })
})

describe('the season-pack rule', () => {
  const rejected = (r: { kind: string; message: string }[]) =>
    r.filter((x) => x.kind === 'rejected').map((x) => x.message)

  test('a pack whose every episode is monitored, aired and missing is accepted', () => {
    const reasons = episodeReasons(parsed('Chernobyl.S01'), chernobyl(), [])
    expect(reasons).toEqual([
      { kind: 'accepted', message: 'Season pack: all 5 episodes of season 1' },
    ])
  })

  test('one episode with a file, unmonitored or not aired turns the pack down, saying which', () => {
    const p = parsed('Chernobyl.S01')
    expect(
      rejected(
        episodeReasons(
          p,
          chernobyl((e) => ({ hasFile: e.episode === 2 })),
          [],
        ),
      ),
    ).toEqual(['Already has a file: S01E02'])
    expect(
      rejected(
        episodeReasons(
          p,
          chernobyl((e) => ({ monitored: e.episode !== 5 })),
          [],
        ),
      ),
    ).toEqual(['Not monitored: S01E05'])
    expect(
      rejected(
        episodeReasons(
          p,
          chernobyl((e) => ({ aired: e.episode < 4 })),
          [],
        ),
      ),
    ).toEqual(['Not aired yet: S01E04, S01E05'])
  })

  test('a multi-episode release follows the same rule; airing is only a pack’s', () => {
    const p = parsed('Chernobyl.S01E02E03')
    const two = chernobyl().slice(1, 3)
    expect(episodeReasons(p, two, [])).toEqual([
      { kind: 'accepted', message: 'Brings S01E02, S01E03' },
    ])
    expect(
      rejected(
        episodeReasons(
          p,
          [two[0] as EpisodeFacts, { ...two[1], hasFile: true } as EpisodeFacts],
          [],
        ),
      ),
    ).toEqual(['Already has a file: S01E03'])
    expect(
      episodeReasons(
        parsed('Chernobyl.S01E04'),
        [{ ...chernobyl()[3], aired: false } as EpisodeFacts],
        [],
      ),
    ).toEqual([])
  })

  test('an automatic search takes an approved pack over single episodes', () => {
    const view = (title: string, ids: string[], pack: boolean, approved = true) =>
      ({ title, episodeIds: ids, pack, approved }) as EpisodeReleaseView
    const releases = [
      view('S01E01', ['ep1'], false),
      view('S01', ['ep1', 'ep2', 'ep3'], true),
      view('S01E02E03', ['ep2', 'ep3'], false),
    ]
    const wanted = ['ep1', 'ep2', 'ep3']
    expect(chooseReleases(releases, wanted).map((r) => r.title)).toEqual(['S01'])
    // without one, each wanted episode once, a multi-episode file for the two it brings
    const singles = [
      view('S01', ['ep1', 'ep2', 'ep3'], true, false),
      ...releases.filter((r) => !r.pack),
    ]
    expect(chooseReleases(singles, wanted).map((r) => r.title)).toEqual(['S01E01', 'S01E02E03'])
    // nothing approved for an episode leaves it
    expect(chooseReleases([view('S01E01', ['ep1'], false, false)], ['ep1'])).toEqual([])
  })
})

describe('searching the indexers for a show', () => {
  async function withTorznab() {
    const t = setup({ definitions: [catalogDefinition('generic-torznab')] })
    const { indexer } = await t.indexers.add('generic-torznab', { settings: torznabSettings })
    return { ...t, indexer }
  }

  test('a season: its pack approved first, then the episodes, judged by the episode sizes', async () => {
    const t = await withTorznab()
    const result = await t.indexers.searchEpisodes(input({ season: 1 }))
    expect(result.searched).toBe(1)
    expect(result.releases.map((r) => [r.title, r.approved])).toEqual([
      ['Chernobyl.S01.1080p.BluRay.x264-GRP', true],
      ['Chernobyl.S01E01.1080p.WEB-DL.DDP5.1.H.264-GRP', true],
      ['Chernobyl.S01E02E03.1080p.WEB-DL.DDP5.1.H.264-GRP', true],
      // HD 1080p doesn't allow 720p
      ['Chernobyl.S01E04.720p.HDTV.x264-OLD', false],
    ])
    const pack = result.releases[0]
    expect(pack).toMatchObject({ pack: true, season: 1, episodes: [1, 2, 3, 4, 5] })
    expect(pack?.episodeIds).toEqual(['ep1', 'ep2', 'ep3', 'ep4', 'ep5'])
    expect(result.releases[2]).toMatchObject({ pack: false, episodes: [2, 3] })
    // kept for a grab, in the same order, for this scope only
    expect(t.indexers.episodeReleases(SHOWS.chernobyl.tmdbId, { season: 1 })).toEqual(
      result.releases,
    )
    expect(t.indexers.episodeReleases(SHOWS.chernobyl.tmdbId, { season: 1, episode: 2 })).toEqual(
      [],
    )
    expect(t.indexers.releases(SHOWS.chernobyl.tmdbId)).toEqual([])
  })

  test('a season with a file in it turns the pack down; the rest come an episode at a time', async () => {
    const t = await withTorznab()
    const result = await t.indexers.searchEpisodes(
      input(
        { season: 1 },
        chernobyl((e) => ({ hasFile: e.episode === 1 })),
      ),
    )
    const pack = result.releases.find((r) => r.pack)
    expect(pack?.approved).toBe(false)
    expect(pack?.reasons[0]).toEqual({ kind: 'rejected', message: 'Already has a file: S01E01' })
    expect(
      chooseReleases(result.releases, ['ep2', 'ep3', 'ep4', 'ep5']).map((r) => r.title),
    ).toEqual(['Chernobyl.S01E02E03.1080p.WEB-DL.DDP5.1.H.264-GRP'])
  })

  test('an upgrade: the pack over WEB files, taken whole; one Bluray file already in turns it down', async () => {
    const t = await withTorznab()
    const web: ExistingFile = {
      quality: 'WEBDL-1080p',
      revision: { version: 1, real: 0, proper: false, repack: false },
      formatScore: 0,
    }
    const bluray: ExistingFile = { ...web, quality: 'Bluray-1080p' }
    // every episode in as WEBDL-1080p, under HD 1080p's Bluray-1080p cutoff
    const allWeb = await t.indexers.searchEpisodes(
      input(
        { season: 1 },
        chernobyl(() => ({ hasFile: true, existing: web })),
      ),
    )
    const pack = allWeb.releases.find((r) => r.pack)
    expect(pack?.approved).toBe(true)
    // the singles are the same quality as the files: no upgrade
    expect(allWeb.releases.filter((r) => !r.pack).every((r) => !r.approved)).toBe(true)
    expect(
      chooseReleases(allWeb.releases, ['ep1', 'ep2', 'ep3', 'ep4', 'ep5']).map((r) => r.title),
    ).toEqual(['Chernobyl.S01.1080p.BluRay.x264-GRP'])

    // S01E01 already Bluray: the pack doesn't upgrade that file, so it's turned down as a whole
    const oneBluray = await t.indexers.searchEpisodes(
      input(
        { season: 1 },
        chernobyl((e) => ({ hasFile: true, existing: e.episode === 1 ? bluray : web })),
      ),
    )
    const turned = oneBluray.releases.find((r) => r.pack)
    expect(turned?.approved).toBe(false)
    expect(turned?.reasons.some((r) => r.kind === 'rejected')).toBe(true)
    expect(chooseReleases(oneBluray.releases, ['ep2', 'ep3', 'ep4', 'ep5'])).toEqual([])
  })

  test('an episode, the blocklist per release, and a grab from the cache', async () => {
    const t = await withTorznab()
    const scope = { season: 1, episode: 1 }
    const result = await t.indexers.searchEpisodes({
      ...input(scope),
      blocked: (r) => r.guid === 'fake-201',
    })
    expect(result.releases.map((r) => r.title)).toEqual([
      'Chernobyl.S01E01.1080p.WEB-DL.DDP5.1.H.264-GRP',
    ])
    expect(result.releases[0]?.approved).toBe(false)
    expect(result.releases[0]?.reasons[0]?.message).toBe('On this show’s blocklist')
    const grabbed = await t.indexers.grabEpisodes({
      tmdbId: SHOWS.chernobyl.tmdbId,
      scope,
      indexerId: t.indexer.id,
      guid: 'fake-201',
    })
    expect(grabbed.release.episodeIds).toEqual(['ep1'])
    expect(grabbed.source).toEqual({
      torrent: madeUpTorrent('Chernobyl.S01E01.1080p.WEB-DL.DDP5.1.H.264-GRP'),
    })
    await expect(
      t.indexers.grabEpisodes({
        tmdbId: SHOWS.chernobyl.tmdbId,
        scope: { season: 1 },
        indexerId: t.indexer.id,
        guid: 'fake-201',
      }),
    ).rejects.toThrow('That release is no longer in the search results.')
  })

  test('another show’s release in the answer is left out, and says so', async () => {
    const t = await withTorznab()
    t.fake.publish({
      id: 299,
      name: 'Chernobyl.Diaries.S01E01.1080p.WEB-DL-GRP',
      size: 2 * 1024 ** 3,
      seeders: 5,
      leechers: 0,
      category: 5040,
      tmdbId: null,
      imdbId: null,
      ageMinutes: 60,
      freeleech: false,
      grabs: 1,
    })
    // without its TVDB id the show is searched by title, and the feed's IMDb ids place the rest
    const result = await t.indexers.searchEpisodes({ ...input({ season: 1 }), tvdbId: null })
    expect(result.releases).toHaveLength(4)
    expect(result.leftOut).toEqual([
      expect.objectContaining({ reason: 'other-show', count: 1, found: 5 }),
    ])
  })
})
