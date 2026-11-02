// SPDX-License-Identifier: AGPL-3.0-only
// What the three client apps share: their data calls, addresses and formatting. Each platform
// draws its own screens (web, mobile and TV differ in layout, input and units), on the same data.
import { createFormat } from '@highsea-tv/client/format'
import { useEffect, useState } from 'react'
import { useAction, useQuery } from '../mock/hooks.tsx'
import type {
  ClientItem,
  ClientType,
  FilmSection,
  HomeSection,
  SearchKind,
  SearchPerson,
} from '../mock/types.ts'
import { useProto } from '../screen/screen.tsx'
import { seasonsCount, showYears } from './shows.ts'

export type ClientPlatform = 'web' | 'mobile' | 'tv'

/** The device the prototype stands for, for audience rules (announcements). */
export const clientType: Record<ClientPlatform, ClientType> = {
  web: 'web',
  mobile: 'ios',
  tv: 'tvos',
}

/** `#/web/movies/1` and so on. */
export const clientHref = (platform: ClientPlatform, path: string) =>
  `#/${platform}${path === '/' ? '' : path}`

/** Home for this app: featured sections whose audience includes it, in the owner's order. */
export const useHome = (platform: ClientPlatform) =>
  useQuery(`client:home:${platform}`, (c) => c.home.sections(clientType[platform]), [
    'movies.updated',
    'watch.updated',
    'curation.updated',
  ])

export const useLibrary = () =>
  useQuery('client:library', (c) => c.library.list(), ['movies.updated', 'watch.updated'])

export const useItem = (id: string, platform: ClientPlatform) =>
  useQuery(`client:item:${id}:${platform}`, (c) => c.library.item(id, clientType[platform]), [
    'movies.updated',
    'watch.updated',
    'collections.updated',
  ])

/** Search (C6): results for the query once it settles, so typing doesn't flood the server. */
export function useSearch(query: string) {
  const [settled, setSettled] = useState(query)
  useEffect(() => {
    const t = setTimeout(() => setSettled(query), 150)
    return () => clearTimeout(t)
  }, [query])
  const results = useQuery(`client:search:${settled}`, (c) => c.library.search(settled), [
    'movies.updated',
  ])
  return { results, settled, typing: settled !== query }
}

/**
 * The search field's text, kept in this history entry: coming Back to Search from a result finds
 * the query and its results as they were, while opening Search afresh starts empty. `focus` is
 * what the TV had chosen (a result's address), to put the remote back on it.
 */
const remember = (patch: Record<string, string>) => {
  try {
    history.replaceState({ ...(history.state as object | null), ...patch }, '')
  } catch {}
}

/** What Search last looked for, for "Playing from" when a song plays from the results. */
export function searchedFor() {
  try {
    const v = (history.state as Record<string, unknown> | null)?.hsSearch
    return typeof v === 'string' ? v.trim() : ''
  } catch {
    return ''
  }
}

export function useSearchQuery(linked?: string) {
  const saved = (key: string) => {
    try {
      const v = (history.state as Record<string, unknown> | null)?.[key]
      return typeof v === 'string' ? v : ''
    } catch {
      return ''
    }
  }
  // a search opened from its address (the web's) starts with that address's text
  const [q, setQ] = useState(() => linked ?? saved('hsSearch'))
  const [returnTo] = useState(() => saved('hsSearchFocus'))
  useEffect(() => remember({ hsSearch: q }), [q])
  return {
    q,
    setQ,
    /** The result the person had opened, when they came Back to it. */
    returnTo,
    /** Note the result about to open, before leaving. */
    leaving: (href: string) => remember({ hsSearchFocus: href }),
  }
}

/** Each kind's heading, singular and plural. */
export const searchKinds: Record<SearchKind, { title: string; one: string; many: string }> = {
  movies: { title: 'Movies', one: 'movie', many: 'movies' },
  shows: { title: 'Shows', one: 'show', many: 'shows' },
  episodes: { title: 'Episodes', one: 'episode', many: 'episodes' },
  people: { title: 'People', one: 'person', many: 'people' },
  collections: { title: 'Collections', one: 'collection', many: 'collections' },
  artists: { title: 'Artists', one: 'artist', many: 'artists' },
  albums: { title: 'Albums', one: 'album', many: 'albums' },
  songs: { title: 'Songs', one: 'song', many: 'songs' },
}

