// SPDX-License-Identifier: AGPL-3.0-only
// The signed-in person and whether their server answers, for every screen under the gate. As on
// the web (apps/web/src/app.tsx), the event stream is kept open while signed in, and while it's
// down the health check says whether the server is gone or the stream is only reconnecting.
import type { CurrentSession } from '@highsea-tv/api-contract'
import { useSession } from '@highsea-tv/client/data'
import { ApiError } from '@highsea-tv/sdk'
import { useClient } from '@highsea-tv/sdk/react'
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'

export const unreachable = (e: unknown) => e instanceof ApiError && e.code === 'unavailable'

export const SessionContext = createContext<CurrentSession | null>(null)

/** The person signed in, or null while the server hasn't answered yet. */
export const useMaybeSession = () => useContext(SessionContext)

/** The person signed in; screens under the gate always have one. */
export function useSessionData(): CurrentSession {
  const s = useContext(SessionContext)
  if (!s) throw new Error('No session')
  return s
}

const CHECK_MS = 3000

export function useReachable() {
  const client = useClient()
  const [offline, setOffline] = useState(false)
  const check = useCallback(async () => {
    if (client.events.connected()) return setOffline(false)
    try {
      await client.system.health()
      setOffline(false)
    } catch (e) {
      setOffline(unreachable(e))
    }
  }, [client])
  useEffect(() => {
    const stop = client.events.subscribe(() => {})
    const timer = setInterval(check, CHECK_MS)
    return () => {
      clearInterval(timer)
      stop()
    }
  }, [client, check])
  return { offline, retry: () => void check() }
}

export const ReachableContext = createContext<{ offline: boolean; retry: () => void }>({
  offline: false,
  retry: () => {},
})

export const useReachableState = () => useContext(ReachableContext)

/**
 * Whether the app is in, from the session check every client makes once a server knows it
 * (the phone's, the TV's and the web's gate): `wait` until the first answer, `signIn` when the
 * server refused the sign-in (a 401) or answered something else it can't open on, and `in`
 * otherwise, also when the server doesn't answer, so the screens can say so. A refetch later keeps
 * the screen while it loads. A refused token is handed to `onRefused` to drop, and the gate waits
 * for the client to start again without it; with no token to drop (the web's session cookie, as
 * apps/web's gate did), a 401 is the sign-in.
 */
export function useSessionGate(onRefused: (() => void) | null) {
  const session = useSession()
  const refused =
    session.status === 'error' && session.error instanceof ApiError && session.error.status === 401
  const [settled, setSettled] = useState(false)
  const last = useRef<CurrentSession | null>(null)
  if (session.status === 'success') last.current = session.data
  useEffect(() => {
    if (session.status !== 'loading') setSettled(true)
  }, [session.status])
  const refuse = useRef(onRefused)
  refuse.current = onRefused
  // a token the server no longer knows (signed out from Settings › Devices): drop it, and sign in
  useEffect(() => {
    if (refused) refuse.current?.()
  }, [refused])
  const phase: 'wait' | 'signIn' | 'in' = !settled
    ? 'wait'
    : refused
      ? onRefused
        ? 'wait'
        : 'signIn'
      : !last.current && session.status === 'error' && !unreachable(session.error)
        ? 'signIn'
        : 'in'
  return { phase, session: last.current, refetch: session.refetch }
}

/** Unreachable while the server doesn't answer, or answered nobody's session yet. */
export function ReachableProvider({
  missing,
  refetch,
  children,
}: {
  missing: boolean
  refetch: () => void
  children: ReactNode
}) {
  const reachable = useReachable()
  const again = useRef(refetch)
  again.current = refetch
  // the server came back after the app opened without it: load the session now
  useEffect(() => {
    if (missing && !reachable.offline) again.current()
  }, [missing, reachable.offline])
  const value = useMemo(
    () => ({
      offline: missing || reachable.offline,
      retry: () => {
        reachable.retry()
        if (missing) again.current()
      },
    }),
    [missing, reachable],
  )
  return <ReachableContext.Provider value={value}>{children}</ReachableContext.Provider>
}
