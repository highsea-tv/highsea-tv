// SPDX-License-Identifier: AGPL-3.0-only
// What the admin's server components need before they render (ADR 0018): whether setup is done,
// and who's signed in, read from the runtime directly. They redirect on it; they never change data.
import { getRuntime } from '@highsea/runtime'
import { cookies, headers } from 'next/headers'
import { COOKIE, PEER_HEADER } from '../session-cookie.ts'

export type AdminSession = {
  userId: string
  displayName: string
  role: 'owner' | 'admin' | 'user'
}

export const setupComplete = () => getRuntime().setupComplete()

/** The signed-in person, by the session cookie or a trusted forward-auth proxy; null if neither. */
export async function currentSession(): Promise<AdminSession | null> {
  const runtime = getRuntime()
  const [jar, h] = await Promise.all([cookies(), headers()])
  const secret = jar.get(COOKIE.secure)?.value ?? jar.get(COOKIE.plain)?.value ?? null
  const principal = runtime.auth.authenticate({
    secret,
    headers: { get: (name) => h.get(name) },
    fromTrustedProxy: runtime.network.trusted().has(h.get(PEER_HEADER) ?? ''),
  })
  // an API key is for scripts, not for signing in to the admin
  if (!principal || principal.via === 'key') return null
  const { id, displayName, role } = principal.user
  return { userId: id, displayName, role }
}
