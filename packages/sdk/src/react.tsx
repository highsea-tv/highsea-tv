// SPDX-License-Identifier: AGPL-3.0-only
// React bindings with the prototype's shapes (ADR 0018): `useQuery(key, call, topics)` keeps a
// result and refetches it in place when an event names one of its topics; `useAction(call)`
// wraps a change. A `reset` event (the stream fell behind) refetches every live query.
import { RESET_TOPIC } from '@highsea-tv/api-contract'
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
          // a silent refetch that fails keeps what's on screen
          if (id === run.current && !silent) setState({ status: 'error', error })
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
      if ((!topics.has(e.topic) && e.topic !== RESET_TOPIC) || queued) return
      // several events in one tick refetch once
      queued = true
      queueMicrotask(() => {
        queued = false
        load(true)
      })
    })
  }, [client, liveKey, load])

  const { interval } = options
  useEffect(() => {
    if (!interval) return
    const timer = setInterval(() => load(true), interval)
    return () => clearInterval(timer)
  }, [interval, load])

  return { ...state, refetch: () => load(false) } as Query<T>
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
