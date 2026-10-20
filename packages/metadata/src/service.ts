// SPDX-License-Identifier: AGPL-3.0-only
// The metadata service: TMDB through the cache. Reads come from the cache when it has the row in the
// metadata language and it's recent, otherwise from TMDB, written back. Without a key, cached rows
// still read and anything new throws `no-tmdb-key`.
import { AppError } from '@highsea/core'
import { readSetting, schema, writeSetting } from '@highsea/db'
import { and, asc, eq, inArray, isNotNull, isNull, lt, notInArray } from 'drizzle-orm'
import { createCache } from './cache.ts'
import { METADATA_TOPIC, type MetadataDeps } from './context.ts'
import { createImages, TMDB_IMAGE_BASE } from './images.ts'
import {
  recommendationsOf,
  toCollection,
  toDiscoverMovie,
  toMovieMetadata,
  toPage,
  toPerson,
} from './map.ts'
import { createSettings, noKeyError } from './settings.ts'
import { tmdbApi } from './tmdb/api.ts'
import { type Credential, createTmdbClient, isTmdbNotFound } from './tmdb/client.ts'
import type { TmdbCollection, TmdbMovie, TmdbPerson } from './tmdb/types.ts'
import type {
  CacheKind,
  Collection,
  DiscoverList,
  DiscoverMovie,
  MovieMetadata,
  Page,
  Person,
} from './types.ts'

const { movieMetadata, people, collections, credits, mediaItems } = schema
const imageRows = schema.images

const DAY = 24 * 60 * 60 * 1000

/**
 * TMDB's terms: cached data is kept no longer than six months
 * (https://www.themoviedb.org/api-terms-of-use). 180 days stays inside the shortest six months.
 */
export const CACHE_LIMIT_MS = 180 * DAY
/** Every library movie, and what it refers to, is refreshed at least this often. */
export const FULL_REFRESH_MS = 30 * DAY
/** TMDB's change lists cover up to 14 days ([Changes](https://developer.themoviedb.org/reference/changes-movie-list)). */
export const CHANGES_WINDOW_MS = 14 * DAY
/** When the changes job missed the window: refresh what's older than this instead. */
export const CHANGES_FALLBACK_AGE_MS = 7 * DAY
/** A row read on demand that's older than this is fetched again (the cached one serves on failure). */
export const STALE_ON_READ_MS = 30 * DAY

export const JOB_TYPES = {
  refresh: 'metadata.refresh',
  changes: 'metadata.changes',
  sweep: 'metadata.sweep',
  purge: 'metadata.purge',
} as const

/** The settings row the changes job keeps its last run in. */
export const CHANGES_STATE_KEY = 'metadata.changes'
/** TMDB's `/3/configuration`, kept so image URLs follow it. */
export const CONFIGURATION_KEY = 'metadata.tmdb'

const utcDate = (ms: number) => new Date(ms).toISOString().slice(0, 10)

