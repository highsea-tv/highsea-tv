// SPDX-License-Identifier: AGPL-3.0-only
// Downloads for offline (C8; client-settings.md#offline, checkpoint 4.0b): what a phone or the
// desktop app keeps, and where each one is. They live on the device, not the server, so the
// prototype keeps them here rather than in the mock server, one list per app. The list starts with
// one download in each state, so the review sees them all, with a show's season and an album kept
// beside the films; a download moves once a second. Episodes are kept under their show and season,
// and songs under their album, as the Apple TV app and Apple Music group what's downloaded.
import { useEffect, useSyncExternalStore } from 'react'
import { useClient } from '../mock/hooks.tsx'
import type {
  ClientAlbum,
  ClientEpisode,
  ClientItem,
  ClientShow,
  ClientSong,
} from '../mock/types.ts'
import { episodeCode } from './shows.ts'

export type OfflineState =
  | 'downloading'
  | 'paused'
  | 'queued'
  | 'waiting-wifi'
  | 'failed'
  | 'done'
  | 'expired'

export type OfflineQuality = 'original' | 'high' | 'saver'

export type OfflineKind = 'film' | 'episode' | 'song'

/** What a download is kept under: an episode's show and season, or a song's album. */
export type OfflineGroup =
  | {
      kind: 'season'
      /** `{show}:{season}`. */
      id: string
      show: { id: string; title: string }
      season: number
      /** "Season 2", or "Specials". */
      title: string
      poster: string
    }
  | { kind: 'album'; id: string; title: string; artist: string; cover: string }

/** Something that can be downloaded: a film, an episode or a song, with what it's kept under. */
export type OfflineSource = {
  id: string
  kind: OfflineKind
  title: string
  still: string
  minutes: number
  /** An episode's "S2, E3", or a song's place on its album. */
  caption: string | null
  group: OfflineGroup | null
}

export type Offline = OfflineSource & {
  state: OfflineState
  /** 0–1 of `bytes` made and received. */
  progress: number
  bytes: number
  /** Bytes a second while downloading. */
  speed: number
  quality: OfflineQuality
  /** Days it plays offline without the server seeing it again. */
  daysLeft: number
}

export type OfflineApp = 'mobile' | 'desktop'

/** A download plays offline this long; then it needs its server once to carry on. */
export const OFFLINE_DAYS = 30

export const qualities: { id: OfflineQuality; label: string; short: string; perMinute: number }[] =
  [
    { id: 'original', label: 'Original (largest)', short: 'Original', perMinute: 140e6 },
    { id: 'high', label: 'High · 1080p', short: '1080p', perMinute: 30e6 },
    { id: 'saver', label: 'Data saver · 720p', short: '720p', perMinute: 12e6 },
  ]

type Store = {
  items: Offline[]
  seeded: boolean
  quality: OfflineQuality
  listeners: Set<() => void>
}

const stores: Record<OfflineApp, Store> = {
  mobile: { items: [], seeded: false, quality: 'high', listeners: new Set() },
  desktop: { items: [], seeded: false, quality: 'high', listeners: new Set() },
}

const emit = (s: Store) => {
  s.items = [...s.items]
  for (const l of s.listeners) l()
}

/** A song's bytes a minute at each quality: lossless, 320 and 160 kbit/s. */
const audioPerMinute: Record<OfflineQuality, number> = {
  original: 7.5e6,
  high: 2.4e6,
  saver: 1.2e6,
}

const sizeOf = (x: OfflineSource, quality: OfflineQuality) =>
  x.minutes *
  (x.kind === 'song'
    ? audioPerMinute[quality]
    : (qualities.find((q) => q.id === quality)?.perMinute ?? 30e6))

export const filmSource = (m: ClientItem): OfflineSource => ({
  id: m.id,
  kind: 'film',
  title: m.title,
  still: m.art.still,
  minutes: m.runtimeMinutes,
  caption: null,
  group: null,
})

export const seasonGroup = (
  show: Pick<ClientShow, 'id' | 'title'>,
  season: { number: number; title: string; poster: string },
): OfflineGroup => ({
  kind: 'season',
  id: `${show.id}:${season.number}`,
  show: { id: show.id, title: show.title },
  season: season.number,
  title: season.title,
  poster: season.poster,
})

