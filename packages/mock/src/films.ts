// SPDX-License-Identifier: AGPL-3.0-only
// The films apps' reads as the SDK's transport answers them (one-client-platform-b.md › B1): Home,
// the library, collections, a film's page, a person's page, Search and watch state, in the
// contract's shapes (@highsea-tv/api-contract's library, collections, curation, metadata and
// playback routes), made from the mock's own state. The real server's rules are the reference, and
// each part names the code it follows: Home is packages/curation's `homeFor` over the runtime's
// `builtIn` and `homeRows`; the library is packages/media's `list` and `pageRows`; Search is its
// `searchMovies`, `searchCollections` and `searchPeople`; a person is packages/metadata's
// `toPerson`; collections are packages/curation's `forApps` and `page`; watch state is ADR 0054's,
// through packages/media's `progressOf` and its playback. Search's rules are the server's own,
// imported through `@highsea-tv/media/search` (ADR 0061).
//
// The contract addresses titles, people and collections by TMDB's numbers, where the mock has its
// own ids and slugs. A title's number is the mock's `tmdbId`; a person's, a collection's and a
// genre's are made from their slugs (`tmdbNumber`), the same on every run, and found again by
// scanning the credits and collections the mock knows. The mock's genres aren't all TMDB's
// ("Sci-Fi"), so a genre row's id is numbered the same way rather than by TMDB's genre list.
//
// Shows, episodes and music stay out of every answer here: B3 drafts their routes. So Home has the
// featured sections' films and the films' built-in rows, Search films, collections and people.
//
// Nothing here reads the real clock: every date comes from the mock's seed, which is laid out from
// its fixed EPOCH (clock.ts), and `now` is the mock's own clock, so the same seed draws the same
// screens.
import type {
  Credit as ApiCredit,
  Video as ApiVideo,
  ClientAudio,
  ClientCollection,
  ClientDetail,
  ClientItem,
  ClientItemPage,
  ClientSubtitle,
  ClientType,
  ClientVersion,
  DiscoverMovie,
  HomeItem,
  HomeSection,
  LibraryCollection,
  LibraryCollectionPage,
  Person,
  PersonCredit,
  PlaybackPrefs,
  SearchPerson,
  SearchResults,
} from '@highsea-tv/api-contract'
import {
  fold,
  matchScore,
  rankByMatch,
  rankSections,
  SEARCH_LIMIT,
  SEARCH_MOVIE_POOL,
  SEARCH_PEOPLE_POOL,
  sortTitleOf,
} from '@highsea-tv/media/search'
import { describe, evaluate, fields } from './collections.ts'
import {
  knownTitles,
  person as metadataPerson,
  movieMetadata,
  recommendations,
  collection as tmdbCollection,
} from './metadata.ts'
import type { ServerState } from './seed.ts'
import { type Api, curationStatus, type MockServer } from './server.ts'
import type {
  Audience,
  ClientTrack,
  Credit,
  FeaturedSection,
  MediaItem,
  MediaStatus,
  DiscoverMovie as MockDiscover,
  ClientVersion as MockVersion,
  SmartCollection,
  User,
  Video,
} from './types.ts'

// ---------------------------------------------------------------- ids

/** FNV-1a, as the mock's metadata derives its facts from a title (metadata.ts). */
function hash(s: string): number {
  let h = 2166136261
  for (const c of s) h = Math.imul(h ^ (c.codePointAt(0) ?? 0), 16777619)
  return h >>> 0
}

/** A TMDB-shaped number for a slug the mock knows a person, a collection or a genre by. */
export const tmdbNumber = (slug: string) => 1 + (hash(slug) % 99_999_999)

/**
 * The seeded ids that have every part a B1 screen draws (cast and crew, versions with tracks, a
 * backdrop, a biography, a collection's parts), for the screens' tests and the layout check
 * (scripts/sweeps/layout.ts). The same film, person and collection the old prototypes were
 * captured with for B1's compare sheet: Tears of Steel, Buster Keaton and the Caminandes
 * Collection. `id` is the contract's address; `mock` is the mock's own.
 */
export const SEED = {
  film: { id: 10111, mock: '4', title: 'Tears of Steel' },
  person: { id: tmdbNumber('buster-keaton'), mock: 'buster-keaton', name: 'Buster Keaton' },
  collection: {
    id: String(tmdbNumber('caminandes')),
    mock: 'caminandes',
    name: 'Caminandes Collection',
  },
} as const

// ---------------------------------------------------------------- the server's numbers

