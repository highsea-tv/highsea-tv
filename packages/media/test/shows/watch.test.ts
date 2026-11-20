// SPDX-License-Identifier: AGPL-3.0-only
// Shows for the apps and the admin (Phase 5 B, HT-83): the apps' list and show page with each
// profile's watch state (an episode's, a season's, a show's), what Play plays and what follows,
// Home's Continue watching, Next up and Recently added shows, a show taken off them, Search, an
// episode's file for playback, the pushes the apps hear, and the admin's view and edits. Built on
// the import's test library (fixture.ts): Chernobyl with S01E01, a file holding E02 and E03, and
// The Office with two episodes of season 1, one of season 2 and a special.
import { afterEach, describe, expect, test } from 'bun:test'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import type { ServerEvent } from '@highsea-tv/core'
import { schema } from '@highsea-tv/db'
import { eq } from 'drizzle-orm'
import { CHERNOBYL, chernobyl, cleanup, setup, THE_OFFICE } from './fixture.ts'

afterEach(cleanup)

// Chernobyl's episodes and The Office's, by TMDB id (the recordings')
const CH = { e1: 1725580, e2: 1747124, e3: 1747125 }
const OF = { s1e1: 228902, s1e2: 228907, s2e1: 228917, special: 228923 }

async function library() {
  const t = await setup()
  chernobyl(t)
  t.put('The Office [tvdb-78107]/Season 01/The.Office.S01E01.Downsize.DVDRip.XviD-GRP.avi')
  t.put('The Office [tvdb-78107]/Season 01/The.Office.S01E02.avi')
  t.put('The Office [tvdb-78107]/Season 02/The.Office.S02E01.avi')
  t.put('The Office [tvdb-78107]/Specials/The.Office.S00E01.Christmas.Special.mkv')
  const found = await t.shows.libraryImport.scan(t.root)
  t.shows.libraryImport.run(
    found
      .filter((c) => c.match && !c.reason)
      .map((c) => ({ folder: c.folder, tmdbId: c.match?.tmdbId as number })),
  )
  await t.runJobs()
  const seen: ServerEvent[] = []
  t.events.subscribe((e) => seen.push(e))
  const ines = t.person('ines')
  const theo = t.person('theo')
  const { client, playback } = t.shows
  /** Each episode of a show as `S1E2`, with its watched mark. */
  const marks = (tmdbId: number, who = ines) =>
    Object.fromEntries(
      client
        .show(tmdbId, who.profileId)
        .seasons.flatMap((s) => s.episodes.map((e) => [`S${e.season}E${e.number}`, e.watched])),
    )
  return { ...t, seen, ines, theo, client, playback, marks }
}

