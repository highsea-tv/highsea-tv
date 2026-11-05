// SPDX-License-Identifier: AGPL-3.0-only
// Shows, episodes and music as the SDK's transport answers them (one-client-platform-b.md › B3):
// the contract's drafted `shows`, `music` and `playlists` routes, an episode on the films' own
// routes (`/items/episode/{id}`), and the shows' and music's rows on Home and kinds in Search, in
// the contract's shapes, made from the mock server's own (its `library.shows`, `show`, `music`,
// `queue` and the rest). The real server answers all of these 501 until it has shows and music
// (apps/server/src/api/drafts.ts), and lists neither in public info's `sources`.
//
// The contract addresses shows and episodes by TMDB's numbers, as films are (ADR 0014), where the
// mock has slugs (`the-lantern-keepers`, `the-lantern-keepers-s2e5`): each is numbered from its
// slug as films.ts numbers people and collections (`tmdbNumber`, the same on every run), and found
// again by scanning the shows this person may watch. Music keeps the mock's string ids, as the
// contract does. Images the mock draws are never empty, but the contract's are nullable.
//
// An episode has no files of its own in the mock: it plays as the first playable film's versions
// (the mock server's `episodeDetail`), so its page and the player read that film's detail through
// films.ts with the episode laid over it, and its picks are kept under the episode's own id.
import type {
  ClientAlbum,
  ClientAlbumDetail,
  ClientArtist,
  ClientArtistDetail,
  ClientDetail,
  ClientEpisode,
  ClientItem,
  ClientLibrarySong,
  ClientMusic,
  ClientPlaylist,
  ClientPlaylistDetail,
  ClientShow,
  ClientShowDetail,
  ClientSong,
  ClientType,
  HomeItem,
  HomeMusic,
  HomeRow,
  HomeSection,
  MusicSource,
  PlaybackPrefs,
  QueuedSong,
  SearchResults,
  SearchSection,
} from '@highsea-tv/api-contract'
import { matchScore } from '@highsea-tv/media/search'
import {
  credit,
  dayOf,
  type FilmsCtx,
  filmsOf,
  isoOf,
  tmdbNumber,
  video,
  votesOf,
  WATCHED_AT,
} from './films.ts'
import type {
  ClientAlbum as MockAlbum,
  ClientArtist as MockArtist,
  ClientType as MockClientType,
  ClientEpisode as MockEpisode,
  HomeMusic as MockHomeMusic,
  ClientItem as MockItem,
  HomeSection as MockSection,
  ClientShow as MockShow,
  ClientSong as MockSong,
} from './types.ts'

// ---------------------------------------------------------------- ids

/** A show's number, from its slug. */
export const showNumber = (slug: string) => tmdbNumber(`show:${slug}`)
/** An episode's number, from its id (`{show}-s{n}e{e}`). */
export const episodeNumber = (id: string) => tmdbNumber(`episode:${id}`)

/**
 * What a read refuses, for the transport to answer as the server would: a show or an episode that
 * isn't here (404), or a version that isn't the episode's (400).
 */
export type KindRefusal = 'show' | 'episode' | 'version'
export class KindRefused extends Error {
  readonly refusal: KindRefusal
  constructor(refusal: KindRefusal) {
    super(refusal)
    this.refusal = refusal
  }
}

// ---------------------------------------------------------------- music

const day = (date: string) => date.slice(0, 10)

export const artistOf = (a: MockArtist): ClientArtist => ({
  id: a.id,
  name: a.name,
  sortName: a.sortName,
  photo: a.photo || null,
  albums: a.albums,
  genres: a.genres,
  addedAt: isoOf(a.addedAt),
})

export const albumOf = (a: MockAlbum): ClientAlbum => ({
  id: a.id,
  title: a.title,
  sortTitle: a.sortTitle,
  artist: { id: a.artist.id, name: a.artist.name },
  year: a.year,
  cover: a.cover || null,
  genres: a.genres,
  tracks: a.tracks,
  kind: a.kind,
  addedAt: isoOf(a.addedAt),
})

const songOf = (s: MockSong): ClientSong => ({
  id: s.id,
  number: s.number,
  title: s.title,
  duration: s.duration,
})

