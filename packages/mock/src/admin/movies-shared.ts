// SPDX-License-Identifier: AGPL-3.0-only
// What the movies area's answers share (one-client-platform-d.md › D2): finding a title by the
// contract's TMDB number, the mock's titles in the contract's Movie and DiscoverMovie shapes, the
// library's paging, and the server's refusals in its words.
//
// The contract addresses a title by TMDB's id, where the mock keeps its own (films.ts's `tmdbId`).
// Dates go out on the wall clock (`wall`), days included, so Upcoming, Wanted and the calendar line
// up with the admin's today; the films apps' answers (films.ts) keep the seed's days as they are.
import type { DiscoverMovie, Movie, MoviePage } from '@highsea-tv/api-contract'
import { createT, defineMessages } from '@highsea-tv/i18n'
import { fold } from '@highsea-tv/media/search'
import { art, dayOf, votesOf } from '../films.ts'
import { knownTitles } from '../metadata.ts'
import type { ServerState } from '../seed.ts'
import type { MediaItem, DiscoverMovie as MockDiscover } from '../types.ts'
import { type AdminKit, type Ctx, refuse } from './kit.ts'

export const moviesMessages = defineMessages({
  // packages/media, packages/metadata, packages/downloads and packages/curation, word for word
  'movies.notInLibrary': 'That movie isn’t in the library.',
  'movies.tmdbMovie': 'TMDB has no movie with that id.',
  'movies.tmdbCollection': 'TMDB has no collection with that id.',
  'movies.noIndexers': 'Add an indexer to search for releases.',
  'movies.rootFolder': 'Pick one of the root folders.',
  'movies.duplicateLabel': 'Each version needs its own label.',
  'movies.versionsMax': 'A movie has at most ten versions.',
  'movies.versionUnknown': 'That version doesn’t exist.',
  'movies.lastVersion': 'A movie keeps at least one version.',
  'movies.qualityProfile': 'That quality profile doesn’t exist.',
  'movies.languageProfile': 'That language profile doesn’t exist.',
  'movies.cursor': 'That page link has expired. Start from the first page.',
  'movies.releaseGone': 'That release is no longer in the search results. Search again.',
  'movies.rejected': 'That release was rejected{why}. Grab anyway takes it.',
  'movies.rangeBackwards': 'The range ends before it starts.',
  'movies.rangeLong': 'Ask for at most {max} days at once.',
  'collections.unknown': 'There’s no collection with that id.',
  'collections.inUse':
    'The featured section “{title}” draws on it. Choose another source for the section first.',
  'collections.namedBy':
    'The collection “{name}” names it in its rules. Change that collection first.',
})

export const t = createT(moviesMessages)

export const DAY = 86_400_000

/** The server's MediaStatus for the mock's (packages/media's titles.ts: a title without a file is wanted when monitored). */
export function statusOf(m: MediaItem): Movie['status'] {
  switch (m.status) {
    case 'available':
    case 'cutoff-unmet':
      return 'available'
    case 'downloading':
    case 'queued':
      return 'downloading'
    case 'unreleased':
      return 'not-released'
    case 'missing':
      return m.monitored ? 'wanted' : 'unmonitored'
  }
}

/** Out of 5, to one decimal: the mock's ratings already are. */
export const starsOf = (rating: number) => Math.min(5, Math.max(0, Math.round(rating * 10) / 10))

/** The movies-area state the mock doesn't keep: tags on movies, the last release searches, the feed's key. */
export type MoviesMemory = {
  tags: Map<number, string[]>
  searches: Map<number, { at: number; guids: Set<string> }>
  feed: Map<string, { secret: string; createdAt: number }>
}