describe('the apps’ shows', () => {
  test('only what has a file: its seasons and episodes, specials last and out of the counts', async () => {
    const t = await library()
    const list = t.client.list(t.ines.profileId)
    expect(list.map((s) => [s.id, s.seasons, s.episodes, s.unwatched])).toEqual([
      [CHERNOBYL, 1, 3, 3],
      [THE_OFFICE, 2, 3, 3],
    ])
    expect(list[0]?.next).toMatchObject({ kind: 'start', episode: { id: CH.e1 } })
    const office = t.client.show(THE_OFFICE, t.ines.profileId)
    expect(office.seasons.map((s) => [s.number, s.episodes.map((e) => e.id)])).toEqual([
      [1, [OF.s1e1, OF.s1e2]],
      [2, [OF.s2e1]],
      [0, [OF.special]],
    ])
    // E02 and E03 share one file and both are here; E04 and E05 have none and aren't
    expect(Object.keys(t.marks(CHERNOBYL))).toEqual(['S1E1', 'S1E2', 'S1E3'])
    expect(() => t.client.show(424242, t.ines.profileId)).toThrow()
  })

  test('watch state per profile: an episode, a season, the whole show', async () => {
    const t = await library()
    t.playback.played(t.ines, CH.e1)
    expect(t.marks(CHERNOBYL)).toEqual({ S1E1: true, S1E2: false, S1E3: false })
    // another profile's is its own
    expect(t.marks(CHERNOBYL, t.theo)).toEqual({ S1E1: false, S1E2: false, S1E3: false })
    // what Play plays: the one after the last watched
    expect(t.client.show(CHERNOBYL, t.ines.profileId).show.next).toMatchObject({
      kind: 'next',
      episode: { id: CH.e2 },
    })

    t.client.setWatched(t.ines, THE_OFFICE, 1, true)
    expect(t.marks(THE_OFFICE)).toEqual({ S1E1: true, S1E2: true, S2E1: false, S0E1: false })
    t.client.setWatched(t.ines, THE_OFFICE, null, true)
    // the whole show is its regular episodes: the special stays as it was
    expect(t.marks(THE_OFFICE)).toEqual({ S1E1: true, S1E2: true, S2E1: true, S0E1: false })
    const office = t.client.list(t.ines.profileId).find((x) => x.id === THE_OFFICE)
    expect(office).toMatchObject({ watched: true, unwatched: 0, next: { kind: 'again' } })
    t.client.setWatched(t.ines, THE_OFFICE, null, false)
    expect(t.marks(THE_OFFICE)).toEqual({ S1E1: false, S1E2: false, S2E1: false, S0E1: false })
    expect(() => t.client.setWatched(t.ines, THE_OFFICE, 7, true)).toThrow('That season')
  })

  test('a position part way resumes; past 90% it’s watched', async () => {
    const t = await library()
    expect(t.playback.position(t.ines, CH.e2, 600)).toEqual({ watched: false })
    expect(t.client.show(CHERNOBYL, t.ines.profileId).show.next).toMatchObject({
      kind: 'resume',
      episode: { id: CH.e2, position: 600 },
    })
    // the shared file is an hour: past 90% of it marks this episode, not the other
    expect(t.playback.position(t.ines, CH.e2, 3300)).toEqual({ watched: true })
    expect(t.marks(CHERNOBYL)).toEqual({ S1E1: false, S1E2: true, S1E3: false })
    expect(t.playback.next(t.ines, CH.e2)).toMatchObject({ id: CH.e3, type: 'episode' })
    expect(t.playback.next(t.ines, CH.e3)).toBeNull()
    // a special's next is the next special
    expect(t.playback.next(t.ines, OF.special)).toBeNull()
  })

  test('each change is heard by its account as the episode’s and the show’s', async () => {
    const t = await library()
    t.playback.played(t.ines, CH.e1)
    t.client.setWatched(t.theo, THE_OFFICE, 2, true)
    expect(
      t.seen.filter((e) => e.topic === 'watch.updated').map((e) => ({ ids: e.ids, to: e.to })),
    ).toEqual([
      { ids: [`episode:${CH.e1}`, `show:${CHERNOBYL}`], to: ['ines'] },
      { ids: [`show:${THE_OFFICE}`], to: ['theo'] },
    ])
  })

  test('an episode plays from its file; a multi-episode file is each one’s', async () => {
    const t = await library()
    const e2 = t.playback.source(CH.e2, t.ines)
    const e3 = t.playback.source(CH.e3, t.ines)
    expect(e2.file.path).toContain('Chernobyl.S01E02E03')
    expect(e3.file.id).toBe(e2.file.id)
    expect(e2.duration).toBe(3600)
    expect(e2.item.type).toBe('episode')
    expect(t.client.item(CH.e2, t.ines.profileId).item).toMatchObject({
      id: CH.e2,
      type: 'episode',
      show: { id: CHERNOBYL, title: 'Chernobyl', code: 'S1, E2' },
    })
  })
})

describe('Home', () => {
  test('Continue watching, Next up and Recently added shows; a show taken off stays off until played', async () => {
    const t = await library()
    const empty = t.client.home(t.ines.profileId)
    expect(empty.continuing).toEqual([])
    expect(empty.nextUp).toEqual([])
    expect(empty.recent.map((s) => s.id).sort()).toEqual([THE_OFFICE, CHERNOBYL].sort())

    t.playback.position(t.ines, CH.e2, 600)
    t.clock.advance(1000)
    t.playback.played(t.ines, OF.s1e1)
    const home = t.client.home(t.ines.profileId)
    expect(home.continuing.map((c) => c.item.id)).toEqual([CH.e2])
    expect(home.nextUp.map((i) => i.id)).toEqual([OF.s1e2])
    // nothing of the other profile's
    expect(t.client.home(t.theo.profileId).continuing).toEqual([])

    t.playback.dismiss(t.ines, CH.e2)
    expect(t.client.home(t.ines.profileId).continuing).toEqual([])
    // its place went with it
    expect(t.client.show(CHERNOBYL, t.ines.profileId).show.next).toMatchObject({ kind: 'start' })
    t.clock.advance(1000)
    t.playback.position(t.ines, CH.e1, 60)
    expect(t.client.home(t.ines.profileId).continuing.map((c) => c.item.id)).toEqual([CH.e1])
  })
})

describe('Search', () => {
  test('shows by title and genre, episodes by title, ranked among the films’ kinds', async () => {
    const t = await library()
    const { search } = t.client
    expect(search.shows('chern', t.ines.profileId).map((s) => s.id)).toEqual([CHERNOBYL])
    expect(search.shows('comedy', t.ines.profileId).map((s) => s.id)).toEqual([THE_OFFICE])
    expect(search.episodes('downsize').map((e) => e.id)).toEqual([OF.s1e1])
    // episodes without a file aren't found
    expect(search.episodes('Vichnaya Pamyat')).toEqual([])
    const merged = search.merge(
      { sections: [{ kind: 'people', items: [{ id: 1, name: 'Jared Harris' } as never] }] },
      'office',
      t.ines.profileId,
    )
    expect(merged.sections.map((s) => s.kind)).toEqual(['shows', 'people'])
    expect(search.merge({ sections: [] }, '  ', t.ines.profileId)).toEqual({ sections: [] })
  })
})

