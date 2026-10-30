// SPDX-License-Identifier: AGPL-3.0-only
// The servers this phone knows (connectivity.md, ADR 0059), as the desktop app keeps them
// (ADR 0058): names and addresses in `servers.json` in the app's documents, each device token in
// the iOS keychain through expo-secure-store (https://docs.expo.dev/versions/latest/sdk/securestore/),
// never in the file. The server in use gets a ServerConnection, which probes its addresses (a
// LAN address that answers wins) and fails over between them, and one SDK client over Expo's
// streaming fetch, so the event stream works (https://docs.expo.dev/versions/latest/sdk/expo/#expofetch-api).
import { type PublicInfo, routes } from '@highsea-tv/api-contract'
import { addressesOf, forget, type Known, remember, tokenKey } from '@highsea-tv/client/servers'
import { createServerConnection, type HighseaClient, type ServerConnection } from '@highsea-tv/sdk'
import { fetch as expoFetch } from 'expo/fetch'
import { File, Paths } from 'expo-file-system'
import * as SecureStore from 'expo-secure-store'
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'

type Stored = { current: string | null; servers: Known[] }

const file = () => new File(Paths.document, 'servers.json')

async function load(): Promise<Stored> {
  try {
    const f = file()
    if (!f.exists) return { current: null, servers: [] }
    return JSON.parse(await f.text()) as Stored
  } catch {
    return { current: null, servers: [] }
  }
}

function save(stored: Stored) {
  const f = file()
  if (!f.exists) f.create()
  f.write(JSON.stringify(stored))
}

// Expo's fetch takes the platform's RequestInit; the SDK's Fetch is the DOM's
const fetcher = expoFetch as unknown as typeof fetch

const PUBLIC_INFO = routes.system.publicInfo.path

/** A server's public info at an address, or null when nothing highsea answers there. */
export async function publicInfoAt(base: string, timeoutMs = 4000): Promise<PublicInfo | null> {
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

export type KnownView = Known & { signedIn: boolean }

export type Current = {
  server: Known
  connection: ServerConnection
  client: HighseaClient
  /** The address in use, once probed. */
  base: () => string | null
  /** This device's token, for what loads by URL (artwork, streams, subtitles). */
  token: string | null
}

type ServersValue = {
  ready: boolean
  known: KnownView[]
  current: Current | null
  /** Remembers a server reached at `base` and makes it current. */
  add: (info: PublicInfo, base: string) => Promise<Known>
  use: (id: string) => Promise<void>
  /** Keeps this device's token for the current server. */
  signedIn: (token: string) => Promise<void>
  /** Drops this device's token for the current server, and leaves it known. */
  signedOut: () => Promise<void>
  remove: (id: string) => Promise<void>
}

const ServersContext = createContext<ServersValue | null>(null)

export function ServersProvider({ children }: { children: ReactNode }) {
  const [stored, setStored] = useState<Stored | null>(null)
  const [tokens, setTokens] = useState<Record<string, string>>({})

  useEffect(() => {
    void (async () => {
      const s = await load()
      const t: Record<string, string> = {}
      for (const k of s.servers) {
        const token = await SecureStore.getItemAsync(tokenKey(k.id))
        if (token) t[k.id] = token
      }
      setTokens(t)
      setStored(s)
    })()
  }, [])

  const write = useCallback((next: Stored) => {
    save(next)
    setStored(next)
  }, [])

  const currentKnown = stored?.servers.find((k) => k.id === stored.current) ?? null
  const token = currentKnown ? tokens[currentKnown.id] : undefined

  // a new connection per server and per token: signing in starts the client again
  // biome-ignore lint/correctness/useExhaustiveDependencies: the addresses and token make a connection; lastSeen changing must not
  const current = useMemo<Current | null>(() => {
    if (!currentKnown) return null
    const connection = createServerConnection({
      server: { ...currentKnown, ...(token ? { token } : {}) },
      fetch: fetcher,
    })
    return {
      server: currentKnown,
      connection,
      client: connection.client,
      base: () => connection.current()?.url.replace(/\/$/, '') ?? null,
      token: token ?? null,
    }
  }, [currentKnown?.id, currentKnown?.addresses, token])

  const value = useMemo<ServersValue>(() => {
    const s = stored ?? { current: null, servers: [] }
    return {
      ready: stored !== null,
      known: s.servers.map((k) => ({ ...k, signedIn: !!tokens[k.id] })),
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
        await SecureStore.setItemAsync(tokenKey(s.current), t)
        setTokens((prev) => ({ ...prev, [s.current as string]: t }))
      },
      async signedOut() {
        if (!s.current) return
        const id = s.current
        await SecureStore.deleteItemAsync(tokenKey(id))
        setTokens(({ [id]: _, ...rest }) => rest)
      },
      async remove(id) {
        await SecureStore.deleteItemAsync(tokenKey(id))
        setTokens(({ [id]: _, ...rest }) => rest)
        write({ current: s.current === id ? null : s.current, servers: forget(s.servers, id) })
      },
    }
  }, [stored, tokens, current, write])

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
