// SPDX-License-Identifier: AGPL-3.0-only
import { afterEach, describe, expect, test } from 'bun:test'
import { chmodSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { schema } from '@highsea/db'
import { eq } from 'drizzle-orm'
import { fold, isAvailable, safeName, sortTitleOf, statusOf } from '../src/index.ts'
import {
  BIG_BUCK_BUNNY,
  CAT_IN_THE_HAT,
  DAY,
  ELEPHANTS_DREAM,
  GRAN_DILLAMA,
  LLAMA_DRAMA,
  LLAMIGOS,
  M,
  MABUSE,
  METROPOLIS,
  NOSFERATU,
  reason,
  SINTEL,
  setup,
  TEARS_OF_STEEL,
  TRIP_TO_THE_MOON,
} from './helpers.ts'

let cleanups: (() => void)[] = []
async function start(options?: Parameters<typeof setup>[0]) {
  const s = await setup(options)
  cleanups.push(s.cleanup)
  return s
}
afterEach(() => {
  for (const c of cleanups) c()
  cleanups = []
})

describe('titles', () => {
  test('sort titles drop an English article and fold accents', () => {
    expect(sortTitleOf('The Matrix')).toBe('matrix')
    expect(sortTitleOf('A Trip to the Moon')).toBe('trip to the moon')
    expect(sortTitleOf('An American Werewolf in London')).toBe('american werewolf in london')
    expect(sortTitleOf('Amélie')).toBe('amelie')
    expect(sortTitleOf('The')).toBe('the')
    expect(fold('  Ça  Va ')).toBe('ca va')
  })

  test('folder names lose what common filesystems forbid', () => {
    expect(safeName('Mission: Impossible (1996)')).toBe('Mission Impossible (1996)')
    expect(safeName('What? / Why*')).toBe('What Why')
    expect(safeName('Trailing dots...')).toBe('Trailing dots')
    expect(safeName('???')).toBe('Untitled')
  })

  test('minimum availability follows the region’s dates', () => {
    const m = {
      releaseDate: '2026-07-29',
      releases: { theatrical: '2026-07-31', digital: null, physical: null },
    }
    expect(isAvailable(m, 'announced', '2026-01-01')).toBe(true)
    expect(isAvailable(m, 'in-cinemas', '2026-07-30')).toBe(false)
    expect(isAvailable(m, 'in-cinemas', '2026-07-31')).toBe(true)
    // no home release yet: 90 days after the cinemas
    expect(isAvailable(m, 'released', '2026-10-28')).toBe(false)
    expect(isAvailable(m, 'released', '2026-10-29')).toBe(true)
    const home = { ...m, releases: { ...m.releases, digital: '2026-09-01' } }
    expect(isAvailable(home, 'released', '2026-09-01')).toBe(true)
    const unknown = {
      releaseDate: null,
      releases: { theatrical: null, digital: null, physical: null },
    }
    expect(isAvailable(unknown, 'released', '2099-01-01')).toBe(false)
    expect(statusOf(false, true)).toBe('not-released')
    expect(statusOf(true, true)).toBe('wanted')
    expect(statusOf(true, false)).toBe('unmonitored')
  })
})

describe('adding', () => {
  test('a movie is added by its TMDB id, with TMDB’s facts and its first version', async () => {
    const { movies, add, folder, seen, fetch } = await start()
    const movie = await add(SINTEL)
    expect(movie).toMatchObject({
      id: SINTEL,
      type: 'movie',
      title: 'Sintel',
      sortTitle: 'sintel',
      year: 2010,
      status: 'wanted',
      monitored: true,
      minimumAvailability: 'released',
      languageProfileId: 'lp-en',
      qualityProfileId: 'qp-hd',
      rootFolder: folder.path,
      path: join(folder.path, 'Sintel (2010)'),
      gone: false,
    })
    expect(movie.versions).toEqual([
      { id: expect.any(String), label: '1080p', qualityProfileId: 'qp-hd', fileId: null },
    ])
    expect(movie.rating).toBeGreaterThan(0)
    expect(movie.rating).toBeLessThanOrEqual(5)
    expect(movie.genres.length).toBeGreaterThan(0)
    expect(movie.art.poster).toStartWith('/api/v1/images/movie/45745/poster/')
    expect(movie.addedAt).toBe('2026-10-17T20:15:00.000Z')
    expect(fetch.requests.some((r) => r.includes('/3/movie/45745'))).toBe(true)
    expect(seen.map((e) => [e.topic, e.ids])).toEqual([
      ['movies.updated', ['45745']],
      ['item.updated', ['movie:45745']],
    ])
    expect(movies.get(SINTEL)).toEqual(movie)
  })

  test('opening a movie the server has never seen fetches it, and writes no library rows', async () => {
    const { movies, metadata, db, add } = await start()
    const meta = await metadata.movie(METROPOLIS)
    expect(meta.title).toBe('Metropolis')
    expect(movies.inLibrary([METROPOLIS]).size).toBe(0)
    expect(await reason(() => movies.get(METROPOLIS))).toBe('not-found:undefined')
    expect(db.select().from(schema.mediaItems).all()).toEqual([])
    const added = await add(METROPOLIS)
    expect(added.title).toBe('Metropolis')
    expect(movies.inLibrary([METROPOLIS, SINTEL])).toEqual(new Set([METROPOLIS]))
  })

  test('adding twice is one movie, returned unchanged', async () => {
    const { movies, input, db, seen } = await start()
    const first = await movies.add(input(SINTEL))
    seen.length = 0
    const again = await movies.add(
      input(SINTEL, { monitored: false, versions: [{ label: '4K', qualityProfileId: 'qp-uhd' }] }),
    )
    expect(first.created).toBe(true)
    expect(again).toEqual({ movie: first.movie, created: false })
    expect(db.select().from(schema.mediaItems).all()).toHaveLength(1)
    expect(db.select().from(schema.versions).all()).toHaveLength(1)
    expect(seen).toEqual([])
  })

  test('two adds of one movie at once make one movie', async () => {
    const { movies, input, db } = await start()
    const [a, b] = await Promise.all([movies.add(input(SINTEL)), movies.add(input(SINTEL))])
    expect([a.created, b.created].sort()).toEqual([false, true])
    expect(a.movie.versions).toEqual(b.movie.versions)
    expect(db.select().from(schema.mediaItems).all()).toHaveLength(1)
  })

  test('what adding refuses, before writing anything', async () => {
    const { movies, input, db } = await start()
    expect(await reason(() => movies.add(input(SINTEL, { searchNow: true })))).toBe(
      'conflict:no-indexers',
    )
    expect(await reason(() => movies.add(input(SINTEL, { rootFolder: '/elsewhere' })))).toBe(
      'invalid:unknown-root-folder',
    )
    expect(
      await reason(() =>
        movies.add(input(SINTEL, { versions: [{ label: 'x', qualityProfileId: 'qp-nope' }] })),
      ),
    ).toBe('not-found:unknown-quality-profile')
    expect(
      await reason(() =>
        movies.add(
          input(SINTEL, {
            versions: [
              { label: '1080p', qualityProfileId: 'qp-hd' },
              { label: '1080P', qualityProfileId: 'qp-uhd' },
            ],
          }),
        ),
      ),
    ).toBe('invalid:duplicate-label')
    expect(await reason(() => movies.add(input(999999999)))).toBe('not-found:undefined')
    expect(db.select().from(schema.mediaItems).all()).toEqual([])
  })

  test('without a TMDB key, adding says so', async () => {
    const { movies, input } = await start({ key: false })
    expect(await reason(() => movies.add(input(SINTEL)))).toBe('unavailable:no-tmdb-key')
  })

  test('a movie before its minimum availability is not released', async () => {
    const { add, movies } = await start()
    expect((await add(CAT_IN_THE_HAT)).status).toBe('not-released')
    expect((await add(SINTEL, { monitored: false })).status).toBe('unmonitored')
    expect(movies.update(CAT_IN_THE_HAT, { minimumAvailability: 'announced' }).status).toBe(
      'wanted',
    )
  })
})

describe('editing', () => {
  test('update changes monitoring, availability, languages and the folder', async () => {
    const { movies, add, dir, seen } = await start()
    await add(SINTEL)
    const other = join(dir, 'movies-4k')
    mkdirSync(other)
    movies.rootFolders.add(other)
    seen.length = 0
    const m = movies.update(SINTEL, {
      monitored: false,
      languageProfileId: null,
      rootFolder: `${other}/`,
    })
    expect(m).toMatchObject({
      monitored: false,
      status: 'unmonitored',
      languageProfileId: null,
      rootFolder: other,
      path: join(other, 'Sintel (2010)'),
    })
    expect(seen.map((e) => e.topic)).toEqual(['movies.updated', 'item.updated'])
    expect(await reason(() => movies.update(SINTEL, { rootFolder: '/nowhere' }))).toBe(
      'invalid:unknown-root-folder',
    )
    expect(await reason(() => movies.update(METROPOLIS, { monitored: true }))).toBe(
      'not-found:undefined',
    )
  })

  test('versions: add, rename, change the profile, and never remove the last', async () => {
    const { movies, add } = await start()
    const m = await add(SINTEL)
    const first = m.versions[0]?.id as string
    const two = movies.versions.add(SINTEL, { label: '4K HDR', qualityProfileId: 'qp-uhd' })
    expect(two.versions.map((v) => [v.label, v.qualityProfileId])).toEqual([
      ['1080p', 'qp-hd'],
      ['4K HDR', 'qp-uhd'],
    ])
    const second = two.versions[1]?.id as string
    expect(
      movies.versions.update(SINTEL, second, { label: 'UHD' }).versions.map((v) => v.label),
    ).toEqual(['1080p', 'UHD'])
    // the first version's profile is the movie's
    const changed = movies.versions.update(SINTEL, first, { qualityProfileId: 'qp-any' })
    expect(changed.qualityProfileId).toBe('qp-any')
    expect(await reason(() => movies.versions.update(SINTEL, second, { label: '1080p' }))).toBe(
      'invalid:duplicate-label',
    )
    expect(await reason(() => movies.versions.update(SINTEL, 'ver_nope', { label: 'x' }))).toBe(
      'not-found:undefined',
    )
    // removing the first makes the next one first
    const left = movies.versions.remove(SINTEL, first)
    expect(left.versions.map((v) => v.label)).toEqual(['UHD'])
    expect(left.qualityProfileId).toBe('qp-uhd')
    expect(await reason(() => movies.versions.remove(SINTEL, second))).toBe('conflict:last-version')
  })

  test('refresh queues the metadata job', async () => {
    const { movies, add, jobs } = await start()
    await add(SINTEL)
    movies.refresh(SINTEL)
    movies.refresh(SINTEL)
    const queued = jobs.list({ status: ['queued'] }).filter((j) => j.type === 'metadata.refresh')
    expect(queued).toHaveLength(1)
    expect(await reason(() => movies.refresh(METROPOLIS))).toBe('not-found:undefined')
  })

  test('the library follows metadata.updated', async () => {
    const { movies, add, db, events, seen } = await start()
    await add(SINTEL)
    const row = db
      .select()
      .from(schema.movieMetadata)
      .where(eq(schema.movieMetadata.tmdbId, SINTEL))
      .get()
    db.update(schema.movieMetadata)
      .set({ data: { ...(row?.data as object), title: 'The Sintel', vote_average: 9 } })
      .where(eq(schema.movieMetadata.tmdbId, SINTEL))
      .run()
    seen.length = 0
    events.emit({ topic: 'metadata.updated', ids: [`movie:${SINTEL}`, 'person:68'] })
    const m = movies.get(SINTEL)
    expect(m).toMatchObject({ title: 'The Sintel', sortTitle: 'sintel', rating: 4.5 })
    // the folder stays where the files are
    expect(m.path).toEndWith('Sintel (2010)')
    expect(seen.map((e) => e.topic)).toContain('item.updated')
    // nothing changed the second time: nothing announced
    seen.length = 0
    events.emit({ topic: 'metadata.updated', ids: [`movie:${SINTEL}`] })
    expect(seen.map((e) => e.topic)).toEqual(['metadata.updated'])
  })

  test('the availability job moves released movies on, and is safe to repeat', async () => {
    const { movies, add, clock, jobs } = await start()
    await add(CAT_IN_THE_HAT, { minimumAvailability: 'in-cinemas' })
    expect(movies.jobs.checkAvailability()).toBe(0)
    // the US theatrical date is 2026-11-06
    clock.set(Date.UTC(2026, 10, 7))
    movies.jobs.schedule(clock.now())
    clock.advance(10 * 60_000)
    await jobs.tick()
    await jobs.idle()
    expect(movies.get(CAT_IN_THE_HAT).status).toBe('wanted')
    expect(movies.jobs.checkAvailability()).toBe(0)
  })
})

describe('bulk edits', () => {
  test('setQualityProfile moves the first version only', async () => {
    const { movies, add } = await start()
    await add(SINTEL)
    await add(METROPOLIS)
    movies.versions.add(SINTEL, { label: '4K', qualityProfileId: 'qp-uhd' })
    const result = movies.bulk({
      action: 'setQualityProfile',
      ids: [SINTEL, METROPOLIS, NOSFERATU],
      qualityProfileId: 'qp-any',
    })
    expect(result).toEqual({
      ids: expect.arrayContaining([SINTEL, METROPOLIS]),
      missing: [NOSFERATU],
    })
    expect(movies.get(SINTEL).versions.map((v) => v.qualityProfileId)).toEqual(['qp-any', 'qp-uhd'])
    expect(movies.get(SINTEL).qualityProfileId).toBe('qp-any')
    expect(movies.get(METROPOLIS).qualityProfileId).toBe('qp-any')
    expect(movies.list({ qualityProfileId: 'qp-any' }).total).toBe(2)
    expect(
      await reason(() =>
        movies.bulk({ action: 'setQualityProfile', ids: [SINTEL], qualityProfileId: 'qp-nope' }),
      ),
    ).toBe('not-found:unknown-quality-profile')
  })

  test('monitor and unmonitor keep a not-released movie not released', async () => {
    const { movies, add } = await start()
    await add(SINTEL)
    await add(CAT_IN_THE_HAT)
    movies.bulk({ action: 'unmonitor', ids: [SINTEL, CAT_IN_THE_HAT] })
    expect(movies.get(SINTEL)).toMatchObject({ monitored: false, status: 'unmonitored' })
    expect(movies.get(CAT_IN_THE_HAT)).toMatchObject({ monitored: false, status: 'not-released' })
    movies.bulk({ action: 'monitor', ids: [SINTEL] })
    expect(movies.get(SINTEL)).toMatchObject({ monitored: true, status: 'wanted' })
  })

  test('search waits for indexers; refresh queues; delete removes', async () => {
    const { movies, add, jobs, metadata } = await start()
    await add(SINTEL)
    await add(METROPOLIS)
    expect(await reason(() => movies.bulk({ action: 'search', ids: [SINTEL] }))).toBe(
      'conflict:no-indexers',
    )
    movies.bulk({ action: 'refresh', ids: [SINTEL, METROPOLIS] })
    expect(
      jobs.list({ status: ['queued'] }).filter((j) => j.type === 'metadata.refresh'),
    ).toHaveLength(2)
    expect(movies.bulk({ action: 'delete', ids: [SINTEL, METROPOLIS], deleteFiles: true })).toEqual(
      {
        ids: expect.arrayContaining([SINTEL, METROPOLIS]),
        missing: [],
      },
    )
    expect(movies.list().total).toBe(0)
    // the metadata stays cached: the pages keep working
    expect(metadata.cachedMovie(SINTEL)?.title).toBe('Sintel')
  })
})

describe('deleting', () => {
  test('with and without deleteFiles, the library rows go and the cache stays', async () => {
    const { movies, add, db, metadata, seen, person } = await start()
    await add(SINTEL)
    await add(METROPOLIS)
    const u = person()
    const item = db.select().from(schema.mediaItems).all()[0]
    db.insert(schema.watchPositions)
      .values({
        userId: u,
        itemId: item?.id as string,
        positionSeconds: 60,
        durationSeconds: 900,
        updatedAt: 0,
      })
      .run()
    seen.length = 0
    movies.delete(SINTEL)
    movies.delete(METROPOLIS, { deleteFiles: true })
    expect(seen.filter((e) => e.topic === 'item.updated').map((e) => e.ids)).toEqual([
      [`movie:${SINTEL}`],
      [`movie:${METROPOLIS}`],
    ])
    expect(db.select().from(schema.mediaItems).all()).toEqual([])
    expect(db.select().from(schema.versions).all()).toEqual([])
    expect(db.select().from(schema.watchPositions).all()).toEqual([])
    expect(metadata.cachedMovie(SINTEL)).not.toBeNull()
    expect(await reason(() => movies.delete(SINTEL))).toBe('not-found:undefined')
  })
})

describe('collections and people', () => {
  test('a collection’s parts and a filmography say which titles are here', async () => {
    const { movies, add, metadata } = await start()
    await add(LLAMA_DRAMA)
    const collection = await metadata.collection(339473)
    const parts = movies.decorate(collection.parts)
    expect(parts.map((p) => [p.id, p.inLibrary])).toEqual([
      [LLAMA_DRAMA, true],
      [GRAN_DILLAMA, false],
      [LLAMIGOS, false],
    ])
    expect(parts.every((p) => p.rating >= 0 && p.rating <= 5)).toBe(true)

    await add(METROPOLIS)
    await add(M)
    const lang = await metadata.person(68)
    const credits = movies.decorate(lang.credits)
    const here = new Set(credits.filter((c) => c.inLibrary).map((c) => c.id))
    expect(here).toEqual(new Set([METROPOLIS, M]))
    expect(credits.some((c) => c.id === MABUSE && !c.inLibrary)).toBe(true)
  })
})

describe('the list', () => {
  async function library() {
    const s = await start()
    const add = async (id: number, patch?: Parameters<typeof s.add>[1]) => {
      await s.add(id, patch)
      s.clock.advance(60_000)
    }
    await add(SINTEL)
    await add(BIG_BUCK_BUNNY)
    await add(TEARS_OF_STEEL, { monitored: false })
    await add(ELEPHANTS_DREAM, { versions: [{ label: '4K', qualityProfileId: 'qp-uhd' }] })
    s.clock.advance(DAY)
    await add(METROPOLIS)
    await add(NOSFERATU)
    await add(TRIP_TO_THE_MOON)
    await add(CAT_IN_THE_HAT)
    return s
  }
  const titles = (page: { items: { title: string }[] }) => page.items.map((m) => m.title)

  test('sorts by title A to Z by default, ignoring a leading article', async () => {
    const { movies } = await library()
    expect(titles(movies.list())).toEqual([
      'Big Buck Bunny',
      'The Cat in the Hat',
      'Elephants Dream',
      'Metropolis',
      'Nosferatu',
      'Sintel',
      'Tears of Steel',
      'A Trip to the Moon',
    ])
    expect(titles(movies.list({ dir: 'desc' }))[0]).toBe('A Trip to the Moon')
  })

  test('sorts by year, rating and date added, newest or highest first', async () => {
    const { movies } = await library()
    const years = movies.list({ sort: 'year' }).items.map((m) => m.year)
    expect(years).toEqual([...years].sort((a, b) => (b ?? 0) - (a ?? 0)))
    expect(movies.list({ sort: 'year', dir: 'asc' }).items[0]?.title).toBe('A Trip to the Moon')
    const ratings = movies.list({ sort: 'rating' }).items.map((m) => m.rating)
    expect(ratings).toEqual([...ratings].sort((a, b) => b - a))
    const added = titles(movies.list({ sort: 'added', limit: 4 }))
    expect(added.sort()).toEqual([
      'A Trip to the Moon',
      'Metropolis',
      'Nosferatu',
      'The Cat in the Hat',
    ])
  })

  test('filters, with counts per status over every other filter', async () => {
    const { movies } = await library()
    const all = movies.list()
    expect(all.total).toBe(8)
    expect(all.counts).toEqual({
      all: 8,
      available: 0,
      wanted: 6,
      downloading: 0,
      'not-released': 1,
      unmonitored: 1,
    })
    const wanted = movies.list({ status: 'wanted' })
    expect(wanted.total).toBe(6)
    expect(wanted.counts.all).toBe(8)
    expect(titles(movies.list({ monitored: 'false' }))).toEqual(['Tears of Steel'])
    expect(titles(movies.list({ monitored: true, status: 'unmonitored' }))).toEqual([])
    expect(titles(movies.list({ qualityProfileId: 'qp-uhd' }))).toEqual(['Elephants Dream'])
    expect(titles(movies.list({ title: 'of' }))).toEqual(['Tears of Steel'])
    expect(titles(movies.list({ title: 'TRIP' }))).toEqual(['A Trip to the Moon'])
    expect(titles(movies.list({ title: '%' }))).toEqual([])
    const filtered = movies.list({ title: 'e', status: 'wanted' })
    expect(filtered.counts.all).toBe(
      filtered.counts.wanted + filtered.counts['not-released'] + filtered.counts.unmonitored,
    )
  })

  test('cursors page through every sort without gaps or repeats', async () => {
    const { movies } = await library()
    for (const sort of ['title', 'added', 'year', 'rating'] as const)
      for (const dir of ['asc', 'desc'] as const) {
        const seen: number[] = []
        let cursor: string | undefined
        do {
          const page = movies.list({ sort, dir, cursor, limit: 3 })
          seen.push(...page.items.map((m) => m.id))
          cursor = page.next ?? undefined
        } while (cursor)
        expect({ sort, dir, ids: seen }).toEqual({
          sort,
          dir,
          ids: movies.list({ sort, dir }).items.map((m) => m.id),
        })
      }
  })

  test('undated movies page after the dated ones, newest first', async () => {
    const { movies, db } = await library()
    db.update(schema.mediaItems)
      .set({ year: null })
      .where(eq(schema.mediaItems.tmdbId, CAT_IN_THE_HAT))
      .run()
    const desc = movies.list({ sort: 'year' }).items
    expect(desc[desc.length - 1]?.id).toBe(CAT_IN_THE_HAT)
    const asc = movies.list({ sort: 'year', dir: 'asc' }).items
    expect(asc[0]?.id).toBe(CAT_IN_THE_HAT)
    const ids: number[] = []
    let cursor: string | undefined
    do {
      const page = movies.list({ sort: 'year', dir: 'asc', cursor, limit: 1 })
      ids.push(...page.items.map((m) => m.id))
      cursor = page.next ?? undefined
    } while (cursor)
    expect(ids).toEqual(asc.map((m) => m.id))
  })

  test('a cursor from another sort is refused', async () => {
    const { movies } = await library()
    const next = movies.list({ limit: 2 }).next as string
    expect(await reason(() => movies.list({ sort: 'year', cursor: next }))).toBe(
      'invalid:bad-cursor',
    )
    expect(await reason(() => movies.list({ cursor: 'garbage' }))).toBe('invalid:bad-cursor')
  })

  test('upcoming and recent', async () => {
    const { movies } = await library()
    expect(movies.upcoming(30).map((m) => m.id)).toEqual([CAT_IN_THE_HAT])
    expect(movies.upcoming(7)).toEqual([])
    expect(movies.recent(2).map((m) => m.id)).toEqual([CAT_IN_THE_HAT, TRIP_TO_THE_MOON])
  })
})

describe('root folders', () => {
  test('adding checks the path; the list reads the disk', async () => {
    const { movies, dir, folder } = await start()
    expect(await reason(() => movies.rootFolders.add('relative/path'))).toBe('invalid:not-absolute')
    expect(await reason(() => movies.rootFolders.add(join(dir, 'missing')))).toBe(
      'invalid:not-found',
    )
    writeFileSync(join(dir, 'file'), 'x')
    expect(await reason(() => movies.rootFolders.add(join(dir, 'file')))).toBe('invalid:not-found')
    const locked = join(dir, 'locked')
    mkdirSync(locked)
    chmodSync(locked, 0o555)
    // root may write anywhere: the check only means something for other users
    if (process.getuid?.() !== 0)
      expect(await reason(() => movies.rootFolders.add(locked))).toBe('invalid:not-writable')
    chmodSync(locked, 0o755)
    expect(await reason(() => movies.rootFolders.add(folder.path))).toBe('conflict:exists')
    mkdirSync(join(folder.path, 'inner'))
    expect(await reason(() => movies.rootFolders.add(join(folder.path, 'inner')))).toBe(
      'conflict:overlaps',
    )
    expect(await reason(() => movies.rootFolders.add(dir))).toBe('conflict:overlaps')

    const [listed] = movies.rootFolders.list()
    expect(listed).toMatchObject({ id: folder.id, path: folder.path, accessible: true, movies: 0 })
    expect(listed?.free).toBeGreaterThan(0)
    expect(listed?.total).toBeGreaterThanOrEqual(listed?.free ?? 0)
    expect(listed?.device).toEqual(expect.any(String))
  })

  test('a folder in use can’t be removed; an unused one can', async () => {
    const { movies, add, folder, dir } = await start()
    await add(SINTEL)
    expect(movies.rootFolders.list()[0]?.movies).toBe(1)
    expect(await reason(() => movies.rootFolders.remove(folder.id))).toBe('conflict:in-use')
    const other = join(dir, 'other')
    mkdirSync(other)
    const added = movies.rootFolders.add(other)
    movies.rootFolders.remove(added.id)
    expect(movies.rootFolders.list().map((f) => f.path)).toEqual([folder.path])
    expect(await reason(() => movies.rootFolders.remove('rf_nope'))).toBe('not-found:undefined')
  })

  test('a folder that went away reads as inaccessible', async () => {
    const { movies, dir } = await start()
    const gone = join(dir, 'gone')
    mkdirSync(gone)
    movies.rootFolders.add(gone)
    const { rmSync } = await import('node:fs')
    rmSync(gone, { recursive: true })
    expect(movies.rootFolders.list().find((f) => f.path === gone)).toMatchObject({
      accessible: false,
      free: null,
      device: null,
    })
  })
})

describe('profiles, formats and sizes', () => {
  test('seeds are idempotent and never overwrite the owner’s', async () => {
    const { movies, db } = await start()
    expect(movies.profiles.list().map((p) => p.id)).toEqual(['qp-uhd', 'qp-hd', 'qp-any'])
    expect(
      movies
        .customFormats()
        .map((f) => f.id)
        .sort(),
    ).toEqual(['cf-dv', 'cf-hdr10', 'cf-lq', 'cf-x265'])
    movies.seed()
    expect(movies.profiles.list()).toHaveLength(3)
    // the owner renames one and removes another: seeding again leaves both alone
    db.update(schema.qualityProfiles)
      .set({ data: { ...movies.profiles.get('qp-hd'), name: 'Mine' } })
      .where(eq(schema.qualityProfiles.id, 'qp-hd'))
      .run()
    db.delete(schema.qualityProfiles).where(eq(schema.qualityProfiles.id, 'qp-any')).run()
    movies.seed()
    expect(movies.profiles.list().map((p) => [p.id, p.name])).toEqual([
      ['qp-uhd', expect.any(String)],
      ['qp-hd', 'Mine'],
    ])
    expect(await reason(() => movies.profiles.get('qp-any'))).toBe(
      'not-found:unknown-quality-profile',
    )
  })

  test('quality sizes come from the settings row, defaults filling gaps', async () => {
    const { movies, db } = await start()
    const sizes = movies.qualitySizes()
    expect(sizes[0]?.quality).toBe('Unknown')
    expect(sizes.find((s) => s.quality === 'Bluray-1080p')?.min).toBe(50.8)
    db.update(schema.settings)
      .set({ value: [{ quality: 'Bluray-1080p', min: 10, preferred: 20, max: 30 }] })
      .where(eq(schema.settings.key, 'qualitySizes'))
      .run()
    movies.seed()
    const after = movies.qualitySizes()
    expect(after).toHaveLength(sizes.length)
    expect(after.find((s) => s.quality === 'Bluray-1080p')).toEqual({
      quality: 'Bluray-1080p',
      min: 10,
      preferred: 20,
      max: 30,
    })
    expect(after.find((s) => s.quality === 'Remux-2160p')?.min).toBe(187.4)
  })

  test('language profiles are English alone until checkpoint 7', async () => {
    const { movies } = await start()
    expect(movies.languageProfiles().map((p) => p.id)).toEqual(['lp-en'])
  })
})

describe('parse', () => {
  test('a release name, its quality, formats, scores and the library movie', async () => {
    const { movies, add } = await start()
    await add(SINTEL)
    const r = movies.parse('Sintel.2010.2160p.UHD.BluRay.x265.DV.HDR10-GROUP')
    expect(r.release).toMatchObject({ title: 'Sintel', year: 2010 })
    expect(r.quality).toBe('Bluray-2160p')
    expect(r.formats.map((f) => f.id)).toEqual(expect.arrayContaining(['cf-dv', 'cf-x265']))
    expect(r.scores.map((s) => s.profileId)).toEqual(['qp-uhd', 'qp-hd', 'qp-any'])
    expect(r.movie).toEqual({ id: SINTEL, title: 'Sintel', year: 2010 })
    expect(movies.parse('Sintel.2011.1080p.WEB-DL').movie?.id).toBe(SINTEL)
    expect(movies.parse('Metropolis.1927.1080p.BluRay').movie).toBeNull()
    expect(movies.parse('Something.Else.tmdbid-45745.1080p').movie?.id).toBe(SINTEL)
  })
})

describe('the client API', () => {
  test('the list carries each person’s place in each title', async () => {
    const { movies, add, db, person } = await start()
    await add(SINTEL)
    await add(METROPOLIS)
    const u = person()
    const sintel = db
      .select()
      .from(schema.mediaItems)
      .where(eq(schema.mediaItems.tmdbId, SINTEL))
      .get()
    db.insert(schema.watchPositions)
      .values({
        userId: u,
        itemId: sintel?.id as string,
        positionSeconds: 300,
        durationSeconds: 900,
        updatedAt: 0,
      })
      .run()
    const page = movies.client.list({}, u)
    expect(page.total).toBe(2)
    expect(page.items.map((i) => [i.title, i.progress, i.position, i.playable])).toEqual([
      ['Metropolis', null, 0, false],
      ['Sintel', 0.333, 300, false],
    ])
    expect(movies.client.list({}, person()).items[1]?.progress).toBeNull()
    expect(movies.client.list({ playable: 'true' }, u).total).toBe(0)
    const genre = movies.get(METROPOLIS).genres[0] as string
    expect(movies.client.list({ genre: genre.toUpperCase() }, u).items.map((i) => i.id)).toContain(
      METROPOLIS,
    )
  })

  test('an item has its people, videos, versions and related titles here', async () => {
    const { movies, add, person } = await start()
    await add(METROPOLIS)
    const detail = await movies.client.item('movie', METROPOLIS, person())
    expect(detail.item.title).toBe('Metropolis')
    expect(detail.directors.map((d) => d.name)).toContain('Fritz Lang')
    expect(detail.cast.length).toBeGreaterThan(0)
    expect(new Set(detail.cast.map((c) => c.id)).size).toBe(detail.cast.length)
    expect(detail.versions).toEqual([
      { id: expect.any(String), label: '1080p', detail: null, playable: false },
    ])
    // none of its recommendations are here
    expect(detail.related).toEqual([])
    // Elephants Dream's recommendations include Sintel
    await add(ELEPHANTS_DREAM)
    await add(SINTEL)
    const dream = await movies.client.item('movie', ELEPHANTS_DREAM, person())
    expect(dream.related.map((r) => r.id)).toEqual([SINTEL])
    expect(await reason(() => movies.client.item('movie', NOSFERATU, 'u'))).toBe(
      'not-found:undefined',
    )
  })

  test('search finds titles, collections and people, the best-matching kind first', async () => {
    const { movies, add, person } = await start()
    await add(LLAMA_DRAMA)
    await add(GRAN_DILLAMA)
    await add(METROPOLIS)
    const u = person()
    const caminandes = await movies.client.search('caminandes', { userId: u, mayAdd: false })
    expect(caminandes.sections.map((s) => s.kind)).toEqual(['movies', 'collections'])
    const collection = caminandes.sections[1]
    expect(collection?.kind === 'collections' && collection.items[0]).toMatchObject({
      id: 339473,
      count: 2,
      years: '2013',
    })
    const lang = await movies.client.search('lang', { userId: u, mayAdd: false })
    expect(lang.sections[0]?.kind).toBe('people')
    expect(lang.sections[0]?.kind === 'people' && lang.sections[0].items[0]).toMatchObject({
      id: 68,
      name: 'Fritz Lang',
      titles: 1,
    })
    // Metropolis by its director
    expect(
      lang.sections.find((s) => s.kind === 'movies')?.items.map((i) => (i as { id: number }).id),
    ).toEqual([METROPOLIS])
    expect(await movies.client.search('  ', { userId: u, mayAdd: true })).toEqual({ sections: [] })
  })

  test('people who may add also get TMDB’s matches that aren’t here', async () => {
    const { movies, add, person } = await start()
    await add(LLAMA_DRAMA)
    const u = person()
    const r = await movies.client.search('caminandes', { userId: u, mayAdd: true })
    const discover = r.sections.find((s) => s.kind === 'discover')
    expect(discover?.items.length).toBeGreaterThan(0)
    expect(discover?.items.some((m) => (m as { id: number }).id === LLAMA_DRAMA)).toBe(false)
    const offline = await start({ key: false })
    await offline.db.insert(schema.users).values({
      id: 'x',
      username: 'x',
      displayName: 'x',
      role: 'member',
      webauthnId: 'w-x',
      createdAt: 0,
      updatedAt: 0,
    })
    expect(await offline.movies.client.search('caminandes', { userId: 'x', mayAdd: true })).toEqual(
      {
        sections: [],
      },
    )
  })
})
