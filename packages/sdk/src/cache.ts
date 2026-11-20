// SPDX-License-Identifier: AGPL-3.0-only
// One cache of answers per signed-in client (HT-116, ADR 0055's 2026-11-19 section), so a screen
// opened again draws at once from what the app already has and asks again quietly behind it:
// stale-while-revalidate (RFC 5861 § 3, https://www.rfc-editor.org/rfc/rfc5861#section-3), the
// behaviour TanStack Query's docs describe as its default caching
// (https://tanstack.com/query/v5/docs/framework/react/guides/caching), kept here in one place rather
// than taken on as a dependency, since `useQuery` already has that library's shape (ADR 0018).
//
// - An answer is fresh for `staleMs`; a screen mounting on a fresh one asks nothing, one on a stale
//   one shows it and fetches again quietly (TanStack's `staleTime`). One whose query names no
//   topics is never fresh, since no event would say it changed.
// - An answer nobody shows is forgotten after `gcMs` (TanStack's `gcTime`, five minutes there too).
// - The same key asked twice at once is one request.
// - A server event naming a query's topic makes it stale: shown, it's fetched again quietly; not
//   shown, it's fetched when a screen next shows it (TanStack's `invalidateQueries`). While nobody
//   shows anything the cache doesn't listen, so every answer events keep fresh goes stale.
// - Prefetches run two at a time, the newest first, and a queue of more than four drops its oldest,
//   so a remote's quick focus across a grid doesn't flood a slow connection.
import { RESET_TOPIC } from '@highsea-tv/api-contract'
import type { HighseaClient } from './client.ts'

export type CacheState<T = unknown> =
  | { status: 'loading'; data: undefined; error: undefined }
  | { status: 'error'; data: undefined; error: Error }
  | { status: 'success'; data: T; error: undefined }

type Fetcher<T> = (client: HighseaClient) => Promise<T>

type Entry = {
  state: CacheState
  /** When the answer came, or 0 when it's stale. */
  at: number
  run: number
  inflight: Promise<unknown> | null
  fetch: Fetcher<unknown> | null
  topics: Set<string>
  listeners: Set<() => void>
  shown: number
  forget: ReturnType<typeof setTimeout> | null
}

export type QueryCacheOptions = {
  /** How long an answer counts as fresh, in milliseconds. */
  staleMs?: number
  /** How long an answer nobody shows is kept, in milliseconds. */
  gcMs?: number
}

/**
 * Thirty seconds fresh: the server's events say when something changes, so a fresh answer isn't
 * asked for again on every screen, and the window keeps a quick back-and-forth to one request.
 */
export const STALE_MS = 30_000
export const GC_MS = 5 * 60_000
const PREFETCHES = 2
const PREFETCH_QUEUE = 4

const LOADING: CacheState = { status: 'loading', data: undefined, error: undefined }

export class QueryCache {
  readonly client: HighseaClient
  readonly staleMs: number
  readonly gcMs: number
  private entries = new Map<string, Entry>()
  private shownTotal = 0
  private unlisten: (() => void) | null = null
  private queued = new Set<string>()
  private flushing = false
  private prefetchQueue: { key: string; fetch: Fetcher<unknown>; topics: string[] }[] = []
  private prefetching = 0

  constructor(client: HighseaClient, { staleMs = STALE_MS, gcMs = GC_MS }: QueryCacheOptions = {}) {
    this.client = client
    this.staleMs = staleMs
    this.gcMs = gcMs
  }

  private entry(key: string): Entry {
    let e = this.entries.get(key)
    if (!e) {
      e = {
        state: LOADING,
        at: 0,
        run: 0,
        inflight: null,
        fetch: null,
        topics: new Set(),
        listeners: new Set(),
        shown: 0,
        forget: null,
      }
      this.entries.set(key, e)
      this.scheduleForget(key, e)
    }
    return e
  }

  private set(e: Entry, state: CacheState) {
    e.state = state
    for (const l of [...e.listeners]) l()
  }

  private scheduleForget(key: string, e: Entry) {
    if (e.forget) clearTimeout(e.forget)
    e.forget = null
    if (e.shown > 0 || e.inflight) return
    e.forget = setTimeout(() => {
      if (this.entries.get(key) === e && e.shown === 0 && !e.inflight) this.entries.delete(key)
    }, this.gcMs)
    // a timer only to tidy up doesn't keep a process open (Node's and Bun's `unref`; a browser's
    // and React Native's timers are numbers without one)
    ;(e.forget as { unref?: () => void }).unref?.()
  }

