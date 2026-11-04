// SPDX-License-Identifier: AGPL-3.0-only
// The films apps' reads through the SDK's own client (films.ts), against the real server's rules
// (each test names the code it pins): every answer exactly its contract schema, the seeded ids with
// every part a screen draws, Home's rows, the library's pages, Search's ranking, a person's
// filmography, the collections' order and watch state; the same answers under another clock and
// time zone; and the empty server.
import { describe, expect, test } from 'bun:test'
import { join } from 'node:path'
import { type ClientItem, routes } from '@highsea-tv/api-contract'
import { matchScore, sortTitleOf } from '@highsea-tv/media/search'
import {
  type CreditEntry,
  filmography,
  GENRE_ROWS_MAX,
  PAGE_DEFAULT,
  ROW_MAX,
  SEARCH_MAX,
  SEED,
  tmdbNumber,
  WATCHED_AT,
} from '@highsea-tv/mock/films'
import { collectionRefs, knownTitles, movieMetadata } from '@highsea-tv/mock/metadata'
import { createMock } from '@highsea-tv/mock/mock'
import { memoryStorage } from '@highsea-tv/mock/transport'
import type { MediaItem } from '@highsea-tv/mock/types'
import { ApiError } from '@highsea-tv/sdk'
import { everything, parse, signedIn } from './fixtures/films-reads.ts'

const RUTH = 'u-ruth'
const movie = { type: 'movie' as const, id: SEED.film.id }

const caught = async (p: Promise<unknown>) => {
  try {
    await p
  } catch (e) {
    return e as ApiError
  }
  throw new Error('it answered')
}
const reasonOf = (e: ApiError) => (e.details as { reason?: string } | undefined)?.reason

const until = async (check: () => boolean, ms = 1000) => {
  const end = Date.now() + ms
  while (!check()) {
    if (Date.now() > end) throw new Error('timed out')
    await new Promise((r) => setTimeout(r, 5))
  }
}

/** A mock of its own, signed in as Ruth, with its state to arrange and to check against. */
async function arranged(arrange?: (state: ReturnType<typeof stateOf>) => void) {
  const mock = createMock(memoryStorage())
  const state = stateOf(mock)
  arrange?.(state)
  return { a: await signedIn({ mock }), state }
}
const stateOf = (mock: ReturnType<typeof createMock>) => mock.servers.populated.state

const byCode = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)
const playable = (m: MediaItem) => m.type === 'movie' && m.versions.some((v) => v.fileId)
const filmsIn = (state: ReturnType<typeof stateOf>) => state.items.filter((m) => m.type === 'movie')
const idsOf = (items: { id: number }[]) => items.map((i) => i.id)

describe('the films reads', () => {
  test('every answer is exactly its schema, and the seeded ids have every part', async () => {
    const all = await everything(await signedIn())
    for (const [route, value] of Object.values(all))
      expect(parse(route, value)).toStrictEqual(value)
    const [, item] = all.item
    const [, person] = all.person
    const [, collection] = all.collection
    expect(item.item.title).toBe(SEED.film.title)
    expect(item.item.art.backdrop).toBeTruthy()
    expect(item.cast.length).toBeGreaterThan(0)
    expect(item.directors.length).toBeGreaterThan(0)
    expect(item.crew.length).toBeGreaterThan(0)
    expect(item.versions.some((v) => v.playable && v.audio.length > 0)).toBe(true)
    expect(person.name).toBe(SEED.person.name)
    expect(person.bio?.length).toBeGreaterThan(0)
    expect(person.credits.some((c) => c.inLibrary)).toBe(true)
    expect(collection.collection.name).toBe(SEED.collection.name)
    expect(collection.items.length).toBeGreaterThan(1)
  })

  test('the empty server answers in every schema, with nothing in it', async () => {
    const a = await signedIn({ state: { data: 'empty' } })
    expect(await a.home.sections({ query: {} })).toEqual([])
    const list = await a.library.list({ query: {} })
    expect(parse(routes.library.list, list)).toStrictEqual({ items: [], next: null, total: 0 })
    expect(await a.library.collections({ query: {} })).toEqual([])
    expect(await a.library.search({ query: { query: 'tears' } })).toEqual({ sections: [] })
    const missing = await caught(a.library.item({ params: movie }))
    expect(missing).toBeInstanceOf(ApiError)
    expect(missing.status).toBe(404)
    expect(missing.message).toBe('That movie isn’t in the library.')
  })
})

