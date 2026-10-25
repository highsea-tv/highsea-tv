// SPDX-License-Identifier: AGPL-3.0-only
// Downloads for offline (C8; client-settings.md#offline, checkpoint 4.0b): what a phone or the
// desktop app keeps, and where each one is. They live on the device, not the server, so the
// prototype keeps them here rather than in the mock server, one list per app. The list starts with
// one download in each state, so the review sees them all; a download moves once a second.
import { useEffect, useSyncExternalStore } from 'react'
import type { ClientItem } from '../mock/types.ts'

export type OfflineState =
  | 'downloading'
  | 'paused'
  | 'queued'
  | 'waiting-wifi'
  | 'failed'
  | 'done'
  | 'expired'

export type OfflineQuality = 'original' | 'high' | 'saver'

export type Offline = {
  id: string
  title: string
  still: string
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

const sizeOf = (m: ClientItem, quality: OfflineQuality) =>
  m.runtimeMinutes * (qualities.find((q) => q.id === quality)?.perMinute ?? 30e6)

const offline = (m: ClientItem, state: OfflineState, extra: Partial<Offline> = {}): Offline => ({
  id: m.id,
  title: m.title,
  still: m.art.still,
  state,
  progress: state === 'done' || state === 'expired' ? 1 : 0,
  bytes: sizeOf(m, 'high'),
  speed: 0,
  quality: 'high',
  daysLeft: OFFLINE_DAYS,
  ...extra,
})

/** One of each state, from the library's titles after the first (which Home features). */
function seed(app: OfflineApp, library: ClientItem[]): Offline[] {
  const [, a, b, c, d, e, f] = library
  const list: (Offline | null)[] = [
    a ? offline(a, 'done', { daysLeft: 26 }) : null,
    b ? offline(b, 'downloading', { progress: 0.42, speed: 6.2e6 }) : null,
    c ? offline(c, 'queued') : null,
    d ? offline(d, app === 'mobile' ? 'waiting-wifi' : 'paused', { progress: 0.18 }) : null,
    e ? offline(e, 'failed', { progress: 0.63 }) : null,
    f ? offline(f, 'expired', { daysLeft: 0 }) : null,
  ]
  return list.filter((x): x is Offline => x !== null)
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

export function useDownloads(app: OfflineApp, library: ClientItem[] | undefined) {
  const s = stores[app]
  useEffect(() => {
    if (!s.seeded && library && library.length > 0) {
      s.seeded = true
      s.items = seed(app, library)
      emit(s)
    }
  }, [s, app, library])
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
    /** Download at the chosen quality: it starts now, or queues behind the one that's going. */
    start: (m: ClientItem) => {
      s.items = s.items.filter((x) => x.id !== m.id)
      s.items.push(offline(m, 'queued', { quality: s.quality, bytes: sizeOf(m, s.quality) }))
      startNext(s)
      emit(s)
    },
    pause: (id: string) => change(id, { state: 'paused', speed: 0 }),
    resume: (id: string) => change(id, { state: 'queued' }),
    retry: (id: string) => change(id, { state: 'queued' }),
    /** An expired download plays again once the server has seen it: here, at once. */
    renew: (id: string) => change(id, { state: 'done', daysLeft: OFFLINE_DAYS }),
    remove: (id: string) => {
      s.items = s.items.filter((x) => x.id !== id)
      startNext(s)
      emit(s)
    },
  }
}
