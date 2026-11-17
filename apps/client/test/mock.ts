// SPDX-License-Identifier: AGPL-3.0-only
// What the client's Jest tests share: the app directory, and src/transport.ts's mock mode with no
// latency and its sign-ins kept in memory, for jest.mock to put in its place, a mock server and a
// store of the servers known for each test (`fresh()`), and rewrites on the requests sent. Expo Router's test
// renderer runs on Jest's fake timers, so `flush` moves them on inside act.

import path from 'node:path'
import { act, fireEvent, screen } from '@testing-library/react-native'
import { type MockContextConfig, renderRouter } from 'expo-router/testing-library'

export const APP = path.resolve(__dirname, '../src/app')

/**
 * The real app directory with a test's own routes laid over it, for `renderRouter`. Expo Router's
 * own `{ appDir, overrides }` names the files without their extensions
 * (testing-library/context-stubs.js, requireContextWithOverrides), so the rule that keeps
 * `+native-intent.ts` out of the routes, which looks for one (getRoutesCore.js), misses it and the
 * file is refused as a route. The in-memory form keeps the names whole, so this builds that: each
 * file by its name without extension, loaded when the router asks, then the test's routes.
 */
export function appWith(overrides: Record<string, unknown>): MockContextConfig {
  const { default: requireContext } = jest.requireActual<{
    default: (dir: string) => ((id: string) => unknown) & { keys: () => string[] }
  }>('expo-router/build/testing-library/require-context-ponyfill')
  const context = requireContext(APP)
  const files: Record<string, unknown> = {}
  for (const key of context.keys()) {
    const name = key.replace(/^\.\//, '').replace(/\.[tj]sx?$/, '')
    // the router only asks for the routes; the link's hook isn't one
    if (name === '+native-intent') continue
    Object.defineProperty(files, name, { enumerable: true, get: () => context(key) })
  }
  return { ...files, ...overrides } as MockContextConfig
}

/** Moves the fake clock on by `ms` and lets promises settle, a few times over. */
export async function flush(ms = 50) {
  for (let i = 0; i < 20; i++)
    await act(async () => {
      await jest.advanceTimersByTimeAsync(ms / 20)
      await new Promise((r) =>
        jest.requireActual<typeof import('node:timers')>('node:timers').setImmediate(r),
      )
    })
}

/** A request on its way to the mock: change it, or keep it as it is. */
export type Rewrite = (url: string, init: RequestInit) => [string, RequestInit] | undefined

/**
 * What each test starts from: a mock server of its own, the servers the device knows and their
 * tokens, and the rewrites it puts on requests. `fresh()` in a `beforeEach` starts them again, so
 * no test opens where another left off.
 */
const live = {
  transport: undefined as unknown as MockTransport,
  store: memoryStore(false),
  cookie: false,
  rewrites: [] as Rewrite[],
  holds: [] as { path: string; gate: Promise<void> }[],
  requests: [] as { method: string; url: string; bearer: boolean }[],
  /** The drafted kinds (B3) the mock says it serves: none unless a test asks, as a real server. */
  served: new Set<Drafted>(),
}

type MockTransport = ReturnType<typeof import('@highsea-tv/mock/transport').createMockFetch>

const listeners = new Set<(role: string) => void>()

/** What a play session plays, for the player's tests (`transportModule({ media })`); none waits. */
type Media = { clip: string; subtitles: string; duration: number }
let media: Media | undefined

function newTransport(): MockTransport {
  const Transport = require('@highsea-tv/mock/transport')
  return Transport.createMockFetch({
    latency: 0,
    storage: Transport.memoryStorage(),
    media,
    onRole: (role: string) => {
      for (const l of [...listeners]) l(role)
    },
  })
}

/** Starts the mock server, the device's store and the rewrites again. */
/**
 * A pointer's window. Jest's is React Native's mock's, 750 wide: compact under the one width rule
 * (768, spacing-layout.md), so a test that asks for `regular-pointer` widens it to match, and
 * `phoneWindow` puts it back after the test's cleanup (so nothing drawn hears the change).
 */
const PHONE_WINDOW = (() => {
  const { Dimensions } = require('react-native')
  return { window: Dimensions.get('window'), screen: Dimensions.get('screen') }
})()
export function pointerWindow() {
  ;(globalThis as { __formFactor?: string }).__formFactor = 'regular-pointer'
  const wide = { width: 1024, height: 768, scale: 2, fontScale: 1 }
  require('react-native').Dimensions.set({ window: wide, screen: wide })
}
export function phoneWindow() {
  require('react-native').Dimensions.set(PHONE_WINDOW)
}

export function fresh() {
  live.transport = newTransport()
  live.store = memoryStore(live.cookie)
  live.rewrites = []
  live.holds = []
  live.requests = []
  live.served = new Set()
}

/**
 * Has the mock say it serves profiles, as it does in the prototypes. Every other test leaves them
 * out of public info's `sources`, as a real server does, so its client looks as it did at B2.
 */
export function serveProfiles() {
  serve('profiles')
}

/** The kinds drafted in the contract (B3), which a real server doesn't serve yet. */
export type Drafted = 'shows' | 'music' | 'profiles'

/**
 * Has the mock say it serves these drafted kinds, as it does in the prototypes. Every other test
 * leaves shows, music and profiles out of public info's `sources`, as a real server does, so its
 * client looks as it did at B2.
 */
export function serve(...kinds: Drafted[]) {
  for (const k of kinds) live.served.add(k)
}

/** Public info without shows, music and profiles in its sources unless the test serves them. */
async function withoutDrafted(url: string, answer: Promise<Response>): Promise<Response> {
  const response = await answer
  if (!url.includes('/system/info/public') || !response.ok) return response
  const info = (await response.json()) as { sources?: string[] }
  const drafted: readonly string[] = ['shows', 'music', 'profiles']
  info.sources = info.sources?.filter((s) => !drafted.includes(s) || live.served.has(s as Drafted))
  return new Response(JSON.stringify(info), {
    status: response.status,
    headers: response.headers,
  })
}

/** Keeps the server from answering requests to `path` until the returned release is called. */
export function hold(path: string) {
  let release = () => {}
  const gate = new Promise<void>((r) => {
    release = r
  })
  live.holds.push({ path, gate })
  return release
}

/** Changes the requests that match from here on (the session refused, a pairing gone). */
export function rewrite(r: Rewrite) {
  live.rewrites.push(r)
}

/** The requests sent so far, with whether each carried a bearer token. */
export const requests = () => live.requests

/** The device's store, to see what it kept. */
export const store = () => live.store

/** The mock server answering this test, for its toolbar's states. */
export const server = () => live.transport

/** src/transport.ts in mock mode, for `jest.mock('../src/transport.ts', …)`. */
export function transportModule(options: { media?: Media } = {}) {
  media = options.media
  const frame = require('@highsea-tv/mock/frame')
  // the first test's server may be up before this is asked for: it's made again with the media
  if (!live.transport || media) live.transport = newTransport()
  const transport = Object.assign(
    (input: string, init: RequestInit = {}) => {
      let call: [string, RequestInit] = [input, init]
      for (const r of live.rewrites) call = r(...call) ?? call
      const headers = new Headers(call[1].headers)
      live.requests.push({
        method: (call[1].method ?? 'GET').toUpperCase(),
        url: call[0],
        bearer: headers.has('authorization'),
      })
      const held = live.holds.find((h) => call[0].includes(h.path))
      const answer = held ? held.gate.then(() => live.transport(...call)) : live.transport(...call)
      return withoutDrafted(call[0], answer)
    },
    {
      nearby: (...a: Parameters<MockTransport['nearby']>) => live.transport.nearby(...a),
      oidc: (address: string) => live.transport.oidc(address),
      setState: (patch: Parameters<MockTransport['setState']>[0]) => live.transport.setState(patch),
      state: () => live.transport.state(),
      dispose: () => live.transport.dispose(),
    },
  )
  Object.defineProperty(transport, 'mock', { get: () => live.transport.mock })
  return {
    mock: {
      transport,
      frame,
      query: {},
      onRole(listener: (role: string) => void) {
        listeners.add(listener)
        return () => listeners.delete(listener)
      },
    },
    transport,
  }
}

/** expo-crypto for PKCE, which Jest has no native module for: Node's own. */
export function cryptoModule() {
  const { createHash, randomBytes } = require('node:crypto')
  return {
    getRandomBytes: (n: number) => new Uint8Array(randomBytes(n)),
    digestStringAsync: async (_: string, data: string) =>
      createHash('sha256').update(data).digest('base64'),
    CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
    CryptoEncoding: { BASE64: 'base64' },
  }
}

/** ReanimatedSwipeable as its plain children, for Jest, which has no Reanimated native side. */
export function swipeable() {
  const { forwardRef, createElement } = require('react')
  const { View } = require('react-native')
  const Swipeable = forwardRef((props: { children?: unknown }, _ref: unknown) =>
    createElement(View, null, props.children),
  )
  return { __esModule: true, default: Swipeable }
}

/**
 * The servers known and their device tokens, in memory. Without the cookie, as the phone and the
 * TV keep them (packages/native/src/server-store.ts): a sign-in with no token is an error. With
 * it, as the web keeps them (server-store.web.ts): a token is kept when a sign-in sends one, and
 * the session cookie stands in otherwise.
 */
function memoryStore(cookie: boolean) {
  let stored = { current: null as string | null, servers: [] as unknown[] }
  const tokens = new Map<string, string>()
  return {
    loadStored: async () => structuredClone(stored),
    saveStored: (next: typeof stored) => {
      stored = structuredClone(next)
    },
    readToken: async (id: string) => tokens.get(id) ?? null,
    writeToken: async (id: string, token: string | undefined) => {
      if (token) tokens.set(id, token)
      else if (cookie) tokens.delete(id)
      else throw new Error('No device token to keep')
      return token ?? ''
    },
    dropToken: async (id: string) => {
      tokens.delete(id)
    },
    tokens,
  }
}

/**
 * @highsea-tv/native's server store for `jest.mock`, over the test's own (`fresh()` starts it
 * again), with the web's session cookie when `cookie` is set.
 */
export function serverStore(cookie = false) {
  live.cookie = cookie
  live.store = memoryStore(cookie)
  return {
    loadStored: () => live.store.loadStored(),
    saveStored: (next: Parameters<ReturnType<typeof memoryStore>['saveStored']>[0]) =>
      live.store.saveStored(next),
    readToken: (id: string) => live.store.readToken(id),
    writeToken: (id: string, token: string | undefined) => live.store.writeToken(id, token),
    dropToken: (id: string) => live.store.dropToken(id),
    COOKIE: cookie,
    platformFetch: () => Promise.reject(new TypeError('No network in tests')),
  }
}

/** The words on screen, for a failing test's message. */
export function words(tree: unknown): string {
  const out: string[] = []
  const walk = (n: unknown) => {
    if (typeof n === 'string') out.push(n)
    else if (Array.isArray(n)) n.forEach(walk)
    else if (n && typeof n === 'object') {
      const o = n as { props?: { accessibilityLabel?: string }; children?: unknown }
      if (o.props?.accessibilityLabel) out.push(`[${o.props.accessibilityLabel}]`)
      walk(o.children)
    }
  }
  walk(tree)
  return out.join(' | ')
}

/** Types into the fields named, and lets the form take each before going on. */
export async function type(fields: Record<string, string>) {
  for (const [label, text] of Object.entries(fields)) {
    await fireEvent.changeText(screen.getByLabelText(label), text)
    await flush()
  }
}

/** Opens the app at `/`, as launching it does, and lets discovery and the first answers land. */
export async function open() {
  const r = await renderRouter(APP, { initialUrl: '/' })
  await flush(5000)
  return r
}

/** Opens the app, chooses Harbor and signs in with a password, as someone without two steps. */
export async function signedIn(username = 'ruth') {
  const r = await open()
  await fireEvent.press(screen.getByRole('button', { name: /^Harbor/ }))
  await flush()
  await type({ Username: username, Password: 'x' })
  await fireEvent.press(screen.getByRole('button', { name: 'Sign in' }))
  await flush()
  return r
}

/** Opens the app on the TV, chooses Harbor from the servers answering, and waits for the phone's approval. */
export async function tvSignedIn() {
  const r = await open()
  await fireEvent.press(screen.getByLabelText(/^Harbor,/))
  await flush(20_000)
  return r
}

/**
 * Presses Got it on the owner's announcement that must be acknowledged (the mock's seed has one,
 * an-new-address), which the shell shows over every destination until it is: for tests that sign
 * in to cover something else. Does nothing when none shows.
 */
export async function acknowledge() {
  const got = screen.queryAllByRole('button', { name: 'Got it' })
  const last = got[got.length - 1]
  if (!last) return
  await fireEvent.press(last)
  await flush(500)
}

/** Whether a request went to the API path given. */
export const sent = (path: string) => requests().filter((q) => q.url.includes(path))

/**
 * expo-video for `jest.mock`, which Jest has no native side for: a player that keeps its state
 * and sends expo-video's events (https://docs.expo.dev/versions/latest/sdk/video/#videoplayerevents)
 * as AVPlayer would, a source loading to ready at once, with `duration` seconds; and the views as
 * host elements named VideoView and VideoAirPlayButton, with the props the screen gives them.
 * The players made are in `players`, the last the screen's.
 */
export function videoModule(duration = 52) {
  const { createElement, forwardRef, useImperativeHandle, useMemo } = require('react')
  const players: FakePlayer[] = []
  class FakePlayer {
    listeners = new Map<string, Set<(e: unknown) => void>>()
    playing = false
    status = 'idle'
    duration = 0
    currentTime = 0
    volume = 1
    muted = false
    playbackRate = 1
    subtitleTrack: unknown = null
    availableSubtitleTracks: unknown[] = []
    source: unknown = null
    timeUpdateEventInterval = 0
    showNowPlayingNotification = false
    staysActiveInBackground = false
    allowsExternalPlayback = false
    addListener(event: string, f: (e: unknown) => void) {
      const set = this.listeners.get(event) ?? new Set()
      set.add(f)
      this.listeners.set(event, set)
      return { remove: () => set.delete(f) }
    }
    emit(event: string, payload: unknown) {
      for (const f of [...(this.listeners.get(event) ?? [])]) f(payload)
    }
    play() {
      if (this.playing || !this.source) return
      this.playing = true
      this.emit('playingChange', { isPlaying: true })
    }
    pause() {
      if (!this.playing) return
      this.playing = false
      this.emit('playingChange', { isPlaying: false })
    }
    replace(source: unknown) {
      this.source = source
      if (!source) {
        this.playing = false
        this.status = 'idle'
      }
    }
    async replaceAsync(source: unknown) {
      this.source = source
      this.status = 'readyToPlay'
      this.duration = duration
      this.emit('sourceLoad', {})
      this.emit('statusChange', { status: 'readyToPlay' })
    }
    /** The film at `seconds`, as AVPlayer's time updates say. */
    at(seconds: number) {
      this.currentTime = seconds
      this.emit('timeUpdate', { currentTime: seconds })
    }
  }
  const VideoView = forwardRef((props: object, ref: unknown) => {
    useImperativeHandle(ref, () => ({
      startPictureInPicture: jest.fn(async () => {
        ;(props as { onPictureInPictureStart?: () => void }).onPictureInPictureStart?.()
      }),
      stopPictureInPicture: jest.fn(async () => {
        ;(props as { onPictureInPictureStop?: () => void }).onPictureInPictureStop?.()
      }),
    }))
    return createElement('VideoView', props)
  })
  return {
    players,
    useVideoPlayer: (_source: unknown, setup?: (p: FakePlayer) => void) =>
      useMemo(() => {
        const p = new FakePlayer()
        setup?.(p)
        players.push(p)
        return p
      }, []),
    VideoView,
    VideoAirPlayButton: (props: object) => createElement('VideoAirPlayButton', props),
  }
}

export type FakeVideo = ReturnType<typeof videoModule>