/** The search field's words on every app (client-search.md). */
export const searchPlaceholder = 'Films, shows, music and people'

/** "3 movies · 1 show": what a person Search found is in here. */
export const personCredits = (p: SearchPerson) =>
  [
    p.films > 0 && `${p.films} ${p.films === 1 ? 'movie' : 'movies'}`,
    p.shows > 0 && `${p.shows} ${p.shows === 1 ? 'show' : 'shows'}`,
  ]
    .filter(Boolean)
    .join(' · ')

/** Library › Collections: the owner's collections this person and app see, then TMDB's. */
export const useCollections = (platform: ClientPlatform) =>
  useQuery(`client:collections:${platform}`, (c) => c.library.collections(clientType[platform]), [
    'movies.updated',
    'collections.updated',
  ])

export const useCollection = (id: string, platform: ClientPlatform = 'web') =>
  useQuery(
    `client:collection:${platform}:${id}`,
    (c) => c.library.collection(id, clientType[platform]),
    ['movies.updated', 'watch.updated', 'collections.updated'],
  )

/** A person and the films here they're in (client-people.md). */
export const usePerson = (id: string) =>
  useQuery(`client:person:${id}`, (c) => c.library.person(id), ['movies.updated', 'watch.updated'])

/** The music library: artists and albums. */
export const useMusic = () => useQuery('client:music', (c) => c.library.music(), ['music.updated'])

/** An album with its songs. */
export const useAlbum = (id: string) =>
  useQuery(`client:album:${id}`, (c) => c.library.album(id), ['music.updated', 'movies.updated'])

/** An artist with their albums by kind. */
export const useArtist = (id: string) =>
  useQuery(`client:artist:${id}`, (c) => c.library.artist(id), ['music.updated', 'movies.updated'])

/** The shows library, with this person's place in each show. */
export const useShows = () =>
  useQuery('client:shows', (c) => c.library.shows(), ['shows.updated', 'watch.updated'])

/** A show with its seasons and episodes. */
export const useShow = (id: string) =>
  useQuery(`client:show:${id}`, (c) => c.library.show(id), ['shows.updated', 'watch.updated'])

/** Mark an episode, or a season (or the whole show, with no season), watched or not. */
export const useMarkEpisodes = () => ({
  episode: useAction((c, id: string, watched: boolean) => c.library.setEpisodeWatched(id, watched)),
  season: useAction((c, show: string, season: number | null, watched: boolean) =>
    c.library.setSeasonWatched(show, season, watched),
  ),
})

/** "4 movies and 1 show", leaving out a kind it has none of (@highsea-tv/client/format). */
export const titlesHere = (movies: number, shows: number) => format.titlesHere(movies, shows)

/** A collection's row, named by what's in it, the films first. */
export const titlesRow = (movies: number, shows: number) => format.titlesRow(movies, shows)

/** "6 movies · 2010–2020", or "4 movies and 1 show · 2006–2019". */
export const collectionCaption = (c: { count: number; years: string; shows?: number }) =>
  format.caption(c)

/** Narrows a Home row to one of films (and episodes): every row but shows' and music's. */
export const isFilmSection = (s: HomeSection): s is FilmSection =>
  s.layout !== 'shows' && s.layout !== 'music'

/** Quick picks for an empty search. */
export const searchSuggestions = [
  'Comedy',
  'Animation',
  'Science fiction',
  'Fritz Lang',
  'Saltmarsh',
  'Jazz',
  'Jan Morgenstern',
]

export const useServer = () => useQuery('server', (c) => c.system.server(), ['server.updated'])

/** The server's name as its owner set it, and "this server" until it's known (prototype-gaps.md › 3.7). */
export const useServerName = () => format.serverName(useServer().data?.name)

export const useKnownServers = () => useQuery('client:known', (c) => c.connect.known())

