// SPDX-License-Identifier: AGPL-3.0-only
// The web's side of ./server-store.ts. A browser is served by its server, so it knows that one (the
// page's own address, '', which ServersProvider's `home` adds), and signs in with the server's
// session cookie, as the web client always has (ADR 0053), so every page asks the server who's
// signed in and a 401 sends it to sign-in (apps/web's gate): a second tab, a private window, single
// sign-on and the admin's link to /web all arrive signed in. A sign-in that names a device (the
// mock's TV and phone frames pair as one) answers with a device token, which is kept here and sent
// as a bearer token; otherwise the cookie signs the requests. What's kept in localStorage is the
// list and any such token. Storage may be missing or refuse (a private window), so every read and
// write is guarded.
import type {
  COOKIE as nativeCookie,
  dropToken as nativeDrop,
  platformFetch as nativeFetch,
  loadStored as nativeLoad,
  readToken as nativeRead,
  saveStored as nativeSave,
  writeToken as nativeWrite,
  Stored,
} from './server-store.ts'

export type { Stored }

const LIST = 'highsea.servers'
const TOKEN = 'highsea.session.'
/** What an earlier build kept in a token's place when it signed in by the cookie: not a token. */
const OLD_MARK = 'session-cookie'

const get = (key: string) => {
  try {
    return globalThis.localStorage?.getItem(key) ?? null
  } catch {
    return null
  }
}
const set = (key: string, value: string | null) => {
  try {
    if (value === null) globalThis.localStorage?.removeItem(key)
    else globalThis.localStorage?.setItem(key, value)
  } catch {
    // a browser that keeps nothing signs in again after a reload
  }
}

export const loadStored: typeof nativeLoad = async () => {
  try {
    const raw = get(LIST)
    return raw ? (JSON.parse(raw) as Stored) : { current: null, servers: [] }
  } catch {
    return { current: null, servers: [] }
  }
}

export const saveStored: typeof nativeSave = (stored) => set(LIST, JSON.stringify(stored))

export const readToken: typeof nativeRead = async (id) => {
  const token = get(TOKEN + id)
  return token && token !== OLD_MARK ? token : null
}

/** Keeps a device token when the sign-in returned one; a cookie sign-in leaves nothing to keep. */
export const writeToken: typeof nativeWrite = async (id, token) => {
  set(TOKEN + id, token || null)
  return token ?? ''
}

export const dropToken: typeof nativeDrop = async (id) => set(TOKEN + id, null)

/** The browser's session cookie signs requests that carry no device token. */
export const COOKIE: typeof nativeCookie = true

export const platformFetch: typeof nativeFetch = (input, init) => globalThis.fetch(input, init)
