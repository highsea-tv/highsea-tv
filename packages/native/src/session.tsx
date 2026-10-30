// SPDX-License-Identifier: AGPL-3.0-only
// The signed-in person and whether their server answers, for every screen under the gate. As on
// the web (apps/web/src/app.tsx), the event stream is kept open while signed in, and while it's
// down the health check says whether the server is gone or the stream is only reconnecting.
import type { CurrentSession } from '@highsea-tv/api-contract'
import { ApiError } from '@highsea-tv/sdk'
import { useClient } from '@highsea-tv/sdk/react'
import { createContext, useCallback, useContext, useEffect, useState } from 'react'

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
