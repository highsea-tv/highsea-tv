// SPDX-License-Identifier: AGPL-3.0-only
// Where the web client runs (ADR 0058): served by the server at /web, or as the desktop app's
// page in a Tauri window. In a browser the page and the server share an origin, the session
// cookie signs every request, and this module changes nothing. In the app the page is the app's
// own, so it reaches the server through the Rust side (apps/desktop/src-tauri/src/proxy.rs),
// which adds this device's token from the OS's keychain: the page never holds it.
//
// - `hostFetch`: the SDK's fetch. In the app, the `api` command answers whole; the event stream
//   comes through `stream_open` a part at a time on a channel
//   (https://v2.tauri.app/develop/calling-frontend/#channels).
// - `media()`: what the page loads by URL (posters, trickplay, subtitles, the streams). In the app,
//   a server path goes through the `server` scheme: `server://localhost/…`, or
//   `http://server.localhost/…` on Windows, where WebView2 needs custom schemes as http
//   (https://docs.rs/tauri/2.12.4/tauri/struct.Builder.html#method.register_asynchronous_uri_scheme_protocol).
import type { Fetch } from '@highsea-tv/core/fetch'
import { Channel, invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'

/** Tauri sets this before the page's scripts run (https://v2.tauri.app/develop/calling-rust/). */
export const inApp = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

const onWindows = typeof navigator !== 'undefined' && /Windows/.test(navigator.userAgent)
const SCHEME = onWindows ? 'http://server.localhost' : 'server://localhost'

/**
 * A server path the page loads by URL, as the page can load it: unchanged in a browser, through
 * the `server` scheme in the app. Full URLs (a TMDB image) and `data:` are left as they are.
 */
export function media<T extends string | null | undefined>(url: T): T extends string ? string : T {
  type Out = T extends string ? string : T
  if (!inApp || !url?.startsWith('/')) return url as Out
  return `${SCHEME}${url}` as Out
}

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

/** The app's fetch: the server's API and streams, through the Rust side. */
const appFetch: Fetch = async (input, init = {}) => {
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

/** What the page fetches the server with. */
export const hostFetch: Fetch = inApp ? appFetch : (input, init) => fetch(input, init)

// ---------------------------------------------------------------- the app's own

/** This computer as it signs in (DeviceInput): its name as its owner set it. */
export type AppDevice = { name: string; client: 'desktop'; appVersion: string }

export type ServerAddress = { url: string; kind: 'local' | 'remote' }

/** A server this app has used. Whether it's signed in comes from the keychain, never the token. */
export type AppServer = {
  id: string
  name: string
  addresses: ServerAddress[]
  /** When this app last reached it, in seconds since 1970. */
  lastSeen: number
  signedIn: boolean
  current: boolean
}

/** The server in use, at the address that answered: on this network if one did. */
export type CurrentServer = { id: string; name: string; base: string; kind: 'local' | 'remote' }

/** What looking on this network finds, as it finds it. */
export type Found =
  | { kind: 'server'; id: string; name: string; address: string }
  | { kind: 'refused' }
  | { kind: 'done' }

/** How a browser sign-in came back (lib.rs's `oidc_finish`). */
export type OidcDone = { status: 'signedIn' } | { status: 'failed'; reason: string }

/** The Rust side's commands (apps/desktop/src-tauri/src/lib.rs). Only call them in the app. */
export const desktop = {
  device: () => invoke<AppDevice>('app_device'),
  servers: () => invoke<AppServer[]>('servers_list'),
  current: () => invoke<CurrentServer | null>('server_current'),
  /** A typed address: its server, remembered and in use. Fails with `unreachable`, `invalid`… */
  add: (address: string) => invoke<AppServer>('server_add', { address }),
  use: (id: string) => invoke<CurrentServer>('server_use', { id }),
  leave: () => invoke<void>('server_leave'),
  forget: (id: string) => invoke<void>('server_forget', { id }),
  /** Looks on this network for a few seconds, calling `found` as servers answer. */
  discover(found: (f: Found) => void): Promise<void> {
    const onFound = new Channel<Found>()
    onFound.onmessage = found
    return invoke<void>('discover', { onFound })
  },
  /** Opens the server's single sign-on in the system browser; `onOidc` hears how it ends. */
  oidcStart: () => invoke<void>('oidc_start'),
  onOidc: (heard: (done: OidcDone) => void) =>
    listen<OidcDone>('highsea://oidc', (e) => heard(e.payload)),
  /** A `highsea://connect?server=` link, with the server it names. */
  onConnect: (heard: (server: string) => void) =>
    listen<string>('highsea://connect', (e) => heard(e.payload)),
}