/** Titles in a featured section (packages/curation's SECTION_MAX). */
export const SECTION_MAX = 50
/** Titles in a built-in Home row (the runtime's ROW_MAX). */
export const ROW_MAX = 20
/** Genre rows on Home (the runtime's GENRE_ROWS_MAX). */
export const GENRE_ROWS_MAX = 8
/** Results per kind in Search (packages/media's SECTION_LIMIT). */
export const SEARCH_MAX = SEARCH_LIMIT
/** The library's page when none is asked for, and the most a page holds (packages/media's). */
export const PAGE_DEFAULT = 60
const PAGE_MAX = 200
/** Past this share of its length a title counts as watched (packages/media's WATCHED_AT). */
export const WATCHED_AT = 0.9
/** Posters in a smart collection's mosaic (packages/curation's MOSAIC). */
const MOSAIC = 4
/** Recently added's windows (packages/curation's RECENT_WINDOWS). */
const RECENT_WINDOWS: Record<string, number> = { '7d': 7, '30d': 30, '90d': 90 }
const DAY = 86_400_000

// ---------------------------------------------------------------- refusals

/**
 * What a read refuses, for the transport to answer as the server does: a title, collection or
 * person that isn't there (404), a version that isn't the title's or a page link that doesn't fit
 * (400).
 */
export type Refusal = 'title' | 'collection' | 'person' | 'version' | 'cursor'

export class FilmRefused extends Error {
  readonly refusal: Refusal
  constructor(refusal: Refusal) {
    super(refusal)
    this.refusal = refusal
  }
}

// ---------------------------------------------------------------- shared mappers

/** The real server's statuses (LIBRARY_STATUSES) for the mock's. */
const STATUS: Record<MediaStatus, ClientItem['status']> = {
  available: 'available',
  'cutoff-unmet': 'available',
  downloading: 'downloading',
  queued: 'downloading',
  missing: 'wanted',
  unreleased: 'not-released',
}

/** A date as its day, in the zone the seed laid it out in (seed.ts uses local dates). */
const dayOf = (date: string) => {
  const d = new Date(Date.parse(date))
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}
const isoOf = (date: string) => new Date(Date.parse(date)).toISOString()
/** TMDB's vote count isn't in the seed: derived from the title, as the mock's other facts are. */
const votesOf = (title: string) => 120 + (hash(title) % 4800)
const starsOf = (rating: number) => Math.min(5, Math.max(0, Math.round(rating * 10) / 10))
/** Plain code order, as SQLite's BINARY collation compares text. */
const byCode = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)
/** "2010–2016", or one year; empty without one (packages/curation's `yearsOf`). */
const yearsOf = (years: number[]) => {
  if (!years.length) return ''
  const lo = Math.min(...years)
  const hi = Math.max(...years)
  return lo === hi ? String(lo) : `${lo}–${hi}`
}
/** SQLite's LIKE with `%…%`: contains, ignoring case. */
const like = (hay: string | null | undefined, query: string) =>
  !!hay && hay.toLowerCase().includes(query.toLowerCase())

const art = (a: { poster: string; backdrop: string }) => ({
  poster: a.poster || null,
  backdrop: a.backdrop || null,
})

/** A title the household can watch: some version has a file (the server's HAS_FILE). */
const playableOf = (m: MediaItem) => m.type === 'movie' && m.versions.some((v) => v.fileId)

function credit(c: Credit, titleId: number, kind: 'cast' | 'crew', i: number): ApiCredit {
  return {
    id: `${titleId}-${kind}-${i}`,
    personId: tmdbNumber(c.personId),
    name: c.name,
    photo: c.photo || null,
    department: c.department,
    character: c.character,
    job: c.job,
  }
}

const video = (v: Video): ApiVideo => ({
  id: v.id,
  name: v.name,
  kind: v.kind,
  site: v.site,
  key: v.key,
  official: true,
  publishedAt: isoOf(v.publishedAt),
  still: v.still || null,
})

const discover = (t: MockDiscover, here: boolean): DiscoverMovie => ({
  id: t.tmdbId,
  title: t.title,
  year: t.year,
  runtimeMinutes: t.runtimeMinutes || null,
  genres: t.genres,
  synopsis: t.synopsis,
  rating: starsOf(t.rating),
  voteCount: votesOf(t.title),
  releaseDate: dayOf(t.releaseDate),
  art: art(t.art),
  inLibrary: here,
})

/** "5.1" as six channels, "Stereo" as two. */
const channelsOf = (s: string) => {
  const n = /^(\d+)(?:\.(\d))?/.exec(s)
  if (n) return Number(n[1]) + Number(n[2] ?? 0)
  return /mono/i.test(s) ? 1 : 2
}

