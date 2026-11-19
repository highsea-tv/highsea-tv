// SPDX-License-Identifier: AGPL-3.0-only
// The metadata service: TMDB through the cache. Reads come from the cache when it has the row in the
// metadata language and it's recent, otherwise from TMDB, written back. Without a key, cached rows
// still read and anything new throws `no-tmdb-key`.
import { AppError } from '@highsea-tv/core'
import { readSetting, schema, writeSetting } from '@highsea-tv/db'
import { and, asc, eq, inArray, isNotNull, isNull, lt, notInArray, or, sql } from 'drizzle-orm'
import {
  ARTWORK_KINDS_OF,
  type ArtworkChoice,
  type ArtworkKind,
  type ArtworkOption,
  type ArtworkOwner,
  createArtwork,
  optionsOf,
} from './artwork.ts'
import { createCache } from './cache.ts'
import { METADATA_TOPIC, type MetadataDeps } from './context.ts'
import { FANART_KEY_REJECTED, FANART_UNAVAILABLE } from './fanart/client.ts'
import { createFanart, type FanartSubject, isFanartFile } from './fanart/source.ts'
import { createImages, TMDB_IMAGE_BASE } from './images.ts'
import {
  automaticLogo,
  recommendationsOf,
  toCollection,
  toDiscoverMovie,
  toMovieMetadata,
  toPage,
  toPerson,
} from './map.ts'
import { toDiscoverShow, toShowMetadata } from './map-shows.ts'
import { createSettings, noKeyError } from './settings.ts'
import { tmdbApi } from './tmdb/api.ts'
import { type Credential, createTmdbClient, isTmdbNotFound } from './tmdb/client.ts'
import type {
  TmdbCollection,
  TmdbImage,
  TmdbMovie,
  TmdbPerson,
  TmdbSeason,
  TmdbShow,
} from './tmdb/types.ts'
import type {
  CacheKind,
  Collection,
  DiscoverList,
  DiscoverMovie,
  DiscoverShow,
  MovieMetadata,
  Page,
  Person,
  ShowMetadata,
  TvdbMatch,
} from './types.ts'

const { movieMetadata, people, collections, credits, mediaItems, showMetadata } = schema
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
  /** Derives collection rules' facts again (checkpoint 8d): after a region change, or once for rows from before. */
  facts: 'metadata.facts',
  /** Asks fanart.tv for one title (HT-74): a film TMDB has no logo for. */
  fanart: 'metadata.fanart',
  /**
   * Queues what the library is missing (HT-74): films never fetched, fetched before `images` was
   * asked for, or without a logo fanart.tv hasn't been asked about. Queued once at boot when there's
   * any, so an update that needs a refetch starts it within minutes, not at the next daily sweep.
   */
  catchUp: 'metadata.catch-up',
} as const

/** How long after boot the catch-up runs: once the server has settled, well before the sweep. */
export const CATCH_UP_DELAY_MS = 3 * 60_000
/** A library film TMDB said it doesn't have is asked again this often (HT-74). */
export const GONE_RETRY_MS = 7 * DAY

/** The settings row the changes job keeps its last run in. */
export const CHANGES_STATE_KEY = 'metadata.changes'
/** TMDB's `/3/configuration`, kept so image URLs follow it. */
export const CONFIGURATION_KEY = 'metadata.tmdb'
/** TMDB's `/3/certification/movie/list`, by country: what a region's ratings are, in order. */
export const CERTIFICATIONS_KEY = 'metadata.certifications'

/** A region's film certification and its place from mildest (TMDB's `order`). */
export type Certification = { certification: string; order: number }
type StoredCertifications = { regions: Record<string, Certification[]>; fetchedAt: number }