export const episodeSource = (e: ClientEpisode, group: OfflineGroup): OfflineSource => ({
  id: e.id,
  kind: 'episode',
  title: e.title,
  still: e.still,
  minutes: e.runtimeMinutes,
  caption: episodeCode(e),
  group,
})

export const albumGroup = (a: ClientAlbum): OfflineGroup => ({
  kind: 'album',
  id: a.id,
  title: a.title,
  artist: a.artist.name,
  cover: a.cover,
})

export const songSource = (song: ClientSong, a: ClientAlbum): OfflineSource => ({
  id: song.id,
  kind: 'song',
  title: song.title,
  still: a.cover,
  minutes: song.duration / 60,
  caption: String(song.number),
  group: albumGroup(a),
})

const offline = (x: OfflineSource, state: OfflineState, extra: Partial<Offline> = {}): Offline => ({
  ...x,
  state,
  progress: state === 'done' || state === 'expired' ? 1 : 0,
  bytes: sizeOf(x, 'high'),
  speed: 0,
  quality: 'high',
  daysLeft: OFFLINE_DAYS,
  ...extra,
})

/**
 * One of each state, from the library's titles after the first (which Home features), then the
 * first show's first season part kept, and an album kept whole.
 */
function seed(
  app: OfflineApp,
  library: ClientItem[],
  episodes: OfflineSource[],
  songs: OfflineSource[],
): Offline[] {
  const [, a, b, c, d, e, f] = library.map(filmSource)
  const list: (Offline | null)[] = [
    a ? offline(a, 'done', { daysLeft: 26 }) : null,
    b ? offline(b, 'downloading', { progress: 0.42, speed: 6.2e6 }) : null,
    c ? offline(c, 'queued') : null,
    d ? offline(d, app === 'mobile' ? 'waiting-wifi' : 'paused', { progress: 0.18 }) : null,
    e ? offline(e, 'failed', { progress: 0.63 }) : null,
    f ? offline(f, 'expired', { daysLeft: 0 }) : null,
    ...episodes.slice(0, 3).map((x) => offline(x, 'done', { daysLeft: 29 })),
    ...songs.map((x) => offline(x, 'done', { daysLeft: 22 })),
  ]
  return list.filter((x): x is Offline => x !== null)
}

/** A list in the order it's drawn: each film on its own, each group where its first item is. */
export type OfflineEntry =
  | { kind: 'item'; item: Offline }
  | { kind: 'group'; group: OfflineGroup; items: Offline[] }

export function entriesOf(items: Offline[]): OfflineEntry[] {
  const out: OfflineEntry[] = []
  const groups = new Map<string, Extract<OfflineEntry, { kind: 'group' }>>()
  for (const x of items) {
    if (!x.group) {
      out.push({ kind: 'item', item: x })
      continue
    }
    const g = groups.get(x.group.id)
    if (g) g.items.push(x)
    else {
      const entry = { kind: 'group' as const, group: x.group, items: [x] }
      groups.set(x.group.id, entry)
      out.push(entry)
    }
  }
  for (const g of groups.values())
    g.items.sort((a, b) =>
      (a.caption ?? '').localeCompare(b.caption ?? '', 'en', { numeric: true }),
    )
  return out
}

/** Every item of a group downloaded, part of it, or none; and where the part still going is. */
export function groupState(items: (Offline | undefined)[]) {
  const kept = items.filter((x): x is Offline => x !== undefined)
  const done = kept.filter((x) => x.state === 'done').length
  const going = kept.filter((x) => x.state !== 'done' && x.state !== 'expired')
  return {
    kept,
    done,
    all: items.length > 0 && kept.length === items.length,
    none: kept.length === 0,
    going: going.length > 0,
    progress:
      kept.length === 0
        ? 0
        : kept.reduce((s, x) => s + x.bytes * x.progress, 0) /
          kept.reduce((s, x) => s + x.bytes, 0),
  }
}