  /** What the cache holds for `key` now: the same object until it changes. */
  read<T>(key: string): CacheState<T> {
    return (this.entries.get(key)?.state ?? LOADING) as CacheState<T>
  }

  /** The answer for `key`, if there is one. */
  data<T>(key: string): T | undefined {
    const s = this.entries.get(key)?.state
    return s?.status === 'success' ? (s.data as T) : undefined
  }

  /** Every answer the cache holds, by key, to look for what a screen already knows. */
  *answers(): Generator<[string, unknown]> {
    for (const [key, e] of this.entries) if (e.state.status === 'success') yield [key, e.state.data]
  }

  /** Calls `listener` whenever `key`'s state changes. */
  subscribe(key: string, listener: () => void): () => void {
    const e = this.entry(key)
    e.listeners.add(listener)
    return () => {
      e.listeners.delete(listener)
    }
  }

  /**
   * A screen shows `key`: fetch it when there's no answer, or quietly when its answer is stale.
   * Returns what to call when the screen stops showing it.
   */
  show<T>(key: string, fetch: Fetcher<T>, topics: readonly string[]): () => void {
    const e = this.entry(key)
    e.fetch = fetch as Fetcher<unknown>
    for (const t of topics) e.topics.add(t)
    e.shown++
    this.shownTotal++
    if (e.forget) clearTimeout(e.forget)
    e.forget = null
    // a query with no topics hears nothing (a page nobody's signed in to keeps no stream open)
    if (topics.length > 0) this.listen()
    if (e.state.status !== 'success') {
      if (!e.inflight || e.state.status === 'error') void this.fetch(key, fetch, { silent: false })
    } else if (this.stale(e)) {
      void this.fetch(key, fetch, { silent: true }).catch(() => {})
    }
    return () => {
      e.shown--
      this.shownTotal--
      this.scheduleForget(key, e)
      if (this.shownTotal === 0) this.deafen()
    }
  }

  /**
   * Whether an answer is to be asked for again. One whose query names no topics has no event to say
   * it changed, so it's never fresh: shown at once, it's always asked again behind it.
   */
  private stale(e: Entry) {
    return e.topics.size === 0 || e.at === 0 || Date.now() - e.at >= this.staleMs
  }

  /**
   * Fetches `key`. Quietly (`silent`), what's shown stays until the answer comes and a failure keeps
   * it; otherwise the query goes back to loading first (a Retry). A fetch already on its way is
   * shared rather than sent again, unless `fresh` asks for a new one.
   */
  fetch<T>(
    key: string,
    fetch: Fetcher<T>,
    { silent, fresh = false }: { silent: boolean; fresh?: boolean },
  ): Promise<T> {
    const e = this.entry(key)
    e.fetch = fetch as Fetcher<unknown>
    if (!silent && e.state.status !== 'loading') this.set(e, LOADING)
    if (e.inflight && !fresh) return e.inflight as Promise<T>
    const id = ++e.run
    const answer = fetch(this.client)
    e.inflight = answer
    if (e.forget) clearTimeout(e.forget)
    e.forget = null
    const settle = () => {
      if (e.run !== id) return
      e.inflight = null
      this.scheduleForget(key, e)
    }
    answer.then(
      (data) => {
        if (e.run !== id) return
        e.at = Date.now()
        settle()
        this.set(e, { status: 'success', data, error: undefined })
      },
      (error: Error) => {
        if (e.run !== id) return
        settle()
        // a quiet fetch that fails keeps what's on screen
        if (e.state.status !== 'success') this.set(e, { status: 'error', data: undefined, error })
      },
    )
    // handled here, so a caller that doesn't wait leaves no unhandled rejection
    answer.catch(() => {})
    return answer
  }

  /**
   * Fetches `key` ahead of a screen that may show it (a card pressed or focused, the next tab), when
   * there's no fresh answer and none on its way: two at a time, the newest first.
   */
  prefetch<T>(key: string, fetch: Fetcher<T>, topics: readonly string[] = []) {
    const e = this.entries.get(key)
    if (e && (e.inflight || (e.state.status === 'success' && !this.stale(e)))) return
    this.prefetchQueue = this.prefetchQueue.filter((p) => p.key !== key)
    this.prefetchQueue.push({ key, fetch: fetch as Fetcher<unknown>, topics: [...topics] })
    if (this.prefetchQueue.length > PREFETCH_QUEUE) this.prefetchQueue.shift()
    this.pump()
  }