export function useAnnouncements(platform: ClientPlatform) {
  const list = useQuery(
    `client:announcements:${platform}`,
    (c) => c.announcements.active(clientType[platform]),
    ['announcements.updated'],
  )
  const done = useAction((c, id: string) => c.announcements.dismiss(id))
  // newest first, by when each went live
  const all = [...(list.data ?? [])].sort((a, b) =>
    b.schedule.start.localeCompare(a.schedule.start),
  )
  const unseen = all.filter((a) => !a.seen)
  return {
    /** Every live announcement, newest first: what Alerts lists (the owner, 2026-10-30). */
    all,
    /**
     * The new ones Alerts counts as seen when it opens: its dot. The acknowledge-required ones are
     * the modal's to count.
     */
    unread: unseen.filter((a) => a.acknowledgement === 'dismiss'),
    /** Acknowledge-required ones, shown one at a time before anything else. */
    modal: unseen.find((a) => a.acknowledgement === 'require' && a.placements.includes('modal')),
    cards: unseen.filter((a) => a.placements.includes('card') && a.acknowledgement === 'dismiss'),
    /** Shown once as a toast on the web and desktop, then marked seen. */
    toasts: unseen.filter((a) => a.placements.includes('toast') && a.acknowledgement === 'dismiss'),
    /** The newest, for the TV's pill. */
    latest: unseen[0],
    dismiss: (id: string) => done.run(id),
  }
}

/** The toolbar's Connection: how this app reaches its server right now. */
export const useConnection = () => useProto().connection
export const useStreamState = () => useProto().stream
/** The web platform inside the desktop app, which keeps downloads. */
export const useDesktopApp = () => useProto().app === 'desktop'
/** The desktop app's computer: macOS, Windows or Linux (its window chrome and folders). */
export const useDesktopOs = () => useProto().os
/** The desktop app's own update, downloaded and waiting for a restart. */
export const useAppUpdateReady = () => {
  const p = useProto()
  return p.app === 'desktop' && p.update === 'ready'
}
/**
 * The local network permission that the desktop app on macOS and the phone app on iOS need to
 * find servers (Apple TN3179). Which device asks: a Mac, an iPhone, or none (no permission).
 */
export const useLocalNetwork = (platform: 'web' | 'mobile' = 'web') => {
  const p = useProto()
  const device =
    platform === 'mobile' ? 'iphone' : p.app === 'desktop' && p.os === 'mac' ? 'mac' : null
  return { lan: device ? p.lan : ('allowed' as const), device }
}
/** The phone's player on an AirPlay screen: its name, or null while it plays on the phone. */
/** The toolbar's music state: a song seeded into the player when the screen opens. */
export const useMusicState = () => useProto().music
export const useAirPlay = () => (useProto().airplay === 'on' ? 'Living room TV' : null)
/** Downloads on the phone aren't built until 4.6; until then Offline says so. */
export const usePhoneDownloadsLater = () => useProto().downloads === 'later'

// ---------------------------------------------------------------- formatting

// @highsea-tv/client's (ADR 0055), so the prototype and the apps say the same thing the same way
const format = createFormat('en')

/** 1:04:05 or 12:04. */
export const clock = format.clock

/** 1h 36m, or 15m. */
export const runtime = format.runtime

/** "52 min left", for Continue watching. */
export const left = (item: ClientItem) => format.left(item)

/** "2010 · 15m · Fantasy"; a featured show's "3 seasons · 2019–present · Drama" (showMeta). */
export const meta = (item: ClientItem) =>
  item.series
    ? [
        seasonsCount(item.series.seasons),
        showYears({ year: item.year, endYear: item.series.endYear }),
        item.genres[0],
      ]
        .filter(Boolean)
        .join(' · ')
    : format.meta(item)

/** Where a card on Home opens: a film's page, or a featured show's (ClientItem.series). */
export const titlePath = (item: ClientItem) =>
  item.series ? `/shows/${item.id}` : `/movies/${item.id}`

/** What Play on a card starts: the film, or the episode a featured show is on. */
export const playPath = (item: ClientItem) => `/play/${item.series?.play ?? item.id}`

/** The quality markers worth showing on artwork: the best version's. */
export const qualityTags = (item: ClientItem) => item.quality.filter((q) => q !== '1080p')
