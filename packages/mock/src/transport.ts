// SPDX-License-Identifier: AGPL-3.0-only
// The mock server as a transport for @highsea-tv/sdk: a `Fetch` the SDK's own client takes
// (`createClient({ baseUrl, fetch })`), so the real client app runs as a prototype with the mock in
// place of the network, in a browser and in the iOS and tvOS simulators (one-client-platform.md ›
// The prototypes are the clients). Each request is matched to its contract route, checked with the
// route's own schemas, and answered from the mock's state in the contract's shapes; errors come back
// as the server's ErrorBody with its status, and /api/v1/events is a text/event-stream.
//
// The routes it answers, the shell's and the proof destination's (Choose a server, signing in and
// Settings on the phone, the TV and the web):
//
//   system.health          GET    /api/health
//   system.publicInfo      GET    /api/v1/system/info/public
//   system.events          GET    /api/v1/events
//   system.server          GET    /api/v1/system/server
//   auth.signIn            POST   /api/v1/auth/sign-in
//   auth.twoFactor         POST   /api/v1/auth/two-factor
//   auth.signOut           POST   /api/v1/auth/sign-out
//   auth.session           GET    /api/v1/auth/session
//   auth.oidcExchange      POST   /api/v1/auth/oidc/exchange
//   auth.startPairing      POST   /api/v1/auth/pairing
//   auth.pollPairing       POST   /api/v1/auth/pairing/poll
//   auth.pairingRequest    GET    /api/v1/auth/pairing/{code}
//   auth.approvePairing    POST   /api/v1/auth/pairing/{code}/approve
//   me.devices             GET    /api/v1/me/devices
//   devices.revoke         DELETE /api/v1/devices/{id}
//   preferences.get        GET    /api/v1/me/preferences
//   preferences.save       PATCH  /api/v1/me/preferences
//   home.layout            GET    /api/v1/me/home
//   home.saveLayout        PUT    /api/v1/me/home
//   appearance.get         GET    /api/v1/appearance
//   announcements.active   GET    /api/v1/announcements
//   announcements.seen     POST   /api/v1/announcements/{id}/seen
//
// And the films apps' (B1: Home, Library, Collections, a film, a person and Search), from films.ts:
//
//   home.sections          GET    /api/v1/home
//   library.list           GET    /api/v1/items
//   library.item           GET    /api/v1/items/{type}/{id}
//   library.search         GET    /api/v1/search
//   library.collections    GET    /api/v1/library/collections
//   library.collection     GET    /api/v1/library/collections/{id}
//   metadata.person        GET    /api/v1/people/{id}
//   playback.prefs         GET    /api/v1/items/{type}/{id}/prefs
//   playback.setPrefs      PUT    /api/v1/items/{type}/{id}/prefs
//   playback.played        POST   /api/v1/items/{type}/{id}/played
//   playback.unplayed      DELETE /api/v1/items/{type}/{id}/played
//   playback.dismiss       POST   /api/v1/items/{type}/{id}/dismiss
//
// And the player's (B2), from play.ts, which serves every film as one clip the caller hands in
// (`media`) and follows the toolbar's stream state:
//
//   playback.play          POST   /api/v1/items/{type}/{id}/play
//   playback.progress      POST   /api/v1/playback/sessions/{id}/progress
//   playback.stop          DELETE /api/v1/playback/sessions/{id}
//   playback.report        PUT    /api/v1/devices/current/profile
//   playback.next          GET    /api/v1/items/{type}/{id}/next
//   playback.trickplay     GET    /api/v1/items/{type}/{id}/trickplay
//
// And the drafted routes (B3), which the real server answers 501: shows', episodes' and music's
// from kinds.ts (an episode also plays, and is marked, through the films' `{type}` routes above),
// and the account's profiles from profiles.ts:
//
//   shows.list             GET    /api/v1/shows
//   shows.show             GET    /api/v1/shows/{id}
//   shows.watched          PUT    /api/v1/shows/{id}/watched
//   music.library          GET    /api/v1/music
//   music.songs            GET    /api/v1/music/songs
//   music.album            GET    /api/v1/music/albums/{id}
//   music.artist           GET    /api/v1/music/artists/{id}
//   music.queue            POST   /api/v1/music/queue
//   music.tracks           GET    /api/v1/music/tracks
//   playlists.list         GET    /api/v1/music/playlists
//   playlists.get          GET    /api/v1/music/playlists/{id}
//   playlists.create       POST   /api/v1/music/playlists
//   playlists.rename       PATCH  /api/v1/music/playlists/{id}
//   playlists.add          POST   /api/v1/music/playlists/{id}/songs
//   playlists.remove       DELETE /api/v1/playlists/{id}/songs/{entry}
//   playlists.reorder      PUT    /api/v1/music/playlists/{id}/order
//   playlists.delete       DELETE /api/v1/playlists/{id}
//   profiles.list          GET    /api/v1/me/profiles
//   profiles.create        POST   /api/v1/me/profiles
//   profiles.update        PATCH  /api/v1/me/profiles/{id}
//   profiles.delete        DELETE /api/v1/me/profiles/{id}
//   profiles.choose        POST   /api/v1/me/profiles/{id}/choose
//
// Every other contract route answers 501 with a body naming it. Adding one is one entry in
// `answers` below, under its group and name as the contract has them: a function from the route's
// checked input to its output, typed by the route's parsed request and the SDK's `Output`, so it
// can't drift from the contract. The mock's shapes become the contract's in the mappers just above
// the table.
//
// It runs under Vite, Bun and Metro alike: nothing it imports touches the DOM, Node or a bundler's
// own API (`import.meta`, `?raw`, `?url`; test/transport.test.ts checks), and the caller chooses
// the storage (`memoryStorage()` on native). The only image in its answers, an announcement's, is
// the mock's SVG data URI, drawn in sRGB hex because CoreSVG, which draws SVG on iOS and tvOS,
// paints `oklch()` black (@highsea-tv/fixtures's art.ts).
//
// Single sign-on can't reach a provider from a mock, so `oidc(url)` stands in for the browser the
// app opens: given the app's `oidc/start` address, it answers with where the provider would send
// the browser back, `highsea://oidc?code=…`, as `nearby` stands in for Bonjour.
import {
  accessOf,
  CLIENT_SOURCES,
  COLLECTION_TOPICS,
  CURATION_TOPICS,
  OPERATIONS_TOPICS,
  PLAYBACK_TOPICS,
  RESET_TOPIC,
  routes,
  SESSIONS_TOPICS,
  STAFF_TOPICS,
  type TITLE_TYPES,
  TMDB_ATTRIBUTION,
  WIDGET_SOURCES,
} from '@highsea-tv/api-contract'
import { normalizeCode, PAIRING_INTERVAL, PAIRING_TTL } from '@highsea-tv/auth/codes'
import type { Nearby } from '@highsea-tv/client/servers'
import { AppError, ERROR_CODES, type ErrorCode } from '@highsea-tv/core/errors'
import { type ServerEvent as BusEvent, createEventBus } from '@highsea-tv/core/events'
import type { Fetch } from '@highsea-tv/core/fetch'
import { createT, defineMessages } from '@highsea-tv/i18n'
import {
  BUILT_IN_PACK,
  type EditableLayer,
  type PreferenceLayers,
  patchLayer,
  preferenceLayer,
  resolveLayers,
  scopeFor,
  serverPreferences,
} from '@highsea-tv/personalization/keys'
import type { HighseaClient, Output } from '@highsea-tv/sdk'
import { PROVIDER_INFO } from '@highsea-tv/subtitles/providers/info'
import { builtInThemes } from '@highsea-tv/tokens'
import type { z } from 'zod'
import { clientMessages } from './client.ts'
import { EPOCH, iso } from './clock.ts'
import { FilmRefused, filmsOf, type Refusal } from './films.ts'
import { type KindRefusal, KindRefused, kindsOf } from './kinds.ts'
import { createMock, type Mock, userFor } from './mock.ts'
import { waiting } from './pairing.ts'
import { createPlays, type MockMedia } from './play.ts'
import { MAX_PROFILES, type ProfileRefusal, ProfileRefused, profilesOf } from './profiles.ts'
import { type Api, ApiError, createApi, type MockServer, type Storage } from './server.ts'
import { defaultState, type ProtoState, type Role } from './state.ts'
import { DISCOVERY_MS, DISCOVERY_STAGGER_MS, PAIRING_APPROVAL_MS } from './timing.ts'
import type { Announcement, Device, ClientType as MockClientType, User } from './types.ts'

// what a caller needs beside the fetch: the mock and the storage it keeps sign-ins in
export { createMock, type Mock } from './mock.ts'
export { browserStorage, memoryStorage, type Storage } from './server.ts'
export type { ProtoState } from './state.ts'
export type { Nearby }