// curation's `homeFor` over the runtime's `builtIn` and `homeRows`
describe('Home', () => {
  test('the hero on top, Continue watching, the featured rows, Recently added, then the genres', async () => {
    const { a, state } = await arranged()
    const home = await a.home.sections({ query: { client: 'tvos' } })
    const films = filmsIn(state)
    const watchable = films.filter(playable)

    // Continue watching: Ruth's places part way, newest first, named by each app
    const places = state.watch
      .filter((w) => w.userId === RUTH)
      .sort((x, y) => byCode(y.updatedAt, x.updatedAt))
      .flatMap((w) => {
        const m = watchable.find((f) => f.id === w.itemId)
        const p = m ? w.position / (m.runtimeMinutes * 60) : 0
        return m && p > 0 && p < WATCHED_AT ? [m.tmdbId] : []
      })
    const continuing = home.find((s) => s.id === 'continue')
    expect(continuing).toMatchObject({ title: null, suffix: null, layout: 'continue' })
    expect(idsOf(continuing?.items ?? [])).toEqual(places.slice(0, ROW_MAX))

    // Recently added: the 20 newest that play
    const recent = [...watchable]
      .sort((x, y) => Date.parse(y.addedAt) - Date.parse(x.addedAt) || byCode(x.id, y.id))
      .slice(0, ROW_MAX)
      .map((m) => m.tmdbId)
    const row = home.find((s) => s.id === 'recent')
    expect(row).toMatchObject({ title: null, suffix: null, layout: 'row' })
    expect(idsOf(row?.items ?? [])).toEqual(recent)

    // the genres with most titles, up to 8, each highest rated first
    const counts = new Map<string, number>()
    for (const m of films) for (const g of m.genres) counts.set(g, (counts.get(g) ?? 0) + 1)
    const genres = [...counts.entries()]
      .sort((x, y) => y[1] - x[1] || byCode(x[0], y[0]))
      .slice(0, GENRE_ROWS_MAX)
      .map(([g]) => g)
      .filter((g) => watchable.some((m) => m.genres.includes(g)))
    const genreRows = home.filter((s) => s.id.startsWith('genre:'))
    expect(genreRows.map((s) => s.title)).toEqual(genres)
    for (const s of genreRows) {
      expect(s.id).toBe(`genre:${tmdbNumber(`genre:${s.title}`)}`)
      const expected = watchable
        .filter((m) => m.genres.includes(s.title ?? ''))
        .sort(
          (x, y) =>
            y.rating - x.rating ||
            byCode(sortTitleOf(x.title), sortTitleOf(y.title)) ||
            byCode(x.id, y.id),
        )
        .slice(0, ROW_MAX)
        .map((m) => m.tmdbId)
      expect(idsOf(s.items)).toEqual(expected)
    }

    // the order: the hero, Continue watching, the featured rows, then the built-in rows
    const featured = state.featured
      .filter((f) => f.layout !== 'hero')
      .sort((x, y) => x.order - y.order)
      .map((f) => f.id)
      .filter((id) => home.some((s) => s.id === id))
    expect(home.map((s) => s.id)).toEqual([
      'fs-hero',
      'continue',
      ...featured,
      'recent',
      ...genreRows.map((s) => s.id),
    ])
    expect(home[0]?.layout).toBe('hero')
    for (const s of home) for (const i of s.items) expect(i.type).toBe('movie')
  })

  test('the first hero fills the top wherever it sits, and later heroes are rows', async () => {
    const { a } = await arranged((state) => {
      for (const f of state.featured) {
        if (f.id === 'fs-hero') f.order = 9
        if (f.id === 'fs-staff') f.layout = 'hero'
      }
    })
    const home = await a.home.sections({ query: { client: 'tvos' } })
    expect(home[0]).toMatchObject({ id: 'fs-staff', layout: 'hero' })
    expect(home.find((s) => s.id === 'fs-hero')?.layout).toBe('row')
    expect(home.filter((s) => s.layout === 'hero')).toHaveLength(1)
  })

  test('the person’s own order and hidden rows apply below the hero', async () => {
    const { a } = await arranged()
    const before = (await a.home.sections({ query: { client: 'tvos' } })).map((s) => s.id)
    await a.home.saveLayout({ body: { order: ['recent', 'continue'], hidden: ['fs-staff'] } })
    const after = (await a.home.sections({ query: { client: 'tvos' } })).map((s) => s.id)
    const rest = before.filter((id) => !['fs-hero', 'recent', 'continue', 'fs-staff'].includes(id))
    expect(after).toEqual(['fs-hero', 'recent', 'continue', ...rest])
  })
})