// the clock: a download moves once a second; when it finishes, the next queued one starts
let timer: ReturnType<typeof setInterval> | undefined
function tick() {
  for (const s of Object.values(stores)) {
    let changed = false
    for (const x of s.items)
      if (x.state === 'downloading') {
        x.progress = Math.min(1, x.progress + x.speed / x.bytes)
        if (x.progress >= 1) {
          x.state = 'done'
          x.speed = 0
          x.daysLeft = OFFLINE_DAYS
        }
        changed = true
      }
    if (changed) {
      startNext(s)
      emit(s)
    }
  }
}

function startNext(s: Store) {
  if (s.items.some((x) => x.state === 'downloading')) return
  const next = s.items.find((x) => x.state === 'queued')
  if (next) {
    next.state = 'downloading'
    next.speed = 6.2e6
  }
}

function subscribe(app: OfflineApp, listener: () => void) {
  const s = stores[app]
  s.listeners.add(listener)
  timer ??= setInterval(tick, 1000)
  return () => {
    s.listeners.delete(listener)
    if (Object.values(stores).every((x) => x.listeners.size === 0)) {
      clearInterval(timer)
      timer = undefined
    }
  }
}

export function useDownloads(app: OfflineApp) {
  const s = stores[app]
  const client = useClient()
  useEffect(() => {
    if (s.seeded) return
    s.seeded = true
    void (async () => {
      // the seed stands for what this device downloaded earlier, read from the server's library;
      // Offline and Downloads stay open while it can't be reached, so the seed waits until it can
      const read = await Promise.all([
        client.library.list(),
        client.library.shows(),
        client.library.music(),
      ]).catch(() => null)
      if (!read) {
        s.seeded = false
        return
      }
      const [library, shows, music] = read
      const show = shows[0] ? await client.library.show(shows[0].id) : null
      const season = show?.seasons.find((x) => x.number > 0)
      const episodes =
        show && season
          ? season.episodes.map((e) => episodeSource(e, seasonGroup(show.show, season)))
          : []
      const album = music.albums.find((a) => a.kind === 'album')
      const detail = album ? await client.library.album(album.id) : null
      const songs = detail ? detail.songs.map((x) => songSource(x, detail.album)) : []
      // anything downloaded while the seed was loading stays, after the seed
      const started = s.items
      s.items = [
        ...seed(app, library, episodes, songs).filter((x) => !started.some((y) => y.id === x.id)),
        ...started,
      ]
      emit(s)
    })()
  }, [s, app, client])
  const items = useSyncExternalStore(
    (l) => subscribe(app, l),
    () => s.items,
  )
  const find = (id: string) => s.items.find((x) => x.id === id)
  const change = (id: string, patch: Partial<Offline>) => {
    const x = find(id)
    if (!x) return
    Object.assign(x, patch)
    startNext(s)
    emit(s)
  }
  return {
    items,
    quality: s.quality,
    setQuality: (q: OfflineQuality) => {
      s.quality = q
      emit(s)
    },
    get: (id: string) => items.find((x) => x.id === id),
    /**
     * Download at the chosen quality: it starts now, or queues behind the one that's going. A
     * season or an album is several at once; what's already kept stays as it is.
     */
    start: (x: OfflineSource | OfflineSource[]) => {
      const list = Array.isArray(x) ? x : [x]
      for (const m of list) {
        if (s.items.some((y) => y.id === m.id && y.state !== 'failed')) continue
        s.items = s.items.filter((y) => y.id !== m.id)
        s.items.push(offline(m, 'queued', { quality: s.quality, bytes: sizeOf(m, s.quality) }))
      }
      startNext(s)
      emit(s)
    },
    pause: (id: string) => change(id, { state: 'paused', speed: 0 }),
    resume: (id: string) => change(id, { state: 'queued' }),
    retry: (id: string) => change(id, { state: 'queued' }),
    /** An expired download plays again once the server has seen it: here, at once. */
    renew: (id: string) => change(id, { state: 'done', daysLeft: OFFLINE_DAYS }),
    remove: (id: string | string[]) => {
      const ids = new Set(Array.isArray(id) ? id : [id])
      s.items = s.items.filter((x) => !ids.has(x.id))
      startNext(s)
      emit(s)
    },
  }
}
