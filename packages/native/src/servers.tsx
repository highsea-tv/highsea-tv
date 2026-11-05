// SPDX-License-Identifier: AGPL-3.0-only
// The servers this app knows (connectivity.md, ADR 0059), as the desktop app keeps them
// (ADR 0058): where they're kept is the platform's (./server-store.ts on the phone and the TV,
// ./server-store.web.ts in a browser). The server in use gets a ServerConnection, which probes its
// addresses (a LAN address that answers wins) and fails over between them, and one SDK client.
// What it fetches with, and where nearby servers come from, can be handed in: the client's mock
// mode gives it the prototypes' mock server and its stand-in for Bonjour, so the same screens run
// with no server at all (one-client-platform.md › The prototypes are the clients).
import { type PublicInfo, routes } from '@highsea-tv/api-contract'
import { addressesOf, forget, type Known, type Nearby, remember } from '@highsea-tv/client/servers'
import {
  createServerConnection,
  type Fetch,
  type HighseaClient,
  type ServerConnection,
} from '@highsea-tv/sdk'
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
import {
  COOKIE,
  dropToken,
  loadStored,
  platformFetch,
  readToken,
  type Stored,
  saveStored,
  writeToken,
} from './server-store'

const PUBLIC_INFO = routes.system.publicInfo.path

/** A server's public info at an address, or null when nothing highsea answers there. */
export async function publicInfoAt(
  base: string,
  timeoutMs = 4000,
  fetcher: Fetch = platformFetch,
): Promise<PublicInfo | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetcher(`${base}${PUBLIC_INFO}`, {
      headers: { accept: 'application/json' },
      signal: controller.signal,
    })
    if (!res.ok) return null
    const info = (await res.json()) as PublicInfo
    return typeof info?.id === 'string' ? info : null
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

/** What discovery has found so far, and whether the local network may be browsed. */
export type NearbySnapshot = {
  found: Nearby[]
  lan: 'allowed' | 'asking' | 'refused'
  scanning: boolean
}

/** Where nearby servers come from in place of Bonjour: the mock's stand-in. Returns a stop. */
export type NearbySource = (
  listener: (snapshot: NearbySnapshot) => void,
  options?: { permission?: boolean },
) => () => void

export type KnownView = Known & { signedIn: boolean }

export type Current = {
  server: Known
  connection: ServerConnection
  client: HighseaClient
  /** The address in use, once probed. */
  base: () => string | null
  /**
   * This device's token, for what loads by URL (artwork, streams, subtitles); null on the web when
   * the session cookie signs requests instead.
   */
  token: string | null
  /**
   * Whether to ask the server who's signed in: with a token, or always on the web, where the
   * session cookie may be there without this page having signed in (another tab, single sign-on).
   */
  signedIn: boolean
  /** Counts sign-ins and sign-outs, so a client keyed by it starts again on each. */
  round: number
}

export type ServersValue = {
  ready: boolean
  known: KnownView[]
  current: Current | null
  /** Remembers a server reached at `base` and makes it current. */
  add: (info: PublicInfo, base: string) => Promise<Known>
  use: (id: string) => Promise<void>
  /** Keeps this device's token for the current server; on the web the cookie may be all there is. */
  signedIn: (token: string | undefined) => Promise<void>
  /** Drops this device's token for the current server, and leaves it known. */
  signedOut: () => Promise<void>
  remove: (id: string) => Promise<void>
  /** Asks an address for a server's public info, through this app's fetch. */
  probe: (base: string) => Promise<PublicInfo | null>
  /** Where nearby servers come from when it isn't Bonjour. */
  nearby?: NearbySource
}

/**
 * What useServers() reads. ServersProvider fills it on the phone, the TV and the web; the desktop
 * app fills it from its Rust side, which keeps the servers and their tokens itself
 * (apps/client/src/desktop/tauri.tsx, ADR 0058).
 */
export const ServersContext = createContext<ServersValue | null>(null)

/** The id the page's own server goes by while it hasn't answered with its own. */
const HOME_UNREACHED = 'home'

