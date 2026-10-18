// SPDX-License-Identifier: AGPL-3.0-only
// React bindings for the mock client: a provider, a small query hook that refetches in place on
// server events (so live values update without a loading flash), and an action hook.
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react'
import type { HighseaClient } from './client.ts'
import type { EventTopic } from './types.ts'

const ClientContext = createContext<HighseaClient | null>(null)

export function ClientProvider({
  client,
  children,
}: {
  client: HighseaClient
  children: ReactNode
}) {
  return <ClientContext.Provider value={client}>{children}</ClientContext.Provider>
}

export function useClient(): HighseaClient {
  const client = useContext(ClientContext)
  if (!client) throw new Error('useClient needs a ClientProvider')
  return client
}

export type Query<T> =
  | { status: 'loading'; data: undefined; error: undefined; refetch: () => void }
  | { status: 'error'; data: undefined; error: Error; refetch: () => void }
  | { status: 'success'; data: T; error: undefined; refetch: () => void }

/**
 * Runs `fetch` with the client and keeps the result. `live` lists the event topics that make it
 * refetch silently, keeping the current data on screen. A new client (the toolbar's data state or
 * role changed) starts over from loading.
 */
export function useQuery<T>(
  key: string,
  fetch: (client: HighseaClient) => Promise<T>,
  live: EventTopic[] = [],
): Query<T> {
  const client = useClient()
  const [state, setState] = useState<{ status: Query<T>['status']; data?: T; error?: Error }>({
    status: 'loading',
  })
  const fetchRef = useRef(fetch)
  fetchRef.current = fetch
  const run = useRef(0)
  const liveKey = live.join(',')

  const load = useCallback(
    (silent: boolean) => {
      const id = ++run.current
      if (!silent) setState({ status: 'loading' })
      fetchRef.current(client).then(
        (data) => {
          if (id === run.current) setState({ status: 'success', data })
        },
        (error: Error) => {
          if (id === run.current) setState({ status: 'error', error })
        },
      )
    },
    [client],
  )

  // biome-ignore lint/correctness/useExhaustiveDependencies: `key` restarts the query on purpose
  useEffect(() => {
    load(false)
    return () => {
      run.current++
    }
  }, [load, key])

  useEffect(() => {
    if (!liveKey) return
    const topics = new Set(liveKey.split(','))
    let queued = false
    return client.events.subscribe((e) => {
      if (!topics.has(e.type) || queued) return
      // several events in one tick refetch once
      queued = true
      queueMicrotask(() => {
        queued = false
        load(true)
      })
    })
  }, [client, liveKey, load])

  return { ...state, refetch: () => load(false) } as Query<T>
}

/** Wraps a mutation: `run(...)` returns its promise; `pending` and `error` follow the last call. */
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

/** The simulated time, updated every tick. */
export function useNow(): number {
  const client = useClient()
  const [now, setNow] = useState(() => client.now())
  useEffect(
    () =>
      client.events.subscribe((e) => {
        if (e.type === 'tick') setNow(e.now)
      }),
    [client],
  )
  return now
}