export function moviesKit(kit: AdminKit, memory: MoviesMemory) {
  const day = (date: string) => dayOf(kit.wall(date))

  const libraryOf = (state: ServerState) => state.items.filter((m) => m.type === 'movie')

  /** A library movie by TMDB number, or the server's 404. */
  const inLibrary = (ctx: Ctx, id: number): MediaItem => {
    const m = libraryOf(ctx.srv.state).find((x) => x.tmdbId === id)
    if (!m) throw refuse('not-found', t('movies.notInLibrary'))
    return m
  }

  /** Any title TMDB (the mock's metadata) knows, by TMDB number. */
  const known = (ctx: Ctx, id: number): MockDiscover => {
    const m = knownTitles(ctx.srv.state).find((x) => x.tmdbId === id)
    if (!m) throw refuse('not-found', t('movies.tmdbMovie'))
    return m
  }

  /** The mock's id for a TMDB number, library first; null when the mock doesn't know it. */
  const mockIdOf = (state: ServerState, id: number) =>
    libraryOf(state).find((x) => x.tmdbId === id)?.id ??
    knownTitles(state).find((x) => x.tmdbId === id)?.id ??
    null

  const tmdbIdOf = (state: ServerState, mockId: string) =>
    state.items.find((x) => x.id === mockId)?.tmdbId ??
    knownTitles(state).find((x) => x.id === mockId)?.tmdbId ??
    null

  const movieOf = (m: MediaItem): Movie => ({
    id: m.tmdbId,
    type: 'movie',
    title: m.title,
    originalTitle: m.originalTitle ?? m.title,
    sortTitle: m.sortTitle,
    year: m.year || null,
    runtimeMinutes: m.runtimeMinutes || null,
    genres: m.genres,
    synopsis: m.synopsis,
    rating: starsOf(m.rating),
    voteCount: votesOf(m.title),
    releaseDate: day(m.releaseDate),
    art: art(m.art),
    status: statusOf(m),
    monitored: m.monitored,
    minimumAvailability: m.minimumAvailability,
    // the mock writes '' for none
    languageProfileId: m.languageProfileId || null,
    qualityProfileId: m.versions[0]?.qualityProfileId ?? '',
    rootFolder: m.rootFolder,
    path: m.path,
    addedAt: kit.wall(m.addedAt),
    versions: m.versions.map((v) => ({
      id: v.id,
      label: v.label,
      qualityProfileId: v.qualityProfileId,
      fileId: v.fileId,
    })),
    gone: false,
    tags: memory.tags.get(m.tmdbId) ?? [],
  })

  const discoverOf = (x: MockDiscover, inLib: boolean): DiscoverMovie => ({
    id: x.tmdbId,
    title: x.title,
    year: x.year || null,
    runtimeMinutes: x.runtimeMinutes || null,
    genres: x.genres,
    synopsis: x.synopsis,
    rating: starsOf(x.rating),
    voteCount: votesOf(x.title),
    releaseDate: day(x.releaseDate),
    art: art(x.art),
    inLibrary: inLib,
  })

  return { day, libraryOf, inLibrary, known, mockIdOf, tmdbIdOf, movieOf, discoverOf }
}

export type MoviesKit = ReturnType<typeof moviesKit>

// ---------------------------------------------------------------- the library's pages

type Sort = 'title' | 'added' | 'year' | 'rating'
type Query = {
  title?: string
  sort?: Sort
  dir?: 'asc' | 'desc'
  cursor?: string
  limit?: number
}

/** `p:` and the offset: the mock's library is small, so an offset stands in for the server's keyset. */
const offsetOf = (cursor: string | undefined) => {
  if (cursor === undefined) return 0
  const n = /^p:(\d+)$/.exec(cursor)
  if (!n) throw refuse('invalid', t('movies.cursor'), { field: 'cursor', reason: 'cursor' })
  return Number(n[1])
}

/** Matches the title or original title, ignoring case and accents (packages/media's `list`). */
export const titleMatches = (m: Movie, q: string | undefined) =>
  !q || fold(m.title).includes(fold(q)) || fold(m.originalTitle).includes(fold(q))

/**
 * A page of movies, sorted as packages/media sorts them: Title A to Z, the others newest or highest
 * first, ties by TMDB id. `counts` are the status tabs', from `forCounts` (every filter but status).
 */
export function pageOf(rows: Movie[], forCounts: Movie[], q: Query): MoviePage {
  const sort = q.sort ?? 'title'
  const dir = q.dir ?? (sort === 'title' ? 'asc' : 'desc')
  const key = (m: Movie): string | number =>
    sort === 'title'
      ? m.sortTitle
      : sort === 'added'
        ? m.addedAt
        : sort === 'year'
          ? (m.year ?? 0)
          : m.rating
  const sorted = [...rows].sort((a, b) => {
    const x = key(a)
    const y = key(b)
    const c = x < y ? -1 : x > y ? 1 : 0
    return (dir === 'asc' ? c : -c) || a.id - b.id
  })
  const limit = q.limit ?? 60
  const from = offsetOf(q.cursor)
  const items = sorted.slice(from, from + limit)
  const count = (s: Movie['status']) => forCounts.filter((m) => m.status === s).length
  return {
    items,
    next: from + limit < sorted.length ? `p:${from + limit}` : null,
    total: sorted.length,
    counts: {
      all: forCounts.length,
      available: count('available'),
      wanted: count('wanted'),
      downloading: count('downloading'),
      'not-released': count('not-released'),
      unmonitored: count('unmonitored'),
    },
  }
}
