// SPDX-License-Identifier: AGPL-3.0-only
// @highsea-tv/media/shows' first part (ADR 0064): a show added from TMDB with its seasons and
// episodes, and its rows kept in step with TMDB's refreshes. TMDB is replayed from the recordings:
// Chernobyl (87108, five episodes) and The Office (2996, two series and eighteen specials).
import { afterEach, describe, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { AddSeriesInput } from '@highsea-tv/api-contract'
import {
  type AppError,
  createEventBus,
  createFakeClock,
  createSealer,
  generateSecretKey,
  type ServerEvent,
  silentLogger,
} from '@highsea-tv/core'
import { migrate, openDatabase, schema } from '@highsea-tv/db'
import { createJobQueue } from '@highsea-tv/jobs'
import { createMetadata } from '@highsea-tv/metadata'
import { createReplayFetch } from '@highsea-tv/metadata/replay'
import { and, eq } from 'drizzle-orm'
import { createMedia } from '../../src/shared/index.ts'
import { createShows, monitorsEpisode } from '../../src/shows/index.ts'

const CHERNOBYL = 87108
const THE_OFFICE = 2996
const DAY = 24 * 60 * 60 * 1000

let cleanups: (() => void)[] = []
afterEach(() => {
  for (const c of cleanups) c()
  cleanups = []
})

async function setup() {
  const { db, raw } = openDatabase(':memory:')
  migrate(raw)
  const clock = createFakeClock()
  const events = createEventBus({ now: clock.now })
  const seen: ServerEvent[] = []
  events.subscribe((e) => seen.push(e))
  const jobs = createJobQueue({ db, clock, events })
  const fetch = createReplayFetch()
  const dir = mkdtempSync(join(tmpdir(), 'highsea-shows-'))
  const imagesDir = join(dir, 'images')
  const library = join(dir, 'shows')
  mkdirSync(imagesDir)
  mkdirSync(library)
  const metadata = createMetadata({
    db,
    jobs,
    clock,
    logger: silentLogger,
    events,
    sealer: createSealer(generateSecretKey()),
    fetch,
    imagesDir,
    sleep: async (ms) => clock.advance(ms),
  })
  await metadata.settings.setKey('test-key-for-replay-0001')
  const media = createMedia({ db, clock, logger: silentLogger })
  media.seed()
  const folder = media.rootFolders.add({ path: library, kind: 'shows' })
  const shows = createShows({ db, clock, events, logger: silentLogger, metadata }, media)
  cleanups.push(() => {
    shows.close()
    rmSync(dir, { recursive: true, force: true })
  })
  const input = (tmdbId: number, patch: Partial<AddSeriesInput> = {}): AddSeriesInput => ({
    tmdbId,
    title: '',
    year: 0,
    qualityProfileId: 'qp-hd',
    languageProfileId: '',
    rootFolder: folder.path,
    monitor: 'all',
    seasonFolders: true,
    search: false,
    ...patch,
  })
  const rows = (type: 'show' | 'season' | 'episode') =>
    db.select().from(schema.mediaItems).where(eq(schema.mediaItems.type, type)).all()
  /** Rewrites a cached season's answer, as a refresh from TMDB would. */
  const editSeason = (show: number, season: number, edit: (data: SeasonData) => SeasonData) => {
    const where = and(
      eq(schema.seasonMetadata.showId, show),
      eq(schema.seasonMetadata.seasonNumber, season),
    )
    const row = db.select().from(schema.seasonMetadata).where(where).get()
    if (!row) throw new Error('not cached')
    db.update(schema.seasonMetadata)
      .set({ data: edit(row.data as SeasonData) })
      .where(where)
      .run()
  }
  return { db, clock, events, seen, jobs, metadata, media, shows, folder, input, rows, editSeason }
}

type SeasonData = {
  episodes: { id: number; episode_number: number; season_number: number; name: string }[]
}

describe('adding a show', () => {
  test('the show, its seasons and its episodes, each episode with one version', async () => {
    const t = await setup()
    const { show, created } = await t.shows.add(t.input(CHERNOBYL))
    expect(created).toBe(true)
    expect(show).toMatchObject({
      type: 'show',
      tmdbId: CHERNOBYL,
      title: 'Chernobyl',
      year: 2019,
      monitored: true,
      status: 'wanted',
      path: join(t.folder.path, 'Chernobyl (2019)'),
      seasonFolders: true,
      tvdbId: 360893,
      imdbId: 'tt7366338',
    })
    expect(show.seasons).toHaveLength(1)
    const [season] = show.seasons
    expect(season).toMatchObject({
      type: 'season',
      tmdbId: 119454,
      parentId: show.id,
      showId: show.id,
      seasonNumber: 1,
      path: join(show.path, 'Season 01'),
      monitored: true,
    })
    expect(season?.episodes.map((e) => [e.tmdbId, e.episodeNumber, e.title])).toEqual([
      [1725580, 1, '1:23:45'],
      [1747124, 2, 'Please Remain Calm'],
      [1747125, 3, 'Open Wide, O Earth'],
      [1747126, 4, 'The Happiness of All Mankind'],
      [1747127, 5, 'Vichnaya Pamyat'],
    ])
    for (const e of season?.episodes ?? [])
      expect(e).toMatchObject({
        parentId: season?.id,
        showId: show.id,
        seasonNumber: 1,
        monitored: true,
        // aired in 2019, before the test's clock
        status: 'wanted',
        qualityProfileId: 'qp-hd',
        rootFolder: t.folder.path,
      })
    const versions = t.db.select().from(schema.versions).all()
    expect(versions).toHaveLength(5)
    expect(versions.every((v) => v.label === 'Default' && v.fileId === null)).toBe(true)
    expect(t.seen.filter((e) => e.topic === 'shows.updated').at(-1)?.ids).toEqual(['87108'])
    expect(t.seen.filter((e) => e.topic === 'item.updated').at(-1)?.ids).toEqual(['show:87108'])
  })

  test('adding it again returns it unchanged', async () => {
    const t = await setup()
    const first = await t.shows.add(t.input(CHERNOBYL))
    const again = await t.shows.add(t.input(CHERNOBYL, { monitor: 'none' }))
    expect(again.created).toBe(false)
    expect(again.show).toEqual(first.show)
    expect(t.rows('episode')).toHaveLength(5)
  })

  test('specials are season 0 in Specials, unmonitored whatever the choice', async () => {
    const t = await setup()
    const { show } = await t.shows.add(t.input(THE_OFFICE))
    expect(
      show.seasons.map((s) => [s.seasonNumber, s.title, s.monitored, s.episodes.length]),
    ).toEqual([
      [0, 'Specials', false, 18],
      [1, 'Series 1', true, 6],
      [2, 'Series 2', true, 6],
    ])
    expect(show.seasons[0]?.path).toBe(join(show.path, 'Specials'))
    expect(show.seasons[0]?.episodes.every((e) => !e.monitored)).toBe(true)
    expect(t.rows('episode')).toHaveLength(30)
  })

  test('each monitor choice, as Sonarr’s', async () => {
    const t = await setup()
    const { show } = await t.shows.add(t.input(THE_OFFICE, { monitor: 'first-season' }))
    expect(show.monitored).toBe(true)
    expect(show.seasons.map((s) => [s.seasonNumber, s.monitored])).toEqual([
      [0, false],
      [1, true],
      [2, false],
    ])
    const t2 = await setup()
    const none = (await t2.shows.add(t2.input(CHERNOBYL, { monitor: 'none' }))).show
    expect(none.monitored).toBe(false)
    expect(none.status).toBe('unmonitored')
    expect(none.seasons[0]?.episodes.every((e) => !e.monitored && e.status === 'unmonitored')).toBe(
      true,
    )
    const t3 = await setup()
    // everything aired years ago: Future monitors nothing yet
    const future = (await t3.shows.add(t3.input(CHERNOBYL, { monitor: 'future' }))).show
    expect(future.seasons[0]?.episodes.some((e) => e.monitored)).toBe(false)
  })

  test('monitorsEpisode', () => {
    const ep = (season: number, aired: string | null) => ({
      id: 1,
      show: 1,
      season,
      number: 1,
      title: '',
      synopsis: '',
      aired,
      runtimeMinutes: null,
      still: null,
      rating: 0,
    })
    const today = '2026-11-18'
    expect(monitorsEpisode('all', ep(1, '2020-01-01'), today)).toBe(true)
    expect(monitorsEpisode('all', ep(0, '2020-01-01'), today)).toBe(false)
    expect(monitorsEpisode('missing', ep(3, null), today)).toBe(true)
    expect(monitorsEpisode('future', ep(1, '2026-12-01'), today)).toBe(true)
    expect(monitorsEpisode('future', ep(1, null), today)).toBe(true)
    expect(monitorsEpisode('future', ep(1, '2026-11-18'), today)).toBe(false)
    expect(monitorsEpisode('first-season', ep(2, null), today)).toBe(false)
    expect(monitorsEpisode('none', ep(1, null), today)).toBe(false)
  })

  test('without season folders, episodes are filed in the show’s folder', async () => {
    const t = await setup()
    const { show } = await t.shows.add(t.input(CHERNOBYL, { seasonFolders: false }))
    expect(show.seasonFolders).toBe(false)
    expect(show.seasons[0]?.path).toBe(show.path)
    expect(show.seasons[0]?.episodes[0]?.path).toBe(show.path)
  })

  test('refused: a folder that isn’t a shows folder, a profile that doesn’t exist', async () => {
    const t = await setup()
    const movies = join(t.folder.path, '..', 'movies')
    mkdirSync(movies)
    t.media.rootFolders.add(movies)
    const reason = (e: unknown) =>
      ((e as AppError).details as { reason?: string } | undefined)?.reason
    expect(
      reason(await t.shows.add(t.input(CHERNOBYL, { rootFolder: movies })).catch((e) => e)),
    ).toBe('unknown-root-folder')
    expect(
      reason(
        await t.shows.add(t.input(CHERNOBYL, { languageProfileId: 'lp-none' })).catch((e) => e),
      ),
    ).toBe('unknown-language-profile')
    expect(t.rows('show')).toHaveLength(0)
  })
})

describe('keeping in step with TMDB', () => {
  test('a refresh with nothing new changes nothing, however often', async () => {
    const t = await setup()
    await t.shows.add(t.input(THE_OFFICE))
    const before = t.db.select().from(schema.mediaItems).all()
    t.clock.advance(DAY)
    expect(t.shows.sync(THE_OFFICE)).toBe(false)
    t.shows.refresh(THE_OFFICE)
    await t.jobs.tick()
    await t.jobs.idle()
    expect(t.shows.sync(THE_OFFICE)).toBe(false)
    expect(t.db.select().from(schema.mediaItems).all()).toEqual(before)
  })

  test('a renumbered episode keeps its row, its version and its file', async () => {
    const t = await setup()
    await t.shows.add(t.input(CHERNOBYL))
    const ep = (tmdbId: number) =>
      t.db
        .select()
        .from(schema.mediaItems)
        .where(and(eq(schema.mediaItems.type, 'episode'), eq(schema.mediaItems.tmdbId, tmdbId)))
        .get()
    const two = ep(1747124)
    const three = ep(1747125)
    // TMDB swaps episodes 2 and 3
    t.editSeason(CHERNOBYL, 1, (d) => ({
      ...d,
      episodes: d.episodes.map((e) =>
        e.episode_number === 2
          ? { ...e, episode_number: 3 }
          : e.episode_number === 3
            ? { ...e, episode_number: 2 }
            : e,
      ),
    }))
    expect(t.shows.sync(CHERNOBYL)).toBe(true)
    expect(ep(1747124)).toMatchObject({ id: two?.id, episodeNumber: 3 })
    expect(ep(1747125)).toMatchObject({ id: three?.id, episodeNumber: 2 })
    expect(t.db.select().from(schema.versions).all()).toHaveLength(5)
    expect(t.shows.sync(CHERNOBYL)).toBe(false)
  })

  test('a new episode is added, monitored as its season is', async () => {
    const t = await setup()
    await t.shows.add(t.input(CHERNOBYL))
    t.editSeason(CHERNOBYL, 1, (d) => ({
      ...d,
      episodes: [
        ...d.episodes,
        { id: 9999001, season_number: 1, episode_number: 6, name: 'An Epilogue' },
      ],
    }))
    t.shows.sync(CHERNOBYL)
    const added = t.rows('episode').find((e) => e.tmdbId === 9999001)
    // no air date yet: not released
    expect(added).toMatchObject({ episodeNumber: 6, monitored: true, status: 'not-released' })
    expect(t.db.select().from(schema.versions).all()).toHaveLength(6)
  })

  test('an episode TMDB no longer lists goes, unless a file holds it', async () => {
    const t = await setup()
    await t.shows.add(t.input(CHERNOBYL))
    const show = t.shows.get(CHERNOBYL)
    const [e1, e2, , , e5] = show?.seasons[0]?.episodes ?? []
    if (!e1 || !e2 || !e5) throw new Error('no episodes')
    // one file holding episodes 1 and 2 (ADR 0064): filed under the first, both versions point at it
    t.db
      .insert(schema.mediaFiles)
      .values({
        id: 'fil_1',
        itemId: e1.id,
        path: join(show?.seasons[0]?.path ?? '', 'Chernobyl - S01E01-E02.mkv'),
        size: 1,
        addedAt: 0,
      })
      .run()
    t.db
      .update(schema.versions)
      .set({ fileId: 'fil_1' })
      .where(and(eq(schema.versions.itemId, e1.id)))
      .run()
    t.db
      .update(schema.versions)
      .set({ fileId: 'fil_1' })
      .where(eq(schema.versions.itemId, e2.id))
      .run()
    t.editSeason(CHERNOBYL, 1, (d) => ({
      ...d,
      episodes: d.episodes.filter((e) => ![1, 2, 5].includes(e.episode_number)),
    }))
    expect(t.shows.sync(CHERNOBYL)).toBe(true)
    const left = t.rows('episode').map((e) => e.id)
    expect(left).toContain(e1.id)
    expect(left).toContain(e2.id)
    expect(left).not.toContain(e5.id)
    expect(left).toHaveLength(4)
    expect(t.db.select().from(schema.versions).all()).toHaveLength(4)
  })

  test('the rows follow metadata.updated', async () => {
    const t = await setup()
    await t.shows.add(t.input(CHERNOBYL))
    t.editSeason(CHERNOBYL, 1, (d) => ({
      ...d,
      episodes: d.episodes.map((e) => (e.episode_number === 1 ? { ...e, name: 'Renamed' } : e)),
    }))
    t.events.emit({ topic: 'metadata.updated', ids: ['movie:19', 'show:87108'] })
    expect(t.rows('episode').find((e) => e.episodeNumber === 1)?.title).toBe('Renamed')
  })

  test('refreshing a show that isn’t here is refused', async () => {
    const t = await setup()
    expect(() => t.shows.refresh(CHERNOBYL)).toThrow('That show isn’t in the library.')
    expect(t.shows.get(CHERNOBYL)).toBeNull()
    expect(t.shows.sync(CHERNOBYL)).toBe(false)
  })
})

describe('what counts titles', () => {
  test('a show counts once in its folder and in its profile’s uses', async () => {
    const t = await setup()
    await t.shows.add(t.input(THE_OFFICE))
    try {
      t.media.rootFolders.remove(t.folder.id)
      throw new Error('expected a refusal')
    } catch (e) {
      expect((e as Error).message).toBe('A show is filed under that folder. Move it first.')
    }
    try {
      t.media.profiles.remove('qp-hd')
      throw new Error('expected a refusal')
    } catch (e) {
      expect((e as AppError).details).toMatchObject({ reason: 'in-use', movies: 1 })
    }
  })
})