export const transportMessages = defineMessages({
  'transport.notAnswered': 'The mock server doesn’t answer {method} {path} ({route}) yet.',
  'transport.noRoute': 'There’s no API route at that address.',
  'transport.invalid': 'That request isn’t valid.',
  'transport.notJson': 'The body isn’t JSON.',
  'transport.signIn': 'Sign in first.',
  'transport.invalidCredentials': 'That username and password don’t match.',
  'transport.forbidden': 'You don’t have access to that.',
  'transport.challengeExpired': 'That step has expired. Start again.',
  'transport.deviceUnknown': 'That device isn’t signed in.',
  'transport.deviceSelf': 'That’s the browser you’re using. Sign out instead.',
  'transport.announcementUnknown': 'There’s no announcement with that id.',
  'transport.pairingExpired': 'That code has expired. Show a new one on the TV.',
  'transport.noDevice': 'Only an app signed in as a device has a device layer.',
  'transport.noTheme': 'There’s no theme with that id.',
  'transport.whichClient': 'Say which kind of app the layer is for.',
  'transport.internal': 'Something went wrong on the server. It’s in the logs.',
  'transport.browser': 'Browser',
  'transport.oidcStart': 'That isn’t this server’s single sign-on address.',
  // the server's own words for the films apps' refusals (packages/media, curation and metadata)
  'transport.titleUnknown': 'That movie isn’t in the library.',
  'transport.collectionUnknown': 'There’s no collection with that id.',
  'transport.personUnknown': 'TMDB has no person with that id.',
  'transport.versionUnknown': 'That version isn’t this title’s.',
  'transport.badCursor': 'That page link has expired. Start from the first page.',
  // the player's (packages/runtime's playback.ts)
  'transport.sessionEnded': 'That play session has ended.',
  'transport.stoppedBy': '{name} stopped this stream.',
  'transport.notPlayable': 'That version has no file to play.',
  // the drafted routes' (B3): shows, episodes and profiles
  'transport.showUnknown': 'That show isn’t on this server.',
  'transport.episodeUnknown': 'That episode isn’t on this server.',
  'transport.profileUnknown': 'There’s no profile with that id.',
  'transport.profilesFull': 'An account can have {max} profiles at most.',
  'transport.profileMain': 'The account’s own profile can’t be deleted.',
  'transport.profileName': 'A profile needs a name of 40 characters or fewer.',
  'transport.profilePin': 'A PIN is four digits.',
  'transport.wrongPin': 'That isn’t {name}’s PIN. Try again.',
  'transport.pinRest': 'Too many tries. Try again in a minute.',
})
const t = createT(transportMessages)
const tc = createT(clientMessages)

// ---------------------------------------------------------------- types

type Routes = typeof routes
type RouteLike = Parameters<HighseaClient['call']>[0]
type ClientType = Output<Routes['me']['devices']>[number]['client']
type AppClient = Exclude<ClientType, 'admin'>
type Method = Output<Routes['me']['devices']>[number]['method']

/** What the toolbar sets that the transport reads: the rest of ProtoState is the chrome's. */
export type TransportState = Pick<
  ProtoState,
  'data' | 'role' | 'theme' | 'sound' | 'connection' | 'lan' | 'stream' | 'airplay'
>

export type TransportOptions = {
  /** The mock to answer from; a fresh one in `storage` when absent. */
  mock?: Mock
  /** Where sign-ins and preferences are kept: `browserStorage` on the web, `memoryStorage()` on native. */
  storage?: Storage
  /** Simulated network latency in ms, as the prototype's client has it. Tests use 0. */
  latency?: number
  state?: Partial<TransportState>
  /** How long, in real ms, a TV's code waits before the phone approves it. */
  approveAfterMs?: number
  /**
   * The clip every film plays as (play.ts), where the caller serves one: the web's mock export.
   * Without it, a play session has no URL and the player waits, as on a first transcode.
   */
  media?: MockMedia
  /**
   * Signing in as someone else changed the role: the chrome sets its toolbar to it, so the next
   * `setState` doesn't sign them out again.
   */
  onRole?: (role: Role) => void
  /**
   * The page's origin (`location.origin`), so a `same-origin` request to a host by its full
   * address carries that host's cookie when it's the page's own. The transport reads no browser
   * globals; without it, only the page's own host ('') counts as same-origin.
   */
  origin?: string
}

/** What discovery shows: the servers found so far, the local network's permission, and the scan. */
export type NearbySnapshot = {
  found: Nearby[]
  lan: ProtoState['lan']
  scanning: boolean
}

export type MockTransport = Fetch & {
  /** Sets toolbar states, as the chrome's ProtoState has them; open streams and scans follow. */
  setState(patch: Partial<ProtoState>): void
  state(): TransportState
  /**
   * The servers found nearby (Bonjour on the phone and the TV), for the client's mock mode. With
   * `permission` (the phone) the toolbar's local network setting applies; the TV and web never ask.
   * Returns a stop function.
   */
  nearby(
    listener: (snapshot: NearbySnapshot) => void,
    options?: { permission?: boolean },
  ): () => void
  /**
   * Single sign-on in mock mode: given the `oidc/start` address the app would open in a browser,
   * where the provider sends it back (`highsea://oidc?code=…` for an app). Shaped as Expo's
   * `openAuthSessionAsync` answers its success (https://docs.expo.dev/versions/latest/sdk/webbrowser/),
   * so a sign-in can call either. It never cancels or dismisses, as no one closes its browser; it
   * throws instead where the server would answer an error page: an AppError with `details.reason`
   * (`oidc-unknown` when the host offers no single sign-on, `challenge` without one), or a
   * TypeError when the host can't be reached, as fetch does. The sign-in's own catch handles both.
   */
  oidc(address: string): Promise<{ type: 'success'; url: string }>
  mock: Mock
  dispose(): void
}

type Host = {
  id: string
  name: string
  version: string
  /** Its origin (`http://192.168.1.20:3000`), or '' for the page's own. */
  origin: string
  lan: boolean
  oidc: { name: string } | null
  passkeys: boolean
}

type Grant = {
  /** The device's token; null for the browser's session cookie. */
  token: string | null
  host: string
  /** The origin a cookie was set on; '' for the page's own, and for a token. */
  origin: string
  device: {
    id: string
    name: string
    client: ClientType
    appVersion: string
    address: string
    method: Method
    createdAt: string
    expiresAt: string | null
  }
}

type Ctx = {
  host: Host
  caller: Grant | null
  away: boolean
  api: Api
  srv: MockServer
  userId: string
}

/** A request part as the route's schema parses it: defaults filled in, as the answers receive it. */
type Parsed<R, K extends 'params' | 'query'> = R extends {
  request: { [P in K]: infer S extends z.ZodType }
}
  ? { [P in K]: z.output<S> }
  : { [P in K]?: undefined }
type ParsedBody<R> = R extends {
  request: { body: { content: { 'application/json': { schema: infer S extends z.ZodType } } } }
}
  ? { body: z.output<S> }
  : { body?: undefined }
type Checked<R> = Parsed<R, 'params'> & Parsed<R, 'query'> & ParsedBody<R>

type Answer<R> = R extends RouteLike
  ? (input: Checked<R>, ctx: Ctx) => Output<R> | Promise<Output<R>>
  : never
type Answers = {
  [G in keyof Routes]?: { [K in keyof Routes[G]]?: Answer<Routes[G][K]> }
}

/** The parts of a route the transport reads; zod schemas, seen only through `safeParse`. */
type Schema = {
  safeParse(
    value: unknown,
  ): { success: true; data: unknown } | { success: false; error: { issues: unknown[] } }
}
type ContractRoute = {
  method: string
  path: string
  request?: {
    params?: Schema
    query?: Schema
    headers?: Schema
    body?: { content: { 'application/json': { schema: Schema } } }
  }
  responses: Record<number, unknown>
}

/** Refusals are the server's own errors (@highsea-tv/core/errors), answered as its ErrorBody. */
const refuse = (code: ErrorCode, message: string, details?: unknown) =>
  new AppError(code, message, details)

/** A route the mock doesn't answer yet: 501, the server lacking what's needed (RFC 9110 § 15.6.2). */
class NotAnswered extends AppError {
  override get status() {
    return 501
  }
}

const CODES = Object.keys(ERROR_CODES) as ErrorCode[]

/** The mock's own refusals in the server's codes and details. */
function refusalOf(e: unknown): AppError {
  if (e instanceof AppError) return e
  if (e instanceof ApiError) {
    const reason = { reason: e.code }
    switch (e.code) {
      case 'invalid-credentials':
        return refuse('unauthorized', e.message, { field: 'password', reason: e.code })
      case 'invalid-code':
        return refuse('unauthorized', e.message, { field: 'code', reason: e.code })
      case 'rate-limited':
        // the mock's message says five minutes
        return refuse('rate-limited', e.message, { reason: e.code, retryAfter: 300 })
      case 'unreachable':
        return refuse('unavailable', e.message)
      case 'self':
        return refuse('forbidden', e.message, reason)
      case 'invalid-address':
        return refuse('invalid', e.message, reason)
    }
    if ((CODES as string[]).includes(e.code))
      return refuse(e.code as ErrorCode, e.message, e.details)
    const byStatus = CODES.find((c) => ERROR_CODES[c] === e.status)
    return refuse(byStatus ?? 'internal', e.message, reason)
  }
  return refuse('internal', t('transport.internal'), { cause: (e as Error)?.message ?? String(e) })
}

// ---------------------------------------------------------------- responses

/**
 * A body read once, through `getReader()` as the SDK's event stream reads it, or whole through
 * `text()`. Its own, not the platform's ReadableStream, which React Native's fetch doesn't have;
 * it keeps to the reader's `read()` and `cancel()` (https://streams.spec.whatwg.org/#default-reader-class).
 */