  /**
   * Fetches `key` now, quietly, for a screen that's on view and will show it in a moment (a page
   * asking what it reads next beside its first read rather than after it): unlike `prefetch`, not
   * queued behind guesses. Nothing is sent when there's a fresh answer or one on its way.
   */
  warm<T>(key: string, fetch: Fetcher<T>, topics: readonly string[] = []) {
    const e = this.entry(key)
    for (const t of topics) e.topics.add(t)
    if (e.inflight || (e.state.status === 'success' && !this.stale(e))) return
    void this.fetch(key, fetch, { silent: true }).catch(() => {})
  }

  private pump() {
    while (this.prefetching < PREFETCHES && this.prefetchQueue.length > 0) {
      const next = this.prefetchQueue.pop()
      if (!next) return
      const e = this.entry(next.key)
      if (e.inflight || (e.state.status === 'success' && !this.stale(e))) continue
      for (const t of next.topics) e.topics.add(t)
      this.prefetching++
      void this.fetch(next.key, next.fetch, { silent: true })
        .catch(() => {})
        .finally(() => {
          this.prefetching--
          this.pump()
        })
    }
  }

  /**
   * Changes the answer for `key` at once, as a person's own change (Mark as watched) is shown before
   * the server's event comes. A key with no answer is left alone.
   */
  update<T>(key: string, change: (data: T) => T) {
    const e = this.entries.get(key)
    if (e?.state.status !== 'success') return
    this.set(e, { status: 'success', data: change(e.state.data as T), error: undefined })
  }

  /**
   * Marks the answers `which` picks stale (every one without it): those shown are fetched again
   * quietly, the rest when a screen next shows them.
   */
  invalidate(which: (key: string) => boolean = () => true) {
    for (const [key, e] of this.entries) {
      if (!which(key)) continue
      e.at = 0
      if (e.shown > 0) this.queue(key)
    }
  }

  /**
   * Forgets every answer but those `keep` picks, which go stale: another person's or profile's
   * answers are never shown. Screens showing a forgotten one go back to loading and fetch it again.
   */
  clear(keep: (key: string) => boolean = () => false) {
    for (const [key, e] of this.entries) {
      if (keep(key)) {
        e.at = 0
        if (e.shown > 0) this.queue(key)
        continue
      }
      this.forget(key)
    }
    this.prefetchQueue = []
  }

  /**
   * Forgets the answer for `key`, as an action that ends what it answered does (a pairing code
   * used): a screen showing it loads it again, and one opening it later never sees the old one.
   */
  forget(key: string) {
    const e = this.entries.get(key)
    if (!e) return
    e.run++
    e.inflight = null
    e.at = 0
    if (e.shown === 0) {
      if (e.forget) clearTimeout(e.forget)
      this.entries.delete(key)
      return
    }
    this.set(e, LOADING)
    if (e.fetch) void this.fetch(key, e.fetch, { silent: false })
  }

  /** Several events in one tick fetch each query once. */
  private queue(key: string) {
    this.queued.add(key)
    if (this.flushing) return
    this.flushing = true
    queueMicrotask(() => {
      this.flushing = false
      const keys = [...this.queued]
      this.queued.clear()
      for (const k of keys) {
        const e = this.entries.get(k)
        if (e?.fetch && e.shown > 0) void this.fetch(k, e.fetch, { silent: true, fresh: true })
      }
    })
  }

  private listen() {
    if (this.unlisten) return
    this.unlisten = this.client.events.subscribe((event) => {
      if (event.topic === RESET_TOPIC) return this.invalidate()
      this.invalidate((key) => this.entries.get(key)?.topics.has(event.topic) ?? false)
    })
  }

  private deafen() {
    if (!this.unlisten) return
    this.unlisten()
    this.unlisten = null
    // nothing heard from here on: whatever changes meanwhile, each answer kept fresh by events is
    // asked again when shown
    for (const e of this.entries.values()) if (e.topics.size > 0) e.at = 0
  }
}

const caches = new WeakMap<HighseaClient, QueryCache>()

/** The client's one cache: every screen of a signed-in app shares it. A new client, a new cache. */
export function cacheFor(client: HighseaClient, options?: QueryCacheOptions): QueryCache {
  let c = caches.get(client)
  if (!c) {
    c = new QueryCache(client, options)
    caches.set(client, c)
  }
  return c
}