export function ServersProvider({
  children,
  fetch,
  home,
  nearby,
}: {
  children: ReactNode
  /** What every request goes through; the platform's fetch when absent. */
  fetch?: Fetch
  /**
   * The server this app belongs to, at this address: the web client's page is served by its
   * server (''), so it's known and in use from the start, without Choose a server.
   */
  home?: string
  nearby?: NearbySource
}) {
  const fetcher = fetch ?? platformFetch
  const [stored, setStored] = useState<Stored | null>(null)
  const [tokens, setTokens] = useState<Record<string, string>>({})
  const [round, setRound] = useState(0)
  const homeAt = useRef(home)

  useEffect(() => {
    void (async () => {
      let s = await loadStored()
      const at = homeAt.current
      if (at !== undefined && !s.current) {
        // its own server, at the address it's served from and no other (a browser reaches only it)
        const info = await publicInfoAt(at, 4000, fetcher)
        if (info) {
          const known: Known = {
            id: info.id,
            name: info.name,
            addresses: [{ url: at, kind: 'local' }],
            lastSeen: Date.now(),
          }
          s = { current: known.id, servers: remember(s.servers, known) }
          saveStored(s)
        } else {
          // it doesn't answer: it's in use all the same, named by the address the page came from,
          // so the gate says it's unreachable (as apps/web's did) rather than offering a list a
          // browser can't use. It isn't kept, so the next load asks it again
          const host = (globalThis as { location?: { host?: string } }).location?.host || at
          s = {
            current: HOME_UNREACHED,
            servers: [
              {
                id: HOME_UNREACHED,
                name: host,
                addresses: [{ url: at, kind: 'local' }],
                lastSeen: Date.now(),
              },
            ],
          }
        }
      }
      const t: Record<string, string> = {}
      for (const k of s.servers) {
        const token = await readToken(k.id)
        if (token) t[k.id] = token
      }
      setTokens(t)
      setStored(s)
    })()
  }, [fetcher])

  const write = useCallback((next: Stored) => {
    saveStored(next)
    setStored(next)
  }, [])

  const currentKnown = stored?.servers.find((k) => k.id === stored.current) ?? null
  const token = currentKnown ? tokens[currentKnown.id] : undefined
  // a server listed as signed in: by this device's token, or on the web by the cookie, which the
  // page's own server has set, and the one in use has too once the gate let it in (Settings'
  // Servers is drawn only then). Others may hold a cookie this browser can't read: opening one asks
  const signedInAt = useCallback(
    (k: Known) =>
      !!tokens[k.id] ||
      (COOKIE && (k.id === stored?.current || k.addresses.some((a) => a.url === homeAt.current))),
    [tokens, stored?.current],
  )

  // a new connection per server, per token and per sign-in: signing in or out starts the client
  // again, which asks the server again (on the web the cookie changes with no token to show it)
  // biome-ignore lint/correctness/useExhaustiveDependencies: the addresses, token and round make a connection; lastSeen changing must not
  const current = useMemo<Current | null>(() => {
    if (!currentKnown) return null
    // a token when this device has one; otherwise, on the web, the cookie signs the requests
    const bearer = token ? { token } : {}
    const connection = createServerConnection({
      server: { ...currentKnown, ...bearer },
      fetch: fetcher,
    })
    return {
      server: currentKnown,
      connection,
      client: connection.client,
      base: () => connection.current()?.url.replace(/\/$/, '') ?? null,
      token: token ?? null,
      // on the web with no token, the cookie may sign it in, at whatever address it set it: the
      // SDK sends it (`credentials: 'include'`), so the gate asks the session, and a 401 is the
      // sign-in (useSessionGate)
      signedIn: !!token || COOKIE,
      round,
    }
  }, [currentKnown?.id, currentKnown?.addresses, token, fetcher, round])

  const value = useMemo<ServersValue>(() => {
    const s = stored ?? { current: null, servers: [] }
    return {
      ready: stored !== null,
      known: s.servers.map((k) => ({ ...k, signedIn: signedInAt(k) })),
      current,
      async add(info, base) {
        const known: Known = {
          id: info.id,
          name: info.name,
          addresses: addressesOf(info, base),
          lastSeen: Date.now(),
        }
        write({ current: known.id, servers: remember(s.servers, known) })
        return known
      },
      async use(id) {
        const k = s.servers.find((x) => x.id === id)
        if (!k) return
        write({ current: id, servers: remember(s.servers, { ...k, lastSeen: Date.now() }) })
      },
      async signedIn(t) {
        if (!s.current) return
        const id = s.current
        const kept = await writeToken(id, t)
        setTokens(({ [id]: _, ...rest }) => (kept ? { ...rest, [id]: kept } : rest))
        setRound((n) => n + 1)
      },
      async signedOut() {
        if (!s.current) return
        const id = s.current
        await dropToken(id)
        setTokens(({ [id]: _, ...rest }) => rest)
        setRound((n) => n + 1)
      },
      async remove(id) {
        await dropToken(id)
        setTokens(({ [id]: _, ...rest }) => rest)
        write({ current: s.current === id ? null : s.current, servers: forget(s.servers, id) })
      },
      probe: (base) => publicInfoAt(base, 4000, fetcher),
      nearby,
    }
  }, [stored, signedInAt, current, write, fetcher, nearby])

  return <ServersContext.Provider value={value}>{children}</ServersContext.Provider>
}

export function useServers() {
  const v = useContext(ServersContext)
  if (!v) throw new Error('useServers needs a ServersProvider')
  return v
}

/** The server in use; screens under the gate always have one. */
export function useCurrent(): Current {
  const c = useServers().current
  if (!c) throw new Error('No server in use')
  return c
}