/** Who sees a section or a collection (packages/curation's `reaches`). */
function reaches(audience: Audience, u: User, client: ClientType) {
  switch (audience.kind) {
    case 'everyone':
      return true
    case 'roles':
      return audience.roles.includes(u.role)
    case 'users':
      return audience.userIds.includes(u.id)
    case 'clients':
      return audience.clients.includes(client)
  }
}

// ---------------------------------------------------------------- the library's cursor

type Sort = 'title' | 'added' | 'year' | 'rating'
type Dir = 'asc' | 'desc'
/** packages/media's cursor: the sort, the direction, the last row's value and its id. */
type Cursor = { s: Sort; d: Dir; v: string | number; i: string }

/** base64url of the JSON, as the server's `Buffer…toString('base64url')`, without Node. */
const encode = (c: Cursor) => {
  let bin = ''
  for (const b of new TextEncoder().encode(JSON.stringify(c))) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function decode(cursor: string, sort: Sort, dir: Dir): Cursor {
  let c: unknown
  try {
    const bin = atob(cursor.replace(/-/g, '+').replace(/_/g, '/'))
    c = JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, (ch) => ch.charCodeAt(0))))
  } catch {
    throw new FilmRefused('cursor')
  }
  const x = c as Cursor
  const ok =
    typeof c === 'object' &&
    c !== null &&
    x.s === sort &&
    x.d === dir &&
    typeof x.i === 'string' &&
    ['string', 'number'].includes(typeof x.v)
  if (!ok) throw new FilmRefused('cursor')
  return x
}

// ---------------------------------------------------------------- the reads

export type FilmsCtx = { srv: MockServer; api: Api; userId: string }

