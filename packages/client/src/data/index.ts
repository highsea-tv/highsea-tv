// SPDX-License-Identifier: AGPL-3.0-only
// What the apps read and change, over `@highsea-tv/sdk/react` (ADR 0055): the prototype's client
// hooks (design/prototypes/src/client/data.ts) on the real API. React without the DOM, so the web
// app, the desktop app and React Native share them; each platform draws its own screens.
import {
  type ClientAnnouncement,
  type ClientItem,
  type ClientType,
  CURATION_TOPICS,
  MEDIA_TOPICS,
  PLAYBACK_TOPICS,
} from '@highsea-tv/api-contract'
import type { HighseaClient } from '@highsea-tv/sdk'
import { useAction, useQuery } from '@highsea-tv/sdk/react'
import { useEffect, useState } from 'react'

/** The topics a title's watch state and the library change on. */
const LIBRARY = [MEDIA_TOPICS.movies, PLAYBACK_TOPICS.watch]

/**
 * Who's signed in. A 401 means nobody: the app shows its sign-in. No topics: a page nobody's
 * signed in to would otherwise keep the event stream retrying.
 */
export const useSession = () => useQuery('client:session', (c) => c.auth.session())

/** Who this server is, without signing in: its name and what its sign-in offers. */
export const usePublicInfo = () => useQuery('client:public-info', (c) => c.system.publicInfo())

export const useServer = () =>
  useQuery('client:server', (c) => c.system.server(), ['server.updated', 'settings.updated'])

/** Home for this kind of app: the featured sections in its audience, in the person's order. */
export const useHome = (client: ClientType) =>
  useQuery(`client:home:${client}`, (c) => c.home.sections({ query: { client } }), [
    ...LIBRARY,
    CURATION_TOPICS.home,
  ])

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

export const useItem = (id: number) =>
  useQuery(`client:item:${id}`, (c) => c.library.item({ params: { type: 'movie', id } }), LIBRARY)

/** This person's picks for a title: version, audio, subtitles and the subtitles' timing. */
export function usePicks(id: number) {
  const picks = useQuery(
    `client:picks:${id}`,
    (c) => c.playback.prefs({ params: { type: 'movie', id } }),
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
    ) => c.playback.setPrefs({ params: { type: 'movie', id }, body }),
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
    /** The newest, for the TV's pill. */
    latest: unseen[0],
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
    save.run({ order, hidden: hide }).then(() => layout.refetch())
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
