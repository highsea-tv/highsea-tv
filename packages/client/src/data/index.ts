// SPDX-License-Identifier: AGPL-3.0-only
// What the apps read and change, over `@highsea-tv/sdk/react` (ADR 0055): the prototype's client
// hooks (design/prototypes/src/client/data.ts) on the real API. React without the DOM, so the web
// app, the desktop app and React Native share them; each platform draws its own screens.
import {
  type ClientAnnouncement,
  type ClientItem,
  type ClientSource,
  type ClientType,
  CURATION_TOPICS,
  DRAFT_TOPICS,
  type HomeRow,
  type HomeSection,
  isFilmRow,
  MEDIA_TOPICS,
  type MusicSource,
  PLAYBACK_TOPICS,
  type ProfilePatch,
  type ProfileTone,
  type TITLE_TYPES,
} from '@highsea-tv/api-contract'
import type { HighseaClient } from '@highsea-tv/sdk'
import { type Query, useAction, useClient, useQuery } from '@highsea-tv/sdk/react'
import { useEffect, useMemo, useState } from 'react'

/** The topics a title's watch state and the library change on. */
const LIBRARY = [MEDIA_TOPICS.movies, PLAYBACK_TOPICS.watch]

/**
 * Who's signed in. A 401 means nobody: the app shows its sign-in. No topics: a page nobody's
 * signed in to would otherwise keep the event stream retrying.
 */
export const useSession = () => useQuery('client:session', (c) => c.auth.session())

type PublicInfo = Awaited<ReturnType<HighseaClient['system']['publicInfo']>>

/**
 * Each client's last answer from public info. `useQuery` keeps its answer per component, so a
 * screen that mounts later would start from nothing and, until its own answer came, hide what
 * `sources` lists (shows, music, profiles) and redraw without it. Public info changes only with the
 * server, so a component starts from the last answer and fetches again quietly.
 */
const knownInfo = new WeakMap<HighseaClient, PublicInfo>()

/** Who this server is, without signing in: its name and what its sign-in offers. */
export function usePublicInfo(): Query<PublicInfo> {
  const client = useClient()
  const query = useQuery('client:public-info', (c) =>
    c.system.publicInfo().then((info) => {
      knownInfo.set(c, info)
      return info
    }),
  )
  const known = knownInfo.get(client)
  if (query.status === 'success' || !known) return query
  return { ...query, status: 'success', data: known, error: undefined }
}

export const useServer = () =>
  useQuery('client:server', (c) => c.system.server(), ['server.updated', 'settings.updated'])

/**
 * What this server serves beyond films (one-client-platform-b.md › B3): shows, music and profiles
 * are drafted in the contract, and a server lists in public info's `sources` only what it has, so
 * an app hides a kind's tabs, rows and menus until its server serves it (ADR 0061's 2026-11-04
 * section). Until public info answers, nothing beyond films is shown.
 */
export function useServes(source: ClientSource): boolean {
  const info = usePublicInfo()
  return info.data?.sources.includes(source) ?? false
}

/** Home's films: its rows of films only, each with only its films, as B1 and B2 draw them. */
export const filmRows = (rows: HomeRow[]): HomeSection[] =>
  rows
    .filter(isFilmRow)
    .filter((r) => r.layout !== 'episodes')
    .map((r) => ({ ...r, items: r.items.filter((i) => i.type === 'movie') }))
    .filter((r) => r.items.length > 0 || r.layout === 'hero')

const HOME_TOPICS = [
  ...LIBRARY,
  CURATION_TOPICS.home,
  DRAFT_TOPICS.shows,
  DRAFT_TOPICS.music,
  DRAFT_TOPICS.profiles,
]

/** Home for this kind of app: the featured sections in its audience, in the person's order. */
export const useHome = (client: ClientType) =>
  useQuery(
    `client:home:${client}`,
    async (c) => filmRows(await c.home.sections({ query: { client } })),
    HOME_TOPICS,
  )

/**
 * Home with every kind's rows (B3): episodes on Continue watching, Next up, New episodes, and the
 * shows' and music's rows, on a server that serves them.
 */
export const useHomeRows = (client: ClientType) =>
  useQuery(`client:home-rows:${client}`, (c) => c.home.sections({ query: { client } }), HOME_TOPICS)

/**
 * Home's rows with only the kinds a server serves (B3): without shows, no Next up, New episodes
 * or shows' rows and no episodes on Continue watching; without music, no music rows. A server
 * that has neither draws Home as B2 did.
 */
