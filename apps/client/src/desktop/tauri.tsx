// SPDX-License-Identifier: AGPL-3.0-only
// The desktop app's host (ADR 0058, one-client-platform-c.md › C2): what the client's seams take
// in the Tauri window, moved from apps/web's host.ts and desktop/ rather than drawn again. Only the
// desktop export loads it (./app.ts, behind EXPO_PUBLIC_HIGHSEA_APP=desktop), so /web's bundle and
// the phone's and TV's never carry @tauri-apps (scripts/bundles.ts checks it).
//
// The page is the app's own, at the window's root, so it reaches the server through the Rust side
// (apps/desktop/src-tauri/src/proxy.rs), which adds this device's token from the OS's keychain: the
// page never holds it.
// - The SDK's fetch: the `api` command answers whole; the event stream comes through `stream_open`
//   a part at a time on a channel (https://v2.tauri.app/develop/calling-frontend/#channels).
// - What loads by URL (artwork, trickplay, subtitles, the streams) goes through the `server`
//   scheme: `server://localhost/…`, or `http://server.localhost/…` on Windows, where WebView2
//   needs custom schemes as http
//   (https://docs.rs/tauri/2.12.4/tauri/struct.Builder.html#method.register_asynchronous_uri_scheme_protocol).
// - The servers it knows are the Rust side's (servers.json and the keychain), so useServers() is
//   filled from its commands: the client's Choose a server, sign-in, Forget and Settings › Servers
//   run on them as the phone's run on @highsea-tv/native's store.
// - The window's buttons through getCurrentWindow()
//   (https://v2.tauri.app/reference/javascript/api/namespacewindow/), and the app's own updates
//   through the updater and process plugins (https://v2.tauri.app/plugin/updater/), which check
//   each update's signature against tauri.conf.json's key and can't be told not to.
// - Single sign-on in the system browser through `oidc_start`, back through `highsea://oidc`
//   (lib.rs's `oidc_finish` exchanges the code itself, with PKCE; ADR 0024).
import type { DeviceInput, PublicInfo } from '@highsea-tv/api-contract'
import type { Known, Nearby } from '@highsea-tv/client/servers'
import type { Fetch } from '@highsea-tv/core/fetch'
import {
  type Current,
  type KnownView,
  type NearbySource,
  ServersContext,
  type ServersValue,
} from '@highsea-tv/native/servers'
import { type WebHost, WebHostProvider } from '@highsea-tv/native/web-host'
import {
  type Address,
  ApiError,
  createClient,
  type Probe,
  type ServerConnection,
} from '@highsea-tv/sdk'
import { getVersion } from '@tauri-apps/api/app'
import { Channel, invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { openUrl } from '@tauri-apps/plugin-opener'
import { relaunch } from '@tauri-apps/plugin-process'
import { check, type Update } from '@tauri-apps/plugin-updater'
import { router } from 'expo-router'
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { type AppUpdate, type DesktopHost, DesktopHostProvider, type DesktopOs } from './host.ts'

// ---------------------------------------------------------------- the computer

const agent = typeof navigator === 'undefined' ? '' : navigator.userAgent

/** The computer the app runs on, from its webview's user agent (Tauri's webviews keep theirs). */
export const os: DesktopOs = /Mac/.test(agent) ? 'mac' : /Windows/.test(agent) ? 'windows' : 'linux'

const SCHEME = os === 'windows' ? 'http://server.localhost' : 'server://localhost'

/**
 * A server path the page loads by URL, through the `server` scheme. Full URLs (a TMDB image) and
 * `data:` are left as they are.
 */
export const media = (url: string) => (url.startsWith('/') ? `${SCHEME}${url}` : url)

/** This computer as it signs in: its name as its owner set it (lib.rs's `app_device`). */
let device: DeviceInput | undefined
const deviceReady = invoke<DeviceInput>('app_device').then(
  (d) => {
    device = d
  },
  () => {},
)

/** What signing in names this computer as; the Rust side's answer, read before the gate opens. */
export const deviceInput = (): DeviceInput | undefined => device

// ---------------------------------------------------------------- the fetch

type Head = { status: number; headers: [string, string][] }
type Whole = Head & { body: string }

const pathOf = (input: string | URL | Request) =>
  new URL(
    typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
    window.location.href,
  )

const headersOf = (init: RequestInit) => [...new Headers(init.headers).entries()]

/** A status the Rust side couldn't reach the server for, as `fetch` reports it: a TypeError. */
function reached(status: number) {
  if (status === 0) throw new TypeError('The server didn’t answer.')
}

let streams = 0

/** A streamed answer: its head when the server sends it, then its body as it comes. */
async function stream(path: string, init: RequestInit): Promise<Response> {
  const id = ++streams
  let done = false
  const close = () => {
    if (done) return
    done = true
    void invoke('stream_close', { id })
  }
  let into!: ReadableStreamDefaultController<Uint8Array>
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      into = c
    },
    cancel: close,
  })
  const onChunk = new Channel<number[] | ArrayBuffer>()
  onChunk.onmessage = (part) => {
    const bytes = new Uint8Array(part)
    try {
      if (bytes.length > 0) return into.enqueue(bytes)
      // an empty part is the end
      into.close()
      close()
    } catch {}
  }
  init.signal?.addEventListener('abort', () => {
    close()
    try {
      into.error(init.signal?.reason)
    } catch {}
  })
  const head = await invoke<Head>('stream_open', {
    id,
    request: { method: 'GET', path, headers: headersOf(init), body: null },
    onChunk,
  })
  reached(head.status)
  return new Response(body, { status: head.status, headers: head.headers })
}