export function createMetadataCore(deps: MetadataDeps) {
  const { db, clock, events, jobs } = deps
  const logger = deps.logger.child('metadata')
  const client = createTmdbClient({ fetch: deps.fetch, clock, logger, sleep: deps.sleep })
  const api = tmdbApi(client)
  const cache = createCache(db)
  const settings = createSettings(deps)

  const imageBase = () =>
    readSetting(db, CONFIGURATION_KEY, { imageBase: TMDB_IMAGE_BASE, fetchedAt: 0 }).imageBase
  const images = createImages(deps, client, imageBase)

  function requireKey(): Credential {
    const credential = settings.credential()
    if (!credential) throw noKeyError()
    return credential
  }

  const announce = (kind: CacheKind, id: number) =>
    events.emit({ topic: METADATA_TOPIC, ids: [`${kind}:${id}`] })

  /** Reads TMDB's image base URL from `/3/configuration` once a week. */
  async function refreshConfiguration(credential: Credential) {
    const stored = readSetting(db, CONFIGURATION_KEY, { imageBase: TMDB_IMAGE_BASE, fetchedAt: 0 })
    if (clock.now() - stored.fetchedAt < 7 * DAY) return
    try {
      const config = await api.configuration(credential)
      const base = config.images.secure_base_url
      if (/^https:\/\/[^/]+\/.*\/$/.test(base))
        writeSetting(
          db,
          CONFIGURATION_KEY,
          { imageBase: base, fetchedAt: clock.now() },
          clock.now(),
        )
    } catch (e) {
      logger.warn('couldn’t read TMDB’s configuration', { error: (e as Error).message })
    }
  }

  // ------------------------------------------------------------ fetching into the cache

  /** Fetches one cached kind from TMDB and writes it. Returns false when TMDB has no such id. */
  async function fetchInto(kind: CacheKind, id: number, credential: Credential): Promise<boolean> {
    const language = settings.language()
    const now = clock.now()
    try {
      if (kind === 'movie') cache.putMovie(await api.movie(credential, id, language), language, now)
      else if (kind === 'person')
        cache.putPerson(await api.person(credential, id, language), language, now)
      else cache.putCollection(await api.collection(credential, id, language), language, now)
      return true
    } catch (e) {
      if (isTmdbNotFound(e)) return false
      throw e
    }
  }

  const rowOf = (kind: CacheKind, id: number) =>
    kind === 'movie' ? cache.movie(id) : kind === 'person' ? cache.person(id) : cache.collection(id)

  const notFoundMessage: Record<CacheKind, string> = {
    movie: 'TMDB has no movie with that id.',
    person: 'TMDB has no person with that id.',
    collection: 'TMDB has no collection with that id.',
  }

  /**
   * The cached row for `kind` and `id`, fetched first when it's missing, in another language or
   * older than a month. A cached row serves when TMDB can't be reached or no key is set.
   */
  async function load(kind: CacheKind, id: number) {
    if (!Number.isSafeInteger(id) || id <= 0) throw new AppError('not-found', notFoundMessage[kind])
    const row = rowOf(kind, id)
    const fresh =
      row &&
      row.language === settings.language() &&
      (row.goneAt !== null || clock.now() - row.fetchedAt < STALE_ON_READ_MS)
    if (row && fresh) return row
    const credential = settings.credential()
    if (!credential) {
      if (row) return row
      throw noKeyError()
    }
    try {
      if (await fetchInto(kind, id, credential)) return rowOf(kind, id) ?? row
      if (row) {
        cache.markGone(kind, id, clock.now())
        return rowOf(kind, id) ?? row
      }
      throw new AppError('not-found', notFoundMessage[kind])
    } catch (e) {
      if (row && !(e instanceof AppError && e.code === 'not-found')) {
        logger.warn('serving cached metadata', { kind, id, error: (e as Error).message })
        return row
      }
      throw e
    }
  }

  // ------------------------------------------------------------ reads

  async function movie(id: number): Promise<MovieMetadata> {
    const row = await load('movie', id)
    if (!row) throw new AppError('not-found', notFoundMessage.movie)
    return toMovieMetadata(row.data as TmdbMovie, {
      region: settings.region(),
      fetchedAt: row.fetchedAt,
      goneAt: row.goneAt,
    })
  }

  /** The cached movie without asking TMDB, or null: what the library shows offline. */
  function cachedMovie(id: number): MovieMetadata | null {
    const row = cache.movie(id)
    return row
      ? toMovieMetadata(row.data as TmdbMovie, {
          region: settings.region(),
          fetchedAt: row.fetchedAt,
          goneAt: row.goneAt,
        })
      : null
  }

  /** TMDB's recommendations, falling back to "similar" when it has none (owner's decision 6). */
  async function recommendations(id: number): Promise<DiscoverMovie[]> {
    const row = await load('movie', id)
    if (!row) return []
    const data = row.data as TmdbMovie
    if ((data.recommendations?.results.length ?? 0) > 0 || data.similar)
      return recommendationsOf(data)
    const credential = settings.credential()
    if (!credential || row.goneAt !== null) return []
    try {
      const similar = await api.similar(credential, id, settings.language())
      cache.putSimilar(id, similar)
      return recommendationsOf({ ...data, similar })
    } catch (e) {
      logger.warn('couldn’t read similar movies', { id, error: (e as Error).message })
      return []
    }
  }

  async function collection(id: number): Promise<Collection> {
    const row = await load('collection', id)
    if (!row) throw new AppError('not-found', notFoundMessage.collection)
    return toCollection(row.data as TmdbCollection)
  }

  async function person(id: number): Promise<Person> {
    const row = await load('person', id)
    if (!row) throw new AppError('not-found', notFoundMessage.person)
    return toPerson(row.data as TmdbPerson, { fetchedAt: row.fetchedAt, goneAt: row.goneAt })
  }

  const page = (n: number | undefined) => Math.min(Math.max(Math.trunc(n ?? 1) || 1, 1), 500)

  const discover = {
    /** TMDB's movie search, paged. Writes nothing to the library or the cache. */
    async search(query: string, pageNumber?: number): Promise<Page<DiscoverMovie>> {
      const q = query.trim()
      if (!q) return { page: 1, totalPages: 0, totalResults: 0, results: [] }
      const credential = requireKey()
      const result = await api.search(credential, q, page(pageNumber), settings.language())
      return toPage(result, toDiscoverMovie)
    },
    /** Trending (this week), Popular, Now playing or Upcoming, for the server's region. */
    async list(list: DiscoverList, pageNumber?: number): Promise<Page<DiscoverMovie>> {
      const credential = requireKey()
      const result = await api.list(
        credential,
        list,
        page(pageNumber),
        settings.language(),
        settings.region(),
      )
      return toPage(result, toDiscoverMovie)
    },
  }

  // ------------------------------------------------------------ refresh

  /**
   * Fetches the latest from TMDB and writes it with a new `fetched_at`; a 404 marks the cached row
   * gone and keeps it. Safe to repeat (ADR 0022).
   */
  async function refreshNow(kind: CacheKind, id: number) {
    const credential = requireKey()
    const existed = !!rowOf(kind, id)
    if (await fetchInto(kind, id, credential)) {
      announce(kind, id)
      return 'updated' as const
    }
    if (existed) {
      cache.markGone(kind, id, clock.now())
      announce(kind, id)
      logger.warn('TMDB no longer has this id', { kind, id })
      return 'gone' as const
    }
    return 'missing' as const
  }

  const enqueueRefresh = (kind: CacheKind, id: number) =>
    jobs.enqueue(JOB_TYPES.refresh, { kind, id }, { dedupeKey: `${kind}:${id}` })

  /** Ids in `ids` that are cached as `kind` (and not gone). */
  function cachedOf(kind: CacheKind, ids: number[]) {
    const table = kind === 'movie' ? movieMetadata : kind === 'person' ? people : collections
    const found: number[] = []
    for (let i = 0; i < ids.length; i += 500)
      found.push(
        ...db
          .select({ id: table.tmdbId })
          .from(table)
          .where(and(inArray(table.tmdbId, ids.slice(i, i + 500)), isNull(table.goneAt)))
          .all()
          .map((r) => r.id),
      )
    return found
  }

  /**
   * The daily changes job: TMDB's change lists since the last run, refreshing the cached movies
   * and people in them. Past the lists' 14-day window, everything older than a week is refreshed
   * instead. Safe to repeat: a second run finds the same ids, and their refreshes dedupe.
   */
  async function runChanges() {
    const credential = settings.credential()
    if (!credential) return { mode: 'skipped' as const, queued: 0 }
    await refreshConfiguration(credential)
    const now = clock.now()
    const state = readSetting(db, CHANGES_STATE_KEY, { lastRunAt: null as number | null })
    let queued = 0
    let mode: 'changes' | 'fallback'
    if (state.lastRunAt === null || now - state.lastRunAt > CHANGES_WINDOW_MS) {
      mode = 'fallback'
      const before = now - CHANGES_FALLBACK_AGE_MS
      for (const [kind, table] of [
        ['movie', movieMetadata],
        ['person', people],
        ['collection', collections],
      ] as const) {
        const due = db
          .select({ id: table.tmdbId })
          .from(table)
          .where(and(lt(table.fetchedAt, before), isNull(table.goneAt)))
          .all()
        for (const r of due) {
          enqueueRefresh(kind, r.id)
          queued++
        }
      }
    } else {
      mode = 'changes'
      const start = utcDate(Math.max(state.lastRunAt, now - CHANGES_WINDOW_MS))
      const end = utcDate(now)
      for (const kind of ['movie', 'person'] as const) {
        const changed: number[] = []
        for (let n = 1, pages = 1; n <= pages && n <= 500; n++) {
          const result = await api.changes(credential, kind, start, end, n)
          pages = result.total_pages
          changed.push(...result.results.map((r) => r.id))
        }
        for (const id of cachedOf(kind, [...new Set(changed)])) {
          enqueueRefresh(kind, id)
          queued++
        }
      }
    }
    writeSetting(db, CHANGES_STATE_KEY, { lastRunAt: now }, now)
    logger.info('metadata changes checked', { mode, queued })
    return { mode, queued }
  }

  /** TMDB ids the library refers to: its movies, their collections, their credited people. */
  function referenced() {
    const library = db
      .select({ id: mediaItems.tmdbId })
      .from(mediaItems)
      .where(eq(mediaItems.type, 'movie'))
    return {
      library,
      collections: db
        .select({ id: movieMetadata.collectionId })
        .from(movieMetadata)
        // NOT IN over a list holding NULL matches nothing, so the NULLs stay out
        .where(and(inArray(movieMetadata.tmdbId, library), isNotNull(movieMetadata.collectionId))),
      people: db
        .select({ id: credits.personId })
        .from(credits)
        .where(inArray(credits.movieId, library)),
    }
  }

  /**
   * The spread full refresh, daily: each run refreshes the oldest 1/25th of what the library refers
   * to, and anything older than 30 days, so every row is refreshed at least monthly without one
   * large run, and refresh times spread out over the days.
   */
  function runSweep() {
    if (!settings.credential()) return { queued: 0 }
    const now = clock.now()
    const ref = referenced()
    // library movies with no cached row yet
    const missing = db
      .select({ id: mediaItems.tmdbId })
      .from(mediaItems)
      .where(
        and(
          eq(mediaItems.type, 'movie'),
          notInArray(
            mediaItems.tmdbId,
            db.select({ id: movieMetadata.tmdbId }).from(movieMetadata),
          ),
        ),
      )
      .all()
    let queued = 0
    for (const r of missing) {
      enqueueRefresh('movie', r.id)
      queued++
    }
    for (const [kind, table, ids] of [
      ['movie', movieMetadata, ref.library],
      ['collection', collections, ref.collections],
      ['person', people, ref.people],
    ] as const) {
      const rows = db
        .select({ id: table.tmdbId, fetchedAt: table.fetchedAt })
        .from(table)
        .where(and(inArray(table.tmdbId, ids), isNull(table.goneAt)))
        .orderBy(asc(table.fetchedAt))
        .all()
      const share = Math.ceil(rows.length / 25)
      rows.forEach((r, i) => {
        if (i < share || now - r.fetchedAt >= FULL_REFRESH_MS - DAY) {
          enqueueRefresh(kind, r.id)
          queued++
        }
      })
    }
    logger.info('metadata sweep queued', { queued })
    return { queued }
  }

  /**
   * The six-month purge: titles, people and collections fetched longer ago than TMDB's terms allow
   * are removed, with their images, unless the library refers to them. Images of anything are
   * removed once they're that old; they're fetched again when next shown.
   */
  function runPurge() {
    const cutoff = clock.now() - CACHE_LIMIT_MS
    const ref = referenced()
    const purged = { movies: 0, people: 0, collections: 0, images: 0 }
    const owners: { type: CacheKind; ids: number[] }[] = []
    for (const [kind, table, keep, count] of [
      ['movie', movieMetadata, ref.library, 'movies'],
      ['person', people, ref.people, 'people'],
      ['collection', collections, ref.collections, 'collections'],
    ] as const) {
      const where = and(lt(table.fetchedAt, cutoff), notInArray(table.tmdbId, keep))
      const ids = db
        .select({ id: table.tmdbId })
        .from(table)
        .where(where)
        .all()
        .map((r) => r.id)
      if (!ids.length) continue
      for (let i = 0; i < ids.length; i += 500)
        db.delete(table)
          .where(inArray(table.tmdbId, ids.slice(i, i + 500)))
          .run()
      purged[count] = ids.length
      owners.push({ type: kind, ids })
    }
    const doomed: { path: string; size: string }[] = []
    for (const { type, ids } of owners)
      for (let i = 0; i < ids.length; i += 500)
        doomed.push(
          ...db
            .select({ path: imageRows.path, size: imageRows.size })
            .from(imageRows)
            .where(
              and(eq(imageRows.ownerType, type), inArray(imageRows.ownerId, ids.slice(i, i + 500))),
            )
            .all(),
        )
    doomed.push(
      ...db
        .select({ path: imageRows.path, size: imageRows.size })
        .from(imageRows)
        .where(lt(imageRows.fetchedAt, cutoff))
        .all(),
    )
    const unique = [...new Map(doomed.map((d) => [`${d.size}${d.path}`, d])).values()]
    purged.images = images.remove(unique)
    if (purged.movies + purged.people + purged.collections + purged.images)
      logger.info('metadata purged', purged)
    return purged
  }

  return {
    settings,
    api,
    requireKey,
    refreshConfiguration,
    movie,
    cachedMovie,
    recommendations,
    collection,
    person,
    discover,
    images,
    refreshNow,
    enqueueRefresh,
    runChanges,
    runSweep,
    runPurge,
  }
}