export function servedRows(rows: HomeRow[], serves: { shows: boolean; music: boolean }): HomeRow[] {
  return rows.flatMap((r): HomeRow[] => {
    if (r.layout === 'music') return serves.music ? [r] : []
    if (serves.shows) return [r]
    if (r.layout === 'shows' || r.layout === 'episodes') return []
    const items = r.items.filter((i) => i.type === 'movie')
    return items.length > 0 || r.layout === 'hero' ? [{ ...r, items }] : []
  })
}

/** useHomeRows with only what this server serves (servedRows). */
export function useServedHomeRows(client: ClientType) {
  const home = useHomeRows(client)
  const shows = useServes('shows')
  const music = useServes('music')
  const data = useMemo(
    () => (home.data ? servedRows(home.data, { shows, music }) : home.data),
    [home.data, shows, music],
  )
  return { ...home, data } as typeof home
}

/** The page size the library is read in; the API's largest. */
export const LIBRARY_PAGE = 200

/** Every title, read a page at a time: the library's filters and sorts work on all of it. */
export async function readLibrary(c: HighseaClient): Promise<ClientItem[]> {
  const items: ClientItem[] = []
  let cursor: string | undefined
  do {
    const page = await c.library.list({ query: { playable: 'true', limit: LIBRARY_PAGE, cursor } })
    items.push(...page.items)
    cursor = page.next ?? undefined
  } while (cursor)
  return items
}

export const useLibrary = () => useQuery('client:library', readLibrary, LIBRARY)

/** What a title's address names: a film, or (B3, drafted) an episode, which plays as a film does. */
export type TitleType = (typeof TITLE_TYPES)[number]

/** A title's page and the player's read: a film, or an episode (the same key as useEpisode's). */
export const useItem = (id: number, type: TitleType = 'movie') =>
  useQuery(
    type === 'movie' ? `client:item:${id}` : `client:episode:${id}`,
    (c) => c.library.item({ params: { type, id } }),
    type === 'movie' ? LIBRARY : SHOWS,
  )

/** This person's picks for a title: version, audio, subtitles and the subtitles' timing. */
export function usePicks(id: number, type: TitleType = 'movie') {
  const picks = useQuery(
    type === 'movie' ? `client:picks:${id}` : `client:picks:${type}:${id}`,
    (c) => c.playback.prefs({ params: { type, id } }),
    [PLAYBACK_TOPICS.watch],
  )
  const save = useAction(
    (
      c,
      body: Partial<{
        versionId: string | null
        audioId: string | null
        subtitleId: string | null
        subtitleOffsetMs: number
      }>,
    ) => c.playback.setPrefs({ params: { type, id }, body }),
  )
  return { picks, save }
}

/** Mark as watched, or unwatched (client-detail.md#mark-as-watched). */
export const useMarkWatched = (id: number) =>
  useAction((c, watched: boolean) =>
    watched
      ? c.playback.played({ params: { type: 'movie', id } })
      : c.playback.unplayed({ params: { type: 'movie', id } }),
  )

/**
 * Continue watching's menu (prototype-gaps.md › 2.4): Mark as watched, or Remove from Continue
 * watching, which forgets the place and keeps what's been watched (ADR 0054's 2026-11-01 section).
 */
export const useContinueActions = (id: number, type: TitleType = 'movie') => ({
  markWatched: useAction((c) => c.playback.played({ params: { type, id } })),
  remove: useAction((c) => c.playback.dismiss({ params: { type, id } })),
})

/** How long typing pauses before a search goes to the server. */
export const SEARCH_SETTLE_MS = 150

/** Search (C6): results for the query once it settles, so typing doesn't flood the server. */
export function useSearch(query: string) {
  const [settled, setSettled] = useState(query)
  useEffect(() => {
    const t = setTimeout(() => setSettled(query), SEARCH_SETTLE_MS)
    return () => clearTimeout(t)
  }, [query])
  const q = settled.trim()
  const results = useQuery(
    `client:search:${q}`,
    (c) => (q ? c.library.search({ query: { query: q } }) : Promise.resolve({ sections: [] })),
    [MEDIA_TOPICS.movies],
  )
  return { results, settled, typing: settled !== query }
}

/** Library › Collections: the server's own this person sees, then TMDB's. */
export const useCollections = (client: ClientType) =>
  useQuery(`client:collections:${client}`, (c) => c.library.collections({ query: { client } }), [
    ...LIBRARY,
    CURATION_TOPICS.home,
  ])

export const useCollection = (id: string, client: ClientType) =>
  useQuery(
    `client:collection:${client}:${id}`,
    (c) => c.library.collection({ params: { id }, query: { client } }),
    [...LIBRARY, CURATION_TOPICS.home],
  )

