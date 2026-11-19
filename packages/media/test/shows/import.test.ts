// SPDX-License-Identifier: AGPL-3.0-only
// Shows on disk into the library (Phase 5 B, ADR 0064's 2026-11-18 section): show folders
// identified from `tvshow.nfo`, from the ids in their names and from TMDB's search; their files
// matched to episodes, one file to several, the rest kept unmatched with their reason; the scan
// after a file is added, removed and replaced; and every step safe to repeat. The files are a few
// bytes made here and the probe a fake that reads them, so no ffmpeg is needed. TMDB is replayed
// from the recordings: Chernobyl (87108, TheTVDB 360893) and The Office (2996, TheTVDB 78107).
import { afterEach, describe, expect, test } from 'bun:test'
import { chmodSync, rmSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { schema } from '@highsea-tv/db'
import { eq } from 'drizzle-orm'
import { episodeMatch, pickShow } from '../../src/shows/index.ts'
import { CHERNOBYL, chernobyl, cleanup, setup, THE_OFFICE } from './fixture.ts'

afterEach(cleanup)

describe('matching a file to episodes by its name', () => {
  const seasons = new Map([
    [0, new Set([1, 2])],
    [1, new Set([1, 2, 3])],
  ])
  test('its season and episodes, the name’s season over its folder’s', () => {
    expect(episodeMatch('/s/Show/Season 01/Show.S01E02.mkv', '/s/Show', seasons)).toEqual({
      ok: true,
      season: 1,
      episodes: [2],
    })
    expect(episodeMatch('/s/Show/Season 01/Show.S01E02-E03.mkv', '/s/Show', seasons)).toEqual({
      ok: true,
      season: 1,
      episodes: [2, 3],
    })
    expect(episodeMatch('/s/Show/Specials/Show.S00E02.mkv', '/s/Show', seasons)).toMatchObject({
      ok: true,
      season: 0,
    })
    expect(episodeMatch('/s/Show/Season 02/Show.S01E01.mkv', '/s/Show', seasons)).toMatchObject({
      ok: true,
      season: 1,
    })
  })
  test('nothing guessed: each reason', () => {
    const reason = (p: string) => {
      const m = episodeMatch(p, '/s/Show', seasons)
      return m.ok ? null : m.reason
    }
    expect(reason('/s/Show/Season 01/Show Recap.mkv')).toBe('no-episode-number')
    expect(reason('/s/Show/Show.S01.1080p.WEB-DL.mkv')).toBe('no-episode-number')
    // anime's absolute numbers wait for their mapping
    expect(reason('/s/Show/[Group] Show - 112 [1080p].mkv')).toBe('no-episode-number')
    expect(reason('/s/Show/Show.S03E01.mkv')).toBe('unknown-season')
    expect(reason('/s/Show/Show.S01E04.mkv')).toBe('unknown-episode')
    expect(reason('/s/Show/Show.S01E03E04.mkv')).toBe('unknown-episode')
  })
})

describe('telling which show TMDB means', () => {
  const r = (id: number, title: string, year: number | null) => ({
    id,
    title,
    originalTitle: title,
    year,
  })
  test('one show of that title, or of that title and year', () => {
    const first = r(87108, 'Chernobyl', 2019)
    const results = [first, r(196108, 'Chernobyl', 2022), r(5, 'Chernobyl Diaries', 2012)]
    expect(pickShow(results, 'Chernobyl', 2019)).toEqual({ show: first })
    expect(pickShow(results, 'chernobyl', null)).toMatchObject({ reason: 'ambiguous' })
    expect(pickShow(results, 'Pripyat', null)).toMatchObject({ reason: 'no-match' })
    // a first air date a year apart, as regions differ
    expect(pickShow(results, 'Chernobyl', 2018)).toEqual({ show: first })
    expect(pickShow([r(2996, 'The Office', 2001)], 'Office', 2001)).toEqual({
      show: r(2996, 'The Office', 2001),
    })
  })
})

describe('importing the shows on disk', () => {
  test('from tvshow.nfo, from a tvdb- folder name and from the search; one is ambiguous', async () => {
    const t = await setup()
    chernobyl(t)
    t.put('The Office [tvdb-78107]/Season 01/The.Office.S01E01.Downsize.DVDRip.XviD-GRP.avi')
    // a special is never a sample: Sonarr skips the check for season 0
    t.put('The Office [tvdb-78107]/Specials/The.Office.S00E01.Christmas.Special.mkv', 'sample')
    t.put('Chernobyl/Chernobyl.S01E01.mkv')
    // no recording answers its search, as TMDB down would not: it waits, and the next scan tries again
    t.put('Pripyat Nights (1999)/Pripyat.Nights.S01E01.mkv')

    const candidates = await t.shows.libraryImport.scan(t.root)
    expect(
      candidates.map((c) => ({
        name: c.name,
        tmdbId: c.match?.tmdbId ?? null,
        by: c.matchedBy,
        reason: c.reason,
      })),
    ).toEqual([
      { name: 'Chernobyl', tmdbId: null, by: null, reason: 'ambiguous' },
      { name: 'Chernobyl (2019)', tmdbId: CHERNOBYL, by: 'nfo', reason: null },
      { name: 'Pripyat Nights (1999)', tmdbId: null, by: null, reason: 'unreachable' },
      { name: 'The Office [tvdb-78107]', tmdbId: THE_OFFICE, by: 'name', reason: null },
    ])
    expect(candidates[0]?.skip).toContain('TMDB has 2 shows named Chernobyl')
    // nothing written by a preview
    expect(t.showRow(CHERNOBYL)).toBeUndefined()

    t.shows.libraryImport.run(
      candidates
        .filter((c) => c.match)
        .map((c) => ({ folder: c.folder, tmdbId: c.match?.tmdbId as number })),
    )
    await t.runJobs()
    expect(t.shows.libraryImport.status()).toMatchObject({
      state: 'done',
      total: 2,
      done: 2,
      imported: 2,
      files: 4,
      unmatched: 4,
      failures: [],
    })

    const show = t.showRow(CHERNOBYL)
    expect(show).toMatchObject({ path: join(t.root, 'Chernobyl (2019)') })
    expect(t.shows.get(CHERNOBYL)).toMatchObject({ seasonFolders: true })
    expect(t.episodes(CHERNOBYL)).toEqual({
      S01E01: {
        file: 'Chernobyl (2019)/Season 01/Chernobyl.S01E01.1:23:45.1080p.WEB-DL.DD5.1.H.264-NTb.mkv',
        status: 'available',
      },
      S01E02: {
        file: 'Chernobyl (2019)/Season 01/Chernobyl.S01E02E03.1080p.WEB-DL.DD5.1.H.264-NTb.mkv',
        status: 'available',
      },
      S01E03: {
        file: 'Chernobyl (2019)/Season 01/Chernobyl.S01E02E03.1080p.WEB-DL.DD5.1.H.264-NTb.mkv',
        status: 'available',
      },
      S01E04: { file: null, status: expect.not.stringMatching(/^available$/) },
      S01E05: { file: null, status: expect.not.stringMatching(/^available$/) },
    })
    // the multi-episode file is one row, under its first episode, quality from its name
    const multi = t.db
      .select()
      .from(schema.mediaFiles)
      .all()
      .find((f) => f.path.includes('S01E02E03'))
    expect(multi).toMatchObject({ quality: 'WEBDL-1080p', releaseGroup: 'NTb' })
    const e2 = t.db
      .select()
      .from(schema.mediaItems)
      .where(eq(schema.mediaItems.id, multi?.itemId as string))
      .get()
    expect(e2).toMatchObject({ seasonNumber: 1, episodeNumber: 2 })

    expect(t.episodes(THE_OFFICE)).toMatchObject({
      S00E01: {
        file: 'The Office [tvdb-78107]/Specials/The.Office.S00E01.Christmas.Special.mkv',
        status: 'available',
      },
      S01E01: {
        file: 'The Office [tvdb-78107]/Season 01/The.Office.S01E01.Downsize.DVDRip.XviD-GRP.avi',
        status: 'available',
      },
    })

    expect(t.unmatched()).toEqual([
      {
        path: 'Chernobyl (2019)/Season 01/Chernobyl Recap.mkv',
        kind: 'episode-file',
        reason: 'no-episode-number',
      },
      {
        path: 'Chernobyl (2019)/Season 01/Chernobyl.S01E05.1080p.WEB-DL-NTb.mkv',
        kind: 'episode-file',
        reason: 'unreadable',
      },
      {
        path: 'Chernobyl (2019)/Season 01/Chernobyl.S01E09.1080p.WEB-DL-NTb.mkv',
        kind: 'episode-file',
        reason: 'unknown-episode',
      },
      {
        path: 'Chernobyl (2019)/Season 02/Chernobyl.S02E01.1080p.WEB-DL-NTb.mkv',
        kind: 'episode-file',
        reason: 'unknown-season',
      },
    ])
    // one history entry per file, in place
    const imported = t.db
      .select()
      .from(schema.history)
      .all()
      .filter((h) => h.type === 'imported')
    expect(imported).toHaveLength(4)
    expect(imported.every((h) => (h.data as { inPlace?: boolean }).inPlace === true)).toBe(true)
  })

  test('the import run twice changes nothing', async () => {
    const t = await setup()
    chernobyl(t)
    const run = async () => {
      const found = await t.shows.libraryImport.scan(t.root)
      t.shows.libraryImport.run(
        found
          .filter((c) => c.match)
          .map((c) => ({ folder: c.folder, tmdbId: c.match?.tmdbId as number })),
      )
      await t.runJobs()
    }
    await run()
    const first = t.snapshot()
    t.clock.advance(60_000)
    await run()
    const second = t.snapshot()
    // the show's updatedAt may follow TMDB's refresh; what the import owns is unchanged
    expect(second.versions).toEqual(first.versions)
    expect(second.files).toEqual(first.files)
    expect(second.unmatched).toEqual(first.unmatched)
    expect(second.history).toEqual(first.history)
    expect(second.items.map((i) => [i.id, i.status, i.path])).toEqual(
      first.items.map((i) => [i.id, i.status, i.path]),
    )
    // and a scan after it finds nothing to do
    expect(await t.shows.libraryScan.scan()).toEqual({
      added: 0,
      changed: 0,
      removed: 0,
      unmatched: 0,
      shows: 0,
      waiting: 0,
      unreadable: [],
    })
    expect(t.snapshot().files).toEqual(first.files)
  })

  test('from a name with a year, through the search; ids in tvshow.nfo as TMDB and IMDb write them', async () => {
    const t = await setup()
    t.put('Chernobyl (2019)/Chernobyl.S01E01.mkv')
    t.put('Office/tvshow.nfo', '<tvshow><uniqueid type="tmdb">2996</uniqueid></tvshow>')
    t.put('Office/The.Office.S01E01.mkv')
    // IMDb's id (in the nfo and the name) finds no show on TMDB: the name's search decides
    t.put(
      'Chernobyl (2019) {imdb-tt0000000}/tvshow.nfo',
      '<tvshow><uniqueid type="imdb">tt0000000</uniqueid></tvshow>',
    )
    const found = await t.shows.libraryImport.scan(t.root)
    expect(found.map((c) => [c.name, c.match?.tmdbId ?? null, c.matchedBy, c.skip])).toEqual([
      ['Chernobyl (2019)', CHERNOBYL, 'search', null],
      ['Chernobyl (2019) {imdb-tt0000000}', CHERNOBYL, 'search', null],
      ['Office', THE_OFFICE, 'nfo', null],
    ])
    // two folders matched to one show are refused together
    expect(() =>
      t.shows.libraryImport.run(
        found.map((c) => ({ folder: c.folder, tmdbId: c.match?.tmdbId as number })),
      ),
    ).toThrow('Two folders are matched to one show.')
    t.shows.libraryImport.run(
      [found[0], found[2]].map((c) => ({
        folder: c?.folder as string,
        tmdbId: c?.match?.tmdbId as number,
      })),
    )
    await t.runJobs()
    // videos straight in the show's folder: no season folders
    expect(t.shows.get(THE_OFFICE)).toMatchObject({ seasonFolders: false })
    expect(t.episodes(THE_OFFICE).S01E01).toEqual({
      file: 'Office/The.Office.S01E01.mkv',
      status: 'available',
    })
    // the second Chernobyl folder is a second copy, not a second show
    const again = await t.shows.libraryImport.scan(t.root)
    expect(again.find((c) => c.name === 'Chernobyl (2019) {imdb-tt0000000}')).toMatchObject({
      inLibrary: true,
      reason: 'second-copy',
    })
  })
})

describe('the shows scan', () => {
  test('a file added, replaced, removed and changed; a second copy kept unmatched', async () => {
    const t = await setup()
    chernobyl(t)
    const found = await t.shows.libraryImport.scan(t.root)
    t.shows.libraryImport.run(
      found
        .filter((c) => c.match)
        .map((c) => ({ folder: c.folder, tmdbId: c.match?.tmdbId as number })),
    )
    await t.runJobs()
    const folder = 'Chernobyl (2019)/Season 01'

    // added
    t.put(`${folder}/Chernobyl.S01E04.1080p.WEB-DL-NTb.mkv`)
    expect(await t.shows.libraryScan.scan()).toMatchObject({ added: 1, removed: 0, changed: 0 })
    expect(t.episodes(CHERNOBYL).S01E04).toEqual({
      file: `${folder}/Chernobyl.S01E04.1080p.WEB-DL-NTb.mkv`,
      status: 'available',
    })

    // the file that held S01E02 and S01E03 replaced by one each: E02's file is new, E03's wants
    // the episode the old file still holds until it's gone
    rmSync(join(t.root, folder, 'Chernobyl.S01E02E03.1080p.WEB-DL.DD5.1.H.264-NTb.mkv'))
    t.put(`${folder}/Chernobyl.S01E02.2160p.WEB-DL-NTb.mkv`)
    t.put(`${folder}/Chernobyl.S01E03.2160p.WEB-DL-NTb.mkv`)
    expect(await t.shows.libraryScan.scan()).toMatchObject({ added: 2, removed: 1 })
    expect(t.episodes(CHERNOBYL)).toMatchObject({
      S01E02: { file: `${folder}/Chernobyl.S01E02.2160p.WEB-DL-NTb.mkv`, status: 'available' },
      S01E03: { file: `${folder}/Chernobyl.S01E03.2160p.WEB-DL-NTb.mkv`, status: 'available' },
    })
    const deleted = t.db
      .select()
      .from(schema.history)
      .all()
      .filter((h) => h.type === 'deleted')
    expect(deleted).toHaveLength(1)

    // removed
    rmSync(join(t.root, folder, 'Chernobyl.S01E04.1080p.WEB-DL-NTb.mkv'))
    expect(await t.shows.libraryScan.scan()).toMatchObject({ added: 0, removed: 1 })
    expect(t.episodes(CHERNOBYL).S01E04?.file).toBeNull()
    expect(t.episodes(CHERNOBYL).S01E04?.status).not.toBe('available')

    // changed in place: probed again, its size followed
    const e1 = t.put(
      `${folder}/Chernobyl.S01E01.1:23:45.1080p.WEB-DL.DD5.1.H.264-NTb.mkv`,
      'episode, a longer one',
    )
    expect(await t.shows.libraryScan.scan()).toMatchObject({ changed: 1, added: 0, removed: 0 })
    expect(
      t.db.select().from(schema.mediaFiles).where(eq(schema.mediaFiles.path, e1)).get()?.size,
    ).toBe(statSync(e1).size)

    // a duplicate for an episode that has a file is kept unmatched, never swapped in
    t.put(`${folder}/Chernobyl.S01E02.720p.HDTV-GRP.mkv`)
    expect(await t.shows.libraryScan.scan()).toMatchObject({ added: 0, unmatched: 1 })
    expect(t.unmatched()).toContainEqual({
      path: `${folder}/Chernobyl.S01E02.720p.HDTV-GRP.mkv`,
      kind: 'episode-file',
      reason: 'episode-has-file',
    })

    // a file that gives up an unmatched reason by disappearing is forgotten
    rmSync(join(t.root, folder, 'Chernobyl Recap.mkv'))
    await t.shows.libraryScan.scan()
    expect(t.unmatched().some((u) => u.path.endsWith('Chernobyl Recap.mkv'))).toBe(false)
  })

  test('matched by hand: an episode taken from a multi-episode file leaves it the other', async () => {
    const t = await setup()
    chernobyl(t)
    const found = await t.shows.libraryImport.scan(t.root)
    t.shows.libraryImport.run(
      found
        .filter((c) => c.match)
        .map((c) => ({ folder: c.folder, tmdbId: c.match?.tmdbId as number })),
    )
    await t.runJobs()
    const folder = 'Chernobyl (2019)/Season 01'
    const multi = 'Chernobyl.S01E02E03.1080p.WEB-DL.DD5.1.H.264-NTb.mkv'

    // the recap is really episode 2: the multi-episode file keeps 3, and moves under it
    await t.shows.files.assign(CHERNOBYL, join(t.root, folder, 'Chernobyl Recap.mkv'), [
      { season: 1, episode: 2 },
    ])
    expect(t.episodes(CHERNOBYL)).toMatchObject({
      S01E02: { file: `${folder}/Chernobyl Recap.mkv`, status: 'available' },
      S01E03: { file: `${folder}/${multi}`, status: 'available' },
    })
    const row = t.db
      .select()
      .from(schema.mediaFiles)
      .all()
      .find((f) => f.path.endsWith(multi))
    const holder = t.db
      .select()
      .from(schema.mediaItems)
      .where(eq(schema.mediaItems.id, row?.itemId as string))
      .get()
    expect(holder?.episodeNumber).toBe(3)
    expect(t.unmatched().some((u) => u.path.endsWith('Chernobyl Recap.mkv'))).toBe(false)

    // its last episode taken too: the file's row goes, as nothing holds it
    await t.shows.files.assign(
      CHERNOBYL,
      join(t.root, folder, 'Chernobyl.S01E09.1080p.WEB-DL-NTb.mkv'),
      [{ season: 1, episode: 3 }],
    )
    expect(t.files().some((f) => f.endsWith(multi))).toBe(false)
    expect(t.episodes(CHERNOBYL).S01E03?.file).toBe(
      `${folder}/Chernobyl.S01E09.1080p.WEB-DL-NTb.mkv`,
    )

    await expect(
      t.shows.files.assign(
        CHERNOBYL,
        join(t.root, folder, 'Chernobyl.S01E09.1080p.WEB-DL-NTb.mkv'),
        [{ season: 4, episode: 1 }],
      ),
    ).rejects.toThrow('The show has no S04E01.')
  })

  test('a new show folder is added when it’s sure, kept with its reason when not, and an unreadable root is left alone', async () => {
    const t = await setup()
    chernobyl(t)
    t.put('Chernobyl/Chernobyl.S01E01.mkv')
    const first = await t.shows.libraryScan.scan()
    expect(first).toMatchObject({ shows: 1, waiting: 1 })
    expect(t.showRow(CHERNOBYL)).toBeDefined()
    expect(t.unmatched().filter((u) => u.kind === 'show-folder')).toEqual([
      { path: 'Chernobyl', kind: 'show-folder', reason: 'ambiguous' },
    ])
    // a folder kept isn't searched again by the periodic scan
    const requests = t.fetch.requests.length
    expect(await t.shows.libraryScan.scan()).toMatchObject({ shows: 0, waiting: 1, added: 0 })
    expect(t.fetch.requests.length).toBe(requests)

    // an unreadable root: nothing removed
    const before = t.files()
    chmodSync(t.root, 0o000)
    try {
      const r = await t.shows.libraryScan.scan()
      if (process.getuid?.() !== 0) expect(r.unreadable).toEqual([t.root])
    } finally {
      chmodSync(t.root, 0o755)
    }
    expect(t.files()).toEqual(before)
  })

  test('the scan is a job: queued per folder and scheduled every 12 hours', async () => {
    const t = await setup()
    chernobyl(t)
    const id = t.shows.libraryScan.queue()
    expect(t.shows.libraryScan.queue()).toBe(id)
    await t.runJobs()
    expect(t.showRow(CHERNOBYL)).toBeDefined()
    t.shows.jobs.schedule(t.clock.now())
    const scheduled = t.db
      .select()
      .from(schema.jobSchedules)
      .all()
      .find((s) => s.type === 'shows.scan')
    expect(scheduled?.everyMs).toBe(12 * 60 * 60 * 1000)
  })
})

describe('a read-only root folder', () => {
  test('the import and the scan write nothing in it', async () => {
    const t = await setup()
    chernobyl(t)
    const listing = () => {
      const { readdirSync } = require('node:fs') as typeof import('node:fs')
      const walk = (d: string): string[] =>
        readdirSync(d, { withFileTypes: true }).flatMap((e) =>
          e.isDirectory()
            ? walk(join(d, e.name))
            : [`${join(d, e.name)}:${statSync(join(d, e.name)).mtimeMs}`],
        )
      return walk(t.root).sort()
    }
    const before = listing()
    const found = await t.shows.libraryImport.scan(t.root)
    t.shows.libraryImport.run(
      found
        .filter((c) => c.match)
        .map((c) => ({ folder: c.folder, tmdbId: c.match?.tmdbId as number })),
    )
    await t.runJobs()
    await t.shows.libraryScan.scan()
    expect(listing()).toEqual(before)
  })
})