// packages/media's `list` and `pageRows`
describe('the library', () => {
  /** 40 more films, so the library runs past a page; half of them sort under "An …". */
  const more = (state: ReturnType<typeof stateOf>) => {
    const base = filmsIn(state)[0] as MediaItem
    for (let i = 0; i < 40; i++)
      state.items.push({
        ...structuredClone(base),
        id: `extra-${String(i).padStart(2, '0')}`,
        tmdbId: 900_000 + i,
        title: i % 2 ? `An Extra ${i % 5}` : `Extra ${i % 5}`,
        rating: 3,
      })
  }

  test('pages of 60 by default, A to Z by the sort title in code order, ties by row id', async () => {
    const { a, state } = await arranged(more)
    const films = filmsIn(state)
    const expected = [...films]
      .sort((x, y) => byCode(sortTitleOf(x.title), sortTitleOf(y.title)) || byCode(x.id, y.id))
      .map((m) => m.tmdbId)
    const first = await a.library.list({ query: {} })
    expect(first.items).toHaveLength(PAGE_DEFAULT)
    expect(first.total).toBe(films.length)
    const seen: ClientItem[] = [...first.items]
    let next = first.next
    while (next) {
      const page = await a.library.list({ query: { cursor: next } })
      seen.push(...page.items)
      next = page.next
    }
    expect(idsOf(seen)).toEqual(expected)
    // "An" is an article, as "The" and "A" are
    const extra = seen.filter((m) => m.title.includes('Extra')).map((m) => m.title)
    expect(extra.slice(0, 2).every((t) => t.endsWith(' 0'))).toBe(true)
  })

  test('descending sorts break ties by row id descending, and pages follow on', async () => {
    const { a, state } = await arranged(more)
    const expected = filmsIn(state)
      .sort((x, y) => y.rating - x.rating || byCode(y.id, x.id))
      .map((m) => m.tmdbId)
    const one = await a.library.list({ query: { sort: 'rating', limit: 25 } })
    const two = await a.library.list({
      query: { sort: 'rating', limit: 200, cursor: one.next ?? '' },
    })
    expect(two.next).toBeNull()
    expect([...idsOf(one.items), ...idsOf(two.items)]).toEqual(expected)
  })

  test('a page link that doesn’t fit is refused as the server refuses it', async () => {
    const { a } = await arranged(more)
    const garbled = await caught(a.library.list({ query: { cursor: 'not a cursor' } }))
    expect(garbled.status).toBe(400)
    expect(reasonOf(garbled)).toBe('bad-cursor')
    const first = await a.library.list({ query: {} })
    const other = await caught(
      a.library.list({ query: { sort: 'year', cursor: first.next ?? '' } }),
    )
    expect(reasonOf(other)).toBe('bad-cursor')
  })

  test('filters by playing and by genre, ignoring case', async () => {
    const { a, state } = await arranged()
    const plays = await a.library.list({ query: { playable: 'true', limit: 200 } })
    expect(plays.items.every((i) => i.playable)).toBe(true)
    expect(plays.total).toBe(filmsIn(state).filter(playable).length)
    const comedy = await a.library.list({ query: { genre: 'comedy', limit: 200 } })
    expect(comedy.total).toBe(filmsIn(state).filter((m) => m.genres.includes('Comedy')).length)
  })
})