const queuedOf = (s: MockSong & { album: MockAlbum; loudness: number[] }): QueuedSong => ({
  ...songOf(s),
  album: albumOf(s.album),
  loudness: s.loudness,
})

const librarySongOf = (s: MockSong & { album: MockAlbum; plays: number }): ClientLibrarySong => ({
  ...songOf(s),
  album: albumOf(s.album),
  plays: s.plays,
})

const homeMusicOf = (x: MockHomeMusic): HomeMusic =>
  x.kind === 'album'
    ? { kind: 'album', album: albumOf(x.album) }
    : { kind: 'artist', artist: artistOf(x.artist) }

// ---------------------------------------------------------------- the reads

export function kindsOf(ctx: FilmsCtx) {
  const { srv, api, userId } = ctx
  const { state } = srv
  const films = () => filmsOf(ctx)

  // ------------------------------------------------------------ ids back to slugs

  const shows = () => api.library.shows()
  const showSlug = (id: number) => {
    const s = shows().find((x) => showNumber(x.id) === id)
    if (!s) throw new KindRefused('show')
    return s.id
  }
  /** An episode by its number: its show's detail and the episode, as the mock has them. */
  const episodeAt = (id: number) => {
    for (const s of shows()) {
      const d = api.library.show(s.id)
      for (const season of d.seasons)
        for (const e of season.episodes)
          if (episodeNumber(e.id) === id) return { show: d.show, episode: e }
    }
    throw new KindRefused('episode')
  }

  // ------------------------------------------------------------ shows

  const episodeOf = (e: MockEpisode): ClientEpisode => ({
    id: episodeNumber(e.id),
    show: showNumber(e.show),
    season: e.season,
    number: e.number,
    title: e.title,
    synopsis: e.synopsis,
    runtimeMinutes: e.runtimeMinutes,
    aired: e.aired,
    still: e.still || null,
    progress: e.progress,
    position: e.position,
    watched: e.watched,
  })

  const showOf = (s: MockShow): ClientShow => ({
    id: showNumber(s.id),
    title: s.title,
    sortTitle: s.sortTitle,
    year: s.year,
    endYear: s.endYear,
    genres: s.genres,
    rating: s.rating,
    certification: s.certification,
    synopsis: s.synopsis,
    runtimeMinutes: s.runtimeMinutes,
    seasons: s.seasons,
    episodes: s.episodes,
    addedAt: isoOf(s.addedAt),
    art: {
      poster: s.art.poster || null,
      backdrop: s.art.backdrop || null,
      logo: s.art.logo || null,
    },
    unwatched: s.unwatched,
    watched: s.watched,
    next: s.next ? { episode: episodeOf(s.next.episode), kind: s.next.kind } : null,
  })

  /** GET /shows: every show this person may watch, with their place in each. */
  const list = (): ClientShow[] => shows().map(showOf)

  /** GET /shows/{id}: its seasons (specials last), its people, like shows, trailers and picks. */
  function show(id: number): ClientShowDetail {
    const d = api.library.show(showSlug(id))
    const number = showNumber(d.show.id)
    return {
      show: showOf(d.show),
      seasons: d.seasons.map((x) => ({
        number: x.number,
        title: x.title,
        year: x.year,
        poster: x.poster || null,
        episodes: x.episodes.map(episodeOf),
      })),
      cast: d.cast.map((c, i) => credit(c, number, 'cast', i)),
      creators: d.creators.map((c, i) => credit(c, number, 'crew', i)),
      crew: d.crew.map((c, i) => credit(c, number, 'crew', d.creators.length + i)),
      related: d.related.map(showOf),
      videos: d.videos.map(video),
      tracks: d.tracks,
      defaults: d.defaults,
    }
  }

  /** PUT /shows/{id}/watched: a season, or every episode but the specials. */
  function setWatched(id: number, season: number | null, watched: boolean) {
    const slug = showSlug(id)
    if (season !== null && !api.library.show(slug).seasons.some((x) => x.number === season))
      throw new KindRefused('show')
    api.library.setSeasonWatched(slug, season, watched)
  }

  // ------------------------------------------------------------ an episode as a title

  /** The film an episode plays as: the mock's `episodeDetail` takes the first playable film's. */
  const donorOf = (mockEpisode: string) => {
    const own = api.library.item(mockEpisode)
    const version = own.versions[0]?.id
    const m = state.items.find(
      (x) => x.type === 'movie' && x.versions.some((v) => v.id === version),
    )
    if (!m) throw new KindRefused('episode')
    return { own, film: m }
  }

  /** An episode as a card's title: the show's poster, its own still, its place. */
  const episodeItemOf = (x: MockItem): ClientItem => ({
    id: episodeNumber(x.id),
    type: 'episode',
    title: x.show?.episode ?? x.title,
    year: x.year || null,
    runtimeMinutes: x.runtimeMinutes || null,
    genres: x.genres,
    synopsis: x.synopsis,
    rating: Math.min(5, Math.max(0, x.rating)),
    voteCount: votesOf(x.title),
    releaseDate: x.releaseDate ? dayOf(x.releaseDate) : null,
    addedAt: isoOf(x.addedAt),
    status: 'available',
    playable: true,
    art: { poster: x.art.poster || null, backdrop: x.art.still || x.art.backdrop || null },
    progress: x.progress,
    position: x.position,
    watched: x.watched,
    show: x.show
      ? {
          id: showNumber(x.show.id),
          title: x.show.title,
          code: x.show.code,
          episode: x.show.episode,
        }
      : undefined,
  })

  /** GET /items/episode/{id}: the episode over its donor film's versions, with its place. */
  function detail(id: number, client: ClientType): ClientDetail {
    const { episode } = episodeAt(id)
    const { own, film } = donorOf(episode.id)
    const base = films().detail(film.tmdbId, client)
    const number = showNumber(episode.show)
    const place = own.episode
    return {
      ...base,
      item: episodeItemOf(own.item),
      originalTitle: own.originalTitle,
      tagline: null,
      certification: own.certification,
      studios: [],
      cast: own.cast.map((c, i) => credit(c, number, 'cast', i)),
      directors: [],
      crew: own.crew.map((c, i) => credit(c, number, 'crew', i)),
      videos: [],
      collection: null,
      related: [],
      episode: place
        ? {
            show: { id: showNumber(place.show.id), title: place.show.title },
            season: place.season,
            number: place.number,
            title: place.title,
            code: place.code,
            intro: place.intro,
            credits: place.credits,
          }
        : undefined,
    }
  }

  const prefsKey = (mockEpisode: string) => `${userId}:${mockEpisode}`

  /** An episode's picks, kept under its own id. */
  function prefs(id: number): PlaybackPrefs {
    const p = state.prefs[prefsKey(episodeAt(id).episode.id)] ?? {}
    return {
      versionId: p.versionId ?? null,
      audioId: p.audioId ?? null,
      subtitleId: p.subtitleId ?? null,
      subtitleOffsetMs: p.subtitleOffsetMs ?? 0,
    }
  }

  function setPrefs(id: number, patch: Partial<PlaybackPrefs>) {
    const { episode } = episodeAt(id)
    const { film } = donorOf(episode.id)
    if (patch.versionId && !film.versions.some((v) => v.id === patch.versionId))
      throw new KindRefused('version')
    const key = prefsKey(episode.id)
    const { versionId, ...rest } = patch
    const next = { ...state.prefs[key], ...rest }
    if (versionId !== undefined) {
      if (versionId === null) delete next.versionId
      else next.versionId = versionId
    }
    state.prefs[key] = next
    srv.events.emit({ type: 'watch.updated' })
    return prefs(id)
  }

  /** Watched to the end, or not started. */
  const played = (id: number, watched: boolean) =>
    api.library.setEpisodeWatched(episodeAt(id).episode.id, watched)

  /** Off Continue watching: the show leaves it and Next up until it's played again. */
  const dismiss = (id: number) => api.playback.dismiss(episodeAt(id).episode.id)

  /**
   * A report from the player: the place, in the episode's own length; past WATCHED_AT of the
   * stream it's watched, as a film is.
   */
  function place(id: number, position: number, duration: number) {
    const { episode } = episodeAt(id)
    const done = duration > 0 && position / duration >= WATCHED_AT
    if (done) {
      api.library.setEpisodeWatched(episode.id, true)
      return true
    }
    const length = episode.runtimeMinutes * 60
    api.playback.progress(
      episode.id,
      duration > 0 && length > 0 ? (position / duration) * length : position,
    )
    return false
  }

  /** GET /items/episode/{id}/next: the next episode in its season, then the next season's first. */
  function next(id: number): ClientItem | null {
    const { own } = donorOf(episodeAt(id).episode.id)
    const after = own.upNext?.kind === 'episode' ? own.upNext.id : null
    return after ? episodeItemOf(api.library.item(after).item) : null
  }

  // ------------------------------------------------------------ music

  const music = (): ClientMusic => {
    const m = api.library.music()
    return { artists: m.artists.map(artistOf), albums: m.albums.map(albumOf) }
  }

  function album(id: string): ClientAlbumDetail {
    const d = api.library.album(id)
    const film = d.film ? state.items.find((x) => x.id === d.film?.id) : undefined
    return {
      album: albumOf(d.album),
      songs: d.songs.map(songOf),
      duration: d.duration,
      released: day(d.released),
      label: d.label,
      about: d.about,
      film: film ? films().detail(film.tmdbId, 'web').item : null,
      more: d.more.map(albumOf),
    }
  }

  function artist(id: string): ClientArtistDetail {
    const d = api.library.artist(id)
    return {
      artist: artistOf(d.artist),
      bio: d.bio,
      backdrop: d.backdrop || null,
      songs: d.songs,
      person: d.person ? tmdbNumber(d.person) : null,
      sections: d.sections.map((s) => ({ kind: s.kind, albums: s.albums.map(albumOf) })),
      similar: d.similar.map(artistOf),
    }
  }

  const queue = (source: MusicSource, shuffle: boolean): QueuedSong[] =>
    api.library.queue(source, shuffle).map(queuedOf)
  const tracks = (ids: string[]): QueuedSong[] => api.library.tracks(ids).map(queuedOf)
  const songs = (): ClientLibrarySong[] => api.library.songs().map(librarySongOf)

  const playlistOf = (p: ClientPlaylist): ClientPlaylist => ({
    ...p,
    covers: p.covers.filter(Boolean),
    updatedAt: isoOf(p.updatedAt),
  })
  const playlists = () => api.library.playlists().map(playlistOf)
  function playlist(id: string): ClientPlaylistDetail {
    const d = api.library.playlist(id)
    return {
      playlist: playlistOf(d.playlist),
      songs: d.songs.map((s) => ({ ...librarySongOf(s), entry: s.entry })),
    }
  }

  // ------------------------------------------------------------ Home and Search

  /**
   * GET /home with shows and music: films.ts's rows, with the mock's episodes merged into
   * Continue watching in its order (newest first, one card per show), Next up after it, then New
   * episodes, Recently added shows and Recently played at the end, less the rows the person hid.
   */
  function home(client: ClientType): HomeRow[] {
    const rows: HomeRow[] = films().home(client)
    const mock = api.home.sections(client as MockClientType) as MockSection[]
    const byId = new Map(mock.map((r) => [r.id, r]))
    const hidden = new Set(state.homeLayouts[userId]?.hidden ?? [])
    const episodes = (r: MockSection | undefined): HomeItem[] =>
      r && r.layout !== 'shows' && r.layout !== 'music'
        ? r.items.filter((x) => x.show).map((x) => ({ ...episodeItemOf(x), tagline: null }))
        : []

    // Continue watching: the mock's order, films taken from films.ts's row
    const filmsRow = rows.find((r) => r.id === 'continue') as HomeSection | undefined
    const mockContinue = byId.get('continue')
    const tmdbOf = (mockId: string) => state.items.find((x) => x.id === mockId)?.tmdbId
    const merged: HomeItem[] = []
    if (mockContinue && mockContinue.layout === 'continue')
      for (const x of mockContinue.items) {
        if (x.show) merged.push({ ...episodeItemOf(x), tagline: null })
        else {
          const f = filmsRow?.items.find((i) => i.id === tmdbOf(x.id))
          if (f) merged.push(f)
        }
      }
    for (const f of filmsRow?.items ?? []) if (!merged.includes(f)) merged.push(f)
    const continueRow: HomeSection | null =
      merged.length && !hidden.has('continue')
        ? { id: 'continue', title: null, suffix: null, layout: 'continue', items: merged }
        : null

    const episodesRow = (id: string): HomeSection[] => {
      const r = byId.get(id)
      const items = episodes(r)
      return r && items.length && !hidden.has(id)
        ? [{ id, title: r.title, suffix: null, layout: 'episodes', items }]
        : []
    }
    const showsRow = byId.get('recent-shows')
    const musicRow = byId.get('recent-music')
    const later: HomeRow[] = [
      ...episodesRow('new-episodes'),
      ...(showsRow?.layout === 'shows' && showsRow.items.length && !hidden.has(showsRow.id)
        ? [
            {
              id: showsRow.id,
              title: showsRow.title,
              suffix: null,
              layout: 'shows' as const,
              items: showsRow.items.map(showOf),
            },
          ]
        : []),
      ...(musicRow?.layout === 'music' && musicRow.items.length && !hidden.has(musicRow.id)
        ? [
            {
              id: musicRow.id,
              title: musicRow.title,
              suffix: null,
              layout: 'music' as const,
              items: musicRow.items.map(homeMusicOf),
            },
          ]
        : []),
    ]

    // Continue watching where the person's order put it, else after the hero; Next up after it
    const out: HomeRow[] = rows.flatMap((r) =>
      r.id === 'continue' ? (continueRow ? [continueRow] : []) : [r],
    )
    if (continueRow && !filmsRow) out.splice(out[0]?.layout === 'hero' ? 1 : 0, 0, continueRow)
    const at = continueRow ? out.indexOf(continueRow) + 1 : out[0]?.layout === 'hero' ? 1 : 0
    out.splice(at, 0, ...episodesRow('next-up'))
    return [...out, ...later]
  }

  /**
   * GET /search with shows and music: films.ts's films, collections and people, then the mock's
   * shows, episodes, artists, albums and songs, the best-matching kind first (as packages/media's
   * `rankSections` ranks the films' kinds), ties in that order.
   */
  function search(query: string): SearchResults {
    const q = query.trim()
    if (!q) return { sections: [] }
    const ours = films().search(q).sections
    const theirs = api.library.search(q).sections.flatMap((s): SearchSection[] => {
      switch (s.kind) {
        case 'shows':
          return [{ kind: 'shows', items: s.items.map(showOf) }]
        case 'episodes':
          return [
            {
              kind: 'episodes',
              items: s.items.map((e) => ({
                id: episodeNumber(e.id),
                show: { id: showNumber(e.show.id), title: e.show.title },
                code: e.code,
                title: e.title,
                still: e.still || null,
              })),
            },
          ]
        case 'artists':
          return [{ kind: 'artists', items: s.items.map(artistOf) }]
        case 'albums':
          return [{ kind: 'albums', items: s.items.map(albumOf) }]
        case 'songs':
          return [
            {
              kind: 'songs',
              items: s.items.map((x) => ({ ...songOf(x), album: albumOf(x.album) })),
            },
          ]
        default:
          return []
      }
    })
    const names = (s: SearchSection): string[] =>
      (s.items as ({ title: string } | { name: string })[]).map((x) =>
        'title' in x ? x.title : x.name,
      )
    const best = (s: SearchSection) => Math.max(0, ...names(s).map((n) => matchScore(n, q)))
    return {
      sections: [...ours, ...theirs]
        .filter((s) => s.items.length > 0)
        .map((s, i) => ({ s, i, score: best(s) }))
        .sort((a, b) => b.score - a.score || a.i - b.i)
        .map((x) => x.s),
    }
  }

  return {
    list,
    show,
    setWatched,
    detail,
    prefs,
    setPrefs,
    played,
    dismiss,
    place,
    next,
    music,
    album,
    artist,
    queue,
    tracks,
    songs,
    playlists,
    playlist,
    home,
    search,
    /** For the tests and the layout check: the seeded numbers. */
    numbers: { show: showNumber, episode: episodeNumber },
  }
}

export type Kinds = ReturnType<typeof kindsOf>