type Body = {
  getReader(): { read(): Promise<{ done: boolean; value?: Uint8Array }>; cancel(): Promise<void> }
}

type Source = {
  /** The next chunk, or null at the end. */
  next(): Promise<string | null>
  cancel(): void
}

const encoder = new TextEncoder()

/**
 * A body over a source, as the Streams standard's stream is: one reader at a time (`getReader()`
 * on a locked stream throws), disturbed by its first read or cancel, and done once cancelled.
 */
function bodyOf(source: Source) {
  let locked = false
  let disturbed = false
  let closed = false
  const body: Body & { readonly locked: boolean; readonly disturbed: boolean } = {
    get locked() {
      return locked
    },
    get disturbed() {
      return disturbed
    },
    getReader: () => {
      if (locked) throw new TypeError('The body is locked to another reader.')
      locked = true
      return {
        async read() {
          disturbed = true
          if (closed) return { done: true }
          const chunk = await source.next()
          if (chunk === null || closed) return { done: true }
          return { done: false, value: encoder.encode(chunk) }
        },
        async cancel() {
          disturbed = true
          closed = true
          source.cancel()
        },
      }
    },
  }
  return body
}

const once = (text: string): Source => {
  let sent = false
  return {
    next: async () => {
      if (sent) return null
      sent = true
      return text
    },
    cancel: () => {
      sent = true
    },
  }
}

/** The members of the Fetch standard's Response that the SDK and the apps read (https://fetch.spec.whatwg.org/#response-class). */
class MockResponse {
  readonly status: number
  readonly statusText: string
  readonly ok: boolean
  readonly headers: Headers
  readonly url: string
  readonly body: ReturnType<typeof bodyOf> | null
  readonly redirected = false
  readonly type = 'basic'
  #text: string | null
  #type: string | undefined
  constructor(
    url: string,
    status: number,
    init: { text?: string; stream?: Source; type?: string },
  ) {
    this.url = url
    this.status = status
    this.statusText = ''
    this.ok = status >= 200 && status < 300
    this.headers = new Headers(init.type ? { 'content-type': init.type } : {})
    this.#type = init.type
    this.#text = init.stream ? null : (init.text ?? null)
    this.body = init.stream ? bodyOf(init.stream) : init.text ? bodyOf(once(init.text)) : null
  }
  /** True once the body has been read or cancelled, through `text()` or a reader. */
  get bodyUsed() {
    return this.body?.disturbed ?? false
  }
  /** The whole body: a stream is read to its end, as fetch's `text()` does. */
  async text() {
    if (!this.body) return ''
    if (this.body.locked || this.body.disturbed)
      throw new TypeError('The body has already been read.')
    const reader = this.body.getReader()
    const decoder = new TextDecoder()
    let out = ''
    for (;;) {
      const { done, value } = await reader.read()
      if (done) return out + decoder.decode()
      out += decoder.decode(value, { stream: true })
    }
  }
  async json(): Promise<unknown> {
    return JSON.parse(await this.text())
  }
  /** A copy of a whole body. A stream's events go to one reader, so it can't be cloned. */
  clone() {
    if (this.bodyUsed) throw new TypeError('The body has already been read.')
    if (this.#text === null && this.body)
      throw new TypeError('An event stream can’t be cloned: read it through one reader.')
    return new MockResponse(this.url, this.status, {
      text: this.#text ?? undefined,
      type: this.#type,
    })
  }
}

const json = (url: string, status: number, data: unknown) =>
  new MockResponse(url, status, {
    text: data === undefined ? undefined : JSON.stringify(data),
    type: 'application/json',
  })

const errorResponse = (url: string, e: AppError) =>
  json(url, e.status, {
    error: {
      code: e.code,
      message: e.message,
      ...(e.details === undefined ? {} : { details: e.details }),
    },
  })

/** What fetch rejects with when the network fails (https://fetch.spec.whatwg.org/#concept-network-error). */
const networkError = () => new TypeError('Network request failed')
const abortError = (signal: AbortSignal | null | undefined) => {
  if (signal?.reason !== undefined) return signal.reason
  const e = new Error('The operation was aborted.')
  e.name = 'AbortError'
  return e
}

const pause = (ms: number, signal: AbortSignal | null | undefined) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(abortError(signal))
    if (ms <= 0) return resolve()
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', stop)
      resolve()
    }, ms)
    const stop = () => {
      clearTimeout(timer)
      reject(abortError(signal))
    }
    signal?.addEventListener('abort', stop, { once: true })
  })

// ---------------------------------------------------------------- routes

type Entry = {
  key: string
  group: string
  name: string
  route: ContractRoute
  method: string
  pattern: RegExp
  names: string[]
  templated: boolean
}

const table: Entry[] = Object.entries(
  routes as unknown as Record<string, Record<string, ContractRoute>>,
)
  .flatMap(([group, members]) =>
    Object.entries(members).map(([name, route]): Entry => {
      const names: string[] = []
      const source = route.path
        .split(/(\{\w+\})/)
        .map((part) => {
          const m = /^\{(\w+)\}$/.exec(part)
          if (!m) return part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
          names.push(m[1] as string)
          return '([^/]+)'
        })
        .join('')
      return {
        key: `${group}.${name}`,
        group,
        name,
        route,
        method: route.method.toUpperCase(),
        pattern: new RegExp(`^${source}$`),
        names,
        templated: names.length > 0,
      }
    }),
  )
  // a concrete path before a templated one that also matches it, as OpenAPI says
  // (https://spec.openapis.org/oas/v3.1.0#paths-object): /auth/pairing/poll before /auth/pairing/{code}
  .sort((a, b) => Number(a.templated) - Number(b.templated))

function match(method: string, path: string) {
  for (const entry of table) {
    if (entry.method !== method) continue
    const m = entry.pattern.exec(path)
    if (!m) continue
    const params: Record<string, string> = {}
    for (const [i, n] of entry.names.entries()) {
      try {
        params[n] = decodeURIComponent(m[i + 1] as string)
      } catch {
        // a malformed escape (`%E0%A4%A`) isn't an address the server could route (RFC 3986 § 2.1)
        throw refuse('invalid', t('transport.invalid'), [{ path: [n], message: 'malformed' }])
      }
    }
    return { entry, params }
  }
  return null
}

const checked = (schema: Schema | undefined, value: unknown) => {
  if (!schema) return undefined
  const result = schema.safeParse(value)
  if (!result.success) throw refuse('invalid', t('transport.invalid'), result.error.issues)
  return result.data
}

// the routes the connection's probes and the event stream reach, which the toolbar's Loading and
// Error leave answering, as a server that's up but busy would; and announcements, which the
// prototype's client never holds either (client.ts)
const UNHELD = new Set([
  'system.health',
  'system.publicInfo',
  'system.events',
  'announcements.active',
  'announcements.seen',
])
const UNFAILED = new Set(['system.health', 'system.publicInfo', 'system.events'])