// packages/media's `searchMovies`, `searchCollections`, `searchPeople` and `search`
describe('Search', () => {
  const scores = (names: string[], q: string) => names.map((n) => matchScore(n, q))
  const nonIncreasing = (xs: number[]) => xs.every((x, i) => i === 0 || (xs[i - 1] as number) >= x)

  test('people: those with titles here, most titles first, then ranked by the match', async () => {
    const { a, state } = await arranged()
    const q = 'ke'
    const found = await a.library.search({ query: { query: q } })
    const people = found.sections.find((s) => s.kind === 'people')
    if (people?.kind !== 'people') throw new Error('no people')
    expect(people.items.length).toBeLessThanOrEqual(SEARCH_MAX)
    expect(people.items.every((p) => p.titles > 0)).toBe(true)
    expect(
      nonIncreasing(
        scores(
          people.items.map((p) => p.name),
          q,
        ),
      ),
    ).toBe(true)
    // within a score, the server's SQL order: titles here, then name
    for (let i = 1; i < people.items.length; i++) {
      const x = people.items[i - 1] as (typeof people.items)[number]
      const y = people.items[i] as (typeof people.items)[number]
      if (matchScore(x.name, q) === matchScore(y.name, q))
        expect(x.titles > y.titles || (x.titles === y.titles && x.name <= y.name)).toBe(true)
    }
    // titles count the library's films the person is credited on
    const keaton = people.items.find((p) => p.id === SEED.person.id)
    const credited = filmsIn(state).filter((m) => {
      const meta = movieMetadata(state, m.id, 0)
      return [...(meta?.cast ?? []), ...(meta?.crew ?? [])].some(
        (c) => c.personId === SEED.person.mock,
      )
    })
    expect(keaton?.titles).toBe(credited.length)
  })

  test('films: a title starting with the query first, then in sort-title order', async () => {
    const { a } = await arranged()
    for (const q of ['the', 'tears of', 'keaton', 'an']) {
      const found = await a.library.search({ query: { query: q } })
      const films = found.sections.find((s) => s.kind === 'movies')
      if (films?.kind !== 'movies') continue
      expect(films.items.length).toBeLessThanOrEqual(SEARCH_MAX)
      const s = scores(
        films.items.map((m) => m.title),
        q,
      )
      expect(nonIncreasing(s)).toBe(true)
      for (let i = 1; i < films.items.length; i++)
        if (s[i - 1] === s[i])
          expect(
            sortTitleOf((films.items[i - 1] as ClientItem).title) <=
              sortTitleOf((films.items[i] as ClientItem).title),
          ).toBe(true)
    }
  })

  test('the best-matching kind comes first, ties as films, collections, people', async () => {
    const { a } = await arranged()
    const keaton = await a.library.search({ query: { query: 'keaton' } })
    expect(keaton.sections[0]?.kind).toBe('people')
    const tears = await a.library.search({ query: { query: 'tears of' } })
    expect(tears.sections[0]?.kind).toBe('movies')
    const caminandes = await a.library.search({ query: { query: 'caminandes' } })
    expect(caminandes.sections.map((s) => s.kind)).toEqual(['movies', 'collections'])
    const col = caminandes.sections[1]
    if (col?.kind !== 'collections') throw new Error('no collections')
    expect(col.items[0]?.id).toBe(Number(SEED.collection.id))
  })
})

// packages/metadata's `toPerson`
describe('a person', () => {
  const title = (id: number, releaseDate: string | null) =>
    ({ id, title: `T${id}`, releaseDate }) as CreditEntry['title']
  const cast = (id: number, date: string | null, role: string | null): CreditEntry => ({
    title: title(id, date),
    cast: true,
    department: 'Acting',
    role,
  })
  const crew = (
    id: number,
    date: string | null,
    department: CreditEntry['department'],
    role: string,
  ) => ({
    title: title(id, date),
    cast: false,
    department,
    role,
  })

  test('one row per title and department, characters with " / " and jobs with ", "', () => {
    const rows = filmography([
      cast(1, '2001-01-01', 'Rollo'),
      cast(1, '2001-01-01', 'The Boy'),
      cast(1, '2001-01-01', 'Rollo'),
      crew(1, '2001-01-01', 'Directing', 'Director'),
      crew(1, '2001-01-01', 'Directing', 'Co-Director'),
      crew(1, '2001-01-01', 'Directing', 'Director'),
      crew(1, '2001-01-01', 'Writing', 'Screenplay'),
    ])
    expect(rows.map((r) => [r.creditId, r.role])).toEqual([
      ['1:Acting', 'Rollo / The Boy'],
      ['1:Directing', 'Director, Co-Director'],
      ['1:Writing', 'Screenplay'],
    ])
  })

  test('newest first, undated titles at the top, ties in the order given', () => {
    const rows = filmography([
      cast(1, '1920-05-01', 'a'),
      cast(2, null, 'b'),
      cast(3, '1926-01-01', 'c'),
      crew(4, '1926-01-01', 'Directing', 'Director'),
      cast(5, null, 'e'),
    ])
    expect(rows.map((r) => r.id)).toEqual([2, 5, 3, 4, 1])
  })

  test('the seeded person’s credits are in that order', async () => {
    const { a } = await arranged()
    const p = await a.metadata.person({ params: { id: SEED.person.id } })
    const dates = p.credits.map((c) => c.releaseDate ?? '9999')
    expect(dates).toEqual([...dates].sort().reverse())
    expect(new Set(p.credits.map((c) => c.creditId)).size).toBe(p.credits.length)
  })
})