/**
 * A person and their filmography (client-people.md), with each credit saying whether its film is
 * here. From TMDB through the server's cache, so a person nobody here has opened takes a moment.
 */
export const usePerson = (id: number) =>
  useQuery(`client:person:${id}`, (c) => c.metadata.person({ params: { id } }), LIBRARY)

/** The owner's announcements for this person on this kind of app, by where they show. */
export function useAnnouncements(client: ClientType) {
  const list = useQuery(
    `client:announcements:${client}`,
    (c) => c.announcements.active({ query: { client } }),
    [CURATION_TOPICS.announcements],
  )
  const done = useAction((c, id: string) => c.announcements.seen({ params: { id } }))
  return { list, dismiss: (id: string) => done.run(id), ...placements(list.data ?? []) }
}

/** Unseen announcements by placement; one that must be acknowledged is a dialog first. */
export function placements(all: ClientAnnouncement[]) {
  const unseen = all.filter((a) => !a.seen)
  const dismissable = unseen.filter((a) => a.acknowledgement === 'dismiss')
  return {
    modal: unseen.find((a) => a.acknowledgement === 'require'),
    banners: dismissable.filter((a) => a.placements.includes('banner')),
    cards: dismissable.filter((a) => a.placements.includes('card')),
    /** Shown once as a toast on the web and desktop, then marked seen. */
    toasts: dismissable.filter((a) => a.placements.includes('toast')),
    /** The newest unseen. */
    latest: unseen[0],
    /** Every live one, newest first: the TV's Alerts. */
    all,
    /** Those not yet seen: the dot on the TV's bell, and what Alerts marks seen. */
    unread: unseen,
  }
}

/** The person's home rows below the hero: order and visibility, on every device. */
export function useHomeLayout() {
  const layout = useQuery('client:home-layout', (c) => c.home.layout(), [CURATION_TOPICS.home])
  const save = useAction((c, body: { order: string[]; hidden: string[] }) =>
    c.home.saveLayout({ body }),
  )
  // a dropped row stays where it landed while the server saves the order
  const [pending, setPending] = useState<string[] | null>(null)
  const saved = layout.data?.rows ?? []
  const rows = pending
    ? [...saved].sort((a, b) => pending.indexOf(a.id) - pending.indexOf(b.id))
    : saved
  const hidden = layout.data?.hidden ?? []
  const write = (order: string[], hide: string[]) =>
    save.run({ order, hidden: hide }).then(() => layout.refresh())
  return {
    status: layout.status,
    rows,
    hidden,
    /** The whole order at once (a drag on web and mobile). */
    reorder: (ids: string[]) => {
      setPending(ids)
      return write(ids, hidden).finally(() => setPending(null))
    },
    /** One step up or down (the TV's buttons). */
    move: (id: string, by: -1 | 1) => {
      const order = rows.map((r) => r.id)
      const i = order.indexOf(id)
      const j = i + by
      if (i < 0 || j < 0 || j >= order.length) return
      order.splice(i, 1)
      order.splice(j, 0, id)
      return write(order, hidden)
    },
    toggle: (id: string, show: boolean) =>
      write(
        rows.map((r) => r.id),
        show ? hidden.filter((h) => h !== id) : [...hidden, id],
      ),
    reset: () => write([], []),
    pending: save.pending,
  }
}

/** This person's devices, and signing one out. */
export function useMyDevices() {
  const devices = useQuery('client:devices', (c) => c.me.devices(), ['users.updated'])
  const revoke = useAction((c, id: string) => c.devices.revoke({ params: { id } }))
  return { devices, revoke: revoke.run }
}

/** The server's appearance: its default theme, custom themes, sound defaults and name. */
export const useAppearance = () =>
  useQuery('client:appearance', (c) => c.appearance.get(), ['server.updated', 'settings.updated'])

// ------------------------------------------------------------ the drafted kinds (B3)

const SHOWS = [DRAFT_TOPICS.shows, PLAYBACK_TOPICS.watch]
const MUSIC = [DRAFT_TOPICS.music, DRAFT_TOPICS.playlists]

/** Library › Shows: every show this person may watch, with their place in each. */
export const useShows = () => useQuery('client:shows', (c) => c.shows.list(), SHOWS)

/** A show's page: its seasons and episodes, people, like shows and picks. */
export const useShow = (id: number) =>
  useQuery(`client:show:${id}`, (c) => c.shows.show({ params: { id } }), SHOWS)