/** The app's fetch: the server in use's API and streams, through the Rust side. */
export const appFetch: Fetch = async (input, init = {}) => {
  const url = pathOf(input)
  const path = url.pathname + url.search
  if (url.pathname === '/api/v1/events') return stream(path, init)
  if (init.body !== undefined && init.body !== null && typeof init.body !== 'string')
    throw new TypeError('The app sends JSON bodies only.')
  const res = await invoke<Whole>('api', {
    request: {
      method: init.method ?? 'GET',
      path,
      headers: headersOf(init),
      body: init.body ?? null,
    },
  })
  reached(res.status)
  const empty = res.status === 204 || res.status === 304
  return new Response(empty ? null : res.body, { status: res.status, headers: res.headers })
}

/** What the web player loads and sends itself (@highsea-tv/native/web-host). */
const webHost: WebHost = {
  media,
  fetch: (input, init) => appFetch(input, init),
  app: os,
}

// ---------------------------------------------------------------- the Rust side's servers

type AppServer = Known & { signedIn: boolean; current: boolean }
/** The server in use, at the address that answered: on this network if one did. */
type RustCurrent = { id: string; name: string; base: string; kind: 'local' | 'remote' }
type Found =
  | { kind: 'server'; id: string; name: string; address: string }
  | { kind: 'refused' }
  | { kind: 'done' }

/** lib.rs keeps last-seen in seconds; the client's screens word it from milliseconds. */
const listServers = () =>
  invoke<AppServer[]>('servers_list').then((list) =>
    list.map((s) => ({ ...s, lastSeen: s.lastSeen * 1000 })),
  )

/** A server's public info at an address, without remembering it (lib.rs's `server_info`). */
const infoAt = (address: string) =>
  invoke<PublicInfo>('server_info', { address }).then(
    (info) => (typeof info?.id === 'string' ? info : null),
    () => null,
  )

/**
 * The server in use as the SDK's ServerConnection: the Rust side probes its addresses and picks
 * one (servers.rs's `connect`, as the SDK's does), and every call goes through it to that one. A
 * call it can't deliver connects again once and retries, so the app fails over between addresses.
 */
function connectionTo(server: Known): ServerConnection {
  let at: Address | null = null
  let probing: Promise<Probe | null> | null = null
  const probe = () => {
    probing ??= (async () => {
      const started = performance.now()
      const c = await invoke<RustCurrent>('server_use', { id: server.id }).catch(() => null)
      at = c ? { url: c.base, kind: c.kind } : null
      probing = null
      return at ? { address: at, latencyMs: performance.now() - started } : null
    })()
    return probing
  }
  const routed: Fetch = async (input, init) => {
    if (!at) await probe()
    if (!at) throw new ApiError('unavailable', `Can’t reach ${server.name}.`)
    try {
      return await appFetch(input, init)
    } catch (e) {
      if ((init?.signal as AbortSignal | undefined)?.aborted || !(e instanceof TypeError)) throw e
      await probe()
      if (!at) throw e
      return appFetch(input, init)
    }
  }
  return {
    server: { ...server },
    current: () => at,
    probe,
    // the Rust side adds the token; the page never sees it
    client: createClient({ baseUrl: '', token: () => null, fetch: routed }),
  }
}

const ASKED = 'highsea:local-network-asked'
/** How long the first look waits for the person to answer macOS's question (Apple TN3179). */
const ASKING_FOR = 60_000
const ASK_AGAIN_EVERY = 2_000

function asked(): boolean {
  try {
    return localStorage.getItem(ASKED) === '1'
  } catch {
    return true
  }
}

function markAsked() {
  try {
    localStorage.setItem(ASKED, '1')
  } catch {}
}