// packages/curation's `forApps` and `page`
describe('collections', () => {
  test('the server’s own in the admin’s order, then TMDB’s by name', async () => {
    const { a, state } = await arranged()
    const all = await a.library.collections({ query: { client: 'tvos' } })
    const own = all.filter((c) => c.smart)
    const tmdb = all.filter((c) => !c.smart)
    expect(all).toEqual([...own, ...tmdb])
    const order = state.collections.map((c) => c.id)
    expect(own.map((c) => c.id)).toEqual(order.filter((id) => own.some((c) => c.id === id)))
    expect(tmdb.map((c) => c.name)).toEqual(
      [...tmdb.map((c) => c.name)].sort((x, y) => x.localeCompare(y)),
    )
    const posters = new Set(
      filmsIn(state)
        .filter(playable)
        .map((m) => m.art.poster),
    )
    for (const c of own) {
      const def = state.collections.find((x) => x.id === c.id)
      expect(c.smart?.rules).toBe(def?.rules !== null)
      expect(c.smart?.mosaic.length).toBeLessThanOrEqual(4)
      for (const p of c.smart?.mosaic ?? []) expect(posters.has(p)).toBe(true)
      if (def?.artwork) expect(c.smart?.mosaic).toEqual([])
    }
  })

  test('a collection’s page holds what plays, with its count and years from them', async () => {
    const { a } = await arranged()
    const page = await a.library.collection({ params: { id: SEED.collection.id }, query: {} })
    expect(page.items.every((i) => i.playable)).toBe(true)
    expect(page.collection.count).toBe(page.items.length)
    const years = page.items.map((i) => i.year ?? 0)
    const lo = Math.min(...years)
    const hi = Math.max(...years)
    expect(page.collection.years).toBe(lo === hi ? String(lo) : `${lo}–${hi}`)
    const gone = await caught(a.library.collection({ params: { id: '1' }, query: {} }))
    expect(gone.status).toBe(404)
    expect(gone.message).toBe('There’s no collection with that id.')
  })
})

