// SPDX-License-Identifier: AGPL-3.0-only
// What the client's Jest tests share: the app directory, and src/transport.ts's mock mode with no
// latency and its sign-ins kept in memory, for jest.mock to put in its place, a mock server and a
// store of the servers known for each test (`fresh()`), and rewrites on the requests sent. Expo Router's test
// renderer runs on Jest's fake timers, so `flush` moves them on inside act.

import path from 'node:path'
import { act, fireEvent, screen } from '@testing-library/react-native'
import { renderRouter } from 'expo-router/testing-library'

export const APP = path.resolve(__dirname, '../src/app')

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
}

type MockTransport = ReturnType<typeof import('@highsea-tv/mock/transport').createMockFetch>

const listeners = new Set<(role: string) => void>()

function newTransport(): MockTransport {
  const Transport = require('@highsea-tv/mock/transport')
  return Transport.createMockFetch({
    latency: 0,
    storage: Transport.memoryStorage(),
    onRole: (role: string) => {
      for (const l of [...listeners]) l(role)
    },
  })
}

/** Starts the mock server, the device's store and the rewrites again. */
export function fresh() {
  live.transport = newTransport()
  live.store = memoryStore(live.cookie)
  live.rewrites = []
  live.holds = []
  live.requests = []
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
export function transportModule() {
  const frame = require('@highsea-tv/mock/frame')
  if (!live.transport) live.transport = newTransport()
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
      return held ? held.gate.then(() => live.transport(...call)) : live.transport(...call)
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