/** A kind of a title's art in the picker (HT-66). */
export type ArtworkKindView = {
  kind: ArtworkKind
  /** The file shown now: the chosen one, else the automatic one. */
  current: string | null
  /** highsea's own pick, which Reset goes back to. */
  automatic: string | null
  choice: ArtworkChoice | null
  options: ArtworkOption[]
}

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
  const artwork = createArtwork(deps)
  const pick = artwork.pick
  const fanart = createFanart({
    db,
    clock,
    logger,
    fetch: deps.fetch,
    sleep: deps.sleep,
    keys: () => settings.fanartKeys(),
  })
  /**
   * What fanart.tv keys an image owner on: a film by its TMDB id, a show by its TheTVDB id from the
   * cached show (HT-105; none until TMDB has given one); artists later.
   */
  const subjectOf = (owner: string, id: number): [FanartSubject, string] | null => {
    if (owner === 'movie') return ['movie', String(id)]
    if (owner !== 'show') return null
    const tvdb = cache.show(id)?.tvdbId
    return tvdb ? ['show', String(tvdb)] : null
  }
  const images = createImages(deps, client, imageBase, artwork, {
    url: (owner, id, file, width) => {
      const subject = subjectOf(owner, id)
      return subject ? fanart.urlOf(subject[0], subject[1], file, width) : null
    },
    image: fanart.image,
  })

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

  /**
   * Reads TMDB's certification lists once a week, as the configuration is read: they change when a
   * country's ratings board does, which is rare. A failure keeps what's stored.
   */
  async function refreshCertifications(credential: Credential) {
    const stored = readSetting<StoredCertifications>(db, CERTIFICATIONS_KEY, {
      regions: {},
      fetchedAt: 0,
    })
    if (clock.now() - stored.fetchedAt < 7 * DAY) return
    try {
      const list = await api.certifications(credential)
      const regions: Record<string, Certification[]> = {}
      for (const [region, certs] of Object.entries(list.certifications ?? {}))
        regions[region] = certs
          .filter((c) => c.certification.trim())
          .map((c) => ({ certification: c.certification.trim(), order: c.order }))
          .sort((a, b) => a.order - b.order)
      writeSetting(db, CERTIFICATIONS_KEY, { regions, fetchedAt: clock.now() }, clock.now())
    } catch (e) {
      logger.warn('couldn’t read TMDB’s certifications', { error: (e as Error).message })
    }
  }

  /** The region's certifications from mildest, as TMDB lists them; null until they've been read. */
  function certifications(region = settings.region()): Certification[] | null {
    const stored = readSetting<StoredCertifications>(db, CERTIFICATIONS_KEY, {
      regions: {},
      fetchedAt: 0,
    })
    return stored.fetchedAt ? (stored.regions[region] ?? []) : null
  }

  // ------------------------------------------------------------ fetching into the cache

  /** Fetches one cached kind from TMDB and writes it. Returns false when TMDB has no such id. */
  async function fetchInto(kind: CacheKind, id: number, credential: Credential): Promise<boolean> {
    const language = settings.language()
    const now = clock.now()
    try {
      if (kind === 'movie') {
        const m = await api.movie(credential, id, language)
        cache.putMovie(m, language, now, settings.region())
        if (!automaticLogo(m.images?.logos, language)) queueFanart('movie', id)
      } else if (kind === 'show') {
        const show = await api.show(credential, id, language)
        cache.putShow(show, await fetchSeasons(credential, show, language), language, now)
      } else if (kind === 'person')
        cache.putPerson(await api.person(credential, id, language), language, now)
      else cache.putCollection(await api.collection(credential, id, language), language, now)
      return true
    } catch (e) {
      if (isTmdbNotFound(e)) return false
      throw e
    }
  }

  /**
   * Every season the show lists, each with its episodes: one request a season, at the client's pace
   * (at most 4 at once, ADR 0029). A season TMDB answers 404 for is left out; any other failure
   * fails the show's fetch, so the cached show serves until the next try.
   */
  async function fetchSeasons(credential: Credential, show: TmdbShow, language: string) {
    const seasons = await Promise.all(
      (show.seasons ?? []).map(async (s) => {
        try {
          return await api.season(credential, show.id, s.season_number, language)
        } catch (e) {
          if (isTmdbNotFound(e)) return null
          throw e
        }
      }),
    )
    return seasons.filter((s): s is TmdbSeason => s !== null)
  }

  /**
   * Whether a cached movie came with `images` (asked for since HT-66), which its automatic logo is
   * picked from. A movie cached before has no logo until TMDB is asked again: reading one fetches it
   * again, and the sweep queues every such library movie at once.
   */
  const hasImages = (data: unknown) => (data as TmdbMovie).images !== undefined

  /**
   * Queues fanart.tv for a film TMDB has no logo for, unless it was asked lately (HT-74). Never
   * waited on: the logo shows once the job has its answer and `metadata.updated` follows.
   */
  function queueFanart(subject: FanartSubject, id: number) {
    if (!fanart.enabled() || !fanart.due(subject, id)) return false
    jobs.enqueue(JOB_TYPES.fanart, { subject, id }, { dedupeKey: `${subject}:${id}` })
    return true
  }

  /** The job: asks fanart.tv, keeps the answer, and announces the film when it found something. */
  async function refreshFanart(subject: FanartSubject, id: number) {
    try {
      const { found } = await fanart.refresh(subject, id)
      if (found && subject === 'movie') announce('movie', id)
      return found ? ('found' as const) : ('none' as const)
    } catch (e) {
      // down or refusing the key: nothing is written, so the next catch-up or refresh asks again
      const reason = (e as AppError).details as { reason?: string } | undefined
      if (reason?.reason === FANART_UNAVAILABLE || reason?.reason === FANART_KEY_REJECTED) {
        logger.warn('couldn’t ask fanart.tv', { subject, id, reason: reason.reason })
        return 'skipped' as const
      }
      throw e
    }
  }

  /** fanart.tv's logo for a film TMDB has none for, from what it answered; null while it's off. */
  const fanartLogo = (id: number, language: string) => () =>
    fanart.enabled() ? fanart.logo('movie', id, language) : null

  const rowOf = (kind: CacheKind, id: number) =>
    kind === 'movie'
      ? cache.movie(id)
      : kind === 'show'
        ? cache.show(id)
        : kind === 'person'
          ? cache.person(id)
          : cache.collection(id)

  const notFoundMessage: Record<CacheKind, string> = {
    movie: 'TMDB has no movie with that id.',
    person: 'TMDB has no person with that id.',
    collection: 'TMDB has no collection with that id.',
    show: 'TMDB has no show with that id.',
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
      (kind !== 'movie' || row.goneAt !== null || hasImages(row.data)) &&
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
      language: row.language,
      pick,
      fallbackLogo: fanartLogo(id, row.language),
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
          language: row.language,
          pick,
          fallbackLogo: fanartLogo(id, row.language),
        })
      : null
  }

  const showOf = (row: NonNullable<ReturnType<typeof cache.show>>) =>
    toShowMetadata(row.data as TmdbShow, cache.seasons(row.tmdbId), {
      region: settings.region(),
      fetchedAt: row.fetchedAt,
      goneAt: row.goneAt,
      language: row.language,
      pick,
    })

  /**
   * A show with its seasons and episodes (ADR 0064), fetched when it isn't cached, is in another
   * language or is older than a month, as a movie is.
   */
  async function show(id: number): Promise<ShowMetadata> {
    const row = await load('show', id)
    if (!row) throw new AppError('not-found', notFoundMessage.show)
    return showOf(row as NonNullable<ReturnType<typeof cache.show>>)
  }

  /** The cached show without asking TMDB, or null: what the library shows offline. */
  function cachedShow(id: number): ShowMetadata | null {
    const row = cache.show(id)
    return row ? showOf(row) : null
  }

  /** TMDB's recommendations, falling back to "similar" when it has none (owner's decision 6). */
  async function recommendations(id: number): Promise<DiscoverMovie[]> {
    const row = await load('movie', id)
    if (!row) return []
    const data = row.data as TmdbMovie
    if ((data.recommendations?.results.length ?? 0) > 0 || data.similar)
      return recommendationsOf(data, pick)
    const credential = settings.credential()
    if (!credential || row.goneAt !== null) return []
    try {
      const similar = await api.similar(credential, id, settings.language())
      cache.putSimilar(id, similar)
      return recommendationsOf({ ...data, similar }, pick)
    } catch (e) {
      logger.warn('couldn’t read similar movies', { id, error: (e as Error).message })
      return []
    }
  }

  async function collection(id: number): Promise<Collection> {
    const row = await load('collection', id)
    if (!row) throw new AppError('not-found', notFoundMessage.collection)
    return toCollection(row.data as TmdbCollection, pick)
  }

  async function person(id: number): Promise<Person> {
    const row = await load('person', id)
    if (!row) throw new AppError('not-found', notFoundMessage.person)
    return toPerson(row.data as TmdbPerson, {
      fetchedAt: row.fetchedAt,
      goneAt: row.goneAt,
      pick,
    })
  }

  const page = (n: number | undefined) => Math.min(Math.max(Math.trunc(n ?? 1) || 1, 1), 500)

  const discover = {
    /** TMDB's movie search, paged. Writes nothing to the library or the cache. */
    async search(query: string, pageNumber?: number): Promise<Page<DiscoverMovie>> {
      const q = query.trim()
      if (!q) return { page: 1, totalPages: 0, totalResults: 0, results: [] }
      const credential = requireKey()
      const result = await api.search(credential, q, page(pageNumber), settings.language())
      return toPage(result, (m) => toDiscoverMovie(m, pick))
    },
    /** The movie an IMDb id belongs to, through TMDB's Find by ID; null when TMDB has none. */
    async findByImdb(imdbId: string): Promise<DiscoverMovie | null> {
      if (!/^tt\d{1,10}$/.test(imdbId)) return null
      const credential = requireKey()
      const result = await api.findImdb(credential, imdbId, settings.language())
      const first = result.movie_results?.[0]
      return first ? toDiscoverMovie(first, pick) : null
    },
    /**
     * The TMDB show an IMDb id belongs to, through the same Find by ID (`tv_results`); null when
     * TMDB has none. A `tvshow.nfo` or an `{imdb-tt…}` folder name gives a show's (ADR 0064).
     */
    async findShowByImdb(imdbId: string): Promise<number | null> {
      if (!/^tt\d{1,10}$/.test(imdbId)) return null
      const credential = requireKey()
      const result = await api.findImdb(credential, imdbId, settings.language())
      return result.tv_results?.[0]?.id ?? null
    },
    /** TMDB's TV search, paged, as `search` is for films. Writes nothing. */
    async searchShows(query: string, pageNumber?: number): Promise<Page<DiscoverShow>> {
      const q = query.trim()
      if (!q) return { page: 1, totalPages: 0, totalResults: 0, results: [] }
      const credential = requireKey()
      const result = await api.searchShows(credential, q, page(pageNumber), settings.language())
      return toPage(result, (s) => toDiscoverShow(s, pick))
    },
    /**
     * What a TheTVDB id is on TMDB, through Find by ID with `external_source=tvdb_id`
     * ([Find by ID](https://developer.themoviedb.org/reference/find-by-id)); null when TMDB has none.
     * TheTVDB numbers shows, seasons and episodes apart, so one number can be a show and an
     * episode at once (78107 is The Office's show and an episode of another): the caller says
     * which it holds. A `tvdb-…` folder name or a `tvshow.nfo` gives a show's (the owner's answer 8).
     */
    async findByTvdb(tvdbId: number, kind: TvdbMatch['kind'] = 'show'): Promise<TvdbMatch | null> {
      if (!Number.isSafeInteger(tvdbId) || tvdbId <= 0) return null
      const credential = requireKey()
      const result = await api.findTvdb(credential, tvdbId, settings.language())
      if (kind === 'show') {
        const show = result.tv_results?.[0]
        return show ? { kind, show: show.id } : null
      }
      if (kind === 'season') {
        const season = result.tv_season_results?.[0]
        return season ? { kind, show: season.show_id, season: season.season_number } : null
      }
      const episode = result.tv_episode_results?.[0]
      return episode
        ? {
            kind,
            show: episode.show_id,
            season: episode.season_number,
            episode: episode.episode_number,
          }
        : null
    },
    /**
     * Trending (this week), Popular, Now playing or Upcoming, for the server's region; Top rated
     * for import lists.
     */
    async list(
      list: DiscoverList | 'top-rated',
      pageNumber?: number,
    ): Promise<Page<DiscoverMovie>> {
      const credential = requireKey()
      const result = await api.list(
        credential,
        list,
        page(pageNumber),
        settings.language(),
        settings.region(),
      )
      return toPage(result, (m) => toDiscoverMovie(m, pick))
    },
    /**
     * A public TMDB list's movies, a page at a time (import lists, checkpoint 8a). TV shows on a
     * mixed list are left out until highsea has TV.
     */
    async publicList(id: string, pageNumber?: number): Promise<Page<DiscoverMovie>> {
      const credential = requireKey()
      const result = await api.publicList(credential, id, page(pageNumber), settings.language())
      return {
        page: result.page,
        totalPages: result.total_pages,
        totalResults: result.total_results,
        results: result.items
          .filter((i) => (i.media_type ?? 'movie') === 'movie')
          .map((m) => toDiscoverMovie(m, pick)),
      }
    },
  }

  // ------------------------------------------------------------ chosen artwork (HT-66)

  /** What highsea picks by itself for each kind, from the cached title: TMDB's own, the logo by rule. */
  async function automaticArt(owner: ArtworkOwner, id: number) {
    if (owner === 'movie') {
      const row = await load('movie', id)
      if (!row) throw new AppError('not-found', notFoundMessage.movie)
      const data = row.data as TmdbMovie
      return {
        poster: data.poster_path ?? null,
        backdrop: data.backdrop_path ?? null,
        logo: automaticLogo(data.images?.logos, row.language) ?? fanartLogo(id, row.language)(),
      } satisfies Record<ArtworkKind, string | null>
    }
    if (owner === 'show') {
      // the logo by the same rule a show's page has (map-shows.ts): TMDB's only, no fanart.tv stand-in
      const row = await load('show', id)
      if (!row) throw new AppError('not-found', notFoundMessage.show)
      const data = row.data as TmdbShow
      return {
        poster: data.poster_path ?? null,
        backdrop: data.backdrop_path ?? null,
        logo: automaticLogo(data.images?.logos, row.language),
      } satisfies Record<ArtworkKind, string | null>
    }
    const row = await load('collection', id)
    if (!row) throw new AppError('not-found', notFoundMessage.collection)
    const data = row.data as TmdbCollection
    return {
      poster: data.poster_path ?? null,
      backdrop: data.backdrop_path ?? null,
      logo: null,
    } satisfies Record<ArtworkKind, string | null>
  }

  /** Every image TMDB has for the title, in every language; refused without a key or TMDB. */
  async function tmdbImages(owner: ArtworkOwner, id: number) {
    const credential = requireKey()
    return owner === 'movie'
      ? api.movieImages(credential, id)
      : owner === 'show'
        ? api.showImages(credential, id)
        : api.collectionImages(credential, id)
  }

  /**
   * fanart.tv's choices for the title (HT-74), asked first when its answer is missing or old. The
   * dialog waits on this, never a film's page; when fanart.tv is off, down or has nothing, it's an
   * empty list and the dialog shows no fanart.tv section.
   */
  async function fanartOptions(owner: ArtworkOwner, id: number, kind: ArtworkKind) {
    const subject = subjectOf(owner, id)
    if (!subject || !fanart.enabled()) return []
    return fanart.options(subject[0], subject[1], kind)
  }

  async function freshFanart(owner: ArtworkOwner, id: number) {
    const subject = subjectOf(owner, id)
    if (!subject || !fanart.enabled() || !fanart.due(subject[0], subject[1])) return
    await refreshFanart(subject[0], Number(subject[1]))
  }

  const artworkApi = {
    pick,
    /**
     * Each kind's current, automatic and chosen file, and TMDB's alternatives, then fanart.tv's
     * (HT-74). When TMDB can't be asked (no key, unreachable), its options are empty and
     * `optionsError` says why: choosing still works for fanart.tv's, uploads and Reset.
     */
    async view(owner: ArtworkOwner, id: number) {
      // fanart.tv first, so its logo stands in as the automatic one when TMDB has none
      const [tmdb] = await Promise.allSettled([tmdbImages(owner, id), freshFanart(owner, id)])
      const automatic = await automaticArt(owner, id)
      const chosen = new Map(artwork.choices(owner, id).map((c) => [c.kind, c]))
      let images: Awaited<ReturnType<typeof tmdbImages>> | null = null
      let optionsError: AppError | null = null
      if (tmdb.status === 'fulfilled') images = tmdb.value
      else if (tmdb.reason instanceof AppError) optionsError = tmdb.reason
      else throw tmdb.reason
      const kinds: ArtworkKindView[] = []
      for (const kind of ARTWORK_KINDS_OF[owner]) {
        const choice = chosen.get(kind) ?? null
        kinds.push({
          kind,
          current: choice?.file ?? automatic[kind],
          automatic: automatic[kind],
          choice,
          options: [
            ...(images ? optionsOf(images, kind) : []),
            ...(await fanartOptions(owner, id, kind)),
          ],
        })
      }
      return { kinds, optionsError }
    },
    /** Chooses one of TMDB's or fanart.tv's images for the title; it must be among the title's own. */
    async choose(
      owner: ArtworkOwner,
      id: number,
      kind: ArtworkKind,
      file: string,
      by: string | null,
    ) {
      checkKind(owner, kind)
      await automaticArt(owner, id)
      const option = isFanartFile(file)
        ? (await fanartOptions(owner, id, kind)).find((o) => o.file === file)
        : optionsOf(await tmdbImages(owner, id), kind).find((o) => o.file === file)
      if (!option)
        throw new AppError(
          'invalid',
          isFanartFile(file)
            ? 'fanart.tv has no such image for this title.'
            : 'TMDB has no such image for this title.',
          { reason: 'not-an-option' },
        )
      const replaced = artwork.chooseOption(owner, id, kind, option, by)
      if (replaced) images.removeFile(replaced)
      announce(owner, id)
      return option.file
    },
    /** Keeps an uploaded image as the title's art. */
    async upload(
      owner: ArtworkOwner,
      id: number,
      kind: ArtworkKind,
      bytes: Uint8Array,
      by: string | null,
    ) {
      checkKind(owner, kind)
      await automaticArt(owner, id)
      const { file, replaced } = artwork.upload(owner, id, kind, bytes, by)
      if (replaced) images.removeFile(replaced)
      announce(owner, id)
      return file
    },
    /** Back to highsea's automatic choice; false when nothing was chosen. */
    reset(owner: ArtworkOwner, id: number, kind: ArtworkKind) {
      checkKind(owner, kind)
      const { removed, upload } = artwork.reset(owner, id, kind)
      if (upload) images.removeFile(upload)
      if (removed) announce(owner, id)
      return removed
    },
  }

  function checkKind(owner: ArtworkOwner, kind: ArtworkKind) {
    if (!ARTWORK_KINDS_OF[owner].includes(kind))
      throw new AppError('invalid', 'That title has no artwork of that kind.', { reason: 'kind' })
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
    const table =
      kind === 'movie'
        ? movieMetadata
        : kind === 'show'
          ? showMetadata
          : kind === 'person'
            ? people
            : collections
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
    await refreshCertifications(credential)
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
        ['show', showMetadata],
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
      // TV's list only once a show is cached: a server of films asks nothing more than it did
      const anyShow = !!db.select({ id: showMetadata.tmdbId }).from(showMetadata).limit(1).get()
      for (const kind of anyShow
        ? (['movie', 'person', 'show'] as const)
        : (['movie', 'person'] as const)) {
        const changed: number[] = []
        for (let n = 1, pages = 1; n <= pages && n <= 500; n++) {
          const result = await api.changes(credential, kind === 'show' ? 'tv' : kind, start, end, n)
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

  /**
   * TMDB ids the library refers to: its movies, their collections, their credited people, and its
   * shows (ADR 0064; a show's seasons are cached with it).
   */
  function referenced() {
    const library = db
      .select({ id: mediaItems.tmdbId })
      .from(mediaItems)
      .where(eq(mediaItems.type, 'movie'))
    return {
      library,
      shows: db
        .select({ id: mediaItems.tmdbId })
        .from(mediaItems)
        .where(eq(mediaItems.type, 'show')),
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
   * What the library's films are missing (HT-74), read from the data, so asking twice finds the
   * same and queueing it twice dedupes (ADR 0022):
   * - `refetch`: films never fetched; fetched before `images` was asked for (their logos are
   *   missing until they are); and films TMDB answered 404 for, asked again weekly, as an id TMDB
   *   dropped is sometimes back, and until then the row keeps the answer from before (no images);
   * - `fanart`: films whose TMDB answer has no logo, which fanart.tv hasn't been asked about
   *   lately; only while fanart.tv is on.
   */
  function libraryGaps() {
    const now = clock.now()
    const ref = referenced()
    const refetch: number[] = []
    if (settings.credential()) {
      for (const r of db
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
        .all())
        refetch.push(r.id)
      // SQLite's json_type is NULL for a path that isn't there (https://sqlite.org/json1.html#jtype)
      for (const r of db
        .select({ id: movieMetadata.tmdbId })
        .from(movieMetadata)
        .where(
          and(
            inArray(movieMetadata.tmdbId, ref.library),
            or(
              and(
                isNull(movieMetadata.goneAt),
                sql`json_type(${movieMetadata.data}, '$.images') is null`,
              ),
              lt(movieMetadata.goneAt, now - GONE_RETRY_MS),
            ),
          ),
        )
        .all())
        refetch.push(r.id)
    }
    const fanartDue: number[] = []
    if (fanart.enabled())
      for (const r of db
        .select({
          id: movieMetadata.tmdbId,
          language: movieMetadata.language,
          logos: sql<string | null>`json_extract(${movieMetadata.data}, '$.images.logos')`,
        })
        .from(movieMetadata)
        .where(
          and(
            inArray(movieMetadata.tmdbId, ref.library),
            isNull(movieMetadata.goneAt),
            sql`json_type(${movieMetadata.data}, '$.images') is not null`,
          ),
        )
        .all()) {
        const logos = r.logos ? (JSON.parse(r.logos) as TmdbImage[]) : []
        if (!automaticLogo(logos, r.language) && fanart.due('movie', r.id)) fanartDue.push(r.id)
      }
    return { refetch, fanart: fanartDue }
  }

  /** Queues what `libraryGaps` finds: refreshes and fanart.tv lookups, each deduped by its id. */
  function queueLibraryGaps() {
    const gaps = libraryGaps()
    for (const id of gaps.refetch) enqueueRefresh('movie', id)
    for (const id of gaps.fanart) queueFanart('movie', id)
    return { refetch: gaps.refetch.length, fanart: gaps.fanart.length }
  }

  /**
   * The catch-up (HT-74): what an update left the library missing, queued minutes after boot
   * instead of at the next daily sweep, whose time is kept in the database (`job_schedules`).
   * The refreshes it queues run at `metadata.refresh`'s concurrency, through the TMDB client's
   * limiter and its 429 handling, as the sweep's do.
   */
  function runCatchUp() {
    const queued = queueLibraryGaps()
    if (queued.refetch + queued.fanart) logger.info('metadata catch-up queued', queued)
    return queued
  }

  /**
   * The spread full refresh, daily: each run refreshes the oldest 1/25th of what the library refers
   * to, and anything older than 30 days, so every row is refreshed at least monthly without one
   * large run, and refresh times spread out over the days. It queues the library's gaps first.
   */
  function runSweep() {
    if (!settings.credential()) return { queued: 0 }
    const now = clock.now()
    const ref = referenced()
    const gaps = queueLibraryGaps()
    let queued = gaps.refetch + gaps.fanart
    // library shows with no cached row yet
    for (const r of db
      .select({ id: mediaItems.tmdbId })
      .from(mediaItems)
      .where(
        and(
          eq(mediaItems.type, 'show'),
          notInArray(mediaItems.tmdbId, db.select({ id: showMetadata.tmdbId }).from(showMetadata)),
        ),
      )
      .all()) {
      enqueueRefresh('show', r.id)
      queued++
    }
    for (const [kind, table, ids] of [
      ['movie', movieMetadata, ref.library],
      ['collection', collections, ref.collections],
      ['person', people, ref.people],
      ['show', showMetadata, ref.shows],
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
    const purged = { movies: 0, people: 0, collections: 0, shows: 0, images: 0 }
    const owners: { type: CacheKind; ids: number[] }[] = []
    for (const [kind, table, keep, count] of [
      ['movie', movieMetadata, ref.library, 'movies'],
      ['person', people, ref.people, 'people'],
      ['collection', collections, ref.collections, 'collections'],
      // a show's seasons go with it (season_metadata's foreign key)
      ['show', showMetadata, ref.shows, 'shows'],
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
    // fanart.tv's answers for films the library doesn't have, on the same six months
    fanart.purge('movie', cutoff, new Set(ref.library.all().map((r) => String(r.id))))
    const unique = [...new Map(doomed.map((d) => [`${d.size}${d.path}`, d])).values()]
    purged.images = images.remove(unique)
    if (purged.movies + purged.people + purged.collections + purged.shows + purged.images)
      logger.info('metadata purged', purged)
    return purged
  }

  return {
    settings,
    api,
    requireKey,
    refreshConfiguration,
    refreshCertifications,
    certifications,
    movie,
    cachedMovie,
    show,
    cachedShow,
    recommendations,
    collection,
    person,
    discover,
    images,
    artwork: artworkApi,
    refreshNow,
    enqueueRefresh,
    runChanges,
    runSweep,
    runPurge,
    runCatchUp,
    libraryGaps,
    refreshFanart,
    fanart,
  }
}
