// SPDX-License-Identifier: AGPL-3.0-only
// What the three client apps share: their data calls, addresses and formatting. Each platform
// draws its own screens (web, mobile and TV differ in layout, input and units), on the same data.
import { useEffect, useState } from 'react'
import { useAction, useQuery } from '../mock/hooks.tsx'
import type { ClientItem, ClientType } from '../mock/types.ts'
import { useProto } from '../screen/screen.tsx'

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

export const useItem = (id: string) =>
  useQuery(`client:item:${id}`, (c) => c.library.item(id), ['movies.updated', 'watch.updated'])

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

/** Quick picks for an empty search. */
export const searchSuggestions = ['Comedy', 'Horror', 'Animation', 'Science fiction', 'Fritz Lang']

export const useServer = () => useQuery('server', (c) => c.system.server(), ['server.updated'])

export const useKnownServers = () => useQuery('client:known', (c) => c.connect.known())

export function useAnnouncements(platform: ClientPlatform) {
  const list = useQuery(
    `client:announcements:${platform}`,
    (c) => c.announcements.active(clientType[platform]),
    ['announcements.updated'],
  )
  const done = useAction((c, id: string) => c.announcements.dismiss(id))
  const unseen = (list.data ?? []).filter((a) => !a.seen)
  return {
    /** Acknowledge-required ones, shown one at a time before anything else. */
    modal: unseen.find((a) => a.acknowledgement === 'require' && a.placements.includes('modal')),
    banners: unseen.filter(
      (a) => a.placements.includes('banner') && a.acknowledgement === 'dismiss',
    ),
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

// ---------------------------------------------------------------- formatting

/** 1:04:05 or 12:04. */
export function clock(seconds: number) {
  const s = Math.max(0, Math.round(seconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const ss = String(s % 60).padStart(2, '0')
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`
}

/** 1h 36m, or 15m. */
export function runtime(minutes: number) {
  if (!minutes) return ''
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return h ? `${h}h${m ? ` ${m}m` : ''}` : `${m}m`
}

/** "52 min left", for Continue watching. */
export function left(item: ClientItem) {
  const s = item.runtimeMinutes * 60 - item.position
  const m = Math.max(1, Math.round(s / 60))
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m left` : `${m} min left`
}

/** "2010 · 15m · Fantasy". */
export const meta = (item: ClientItem) =>
  [String(item.year), runtime(item.runtimeMinutes), item.genres[0]].filter(Boolean).join(' · ')

/** The quality markers worth showing on artwork: the best version's. */
export const qualityTags = (item: ClientItem) => item.quality.filter((q) => q !== '1080p')