describe('the admin’s shows', () => {
  test('a show by its TMDB id, its counts and episodes; a multi-episode file counted once', async () => {
    const t = await library()
    const { admin } = t.shows
    expect(admin.list().map((s) => s.id)).toEqual([String(CHERNOBYL), String(THE_OFFICE)])
    const show = admin.get(String(CHERNOBYL))
    expect(show).toMatchObject({ id: '87108', tmdbId: CHERNOBYL, seasonFolders: true })
    expect(show.episodes).toEqual({ monitored: 5, have: 3, total: 5 })
    expect(show.size).toBe(14)
    expect(
      show.seasonList[0]?.episodes.map((e) => [e.number, e.status, e.file?.path ?? null]),
    ).toMatchObject([
      [1, 'available', expect.stringContaining('S01E01')],
      [2, 'available', expect.stringContaining('S01E02E03')],
      [3, 'available', expect.stringContaining('S01E02E03')],
      [4, 'missing', null],
      [5, 'missing', null],
    ])
    expect(() => admin.get('chernobyl')).toThrow()
    expect(admin.rootFolders()).toEqual([t.root])
    // what the import kept unmatched, with its show and reason
    expect(admin.unmatched().find((u) => u.path.endsWith('Chernobyl Recap.mkv'))).toMatchObject({
      kind: 'episode-file',
      show: String(CHERNOBYL),
      reason: 'no-episode-number',
      rootFolder: t.root,
    })
    expect(admin.unmatched('/elsewhere')).toEqual([])
  })

  test('monitoring a season and an episode; a root folder move and deleting files refused', async () => {
    const t = await library()
    const { admin } = t.shows
    const fourth = admin.get(String(CHERNOBYL)).seasonList[0]?.episodes[3]?.id as string
    admin.monitorEpisode(String(CHERNOBYL), fourth, false)
    let show = admin.get(String(CHERNOBYL))
    const e4 = show.seasonList[0]?.episodes.find((e) => e.number === 4)
    expect(e4).toMatchObject({ monitored: false })
    expect(show.episodes.monitored).toBe(4)
    admin.monitorSeason(String(CHERNOBYL), 1, false)
    show = admin.get(String(CHERNOBYL))
    expect(show.seasonList[0]?.monitored).toBe(false)
    // an episode with a file is counted whether it's monitored or not, as Sonarr counts it
    expect(show.episodes.monitored).toBe(3)
    expect(() => admin.monitorSeason(String(CHERNOBYL), 9, true)).toThrow('That season')
    expect(() => admin.monitorEpisode(String(CHERNOBYL), '1', true)).toThrow('That episode')

    expect(() => admin.update(String(CHERNOBYL), { rootFolder: '/elsewhere' })).toThrow()
    expect(admin.update(String(CHERNOBYL), { seasonFolders: false }).seasonFolders).toBe(false)
    expect(() => admin.remove(String(CHERNOBYL), true)).toThrow('doesn’t delete')
  })

  test('removing a show keeps its files on disk', async () => {
    const t = await library()
    const path = join(
      t.root,
      'Chernobyl (2019)/Season 01/Chernobyl.S01E01.1:23:45.1080p.WEB-DL.DD5.1.H.264-NTb.mkv',
    )
    t.shows.admin.remove(String(CHERNOBYL), false)
    expect(t.showRow(CHERNOBYL)).toBeUndefined()
    expect(
      t.db.select().from(schema.mediaFiles).where(eq(schema.mediaFiles.path, path)).all(),
    ).toEqual([])
    expect(existsSync(path)).toBe(true)
    expect(t.client.list(t.ines.profileId).map((s) => s.id)).toEqual([THE_OFFICE])
  })
})

describe('Shows’ settings', () => {
  test('episode naming over Sonarr’s defaults, checked; sizes; profiles’ use', async () => {
    const t = await library()
    const { settings } = t.shows
    expect(settings.naming()).toMatchObject({
      rename: true,
      seasonFolderFormat: 'Season {season:00}',
    })
    const saved = settings.saveNaming({ ...settings.naming(), rename: false })
    expect(saved.rename).toBe(false)
    expect(settings.naming().rename).toBe(false)
    expect(() => settings.saveNaming({ ...settings.naming(), standardFormat: ' ' })).toThrow()

    const sizes = settings.sizes()
    expect(sizes.length).toBeGreaterThan(0)
    expect(settings.saveSizes(sizes)).toEqual(sizes)
    expect(() => settings.saveSizes(sizes.slice(1))).toThrow('Every quality needs a row')

    const profile = t.showRow(CHERNOBYL)?.qualityProfileId as string
    expect(settings.profileUsage([profile])).toEqual([{ profileId: profile, movies: 0, shows: 2 }])
  })
})
