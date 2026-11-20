// SPDX-License-Identifier: AGPL-3.0-only
// React bindings with the prototype's shapes (ADR 0018): `useQuery(key, call, topics)` keeps a
// result and refetches it in place when an event names one of its topics; `useAction(call)`
// wraps a change. A `reset` event (the stream fell behind) refetches every live query.
//
// Under a `ClientProvider` with `cache`, every query shares the client's one cache (./cache.ts,
// HT-116): a screen opened again draws at once from the answer the app has and fetches again
// quietly behind it, and the same key asked by two screens is one request. Without it (the admin,
// for now) each component keeps its own answer, as before.
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'
import { cacheFor, QueryCache } from './cache.ts'
import type { HighseaClient } from './client.ts'

export { QueryCache } from './cache.ts'

const ClientContext = createContext<HighseaClient | null>(null)
const CacheContext = createContext<QueryCache | null>(null)

/**
 * The client every hook below uses. With `cache`, its queries share the client's one cache; a new
 * client (another server, a sign-in or a sign-out) starts with an empty one.
 */
export function ClientProvider({
  client,
  cache = false,
  children,
}: {
  client: HighseaClient
  cache?: boolean
  children: ReactNode
}) {
  const shared = cache ? cacheFor(client) : null
  return (
    <ClientContext.Provider value={client}>
      <CacheContext.Provider value={shared}>{children}</CacheContext.Provider>
    </ClientContext.Provider>
  )
}

/** The client's shared cache, or null when the provider keeps none. */
export const useQueryCache = (): QueryCache | null => useContext(CacheContext)

export function useClient(): HighseaClient {
  const client = useContext(ClientContext)
  if (!client) throw new Error('useClient needs a ClientProvider')
  return client
}

/**
 * `refetch` starts over from loading (a Retry); `refresh` fetches again quietly, keeping what's on
 * screen until the answer comes (after a save, so the controls a person is on stay put). `refresh`
 * returns that fetch: it resolves with the answer and rejects with its error, while a failure
 * keeps the old data on screen, so a pull to refresh can end when it settles. Calling it without
 * waiting is safe: a failure nobody awaits isn't an unhandled rejection.
 */
export type Query<T> = (
  | { status: 'loading'; data: undefined; error: undefined }
  | { status: 'error'; data: undefined; error: Error }
  | { status: 'success'; data: T; error: undefined }
) & { refetch: () => void; refresh: () => Promise<T> }

export type QueryOptions = {
  /** Refetch quietly this often, in milliseconds, for numbers no event announces (CPU, memory). */
  interval?: number
}

export function useQuery<T>(
  key: string,
  fetch: (client: HighseaClient) => Promise<T>,
  live: string[] = [],
  options: QueryOptions = {},
): Query<T> {
  const client = useClient()
  const shared = useContext(CacheContext)
  // without a shared cache, a cache of the component's own that keeps nothing it doesn't show
  const own = useMemo(
    () => (shared ? null : new QueryCache(client, { staleMs: 0, gcMs: 0 })),
    [shared, client],
  )
  const cache = shared ?? (own as QueryCache)
  const fetchRef = useRef(fetch)
  fetchRef.current = fetch
  const call = useCallback((c: HighseaClient) => fetchRef.current(c), [])
  const subscribe = useCallback((l: () => void) => cache.subscribe(key, l), [cache, key])
  const read = () => cache.read<T>(key)
  const state = useSyncExternalStore(subscribe, read, read)
  const liveKey = live.join(',')

  useEffect(
    () => cache.show(key, call, liveKey ? liveKey.split(',') : []),
    [cache, key, call, liveKey],
  )

  const { interval } = options
  useEffect(() => {
    if (!interval) return
    const timer = setInterval(
      () => void cache.fetch(key, call, { silent: true, fresh: true }).catch(() => {}),
      interval,
    )
    return () => clearInterval(timer)
  }, [interval, cache, key, call])

  return {
    ...state,
    refetch: () => {
      void cache.fetch(key, call, { silent: false, fresh: true })
    },
    refresh: () => cache.fetch(key, call, { silent: true, fresh: true }),
  } as Query<T>
}

/** Wraps a change: `run(...)` returns its promise; `pending` and `error` follow the last call. */
export function useAction<A extends unknown[], R>(
  action: (client: HighseaClient, ...args: A) => Promise<R>,
) {
  const client = useClient()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const ref = useRef(action)
  ref.current = action
  const run = useCallback(
    async (...args: A): Promise<R> => {
      setPending(true)
      setError(null)
      try {
        return await ref.current(client, ...args)
      } catch (e) {
        setError(e as Error)
        throw e
      } finally {
        setPending(false)
      }
    },
    [client],
  )
  return { run, pending, error, reset: () => setError(null) }
}