/**
 * The servers on this network, from the Rust side's UDP broadcast and mDNS (discovery.rs), each
 * asked for its public info. macOS 15 asks before an app may look on the local network, and until
 * the person answers, looking fails as it does once they've refused (Apple TN3179): so the first
 * refusal on a Mac is taken for the question being asked, and it keeps looking for a minute, as
 * apps/web's Choose a server did.
 */
const nearby: NearbySource = (listener) => {
  let alive = true
  let found: Nearby[] = []
  let askingSince: number | null = null
  const send = (lan: 'allowed' | 'asking' | 'refused', scanning: boolean) => {
    if (alive) listener({ found, lan, scanning })
  }
  const look = async () => {
    send(askingSince === null ? 'allowed' : 'asking', true)
    let refused = false
    const answers: Promise<void>[] = []
    const onFound = new Channel<Found>()
    onFound.onmessage = (f) => {
      if (f.kind === 'refused') refused = true
      if (f.kind !== 'server') return
      answers.push(
        infoAt(f.address).then((info) => {
          if (!info || found.some((n) => n.info.id === info.id)) return
          found = [...found, { info, base: f.address }]
          send('allowed', true)
        }),
      )
    }
    await invoke('discover', { onFound }).catch(() => {})
    await Promise.all(answers)
    if (!alive) return
    if (!refused) {
      askingSince = null
      return send('allowed', false)
    }
    if (os === 'mac' && !asked()) {
      markAsked()
      askingSince = Date.now()
    }
    if (askingSince !== null && Date.now() - askingSince < ASKING_FOR) {
      send('asking', true)
      setTimeout(() => alive && void look(), ASK_AGAIN_EVERY)
      return
    }
    askingSince = null
    send('refused', false)
  }
  void look()
  return () => {
    alive = false
  }
}

/**
 * useServers() in the desktop app: the Rust side's list, the server in use and its connection.
 * The token stays on the Rust side, which keeps it from a sign-in's answer, drops it on sign-out
 * and when the server refuses it (proxy.rs), so signing in and out here only reads the list again.
 */
function DesktopServers({ children }: { children: ReactNode }) {
  const [known, setKnown] = useState<AppServer[] | null>(null)
  const [currentId, setCurrentId] = useState<string | null>(null)
  const [round, setRound] = useState(0)
  const knownRef = useRef<AppServer[]>([])

  const refresh = useCallback(async () => {
    const list = await listServers().catch(() => [] as AppServer[])
    knownRef.current = list
    setKnown(list)
    return list
  }, [])

  // the server in use when the page loaded again, else the one last used that this computer is
  // signed in to, else Choose a server (apps/web's start)
  useEffect(() => {
    void (async () => {
      await deviceReady
      const now = await invoke<RustCurrent | null>('server_current').catch(() => null)
      const list = await refresh()
      const last = list.filter((s) => s.signedIn).sort((a, b) => b.lastSeen - a.lastSeen)[0]
      setCurrentId(now?.id ?? last?.id ?? null)
    })()
  }, [refresh])

  const server = known?.find((k) => k.id === currentId) ?? null
  const signedIn = server?.signedIn ?? false
  // each read of the list makes new objects: the addresses' words decide whether they changed
  const addresses = JSON.stringify(server?.addresses ?? [])
  // a new connection per server and per sign-in or sign-out, as ServersProvider makes them
  // biome-ignore lint/correctness/useExhaustiveDependencies: the server, its addresses and the round make a connection; lastSeen changing must not
  const current = useMemo<Current | null>(() => {
    if (!server) return null
    const { signedIn: _, current: __, ...plain } = server
    const connection = connectionTo(plain)
    return {
      server: plain,
      connection,
      client: connection.client,
      // what loads by URL goes through the `server` scheme once the Rust side has an address
      base: () => (connection.current() ? SCHEME : null),
      token: null,
      signedIn,
      round,
    }
  }, [server?.id, addresses, signedIn, round])

  const value = useMemo<ServersValue>(
    () => ({
      ready: known !== null,
      known: (known ?? []).map(({ current: _, ...k }) => k satisfies KnownView),
      current,
      async add(_info, base) {
        const kept = await invoke<Known>('server_add', { address: base })
        await refresh()
        setCurrentId(kept.id)
        return { ...kept, lastSeen: kept.lastSeen * 1000 }
      },
      async use(id) {
        // the Rust side connects when the client first calls; one that doesn't answer opens the
        // shell, which says it's unreachable
        await invoke('server_leave')
        setCurrentId(id)
        await refresh()
      },
      async signedIn() {
        await refresh()
        setRound((n) => n + 1)
      },
      async signedOut() {
        await refresh()
        setRound((n) => n + 1)
      },
      async remove(id) {
        await invoke('server_forget', { id })
        await refresh()
        setCurrentId((c) => (c === id ? null : c))
      },
      probe: infoAt,
      nearby,
    }),
    [known, current, refresh],
  )

  return <ServersContext.Provider value={value}>{children}</ServersContext.Provider>
}