/** `http://host:port/path?query`, or a path alone for the page's own origin. */
const URL_PARTS = /^(?:(https?):\/\/([^/?#]+))?([^?#]*)(?:\?([^#]*))?/

// ---------------------------------------------------------------- the transport

const random = () => Math.random().toString(36).slice(2, 10)
const DAY = 86_400_000
/** Where the apps sign in from: a home network's address, and a documentation one away (RFC 5737). */
const ADDRESS = { home: '192.168.1.50', away: '203.0.113.24' }
const WAITING_CODE = normalizeCode(waiting.code)
/** A single sign-on code works once, for two minutes (auth.oidcExchange in the contract). */
const OIDC_CODE_MS = 2 * 60_000
const OIDC_RETURN = 'highsea://oidc'

export function createMockFetch(options: TransportOptions = {}): MockTransport {
  const mock = options.mock ?? createMock(options.storage)
  const storage = options.storage ?? mock.storage
  const latency = options.latency ?? 180
  const approveAfterMs = options.approveAfterMs ?? PAIRING_APPROVAL_MS
  let state: TransportState = {
    data: defaultState.data,
    role: defaultState.role,
    theme: defaultState.theme,
    sound: { ...defaultState.sound },
    connection: defaultState.connection,
    lan: defaultState.lan,
    stream: defaultState.stream,
    airplay: defaultState.airplay,
    ...options.state,
  }

  const bus = createEventBus({ now: () => Date.now() })
  const plays = createPlays({
    media: options.media,
    stream: () => state.stream,
    now: () => Date.now(),
    stopped: (id, to) => bus.emit({ topic: SESSIONS_TOPICS.stopped, ids: [id], to: [to] }),
  })
  const srv = () => (state.data === 'empty' ? mock.servers.empty : mock.servers.populated)

  // Who is signed in, decided in one place: the toolbar's role picks its person (mock.ts's
  // userFor), and signing in as someone else picks them, with the role following theirs
  // (`onRole` tells the chrome). Kept, so a reload signs the same person in.
  const WHO = 'transport:who'
  const roleOf = (id: string): Role =>
    srv().state.users.find((u) => u.id === id)?.role ?? state.role
  let who = (storage.load(WHO) as string | undefined) ?? userFor(state.role)
  if (roleOf(who) !== state.role) who = userFor(state.role)
  const userId = () => who
  const becomes = (id: string) => {
    if (id === who) return
    who = id
    storage.save(WHO, who)
    const role = roleOf(id)
    // another person: every app refetches everything
    if (role !== state.role) {
      state = { ...state, role }
      options.onRole?.(role)
    }
    bus.emit({ topic: RESET_TOPIC })
  }
  const mockNow = () => mock.clock.now()
  /** The mock's time on the real clock, which the apps compare dates against. */
  const wall = (date: string) => new Date(Date.parse(date) + (Date.now() - mockNow())).toISOString()
  const wallMs = (ms: number) => new Date(ms + (Date.now() - mockNow())).toISOString()

  const apis = new Map<string, Api>()
  const api = () => {
    const key = `${srv().kind}:${userId()}`
    let a = apis.get(key)
    if (!a) {
      a = createApi(srv(), { userId: userId(), storage })
      apis.set(key, a)
    }
    return a
  }

  // the mock's own events, under the same topics; while a route mutates the mock it emits the
  // server's precise events itself, so the relay is hushed
  let hush = 0
  const quietly = <R>(fn: () => R): R => {
    hush++
    try {
      return fn()
    } finally {
      hush--
    }
  }
  const relays = (['populated', 'empty'] as const).map((kind) =>
    mock.servers[kind].events.subscribe((event) => {
      if (hush || event.type === 'tick' || srv().kind !== kind) return
      bus.emit({ topic: event.type })
      // curation's changes are Home's too, as the runtime raises them (ADR 0048)
      if (event.type === CURATION_TOPICS.curation || event.type === COLLECTION_TOPICS.collections)
        bus.emit({ topic: CURATION_TOPICS.home })
    }),
  )

  // ---------------------------------------------------------------- hosts

  /** Settings › Security's sign-in methods, as `auth.methods()` reads them on the server. */
  const security = () => srv().state.settings.security
  const harbor = (): Host => {
    const s = srv().state.server
    const { oidc } = security()
    return {
      id: s.id,
      name: s.name,
      version: s.version,
      origin: '',
      lan: true,
      oidc: oidc.enabled ? { name: oidc.name } : null,
      passkeys: security().passkeys,
    }
  }
  const hostFor = (scheme: string | undefined, authority: string | undefined): Host | null => {
    const h = harbor()
    if (!authority) return h
    const s = srv().state.server
    const origin = `${scheme}://${authority}`
    if (s.addresses.public && origin === s.addresses.public.replace(/\/$/, ''))
      return { ...h, origin, lan: false }
    if (scheme === 'http' && s.addresses.local.includes(authority))
      return { ...h, origin, lan: true }
    const found = srv().state.discovered.find((d) => scheme === 'http' && d.address === authority)
    if (found)
      return {
        id: found.id,
        name: found.name,
        version: found.version,
        origin,
        lan: true,
        // the others found nearby are bare servers: a password only
        oidc: null,
        passkeys: false,
      }
    return null
  }

  // ---------------------------------------------------------------- sign-ins

  // the browser's session cookies, by the origin each was set on ('' for the page's own)
  const GRANTS = 'transport:cookies'
  const REVOKED = 'transport:revoked'
  const cookies = new Map<string, Grant>(
    Object.entries((storage.load(GRANTS) as Record<string, Grant> | undefined) ?? {}),
  )
  const revoked = new Set<string>((storage.load(REVOKED) as string[] | undefined) ?? [])
  /** Every device signed in through the transport, and the server it's signed in to. */
  const known = new Map<string, Grant>()
  for (const g of cookies.values()) known.set(g.device.id, g)
  const saveGrants = () => {
    storage.save(GRANTS, Object.fromEntries(cookies))
    storage.save(REVOKED, [...revoked])
  }

  // a token says who it is, so a native app's keychain outlives the mock's memory across reloads
  const TOKEN = 'mock.'
  const tokenOf = (grant: Omit<Grant, 'token'>) =>
    TOKEN + encodeURIComponent(JSON.stringify({ host: grant.host, device: grant.device }))
  const fromToken = (token: string): Grant | null => {
    if (!token.startsWith(TOKEN)) return null
    try {
      const g = JSON.parse(decodeURIComponent(token.slice(TOKEN.length))) as Omit<
        Grant,
        'token' | 'origin'
      >
      return { ...g, origin: '', token }
    } catch {
      return null
    }
  }

  /**
   * The caller: an app by its bearer token, or a browser by its session cookie. A cookie goes
   * only to the origin that set it (RFC 6265 § 5.4) and only with the request's credentials
   * (https://fetch.spec.whatwg.org/#concept-request-credentials-mode): always with `include`,
   * with `same-origin` only when the page is on the host's own origin, never with `omit`. So an
   * app reaching Harbor at its own address never takes the page's sign-in for its own.
   */
  const callerOf = (
    host: Host,
    headers: Headers,
    credentials: RequestInit['credentials'],
  ): Grant | null => {
    const auth = headers.get('authorization')
    const grant = auth?.startsWith('Bearer ')
      ? fromToken(auth.slice(7))
      : credentials === 'include' ||
          (credentials === 'same-origin' && (host.origin === '' || host.origin === options.origin))
        ? (cookies.get(host.origin) ?? null)
        : null
    if (!grant || grant.host !== host.id || revoked.has(grant.device.id)) return null
    if (grant.device.expiresAt && Date.parse(grant.device.expiresAt) < mockNow()) return null
    known.set(grant.device.id, grant)
    return grant
  }

  /** Puts the caller's device among the mock's, as the server's devices table has it. */
  const seat = (grant: Grant) => {
    const devices = srv().state.devices
    const at = iso(mockNow())
    const existing = devices.find((d) => d.id === grant.device.id)
    if (existing) {
      existing.userId = userId()
      existing.lastSeen = at
      return
    }
    devices.push({
      id: grant.device.id,
      userId: userId(),
      name: grant.device.name,
      client: grant.device.client as MockClientType,
      appVersion: grant.device.appVersion,
      address: grant.device.address,
      lastSeen: at,
    })
  }

  const issue = (
    host: Host,
    away: boolean,
    device: Checked<Routes['auth']['signIn']>['body']['device'],
    method: Method,
  ) => {
    const now = mockNow()
    const g: Omit<Grant, 'token'> = {
      host: host.id,
      origin: device ? '' : host.origin,
      device: {
        id: `d-${random()}`,
        name: device?.name ?? t('transport.browser'),
        client: device?.client ?? 'admin',
        appVersion: device?.appVersion ?? host.version,
        address: away ? ADDRESS.away : ADDRESS.home,
        method,
        createdAt: iso(now),
        // an app's token lasts until it's signed out; the browser's session as long as Settings ›
        // Security says (ADR 0023)
        expiresAt: device ? null : iso(now + security().sessionDays * DAY),
      },
    }
    const grant: Grant = device ? { ...g, token: tokenOf(g) } : { ...g, token: null }
    if (!grant.token) cookies.set(grant.origin, grant)
    known.set(grant.device.id, grant)
    saveGrants()
    seat(grant)
    bus.emit({ topic: 'users.updated', ids: [userId()] })
    return grant
  }

  const sessionOf = (grant: Grant) => ({
    // the person signed in is `who`, whichever way they signed in
    user: userOf(api().auth.session().user),
    deviceId: grant.device.id,
    expiresAt: grant.device.expiresAt && wall(grant.device.expiresAt),
    method: grant.device.method,
  })

  const signedIn = (
    host: Host,
    away: boolean,
    device: Parameters<typeof issue>[2],
    method: Method,
  ) => {
    const grant = issue(host, away, device, method)
    return {
      status: 'signed-in' as const,
      session: sessionOf(grant),
      ...(grant.token ? { token: grant.token } : {}),
    }
  }

  const challenges = new Map<
    string,
    { host: string; userId: string; device: Parameters<typeof issue>[2] }
  >()
  /** Single sign-on codes from `oidc()`, each for one app's PKCE challenge, once. */
  const oidcCodes = new Map<
    string,
    { host: string; app: AppClient; challenge: string; expiresAt: number }
  >()

  type PairingEntry = {
    code: string
    pollToken: string
    device: AppClientDevice
    host: string
    startedAt: number
    expiresAt: number
    approved: boolean
  }
  type AppClientDevice = { name: string; client: AppClient; appVersion: string }
  const pairings = new Map<string, PairingEntry>()
  let waitingApproved = false

  const pairingUrl = (code: string) => {
    const s = srv().state.server
    const base = s.addresses.public ?? `http://${s.addresses.local[0]}`
    return `${base}/link?code=${encodeURIComponent(code)}`
  }
  const livePairing = (code: string) => {
    const p = pairings.get(normalizeCode(code))
    if (!p || p.expiresAt < mockNow()) return null
    return p
  }
  const pairingExpired = () =>
    refuse('not-found', t('transport.pairingExpired'), { reason: 'pairing-expired' })
  const waitingRequest = () => ({
    device: { name: waiting.device, client: 'tvos' as const, appVersion: harbor().version },
    address: waiting.address,
    expiresAt: wallMs(mockNow() + PAIRING_TTL),
  })

  // ---------------------------------------------------------------- preferences

  const PREFS = 'transport:prefs'
  const prefs = (storage.load(PREFS) as Record<string, Record<string, unknown>> | undefined) ?? {}
  const scopeKey = (ctx: Ctx, scope: string) => `${ctx.host.id}|${ctx.userId}|${scope}`
  const readLayer = (ctx: Ctx, scope: string) => {
    const parsed = preferenceLayer.safeParse(prefs[scopeKey(ctx, scope)] ?? {})
    return parsed.success ? parsed.data : {}
  }
  const themeExists = (id: unknown) =>
    typeof id === 'string' &&
    (id in builtInThemes || srv().state.appearance.themes.some((th) => th.id === id))

  // the toolbar's theme and sounds stand for the server's defaults (client/prefs.tsx)
  const appearanceOf = () => {
    const a = api().appearance.get()
    return {
      defaultTheme: themeExists(state.theme) ? state.theme : a.defaultTheme,
      themes: a.themes,
      sound: {
        tv: state.sound.tv,
        phone: state.sound.mobile,
        web: state.sound.web,
        volume: a.sound.volume,
        pack: a.sound.pack,
      },
      packs: [{ ...BUILT_IN_PACK, builtIn: true }],
      branding: { ...a.branding, mark: null },
    }
  }

  // the layers and their order are the server's own (@highsea-tv/personalization/keys)
  const resolvePrefs = (ctx: Ctx): Output<Routes['preferences']['get']> => {
    const d = ctx.caller?.device ?? null
    const client = d?.client ?? null
    const layers: PreferenceLayers = {
      device: d ? readLayer(ctx, scopeFor('device', d.id)) : {},
      client: client ? readLayer(ctx, scopeFor('client', client)) : {},
      user: readLayer(ctx, scopeFor('user')),
    }
    const { values, from } = resolveLayers(
      serverPreferences(appearanceOf(), client),
      layers,
      (key, value) => key !== 'theme' || themeExists(value),
    )
    return { values, from, layers, client, deviceId: d?.id ?? null }
  }

  // ---------------------------------------------------------------- mappers

  const userOf = (u: User) => ({
    id: u.id,
    username: u.username,
    displayName: u.displayName,
    role: u.role,
    permissions: u.permissions,
    libraries: u.libraries,
    twoFactor: u.twoFactor,
    passkeys: 0,
    hasPassword: !u.invited,
    email: null,
    lastSeen: u.lastSeen && wall(u.lastSeen),
    invited: u.invited,
    // a year before the mock's evening, when Harbor was set up
    createdAt: wallMs(EPOCH - 365 * DAY),
  })

  const deviceOf = (d: Device) => {
    const g = known.get(d.id)
    const tv = d.client === 'tvos' || d.client === 'androidtv'
    return {
      id: d.id,
      userId: d.userId,
      name: d.name,
      client: d.client,
      appVersion: d.appVersion,
      address: d.address,
      method: g?.device.method ?? (tv ? 'pairing' : 'password'),
      createdAt: g ? wall(g.device.createdAt) : wallMs(Date.parse(d.lastSeen) - 30 * DAY),
      lastSeen: wall(d.lastSeen),
      expiresAt: g?.device.expiresAt ? wall(g.device.expiresAt) : null,
    }
  }

  const announcementOf = ({ status: _, ...a }: Announcement) => ({
    ...a,
    schedule: { start: wall(a.schedule.start), end: a.schedule.end && wall(a.schedule.end) },
  })

  const serverOf = (host: Host) => {
    const s = srv().state.server
    return {
      id: host.id,
      name: host.name,
      version: host.version,
      branding: { ...s.branding, name: host.id === s.id ? s.branding.name : host.name, mark: null },
      addresses: {
        local:
          host.id === s.id
            ? s.addresses.local.map((a) => `http://${a}`)
            : [host.origin || `http://${host.name}`],
        public: host.id === s.id ? s.addresses.public : null,
      },
      setupComplete: s.setupComplete,
      clientsConnected: s.clientsConnected,
      catalogVersion: s.catalogVersion,
    }
  }

  const publicInfoOf = (host: Host) => {
    const server = serverOf(host)
    const subtitles = srv().state.providers.find((p) => p.id === 'opensubtitles')
    return {
      id: host.id,
      name: host.name,
      version: host.version,
      localAddresses: server.addresses.local,
      publicUrl: server.addresses.public,
      setupComplete: server.setupComplete,
      auth: { local: true, oidc: host.oidc, passkeys: host.passkeys },
      // the mock serves the drafted kinds too (B3); the real server lists none of CLIENT_SOURCES
      sources: [...WIDGET_SOURCES, ...CLIENT_SOURCES],
      attributions: [
        TMDB_ATTRIBUTION,
        // the runtime's credit for OpenSubtitles.com (runtime.ts's ATTRIBUTIONS), in the mock's words
        ...(subtitles?.attribution
          ? [
              {
                name: subtitles.name,
                notice: subtitles.attribution,
                url: PROVIDER_INFO.opensubtitles.url,
              },
            ]
          : []),
      ],
    }
  }

  const homeOf = (a: Api) => {
    const l = a.home.layout()
    // Continue watching's title is each app's own (home.ts's BUILT_IN_ROWS)
    return {
      order: l.order,
      hidden: l.hidden,
      rows: l.rows.map((r) => ({ id: r.id, title: r.id === 'continue' ? null : r.title })),
    }
  }

  // ---------------------------------------------------------------- the films apps' reads

  const films = (ctx: Ctx) => filmsOf(ctx)
  /** The kind of app asking: its device's, or the web's for a browser's session. */
  const clientOf = (ctx: Ctx): AppClient => {
    const c = ctx.caller?.device?.client
    return !c || c === 'admin' ? 'web' : c
  }
  /** The films reads' refusals, as the server answers them: 404 for what isn't there, 400 otherwise. */
  const refusals: Record<Refusal, () => AppError> = {
    title: () => refuse('not-found', t('transport.titleUnknown')),
    collection: () => refuse('not-found', t('transport.collectionUnknown')),
    person: () => refuse('not-found', t('transport.personUnknown')),
    version: () => refuse('invalid', t('transport.versionUnknown'), { reason: 'version' }),
    cursor: () => refuse('invalid', t('transport.badCursor'), { reason: 'bad-cursor' }),
  }
  /** Shows' and episodes' refusals (kinds.ts), as the server will answer them. */
  const kindRefusals: Record<KindRefusal, () => AppError> = {
    show: () => refuse('not-found', t('transport.showUnknown')),
    episode: () => refuse('not-found', t('transport.episodeUnknown')),
    version: refusals.version,
  }
  /**
   * Profiles' refusals (profiles.ts) as the drafted routes declare them: a wrong PIN is 403, not
   * 401, which would say the app isn't signed in (RFC 9110 § 15.5.2); the fifth in a row is 429
   * with its Retry-After in the details, as the sign-in's limiter answers (packages/auth).
   */
  const profileRefusal = (r: ProfileRefusal): AppError => {
    switch (r.kind) {
      case 'not-found':
        return refuse('not-found', t('transport.profileUnknown'))
      case 'full':
        return refuse('conflict', t('transport.profilesFull', { max: MAX_PROFILES }), {
          reason: 'full',
        })
      case 'main':
        return refuse('conflict', t('transport.profileMain'), { reason: 'main' })
      case 'invalid':
        return refuse(
          'invalid',
          t(r.field === 'pin' ? 'transport.profilePin' : 'transport.profileName'),
          { field: r.field },
        )
      case 'wrong-pin':
        return refuse('forbidden', t('transport.wrongPin', { name: r.name }), {
          field: 'pin',
          reason: 'wrong-pin',
        })
      case 'resting':
        return refuse('rate-limited', t('transport.pinRest'), {
          reason: 'rate-limited',
          retryAfter: r.retryAfter,
        })
    }
  }
  const found = <R>(fn: () => R): R => {
    try {
      return fn()
    } catch (e) {
      if (e instanceof FilmRefused) throw refusals[e.refusal]()
      if (e instanceof KindRefused) throw kindRefusals[e.refusal]()
      if (e instanceof ProfileRefused) throw profileRefusal(e.refusal)
      throw e
    }
  }
  /** Shows, episodes and music (kinds.ts), and the account's profiles (profiles.ts). */
  const kinds = (ctx: Ctx) => kindsOf(ctx)
  const profiles = (ctx: Ctx) => profilesOf(ctx.srv, ctx.userId)
  /** A change to a film's watch state, heard by the person's devices (packages/media's `announce`). */
  type TitleType = (typeof TITLE_TYPES)[number]
  const announce = (ctx: Ctx, id: number, type: TitleType = 'movie') =>
    bus.emit({ topic: PLAYBACK_TOPICS.watch, ids: [`${type}:${id}`], to: [ctx.userId] })
  const watched = (ctx: Ctx, type: TitleType, id: number, done: boolean) => {
    found(() =>
      quietly(() =>
        type === 'episode' ? kinds(ctx).played(id, done) : films(ctx).played(id, done),
      ),
    )
    announce(ctx, id, type)
    return undefined
  }
  /** A title by its address: a film from films.ts, an episode (B3) from kinds.ts. */
  const titleOf = (ctx: Ctx, type: TitleType, id: number) =>
    found(() =>
      type === 'episode'
        ? kinds(ctx).detail(id, clientOf(ctx))
        : films(ctx).detail(id, clientOf(ctx)),
    )
  /** A live session of the caller's, or the 404 the runtime answers: who stopped it, when someone did. */
  const session = (ctx: Ctx, id: string) => {
    const s = plays.find(ctx.userId, id)
    if (!s) throw refuse('not-found', t('transport.sessionEnded'))
    if ('stopped' in s)
      throw refuse('not-found', t('transport.stoppedBy', { name: s.stopped.by }), {
        reason: 'stopped',
        ...s.stopped,
      })
    return s
  }

  // ---------------------------------------------------------------- the answers

  const answers: Answers = {
    system: {
      health: () => ({ status: 'ok', checks: [{ name: 'database', ok: true }] }),
      publicInfo: (_, { host }) => publicInfoOf(host),
      server: (_, { host }) => serverOf(host),
    },

    auth: {
      session: (_, ctx) => ({ ...sessionOf(ctx.caller as Grant), away: ctx.away }),
      // the typed username decides who signs in (the mock's own sign-in finds them, and checks
      // the password), and the toolbar's role follows theirs. The mock's sign-in falls back to the
      // person signed in for a name it doesn't know; the server refuses it (packages/auth's
      // sign-in.ts), so this does too, before anyone is signed in
      signIn: ({ body }, { host, away, api }) => {
        const result = api.auth.signIn(body)
        // the mock's challenge is `ch-` and the person's id (server.ts)
        const user =
          result.status === 'signed-in'
            ? result.session.user
            : srv().state.users.find((u) => `ch-${u.id}` === result.challenge)
        if (!user || user.username !== body.username.toLowerCase())
          throw refuse('unauthorized', t('transport.invalidCredentials'), {
            field: 'password',
            reason: 'invalid-credentials',
          })
        const id = user.id
        if (result.status === 'two-factor') {
          const challenge = `ch-${random()}`
          challenges.set(challenge, { host: host.id, userId: id, device: body.device })
          return { status: 'two-factor', challenge }
        }
        becomes(id)
        return signedIn(host, away, body.device, 'password')
      },
      twoFactor: ({ body }, { host, away, api }) => {
        const c = challenges.get(body.challenge)
        if (!c || c.host !== host.id)
          throw refuse('unauthorized', t('transport.challengeExpired'), {
            reason: 'challenge-expired',
          })
        api.auth.verifyTwoFactor(body)
        challenges.delete(body.challenge)
        becomes(c.userId)
        return signedIn(host, away, c.device, 'password')
      },
      // a code from `oidc()`, once and for two minutes; the provider's person is the one signed
      // in at the toolbar. The PKCE verifier isn't checked: Hermes has no SHA-256 to check it with
      oidcExchange: ({ body }, { host, away }) => {
        const c = oidcCodes.get(body.code)
        oidcCodes.delete(body.code)
        if (!c || c.host !== host.id || c.expiresAt < Date.now())
          throw refuse('unauthorized', t('transport.challengeExpired'), {
            reason: 'challenge-expired',
          })
        return signedIn(host, away, body.device, 'oidc')
      },
      signOut: (_, { caller }) => {
        const g = caller as Grant
        revoked.add(g.device.id)
        if (!g.token) cookies.delete(g.origin)
        saveGrants()
        srv().state.devices = srv().state.devices.filter((d) => d.id !== g.device.id)
        bus.emit({ topic: 'users.updated', ids: [userId()] })
        return undefined
      },
      startPairing: ({ body }, { host }) => {
        const now = mockNow()
        const code = waiting.code
        const entry: PairingEntry = {
          code: normalizeCode(code),
          pollToken: `pt-${random()}${random()}`,
          device: body.device,
          host: host.id,
          startedAt: Date.now(),
          expiresAt: now + PAIRING_TTL,
          approved: false,
        }
        pairings.set(entry.code, entry)
        return {
          code,
          pollToken: entry.pollToken,
          url: pairingUrl(code),
          expiresAt: wallMs(entry.expiresAt),
          interval: PAIRING_INTERVAL,
        }
      },
      pollPairing: ({ body }, { host, away }) => {
        const p = [...pairings.values()].find((x) => x.pollToken === body.pollToken)
        if (!p || p.expiresAt < mockNow() || p.host !== host.id) throw pairingExpired()
        // the phone approves after a few seconds, as the TV prototype's does
        if (!p.approved && Date.now() - p.startedAt < approveAfterMs) return { status: 'pending' }
        pairings.delete(p.code)
        const grant = issue(host, away, p.device, 'pairing')
        return { status: 'signed-in', session: sessionOf(grant), token: grant.token as string }
      },
      pairingRequest: ({ params }) => {
        const p = livePairing(params.code)
        if (p) return { device: p.device, address: waiting.address, expiresAt: wallMs(p.expiresAt) }
        if (normalizeCode(params.code) === WAITING_CODE && !waitingApproved) return waitingRequest()
        throw pairingExpired()
      },
      approvePairing: ({ params }) => {
        const p = livePairing(params.code)
        if (p && !p.approved) {
          p.approved = true
          return { device: p.device, address: waiting.address, expiresAt: wallMs(p.expiresAt) }
        }
        if (!p && normalizeCode(params.code) === WAITING_CODE && !waitingApproved) {
          waitingApproved = true
          return waitingRequest()
        }
        throw pairingExpired()
      },
    },

    me: {
      // another server's sign-ins share Harbor's data, so they're left out
      devices: (_, { host, api }) =>
        api.devices
          .mine()
          .filter((d) => (known.get(d.id)?.host ?? host.id) === host.id && !revoked.has(d.id))
          .map(deviceOf),
    },

    devices: {
      revoke: ({ params }, ctx) => {
        const { caller } = ctx
        const d = srv().state.devices.find((x) => x.id === params.id)
        if (!d || revoked.has(d.id)) throw refuse('not-found', t('transport.deviceUnknown'))
        if (d.id === caller?.device.id)
          throw refuse('forbidden', t('transport.deviceSelf'), { reason: 'self' })
        // someone else's device: managing people, the owner's alone (ADR 0032). The mock's own
        // revoke takes d-admin for the caller's browser, which here it isn't
        if (d.userId !== ctx.userId && roleOf(ctx.userId) !== 'owner')
          throw refuse('forbidden', t('transport.forbidden'))
        srv().state.devices = srv().state.devices.filter((x) => x.id !== d.id)
        revoked.add(d.id)
        saveGrants()
        bus.emit({ topic: 'users.updated', ids: [d.userId] })
        return undefined
      },
    },

    preferences: {
      get: (_, ctx) => resolvePrefs(ctx),
      save: ({ body }, ctx) => {
        const { layer, client, values } = body
        if (layer === 'client' && !client)
          throw refuse('invalid', t('transport.whichClient'), { reason: 'client' })
        const d = ctx.caller?.device
        if (layer === 'device' && !d)
          throw refuse('invalid', t('transport.noDevice'), { reason: 'no-device' })
        if (values.theme && !themeExists(values.theme))
          throw refuse('invalid', t('transport.noTheme'), { reason: 'theme' })
        const scope = scopeFor(layer as EditableLayer, layer === 'device' ? d?.id : client)
        const key = scopeKey(ctx, scope)
        const next = patchLayer(readLayer(ctx, scope), values)
        if (Object.keys(next).length === 0) delete prefs[key]
        else prefs[key] = next
        storage.save(PREFS, prefs)
        bus.emit({ topic: 'preferences.updated', ids: [ctx.userId] })
        return resolvePrefs(ctx)
      },
    },

    home: {
      // the films' rows (films.ts) with shows' and music's (kinds.ts)
      sections: ({ query }, ctx) => kinds(ctx).home(query?.client ?? 'web'),
      layout: (_, { api }) => homeOf(api),
      saveLayout: ({ body }, ctx) => {
        const layout = { order: [...new Set(body.order)], hidden: [...new Set(body.hidden)] }
        quietly(() => ctx.api.home.saveLayout(layout))
        bus.emit({ topic: CURATION_TOPICS.home, ids: [ctx.userId], to: [ctx.userId] })
        return homeOf(ctx.api)
      },
    },

    appearance: {
      get: () => appearanceOf(),
    },

    // the films apps' reads (films.ts), with episodes, shows and music since B3 (kinds.ts)
    library: {
      list: ({ query }, ctx) => found(() => films(ctx).list(query)),
      item: ({ params }, ctx) => titleOf(ctx, params.type, params.id),
      search: ({ query }, ctx) => kinds(ctx).search(query.query),
      collections: ({ query }, ctx) => films(ctx).collections(query?.client ?? 'web'),
      collection: ({ params, query }, ctx) =>
        found(() => films(ctx).collectionPage(params.id, query?.client ?? 'web')),
    },

    metadata: {
      person: ({ params }, ctx) => found(() => films(ctx).person(params.id)),
    },

    playback: {
      prefs: ({ params }, ctx) =>
        found(() =>
          params.type === 'episode' ? kinds(ctx).prefs(params.id) : films(ctx).prefs(params.id),
        ),
      setPrefs: ({ params, body }, ctx) => {
        const next = found(() =>
          quietly(() =>
            params.type === 'episode'
              ? kinds(ctx).setPrefs(params.id, body)
              : films(ctx).setPrefs(params.id, body),
          ),
        )
        announce(ctx, params.id, params.type)
        return next
      },
      played: ({ params }, ctx) => watched(ctx, params.type, params.id, true),
      unplayed: ({ params }, ctx) => watched(ctx, params.type, params.id, false),
      dismiss: ({ params }, ctx) => {
        found(() =>
          quietly(() =>
            params.type === 'episode'
              ? kinds(ctx).dismiss(params.id)
              : films(ctx).dismiss(params.id),
          ),
        )
        announce(ctx, params.id, params.type)
        return undefined
      },
      play: ({ params, body }, ctx) => {
        const d = titleOf(ctx, params.type, params.id)
        const picks = found(() =>
          params.type === 'episode' ? kinds(ctx).prefs(params.id) : films(ctx).prefs(params.id),
        )
        // the version asked for, then the pick, then the first, as the runtime's play has it
        const wanted = body?.versionId ?? picks.versionId
        const version = wanted ? d.versions.find((v) => v.id === wanted) : d.versions[0]
        if (!version) throw refusals.version()
        if (!version.playable) throw refuse('conflict', t('transport.notPlayable'))
        return plays.play(
          ctx.userId,
          { item: d.item, version },
          {
            audioId: body?.audioId === undefined ? picks.audioId : body.audioId,
            subtitleId: body?.subtitleId === undefined ? picks.subtitleId : body.subtitleId,
            start: body?.start,
          },
        )
      },
      progress: ({ params, body }, ctx) => {
        const s = session(ctx, params.id)
        const done = found(() =>
          quietly(() =>
            s.type === 'episode'
              ? kinds(ctx).place(s.tmdbId, body.position, s.duration)
              : films(ctx).place(s.tmdbId, body.position, s.duration),
          ),
        )
        announce(ctx, s.tmdbId, s.type)
        return { watched: done, ...plays.heard() }
      },
      stop: ({ params }, ctx) => {
        plays.end(session(ctx, params.id))
        return undefined
      },
      // kept by the runtime for the device; the mock's play answers every device alike
      report: () => undefined,
      next: ({ params }, ctx) => ({
        item: found(() =>
          params.type === 'episode' ? kinds(ctx).next(params.id) : films(ctx).next(params.id),
        ),
      }),
      // no sheets: the mock serves only the API, and the scrubber draws without previews
      trickplay: ({ params, query }, ctx) => {
        const d = titleOf(ctx, params.type, params.id)
        const v = query?.versionId ?? d.versions[0]?.id
        if (!v || !d.versions.some((x) => x.id === v)) throw refusals.version()
        return plays.trickplay(v)
      },
    },

    // the drafted routes (B3, kinds.ts and profiles.ts): the mock's own events tell the apps
    shows: {
      list: (_, ctx) => kinds(ctx).list(),
      show: ({ params }, ctx) => found(() => kinds(ctx).show(params.id)),
      watched: ({ params, body }, ctx) => {
        found(() => kinds(ctx).setWatched(params.id, body.season, body.watched))
        return undefined
      },
    },

    music: {
      library: (_, ctx) => kinds(ctx).music(),
      songs: (_, ctx) => kinds(ctx).songs(),
      album: ({ params }, ctx) => kinds(ctx).album(params.id),
      artist: ({ params }, ctx) => kinds(ctx).artist(params.id),
      queue: ({ body }, ctx) => kinds(ctx).queue(body.source, body.shuffle),
      tracks: ({ query }, ctx) =>
        kinds(ctx).tracks(
          query.ids
            .split(',')
            .map((x) => x.trim())
            .filter(Boolean),
        ),
    },

    playlists: {
      list: (_, ctx) => kinds(ctx).playlists(),
      get: ({ params }, ctx) => kinds(ctx).playlist(params.id),
      create: ({ body }, ctx) => {
        const p = ctx.api.playlists.create(body.name, body.songs)
        return kinds(ctx).playlist(p.id).playlist
      },
      rename: ({ params, body }, ctx) => {
        ctx.api.playlists.rename(params.id, body.name)
        return undefined
      },
      add: ({ params, body }, ctx) => {
        ctx.api.playlists.add(params.id, body.songs)
        return undefined
      },
      remove: ({ params }, ctx) => {
        ctx.api.playlists.remove(params.id, params.entry)
        return undefined
      },
      reorder: ({ params, body }, ctx) => {
        ctx.api.playlists.reorder(params.id, body.entries)
        return undefined
      },
      delete: ({ params }, ctx) => {
        ctx.api.playlists.delete(params.id)
        return undefined
      },
    },

    profiles: {
      list: (_, ctx) => profiles(ctx).list(),
      create: ({ body }, ctx) => found(() => profiles(ctx).create(body.name, body.tone)),
      update: ({ params, body }, ctx) => found(() => profiles(ctx).update(params.id, body)),
      delete: ({ params }, ctx) => {
        found(() => profiles(ctx).delete(params.id))
        return undefined
      },
      choose: ({ params, body }, ctx) =>
        found(() => profiles(ctx).choose(params.id, body?.pin, ctx.srv.clock.now())),
    },

    announcements: {
      active: ({ query }, { api }) =>
        api.announcements
          .active((query?.client ?? 'web') as MockClientType)
          // newest first, as the curation service orders them
          .sort((a, b) => Date.parse(b.schedule.start) - Date.parse(a.schedule.start))
          .map(announcementOf),
      seen: ({ params }, ctx) => {
        if (!srv().state.announcements.some((x) => x.id === params.id))
          throw refuse('not-found', t('transport.announcementUnknown'))
        // once per person, as the curation service records it
        if (srv().state.seen[ctx.userId]?.includes(params.id)) return undefined
        quietly(() => ctx.api.announcements.dismiss(params.id))
        bus.emit({ topic: CURATION_TOPICS.announcements, ids: [params.id], to: [ctx.userId] })
        bus.emit({ topic: CURATION_TOPICS.curation, ids: [params.id] })
        return undefined
      },
    },
  }

  // ---------------------------------------------------------------- events

  type Stream = { kill(): void; host: Host }
  const streams = new Set<Stream>()

  /** The server's event stream (apps/server/src/api/events.ts), in the SSE format (https://html.spec.whatwg.org/multipage/server-sent-events.html). */
  const eventStream = (
    ctx: Ctx,
    lastEventId: string | undefined,
    topics: string[] | undefined,
    signal: AbortSignal | null | undefined,
  ): Source => {
    // who's signed in is read as each event goes out, so a stream open across a change of person
    // or role sends what the person signed in now may see
    const staff = () => roleOf(userId()) !== 'user'
    const wanted = (e: BusEvent) =>
      (e.topic === RESET_TOPIC || staff() || !STAFF_TOPICS.includes(e.topic)) &&
      (!e.to || e.to.includes(userId())) &&
      (!topics?.length || topics.includes(e.topic) || e.topic === RESET_TOPIC)
    const frame = ({ to: _, ...e }: BusEvent) => `id: ${e.id}\ndata: ${JSON.stringify(e)}\n\n`

    const queue: string[] = []
    let waiter: { resolve(v: string | null): void; reject(e: unknown): void } | null = null
    let ended = false
    const push = (chunk: string) => {
      if (waiter) {
        const w = waiter
        waiter = null
        w.resolve(chunk)
      } else queue.push(chunk)
    }
    const last = Number(lastEventId)
    if (lastEventId !== undefined && Number.isFinite(last)) {
      const missed = bus.since(last)
      if (missed === null) push(frame({ id: bus.lastId(), topic: RESET_TOPIC, at: Date.now() }))
      else for (const e of missed) if (wanted(e)) push(frame(e))
    }
    const unsubscribe = bus.subscribe((e) => {
      if (wanted(e)) push(frame(e))
    })
    const stream: Stream = {
      host: ctx.host,
      // the network went: the read fails, and the SDK reconnects with backoff
      kill: () => end(networkError()),
    }
    streams.add(stream)
    const end = (error?: unknown) => {
      if (ended) return
      ended = true
      unsubscribe()
      streams.delete(stream)
      const w = waiter
      waiter = null
      if (w) error ? w.reject(error) : w.resolve(null)
    }
    signal?.addEventListener('abort', () => end(abortError(signal)), { once: true })
    return {
      next: () => {
        const chunk = queue.shift()
        if (chunk !== undefined) return Promise.resolve(chunk)
        if (ended) return Promise.resolve(null)
        return new Promise((resolve, reject) => {
          waiter = { resolve, reject }
        })
      },
      cancel: () => end(),
    }
  }

  // ---------------------------------------------------------------- loading

  // Loading holds requests until the data state changes, as a server that hasn't answered yet
  // (with an error, it fails instead: `dispose()`)
  const held = new Set<(error?: unknown) => void>()
  const hold = (signal: AbortSignal | null | undefined) =>
    new Promise<void>((resolve, reject) => {
      if (signal?.aborted) return reject(abortError(signal))
      const release = (error?: unknown) => {
        held.delete(release)
        error === undefined ? resolve() : reject(error)
      }
      held.add(release)
      signal?.addEventListener(
        'abort',
        () => {
          held.delete(release)
          reject(abortError(signal))
        },
        { once: true },
      )
    })

  // ---------------------------------------------------------------- the fetch

  let disposed = false
  const reachable = (host: Host) =>
    state.connection !== 'offline' && !(state.connection === 'remote' && host.lan && host.origin)

  async function transport(input: string | URL | Request, init: RequestInit = {}) {
    const url = typeof input === 'string' ? input : 'href' in input ? input.href : input.url
    const request = typeof input === 'object' && 'method' in input ? input : null
    const method = (init.method ?? request?.method ?? 'GET').toUpperCase()
    const headers = new Headers(init.headers ?? request?.headers)
    const signal = init.signal ?? request?.signal
    // a browser sends its cookies unless told not to; the SDK always says `include`
    const credentials = init.credentials ?? request?.credentials ?? 'same-origin'
    const [, scheme, authority, path = '', search = ''] = URL_PARTS.exec(url) ?? []
    const host = hostFor(scheme, authority)
    if (disposed || !host || !reachable(host)) {
      await pause(Math.min(latency, 50), signal)
      throw networkError()
    }
    await pause(latency, signal)
    if (!reachable(host)) throw networkError()

    let found: ReturnType<typeof match>
    try {
      found = match(method, path)
    } catch (e) {
      return errorResponse(url, refusalOf(e)) as unknown as Response
    }
    const key = found?.entry.key ?? ''
    if (state.data === 'loading' && !UNHELD.has(key)) await hold(signal)

    try {
      if (state.data === 'error' && !UNFAILED.has(key))
        throw refuse('unavailable', tc('mock.notResponding', { name: harbor().name }))
      if (!found) throw refuse('not-found', t('transport.noRoute'))
      const { entry, params } = found
      const away = state.connection === 'remote' || !host.lan
      const caller = callerOf(host, headers, credentials)
      const access = accessOf(entry.route)
      if (access && access !== 'public') {
        if (!caller) throw refuse('unauthorized', t('transport.signIn'), { reason: 'signed-out' })
        const role = roleOf(userId())
        if ((access === 'staff' && role === 'user') || (access === 'owner' && role !== 'owner'))
          throw refuse('forbidden', t('transport.forbidden'))
        seat(caller)
      }

      const req = entry.route.request
      const query = Object.fromEntries(new URLSearchParams(search))
      const checkedInput: Record<string, unknown> = {
        params: checked(req?.params, params),
        query: checked(req?.query, query),
      }
      const head: Record<string, string> = {}
      headers.forEach((v, k) => {
        head[k] = v
      })
      const checkedHeaders = checked(req?.headers, head) as Record<string, string> | undefined
      const bodySchema = req?.body?.content['application/json'].schema
      if (bodySchema) {
        let raw: unknown
        try {
          raw = typeof init.body === 'string' && init.body ? JSON.parse(init.body) : undefined
        } catch {
          throw refuse('invalid', t('transport.invalid'), [{ message: t('transport.notJson') }])
        }
        checkedInput.body = checked(bodySchema, raw)
      }
      const ctx: Ctx = { host, caller, away, api: api(), srv: srv(), userId: userId() }

      if (key === 'system.events') {
        const q = checkedInput.query as { topics?: string } | undefined
        const topics = q?.topics?.split(',').filter(Boolean)
        return new MockResponse(url, 200, {
          stream: eventStream(ctx, checkedHeaders?.['last-event-id'], topics, signal),
          type: 'text/event-stream',
        }) as unknown as Response
      }

      const group = (answers as Record<string, Record<string, unknown> | undefined>)[entry.group]
      const answer = group?.[entry.name] as
        | ((input: unknown, ctx: Ctx) => unknown | Promise<unknown>)
        | undefined
      if (!answer)
        throw new NotAnswered(
          'internal',
          t('transport.notAnswered', { method, path: entry.route.path, route: entry.key }),
          { route: entry.key, method, path: entry.route.path },
        )
      const output = await answer(checkedInput, ctx)
      const statuses = entry.route.responses
      const status = 200 in statuses ? 200 : 201 in statuses ? 201 : 204
      // a copy, as a network response would be: nothing shares the mock's state
      return json(url, status, status === 204 ? undefined : output) as unknown as Response
    } catch (e) {
      return errorResponse(url, refusalOf(e)) as unknown as Response
    }
  }

  // ---------------------------------------------------------------- discovery

  /** Each scan's restart, and its stop. */
  const scans = new Map<() => void, () => void>()

  const nearby: MockTransport['nearby'] = (listener, { permission = true } = {}) => {
    let timers: ReturnType<typeof setTimeout>[] = []
    const start = () => {
      for (const timer of timers) clearTimeout(timer)
      timers = []
      const lan = permission ? state.lan : 'allowed'
      const found: Nearby[] = []
      const send = (scanning: boolean) => listener({ found: [...found], lan, scanning })
      // asking: the permission prompt is up, and nothing answers until it's answered
      if (lan === 'asking') return send(true)
      if (lan === 'refused') return send(false)
      send(true)
      // away from home, or with no network, nothing on this network answers
      const servers = state.connection === 'local' ? srv().state.discovered : []
      servers.forEach((d, i) => {
        timers.push(
          setTimeout(() => {
            const host = hostFor('http', d.address)
            if (!host) return
            found.push({ info: publicInfoOf(host), base: host.origin })
            send(true)
          }, DISCOVERY_STAGGER_MS[i] ?? DISCOVERY_MS),
        )
      })
      timers.push(setTimeout(() => send(false), DISCOVERY_MS))
    }
    const stop = () => {
      scans.delete(start)
      for (const timer of timers) clearTimeout(timer)
    }
    scans.set(start, stop)
    start()
    return stop
  }

  // ---------------------------------------------------------------- single sign-on

  /**
   * Stands in for the browser an app opens at `oidc/start` (auth.oidcStart): the provider signs in
   * the person at the toolbar at once, and this answers with where the callback would send the
   * browser. An app's start (`app` and its PKCE `challenge`) comes back to `highsea://oidc` with a
   * one-time code for `oidc/exchange`; the browser's signs it in by cookie and goes home.
   */
  const oidc: MockTransport['oidc'] = async (address) => {
    const [, scheme, authority, path = '', search = ''] = URL_PARTS.exec(address) ?? []
    const host = hostFor(scheme, authority)
    if (disposed || !host || !reachable(host)) throw networkError()
    await pause(latency, null)
    const start = match('GET', path)
    if (!host.oidc || start?.entry.key !== 'auth.oidcStart')
      throw refuse('invalid', t('transport.oidcStart'), { reason: 'oidc-unknown' })
    const query = checked(
      start.entry.route.request?.query,
      Object.fromEntries(new URLSearchParams(search)),
    ) as { app?: AppClient; challenge?: string }
    if (query.app) {
      if (!query.challenge) throw refuse('invalid', t('transport.invalid'), { reason: 'challenge' })
      const code = `oc-${random()}${random()}`
      oidcCodes.set(code, {
        host: host.id,
        app: query.app,
        challenge: query.challenge,
        expiresAt: Date.now() + OIDC_CODE_MS,
      })
      return { type: 'success', url: `${OIDC_RETURN}?code=${code}` }
    }
    const away = state.connection === 'remote' || !host.lan
    issue(host, away, undefined, 'oidc')
    return { type: 'success', url: `${host.origin}/` }
  }

  // ---------------------------------------------------------------- the toolbar

  const setState = (patch: Partial<ProtoState>) => {
    const before = state
    const next: TransportState = { ...state }
    for (const k of [
      'data',
      'role',
      'theme',
      'sound',
      'connection',
      'lan',
      'stream',
      'airplay',
    ] as const)
      if (patch[k] !== undefined) (next as Record<string, unknown>)[k] = patch[k]
    state = next
    const changed = (k: keyof TransportState) =>
      JSON.stringify(before[k]) !== JSON.stringify(next[k])
    // the toolbar's role picks its person, unless the one signed in already has it (signing in as
    // Sam leaves the toolbar at User, and its echo of that keeps Sam)
    if (changed('role') && roleOf(who) !== next.role) {
      who = userFor(next.role)
      storage.save(WHO, who)
    }
    if (changed('connection')) for (const s of [...streams]) if (!reachable(s.host)) s.kill()
    // another server's data, or another person: every app refetches everything
    if (changed('data') || changed('role')) bus.emit({ topic: RESET_TOPIC })
    // the server's defaults changed, as Appearance's save and setup announce them
    if (changed('theme') || changed('sound')) {
      bus.emit({ topic: 'server.updated' })
      bus.emit({ topic: OPERATIONS_TOPICS.settings })
    }
    if (before.data === 'loading' && next.data !== 'loading')
      for (const release of [...held]) release()
    if (changed('lan') || changed('connection') || changed('data'))
      for (const scan of [...scans.keys()]) scan()
  }

  return Object.assign(transport as Fetch, {
    setState,
    state: () => state,
    nearby,
    oidc,
    mock,
    // everything it holds lets go: streams end, held requests fail as the network would, and
    // discovery's timers stop
    dispose: () => {
      disposed = true
      for (const r of relays) r()
      for (const s of [...streams]) s.kill()
      for (const release of [...held]) release(networkError())
      for (const stop of [...scans.values()]) stop()
      plays.dispose()
    },
  })
}