export function filmsOf({ srv, api, userId }: FilmsCtx) {
  const { state } = srv
  const now = srv.clock.now()
  const films = () => state.items.filter((m) => m.type === 'movie')
  const playable = () => films().filter(playableOf)

  const me = state.users.find((u) => u.id === userId)
  /** Staff see every library; a user the ones they're given (stage 6's `sees`). */
  const seesMovies =
    !!me && (me.role !== 'user' || me.libraries === 'all' || me.libraries.includes('movies'))

  const byTmdb = (id: number) => {
    const m = films().find((x) => x.tmdbId === id)
    if (!m || !seesMovies) throw new FilmRefused('title')
    return m
  }

  // ------------------------------------------------------------ watch state (ADR 0054)

  const key = (itemId: string) => `${userId}:${itemId}`
  const positionOf = (itemId: string) =>
    state.watch.find((w) => w.userId === userId && w.itemId === itemId)
  const playedSet = () => new Set(state.played ?? [])

  /**
   * packages/media's `progressOf` and `playedOf`: no place, no progress; past WATCHED_AT the title
   * counts as watched and plays from the start, as the server clears the place when it's reported.
   */
  function watchOf(m: MediaItem, played = playedSet()) {
    const w = positionOf(m.id)
    const length = m.runtimeMinutes * 60
    const p = w && w.position > 0 && length > 0 ? w.position / length : null
    const done = p !== null && p >= WATCHED_AT
    return {
      progress: p === null || done ? null : Math.round(p * 1000) / 1000,
      position: !w || w.position <= 0 || done ? 0 : w.position,
      watched: played.has(key(m.id)) || done,
    }
  }

  const changed = () => srv.events.emit({ type: 'watch.updated' })
  const forget = (itemId: string) => {
    state.watch = state.watch.filter((w) => !(w.userId === userId && w.itemId === itemId))
  }

  /** Watched (the flag, the place cleared) or unwatched (both gone), as packages/media's playback. */
  function played(id: number, watched: boolean) {
    const m = byTmdb(id)
    const set = playedSet()
    if (watched) set.add(key(m.id))
    else set.delete(key(m.id))
    state.played = [...set]
    forget(m.id)
    changed()
  }

  /** Off Continue watching: the place goes, what's been watched stays (ADR 0054's 2026-11-01 section). */
  function dismiss(id: number) {
    forget(byTmdb(id).id)
    changed()
  }

  function prefs(id: number): PlaybackPrefs {
    const p = state.prefs[key(byTmdb(id).id)] ?? {}
    return {
      versionId: p.versionId ?? null,
      audioId: p.audioId ?? null,
      subtitleId: p.subtitleId ?? null,
      subtitleOffsetMs: p.subtitleOffsetMs ?? 0,
    }
  }

  /** Saves the picks sent; a version that isn't the title's is refused (packages/media's). */
  function setPrefs(id: number, patch: Partial<PlaybackPrefs>) {
    const m = byTmdb(id)
    if (patch.versionId && !m.versions.some((v) => v.id === patch.versionId))
      throw new FilmRefused('version')
    const { versionId, ...rest } = patch
    const next = { ...state.prefs[key(m.id)], ...rest }
    if (versionId !== undefined) {
      if (versionId === null) delete next.versionId
      else next.versionId = versionId
    }
    state.prefs[key(m.id)] = next
    changed()
    return prefs(id)
  }

  // ------------------------------------------------------------ items

  function item(m: MediaItem, played = playedSet()): ClientItem {
    return {
      id: m.tmdbId,
      type: 'movie',
      title: m.title,
      year: m.year,
      runtimeMinutes: m.runtimeMinutes || null,
      genres: m.genres,
      synopsis: m.synopsis,
      rating: starsOf(m.rating),
      voteCount: votesOf(m.title),
      releaseDate: dayOf(m.releaseDate),
      addedAt: isoOf(m.addedAt),
      status: STATUS[m.status],
      playable: playableOf(m),
      art: art(m.art),
      ...watchOf(m, played),
    }
  }
  const items = (ms: MediaItem[]) => {
    const played = playedSet()
    return ms.map((m) => item(m, played))
  }

  /** packages/media's sort columns: the sort title (folded, articles off), added, year, rating. */
  const sortValue = (m: MediaItem, sort: Sort): string | number =>
    sort === 'title'
      ? sortTitleOf(m.title)
      : sort === 'added'
        ? Date.parse(m.addedAt)
        : sort === 'year'
          ? m.year
          : m.rating
  const compare = (x: string | number, y: string | number) =>
    typeof x === 'string' ? byCode(x, y as string) : x - (y as number)

  // ------------------------------------------------------------ the library

  /** GET /items: the library a page at a time (packages/media's `list` and `pageRows`). */
  function list(q: {
    genre?: string
    playable?: 'true' | 'false'
    sort?: Sort
    dir?: Dir
    cursor?: string
    limit?: number
  }): ClientItemPage {
    const sort = q.sort ?? 'title'
    const dir = q.dir ?? (sort === 'title' ? 'asc' : 'desc')
    const after = q.cursor ? decode(q.cursor, sort, dir) : null
    if (!seesMovies) return { items: [], next: null, total: 0 }
    const limit = Math.min(
      Math.max(Math.trunc(q.limit ?? PAGE_DEFAULT) || PAGE_DEFAULT, 1),
      PAGE_MAX,
    )
    const genre = q.genre?.trim().toLowerCase()
    const all = films()
      .filter((m) => q.playable === undefined || playableOf(m) === (q.playable === 'true'))
      .filter((m) => !genre || m.genres.some((g) => g.toLowerCase() === genre))
    // the value, then the row id, both in the sort's direction
    const sign = dir === 'asc' ? 1 : -1
    const order = (a: { v: string | number; i: string }, b: { v: string | number; i: string }) =>
      (compare(a.v, b.v) || byCode(a.i, b.i)) * sign
    const rows = all
      .map((m) => ({ m, v: sortValue(m, sort), i: m.id }))
      .sort(order)
      .filter((r) => !after || order(r, after) > 0)
    const page = rows.slice(0, limit)
    const last = page[page.length - 1]
    return {
      items: items(page.map((r) => r.m)),
      next: last && rows.length > limit ? encode({ s: sort, d: dir, v: last.v, i: last.i }) : null,
      total: all.length,
    }
  }

  // ------------------------------------------------------------ a film's page

  function tracks(m: MediaItem, v: MockVersion) {
    const version = m.versions.find((x) => x.id === v.id)
    const file = state.files.find((f) => f.id === version?.fileId)
    const stream = (index: number) => file?.streams.find((s) => s.index === index)
    const audio = (t: ClientTrack): ClientAudio => {
      const s = stream(Number(t.id.slice(1)))
      const channels = s?.type === 'audio' ? s.channels : '2.0'
      return {
        id: t.id,
        language: t.language,
        label: t.label,
        detail: t.detail,
        codec: s?.type === 'audio' ? s.codec : 'aac',
        channels: channelsOf(channels),
        default: t.default,
      }
    }
    const subtitle = (t: ClientTrack): ClientSubtitle => {
      const external = state.subtitles.find((x) => x.id === t.id)
      const s = external ? undefined : stream(Number(t.id.slice(1)))
      return {
        id: t.id,
        language: t.language,
        label: t.label,
        forced: external?.forced ?? (s?.type === 'subtitle' && s.forced),
        hi: external?.hi ?? (s?.type === 'subtitle' && s.hi),
        format: external?.format ?? (s?.type === 'subtitle' ? s.codec : 'srt'),
        kind: external ? external.kind : 'embedded',
      }
    }
    return { audio: v.audio.map(audio), subtitles: v.subtitles.map(subtitle) }
  }

  /** GET /items/movie/{id}: a film's page and the player's (packages/media's `item`). */
  function detail(id: number, client: ClientType): ClientDetail {
    const m = byTmdb(id)
    const meta = movieMetadata(state, m.id, now)
    // the mock's own detail has the versions' tracks, for a film that plays
    const own = playableOf(m) ? api.library.item(m.id, client) : null
    const versions = m.versions.map((v): ClientVersion => {
      const found = own?.versions.find((x) => x.id === v.id)
      return found
        ? { id: v.id, label: v.label, detail: found.detail, playable: true, ...tracks(m, found) }
        : { id: v.id, label: v.label, detail: null, playable: false, audio: [], subtitles: [] }
    })
    const cast = meta?.cast ?? []
    const crew = meta?.crew ?? []
    const related = items(
      recommendations(state, m.id, 20).flatMap((t) => films().find((f) => f.id === t.id) ?? []),
    )
    return {
      item: item(m),
      originalTitle: meta?.originalTitle ?? m.title,
      tagline: meta?.tagline ?? null,
      certification: meta?.certification ?? null,
      studios: meta?.studios ?? [],
      cast: cast.map((c, i) => credit(c, m.tmdbId, 'cast', i)),
      directors: crew.flatMap((c, i) =>
        c.job === 'Director' ? [credit(c, m.tmdbId, 'crew', i)] : [],
      ),
      crew: crew.flatMap((c, i) =>
        c.job === 'Director' || c.job === 'Producer' ? [] : [credit(c, m.tmdbId, 'crew', i)],
      ),
      videos: (meta?.videos ?? []).map(video),
      collection: meta?.collection
        ? { id: tmdbNumber(meta.collection.id), name: meta.collection.name }
        : null,
      versions,
      related,
    }
  }

  // ------------------------------------------------------------ collections

  /** Its rules in words, as the admin's editor describes them. */
  const wordsOf = (c: SmartCollection) =>
    describe(
      c.rules,
      fields(
        state,
        now,
        state.collections.map((x) => ({ id: x.id, name: x.name })),
      ),
    )

  /** A smart collection's films this person can play, in its order (packages/curation's `forApps`). */
  function smartOf(c: SmartCollection) {
    const ms = evaluate(state, c, now, state.collections)
      .map((f) => f.item)
      .filter(playableOf)
    const first = ms[0]
    if (!first) return null
    const collection: LibraryCollection = {
      id: c.id,
      name: c.name,
      overview: c.summary,
      art: {
        poster: c.artwork ?? (first.art.poster || null),
        backdrop: first.art.backdrop || null,
      },
      count: ms.length,
      years: yearsOf(ms.map((m) => m.year)),
      smart: {
        rules: c.rules !== null,
        words: wordsOf(c),
        mosaic: c.artwork
          ? []
          : ms.slice(0, MOSAIC).flatMap((m) => (m.art.poster ? [m.art.poster] : [])),
      },
    }
    return { collection, ms }
  }

  /** TMDB's collections a film here belongs to, by name, with their parts in release order. */
  function tmdbCollections(among: MediaItem[]) {
    const groups = new Map<string, { name: string; ms: MediaItem[] }>()
    for (const m of among) {
      const ref = movieMetadata(state, m.id, now)?.collection
      if (!ref) continue
      const g = groups.get(ref.id) ?? { name: ref.name, ms: [] }
      g.ms.push(m)
      groups.set(ref.id, g)
    }
    return [...groups.entries()]
      .map(([slug, g]) => ({
        slug,
        name: g.name,
        overview: tmdbCollection(state, slug)?.overview ?? '',
        // the runtime's order: year, release date, row id
        ms: [...g.ms].sort(
          (a, b) =>
            a.year - b.year ||
            byCode(dayOf(a.releaseDate), dayOf(b.releaseDate)) ||
            byCode(a.id, b.id),
        ),
      }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }

  const tmdbForApps = (c: ReturnType<typeof tmdbCollections>[number]): LibraryCollection => {
    const first = c.ms[0] as MediaItem
    return {
      id: String(tmdbNumber(c.slug)),
      name: c.name,
      overview: c.overview,
      art: art(first.art),
      count: c.ms.length,
      years: yearsOf(c.ms.map((m) => m.year)),
      smart: null,
    }
  }

  const ownFor = (client: ClientType) =>
    me
      ? state.collections
          .filter((c) => reaches(c.audience, me, client))
          .flatMap((c) => smartOf(c) ?? [])
      : []

  /** GET /library/collections: the server's own this person sees, then TMDB's with films here. */
  const collections = (client: ClientType): LibraryCollection[] =>
    seesMovies
      ? [
          ...ownFor(client).map((x) => x.collection),
          ...tmdbCollections(playable()).map(tmdbForApps),
        ]
      : []

  /** GET /library/collections/{id}: the server's (`sc-…`) or TMDB's (its number). */
  function collectionPage(id: string, client: ClientType): LibraryCollectionPage {
    if (!seesMovies) throw new FilmRefused('collection')
    if (id.startsWith('sc-')) {
      const c = state.collections.find((x) => x.id === id)
      const found = c && me && reaches(c.audience, me, client) ? smartOf(c) : null
      if (!found) throw new FilmRefused('collection')
      return { collection: found.collection, items: items(found.ms) }
    }
    const c = tmdbCollections(playable()).find((x) => String(tmdbNumber(x.slug)) === id)
    if (!c) throw new FilmRefused('collection')
    return { collection: tmdbForApps(c), items: items(c.ms) }
  }

  // ------------------------------------------------------------ Home

  /** A featured section's films, as packages/curation's `picks` and the runtime's `ruleSql`. */
  function picks(f: FeaturedSection): MediaItem[] {
    const ms = playable()
    const source = f.source
    if (source.kind === 'manual')
      return source.itemIds.flatMap((x) => ms.find((m) => m.id === x) ?? []).slice(0, SECTION_MAX)
    const value = source.value.trim()
    const byRating = (a: MediaItem, b: MediaItem) =>
      b.rating - a.rating ||
      byCode(sortTitleOf(a.title), sortTitleOf(b.title)) ||
      byCode(a.id, b.id)
    let picked: MediaItem[] = []
    if (source.rule === 'recently-added') {
      const days = RECENT_WINDOWS[value]
      picked = days
        ? ms
            .filter((m) => Date.parse(m.addedAt) >= now - days * DAY)
            .sort((a, b) => Date.parse(b.addedAt) - Date.parse(a.addedAt) || byCode(a.id, b.id))
        : []
    } else if (source.rule === 'genre') {
      picked = value
        ? ms
            .filter((m) => m.genres.some((g) => g.toLowerCase() === value.toLowerCase()))
            .sort(byRating)
        : []
    } else if (value.startsWith('sc-')) {
      const c = state.collections.find((x) => x.id === value)
      picked = c ? (smartOf(c)?.ms ?? []) : []
    } else {
      picked = tmdbCollections(ms).find((x) => x.slug === value)?.ms ?? []
    }
    return picked.slice(0, SECTION_MAX)
  }

  /** Home's built-in rows: Continue watching, Recently added and the genre rows (the runtime's `builtIn`). */
  function builtIn(): { id: string; title: string | null; ms: MediaItem[] }[] {
    const ms = playable()
    // started, newest first; only what's part way stays (progress isn't null)
    const started = state.watch
      .filter((w) => w.userId === userId)
      .map((w, i) => ({ w, i }))
      .sort((a, b) => byCode(b.w.updatedAt, a.w.updatedAt) || a.i - b.i)
      .flatMap(({ w }) => ms.find((m) => m.id === w.itemId) ?? [])
      .slice(0, ROW_MAX)
    const played = playedSet()
    const rows: { id: string; title: string | null; ms: MediaItem[] }[] = [
      {
        id: 'continue',
        title: null,
        ms: started.filter((m) => watchOf(m, played).progress !== null),
      },
      {
        id: 'recent',
        title: null,
        ms: [...ms]
          .sort((a, b) => Date.parse(b.addedAt) - Date.parse(a.addedAt) || byCode(a.id, b.id))
          .slice(0, ROW_MAX),
      },
    ]
    // the runtime's `homeRows`: the library's genres, most titles first, then by name
    const counts = new Map<string, number>()
    for (const m of films()) for (const g of m.genres) counts.set(g, (counts.get(g) ?? 0) + 1)
    const genres = [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || byCode(a[0], b[0]))
      .slice(0, GENRE_ROWS_MAX)
    for (const [genre] of genres)
      rows.push({
        id: `genre:${tmdbNumber(`genre:${genre}`)}`,
        title: genre,
        ms: ms
          .filter((m) => m.genres.includes(genre))
          .sort(
            (a, b) =>
              b.rating - a.rating ||
              byCode(sortTitleOf(a.title), sortTitleOf(b.title)) ||
              byCode(a.id, b.id),
          )
          .slice(0, ROW_MAX),
      })
    return rows
  }

  /**
   * GET /home: the live featured sections in this person's audience, the first hero on top and
   * later ones as rows, Continue watching after the hero, then the built-in rows; then their own
   * order and hidden rows (packages/curation's `homeFor`). Empty rows are left out.
   */
  function home(client: ClientType): HomeSection[] {
    if (!seesMovies || !me) return []
    const played = playedSet()
    let hero = false
    const featured = state.featured
      .filter((f) => curationStatus(f.schedule, now) === 'live' && reaches(f.audience, me, client))
      .sort((a, b) => a.order - b.order)
      .flatMap((f): HomeSection[] => {
        const by = new Map(f.overrides.map((o) => [o.itemId, o]))
        const its = picks(f).map((m): HomeItem => {
          const o = by.get(m.id)
          const x = item(m, played)
          return {
            ...x,
            art: o?.artwork ? { ...x.art, backdrop: o.artwork } : x.art,
            tagline: o?.tagline ?? null,
          }
        })
        if (!its.length) return []
        const layout =
          f.layout === 'hero' && !hero ? 'hero' : f.layout === 'hero' ? 'row' : f.layout
        if (layout === 'hero') hero = true
        return [{ id: f.id, title: f.title, suffix: f.tagline, layout, items: its }]
      })
    const rows = builtIn()
      .filter((r) => r.ms.length > 0)
      .map(
        (r): HomeSection => ({
          id: r.id,
          title: r.title,
          suffix: null,
          layout: r.id === 'continue' ? 'continue' : 'row',
          items: r.ms.map((m) => ({ ...item(m, played), tagline: null })),
        }),
      )
    const top = featured.find((s) => s.layout === 'hero') ?? null
    const all = [
      ...rows.filter((r) => r.id === 'continue'),
      ...featured.filter((s) => s !== top),
      ...rows.filter((r) => r.id !== 'continue'),
    ]
    const own = state.homeLayouts[userId] ?? { order: [], hidden: [] }
    const ordered = all
      .filter((r) => !own.hidden.includes(r.id))
      .map((r, i) => {
        const j = own.order.indexOf(r.id)
        return { r, p: j < 0 ? own.order.length + i : j }
      })
      .sort((a, b) => a.p - b.p)
      .map((x) => x.r)
    return top ? [top, ...ordered] : ordered
  }

  // ------------------------------------------------------------ Search

  /** Every credit on the library's films, cast then crew, with the film it's on. */
  const creditsHere = () =>
    films().flatMap((m) => {
      const meta = movieMetadata(state, m.id, now)
      return [...(meta?.cast ?? []), ...(meta?.crew ?? [])].map((c) => ({ c, m }))
    })

  /** packages/media's `searchMovies`: by title, sort title, original title, genre or person. */
  function searchMovies(q: string): ClientItem[] {
    const folded = fold(q)
    const people = new Set(creditsHere().flatMap(({ c, m }) => (like(c.name, q) ? [m.id] : [])))
    const rows = films()
      .filter(
        (m) =>
          like(m.title, q) ||
          sortTitleOf(m.title).includes(folded) ||
          like(movieMetadata(state, m.id, now)?.originalTitle, q) ||
          m.genres.some((g) => like(g, q)) ||
          people.has(m.id),
      )
      .sort((a, b) => byCode(sortTitleOf(a.title), sortTitleOf(b.title)) || byCode(a.id, b.id))
      .slice(0, SEARCH_MOVIE_POOL)
    return items(rankByMatch(rows, (m) => matchScore(m.title, q)))
  }

  /** packages/media's `searchCollections`: TMDB's, by name or a part's title; parts here count. */
  function searchCollections(q: string): ClientCollection[] {
    const found = tmdbCollections(films()).filter(
      (c) => like(c.name, q) || c.ms.some((m) => like(m.title, q)),
    )
    return rankByMatch(
      found,
      (c) => Math.max(matchScore(c.name, q), ...c.ms.map((m) => matchScore(m.title, q))),
      (a, b) => a.name.localeCompare(b.name),
    ).map((c) => ({
      id: tmdbNumber(c.slug),
      name: c.name,
      overview: c.overview,
      art: art((c.ms[0] as MediaItem).art),
      count: c.ms.length,
      years: yearsOf(c.ms.map((m) => m.year)),
    }))
  }

  /** packages/media's `searchPeople`: cast and crew by name, most titles here first. */
  function searchPeople(q: string): SearchPerson[] {
    const people = new Map<string, { name: string; photo: string; titles: Set<string> }>()
    for (const { c, m } of creditsHere()) {
      if (!like(c.name, q)) continue
      const p = people.get(c.personId) ?? { name: c.name, photo: c.photo, titles: new Set() }
      p.titles.add(m.id)
      people.set(c.personId, p)
    }
    const rows = [...people.entries()]
      .filter(([, p]) => p.titles.size > 0)
      .sort((a, b) => b[1].titles.size - a[1].titles.size || byCode(a[1].name, b[1].name))
      .slice(0, SEARCH_PEOPLE_POOL)
    return rankByMatch(rows, ([, p]) => matchScore(p.name, q)).map(([slug, p]) => ({
      id: tmdbNumber(slug),
      name: p.name,
      photo: p.photo || null,
      titles: p.titles.size,
    }))
  }

  /** GET /search: films, collections and people, the best-matching kind first (packages/media's `search`). */
  function search(query: string): SearchResults {
    const q = query.trim()
    if (!q || !seesMovies) return { sections: [] }
    return {
      sections: rankSections(q, {
        movies: searchMovies(q),
        collections: searchCollections(q),
        people: searchPeople(q),
      }),
    }
  }

  // ------------------------------------------------------------ a person

  /**
   * GET /people/{id}: TMDB's person (packages/metadata's `toPerson`): one credit per title and
   * department, characters joined with " / " and jobs with ", ", newest first with undated
   * titles at the top.
   */
  function person(id: number): Person {
    const slug = knownPeople(state).get(id)
    const p = slug ? metadataPerson(state, slug) : null
    if (!slug || !p) throw new FilmRefused('person')
    const here = new Set(films().map((m) => m.tmdbId))
    const titles = knownTitles(state).map((t) => ({ t, meta: movieMetadata(state, t.id, now) }))
    const credits = filmography([
      ...titles.flatMap(({ t, meta }) =>
        (meta?.cast ?? []).flatMap((c) =>
          c.personId === slug
            ? [
                {
                  title: discover(t, here.has(t.tmdbId)),
                  cast: true,
                  department: 'Acting' as const,
                  role: c.character,
                },
              ]
            : [],
        ),
      ),
      ...titles.flatMap(({ t, meta }) =>
        (meta?.crew ?? []).flatMap((c) =>
          c.personId === slug
            ? [
                {
                  title: discover(t, here.has(t.tmdbId)),
                  cast: false,
                  department: c.department,
                  role: c.job,
                },
              ]
            : [],
        ),
      ),
    ])
    const h = hash(slug)
    return {
      id,
      name: p.name,
      photo: p.photo || null,
      knownFor: p.knownFor,
      bio: p.bio,
      born: p.born,
      died: p.died ? { date: p.died.date } : null,
      imdbId: `nm${String(h % 9_999_999).padStart(7, '0')}`,
      wikidataId: `Q${100_000 + (h % 900_000)}`,
      credits,
    }
  }

  return {
    list,
    detail,
    played,
    dismiss,
    prefs,
    setPrefs,
    collections,
    collectionPage,
    home,
    search,
    person,
  }
}

/** One of a person's credits as the metadata has it: a character in the cast, or a job in the crew. */
export type CreditEntry = {
  title: DiscoverMovie
  cast: boolean
  department: PersonCredit['department']
  role: string | null
}

/**
 * A person's filmography as packages/metadata's `toPerson` makes it: one row per title and
 * department, the cast's characters joined with " / " and the crew's jobs with ", " (each once),
 * newest first by release date, undated (announced) titles at the top, ties in the order given:
 * the cast's, then the crew's.
 */
export function filmography(entries: CreditEntry[]): PersonCredit[] {
  const rows = new Map<string, PersonCredit>()
  for (const e of entries) {
    const k = `${e.title.id}:${e.department}`
    const joiner = e.cast ? ' / ' : ', '
    const existing = rows.get(k)
    if (!existing)
      rows.set(k, { ...e.title, creditId: k, role: e.role ?? '', department: e.department })
    else if (e.role && !existing.role.split(joiner).includes(e.role))
      existing.role = existing.role ? `${existing.role}${joiner}${e.role}` : e.role
  }
  return [...rows.values()].sort((a, b) =>
    a.releaseDate && b.releaseDate
      ? b.releaseDate.localeCompare(a.releaseDate)
      : a.releaseDate
        ? 1
        : b.releaseDate
          ? -1
          : 0,
  )
}

/** Every person credited on a title the mock knows, by their number, kept while the titles stay. */
const peopleCache = new WeakMap<ServerState, { titles: string; map: Map<number, string> }>()
function knownPeople(state: ServerState) {
  const known = knownTitles(state)
  const titles = known.map((t) => `${t.id}:${t.title}`).join('\n')
  const cached = peopleCache.get(state)
  if (cached?.titles === titles) return cached.map
  const map = new Map<number, string>()
  for (const t of known) {
    const meta = movieMetadata(state, t.id, 0)
    for (const c of [...(meta?.cast ?? []), ...(meta?.crew ?? [])])
      map.set(tmdbNumber(c.personId), c.personId)
  }
  peopleCache.set(state, { titles, map })
  return map
}