/** Mark a season, or the whole show (`season` null, specials left out), watched or not. */
export const useMarkShowWatched = (id: number) =>
  useAction((c, body: { season: number | null; watched: boolean }) =>
    c.shows.watched({ params: { id }, body }),
  )

/** An episode as a title: its versions, tracks and place, as a film's page reads its own. */
export const useEpisode = (id: number) => useItem(id, 'episode')

/** Mark an episode watched or not; Remove from Continue watching for its show. */
export const useEpisodeActions = (id: number) => ({
  mark: useAction((c, watched: boolean) =>
    watched
      ? c.playback.played({ params: { type: 'episode', id } })
      : c.playback.unplayed({ params: { type: 'episode', id } }),
  ),
  remove: useAction((c) => c.playback.dismiss({ params: { type: 'episode', id } })),
})

/** Library › Music: artists and albums. */
export const useMusic = () => useQuery('client:music', (c) => c.music.library(), MUSIC)

/** Library › Music › Songs: every song here, with its album. */
export const useSongs = () => useQuery('client:songs', (c) => c.music.songs(), MUSIC)

export const useAlbum = (id: string) =>
  useQuery(`client:album:${id}`, (c) => c.music.album({ params: { id } }), MUSIC)

export const useArtist = (id: string) =>
  useQuery(`client:artist:${id}`, (c) => c.music.artist({ params: { id } }), MUSIC)

/** What the music player plays: a source's songs in order, or shuffled, and songs by id. */
export function useMusicQueue() {
  const queue = useAction((c, source: MusicSource, shuffle: boolean) =>
    c.music.queue({ body: { source, shuffle } }),
  )
  const tracks = useAction((c, ids: string[]) => c.music.tracks({ query: { ids: ids.join(',') } }))
  return { queue: queue.run, tracks: tracks.run, pending: queue.pending || tracks.pending }
}

/** The person's own playlists, the most recently changed first, and what changes them. */
export function usePlaylists() {
  const list = useQuery('client:playlists', (c) => c.playlists.list(), MUSIC)
  const create = useAction((c, name: string, songs: string[]) =>
    c.playlists.create({ body: { name, songs } }),
  )
  const add = useAction((c, id: string, songs: string[]) =>
    c.playlists.add({ params: { id }, body: { songs } }),
  )
  return { list, create: create.run, add: add.run }
}

/** A playlist, and renaming it, taking a song out, reordering and deleting it. */
export function usePlaylist(id: string) {
  const playlist = useQuery(
    `client:playlist:${id}`,
    (c) => c.playlists.get({ params: { id } }),
    MUSIC,
  )
  const rename = useAction((c, name: string) =>
    c.playlists.rename({ params: { id }, body: { name } }),
  )
  const remove = useAction((c, entry: string) => c.playlists.remove({ params: { id, entry } }))
  const reorder = useAction((c, entries: string[]) =>
    c.playlists.reorder({ params: { id }, body: { entries } }),
  )
  const drop = useAction((c) => c.playlists.delete({ params: { id } }))
  return {
    playlist,
    rename: rename.run,
    remove: remove.run,
    reorder: reorder.run,
    delete: drop.run,
  }
}

/**
 * The account's profiles and the one watching now (profiles.md). Choosing one with a PIN sends
 * the PIN to the server, which checks it: a wrong one is refused with `reason: 'wrong-pin'`, and
 * the fifth in a row with `reason: 'rate-limited'` (`profileRefusal` in @highsea-tv/client/profiles
 * reads which).
 */
export function useProfiles(asked = true) {
  // `asked` false: the server isn't asked (one that doesn't serve profiles), while the hook keeps
  // its place among the caller's
  const list = useQuery(
    asked ? 'client:profiles' : 'client:profiles:unasked',
    (c) => (asked ? c.profiles.list() : Promise.resolve(undefined)),
    asked ? [DRAFT_TOPICS.profiles] : [],
  )
  const choose = useAction((c, id: string, pin?: string) =>
    c.profiles.choose({ params: { id }, body: pin ? { pin } : {} }),
  )
  const create = useAction((c, name: string, tone: ProfileTone) =>
    c.profiles.create({ body: { name, tone } }),
  )
  const update = useAction((c, id: string, patch: ProfilePatch) =>
    c.profiles.update({ params: { id }, body: patch }),
  )
  const remove = useAction((c, id: string) => c.profiles.delete({ params: { id } }))
  const data = list.data
  return {
    list,
    profiles: data?.profiles ?? [],
    me: data?.profiles.find((p) => p.id === data.current),
    max: data?.max ?? 0,
    choose: choose.run,
    create: create.run,
    update: update.run,
    remove: remove.run,
  }
}