// ADR 0054, through packages/media's `progressOf` and its playback
describe('watch state', () => {
  const lengthOf = (state: ReturnType<typeof stateOf>) =>
    (filmsIn(state).find((m) => m.tmdbId === SEED.film.id) as MediaItem).runtimeMinutes * 60
  const place = (state: ReturnType<typeof stateOf>, fraction: number) => {
    const m = filmsIn(state).find((x) => x.tmdbId === SEED.film.id) as MediaItem
    state.watch = state.watch.filter((w) => !(w.userId === RUTH && w.itemId === m.id))
    state.watch.push({
      userId: RUTH,
      itemId: m.id,
      position: lengthOf(state) * fraction,
      updatedAt: new Date().toISOString(),
    })
  }

  test('progress to three places; at 90% it’s watched and plays from the start', async () => {
    const { a, state } = await arranged((s) => place(s, 0.123456))
    const part = (await a.library.item({ params: movie })).item
    expect(part.progress).toBe(0.123)
    expect(part.position).toBe(lengthOf(state) * 0.123456)
    place(state, WATCHED_AT)
    const done = (await a.library.item({ params: movie })).item
    expect(done).toMatchObject({ progress: null, position: 0, watched: true })
    const home = await a.home.sections({ query: { client: 'tvos' } })
    const continuing = home.find((s) => s.id === 'continue')
    expect(idsOf(continuing?.items ?? [])).not.toContain(SEED.film.id)
  })

  test('watched is its own flag, and unwatched clears it and the place', async () => {
    const { a, state } = await arranged((s) => place(s, 0.5))
    await a.playback.played({ params: movie })
    const watched = (await a.library.item({ params: movie })).item
    expect(watched).toMatchObject({ watched: true, progress: null, position: 0 })
    // playing it again keeps it watched, as the history stays
    place(state, 0.2)
    expect((await a.library.item({ params: movie })).item).toMatchObject({
      watched: true,
      progress: 0.2,
    })
    await a.playback.unplayed({ params: movie })
    expect((await a.library.item({ params: movie })).item).toMatchObject({
      watched: false,
      progress: null,
      position: 0,
    })
  })

  test('removing from Continue watching forgets the place, and playing again brings it back', async () => {
    const { a, state } = await arranged((s) => place(s, 0.5))
    const continuing = async () =>
      idsOf(
        (await a.home.sections({ query: { client: 'tvos' } })).find((s) => s.id === 'continue')
          ?.items ?? [],
      )
    expect(await continuing()).toContain(SEED.film.id)
    await a.playback.dismiss({ params: movie })
    expect(await continuing()).not.toContain(SEED.film.id)
    place(state, 0.6)
    expect(await continuing()).toContain(SEED.film.id)
  })

  test('the player’s picks: a version that isn’t the title’s is refused', async () => {
    const { a, state } = await arranged()
    const m = filmsIn(state).find((x) => x.tmdbId === SEED.film.id) as MediaItem
    const wrong = await caught(a.playback.setPrefs({ params: movie, body: { versionId: 'nope' } }))
    expect(wrong.status).toBe(400)
    expect(reasonOf(wrong)).toBe('version')
    const version = m.versions[0]?.id ?? ''
    const saved = await a.playback.setPrefs({
      params: movie,
      body: { versionId: version, subtitleOffsetMs: 250 },
    })
    expect(saved).toEqual({
      versionId: version,
      audioId: null,
      subtitleId: null,
      subtitleOffsetMs: 250,
    })
    const gone = await caught(a.playback.played({ params: { type: 'movie', id: 1 } }))
    expect(gone.status).toBe(404)
  })

  test('each change is heard as watch.updated for the title, by its person', async () => {
    const { a } = await arranged()
    const heard: { topic: string; ids?: string[] }[] = []
    const stop = a.events.subscribe((e) => heard.push(e as (typeof heard)[number]))
    await until(() => a.events.connected())
    await a.playback.played({ params: movie })
    await until(() => heard.some((e) => e.topic === 'watch.updated'))
    expect(heard.find((e) => e.topic === 'watch.updated')?.ids).toEqual([`movie:${SEED.film.id}`])
    stop()
  })
})

describe('the same answers', () => {
  /** The reads run in a process of their own, with the system clock and the zone set. */
  const run = (tz: string, now: string) => {
    const out = Bun.spawnSync(['bun', join(import.meta.dir, 'fixtures/films-answers.ts')], {
      env: { ...process.env, TZ: tz, FAKE_NOW: now },
    })
    if (out.exitCode !== 0) throw new Error(out.stderr.toString())
    return JSON.parse(out.stdout.toString()) as { now: number; answers: unknown }
  }

  // zones without daylight saving: the seed lays its dates out by whole days from a local EPOCH,
  // so across a change of the clocks a zone that has one sees the same days an hour apart
  test('under another clock and another time zone', () => {
    const tokyo = run('Asia/Tokyo', '2031-05-05T00:00:00Z')
    const phoenix = run('America/Phoenix', '1999-12-31T23:00:00Z')
    expect(tokyo.now).toBe(Date.parse('2031-05-05T00:00:00Z'))
    expect(phoenix.now).toBe(Date.parse('1999-12-31T23:00:00Z'))
    expect(phoenix.answers).toEqual(tokyo.answers)
  })

  test('the numbers made for people and collections are each one of a kind', () => {
    const state = stateOf(createMock(memoryStorage()))
    const people = new Set<string>()
    for (const t of knownTitles(state)) {
      const meta = movieMetadata(state, t.id, 0)
      for (const c of [...(meta?.cast ?? []), ...(meta?.crew ?? [])]) people.add(c.personId)
    }
    const slugs = [...people, ...collectionRefs().map((c) => c.id)]
    expect(new Set(slugs.map(tmdbNumber)).size).toBe(new Set(slugs).size)
  })
})