// ---------------------------------------------------------------- updates

const EVERY = 6 * 60 * 60_000
/** Where the page was when it restarted to update, to open there again. */
const RESUME = 'highsea:after-update'

let update: AppUpdate = { current: '', ready: null, checkedAt: null }
let waiting: Update | null = null
const listeners = new Set<() => void>()

function set(next: Partial<AppUpdate>) {
  update = { ...update, ...next }
  for (const l of listeners) l()
}

async function checkNow() {
  if (waiting) return
  try {
    const found = await check()
    set({ checkedAt: Date.now() })
    if (!found) return
    // downloaded in the background; it waits for Restart to update, or for the next start
    await found.download()
    waiting = found
    set({ ready: found.version })
  } catch {
    // offline, or the feed isn't there yet: the next check tries again
  }
}

let started = false

/** Starts checking at start and every 6 hours, once, in the app's release builds. */
function startUpdates() {
  if (started) return
  started = true
  getVersion().then(
    (current) => set({ current }),
    () => {},
  )
  if (process.env.NODE_ENV !== 'production') return
  void checkNow()
  setInterval(() => void checkNow(), EVERY)
}

/** After a restart to update: back to where the page was, before the router reads the address. */
function resumeAfterUpdate() {
  try {
    const at = localStorage.getItem(RESUME)
    if (!at) return
    localStorage.removeItem(RESUME)
    if (at.startsWith('/') && !at.startsWith('//')) window.history.replaceState(null, '', at)
  } catch {}
}

resumeAfterUpdate()

const host: DesktopHost = {
  os,
  // macOS draws its own buttons over the top bar (`titleBarStyle: "Overlay"`)
  drawsSystemButtons: false,
  window: {
    minimize: () => void getCurrentWindow().minimize(),
    toggleMaximize: () => void getCurrentWindow().toggleMaximize(),
    close: () => void getCurrentWindow().close(),
  },
  updates: {
    get: () => update,
    subscribe(l) {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    async restart() {
      if (!waiting) return
      try {
        localStorage.setItem(RESUME, window.location.pathname + window.location.search)
      } catch {}
      await waiting.install()
      await relaunch()
    },
  },
  // downloads stay the mock's until 4.6 (B2's answer 2), so the real app never draws Kept in
  keptIn: {
    folder: async () => '',
    choose: async () => null,
    move: async () => {
      throw new Error('Downloads come with 4.6.')
    },
  },
}

// ---------------------------------------------------------------- the browser and links

/** Opens a page in the system browser (the opener plugin, limited to http and https). */
export const openBrowser = (url: string) => openUrl(url)

/** How a browser sign-in came back (lib.rs's `oidc_finish`). */
type OidcDone = { status: 'signedIn' } | { status: 'failed'; reason: string }

/**
 * Single sign-on in the system browser: `oidc_start` opens the server's start with a PKCE
 * challenge, and the Rust side exchanges the code that comes back to `highsea://oidc` and keeps
 * the token. Answers the reason when it failed, or null once signed in.
 */
export async function signInInBrowser(): Promise<string | null> {
  let stop: (() => void) | undefined
  const done = new Promise<OidcDone>((resolve) => {
    void listen<OidcDone>('highsea://oidc', (e) => resolve(e.payload)).then((off) => {
      stop = off
    })
  })
  try {
    await invoke('oidc_start')
    const back = await done
    return back.status === 'signedIn' ? null : back.reason
  } catch (e) {
    return String(e)
  } finally {
    stop?.()
  }
}

/** A `highsea://connect?server=` link opens Choose a server with that address (ADR 0020). */
function useConnectLinks() {
  useEffect(() => {
    const off = listen<string>('highsea://connect', (e) =>
      router.navigate({ pathname: '/connect', params: { server: e.payload } }),
    )
    return () => {
      void off.then((f) => f())
    }
  }, [])
}

/** The desktop app's providers, in ServersProvider's place at the client's root. */
export function DesktopRoot({ children }: { children: ReactNode }) {
  useEffect(startUpdates, [])
  useConnectLinks()
  return (
    <DesktopHostProvider value={host}>
      <WebHostProvider value={webHost}>
        <DesktopServers>{children}</DesktopServers>
      </WebHostProvider>
    </DesktopHostProvider>
  )
}
