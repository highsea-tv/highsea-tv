// SPDX-License-Identifier: AGPL-3.0-only
// The control channel between the prototypes' chrome and the framed client: its messages are
// checked field by field, only the parent at the page's own origin is heard, the chrome's state
// reaches the transport's setState, and the client's route and role go back.
import { describe, expect, test } from 'bun:test'
import { resolve } from 'node:path'
import {
  type ClientMessage,
  FRAME_CHANNEL,
  type FrameMessage,
  frameStateOf,
  type Listener,
  linkFrame,
  type MessageLike,
  parseClientMessage,
  parseFrameMessage,
  postFrame,
  queryState,
  sameOrigin,
} from '@highsea-tv/mock/frame'
import { defaultState } from '@highsea-tv/mock/state'
import { createMockFetch, memoryStorage } from '@highsea-tv/mock/transport'

const ORIGIN = 'http://localhost:4500'
const state = frameStateOf(defaultState)
const stateMessage = (patch: Partial<typeof state> = {}): FrameMessage => ({
  channel: FRAME_CHANNEL,
  type: 'state',
  input: 'touch',
  state: { ...state, ...patch },
})

/** A window that hears what's dispatched to it, and a parent that keeps what it's sent. */
function windows() {
  const listeners = new Set<(e: MessageLike) => void>()
  const self: Listener = {
    addEventListener: (_, l) => void listeners.add(l),
    removeEventListener: (_, l) => void listeners.delete(l),
  }
  const sent: { message: unknown; origin: string }[] = []
  const parent = {
    postMessage: (message: unknown, origin: string) => sent.push({ message, origin }),
  }
  const dispatch = (data: unknown, from: { origin?: string; source?: unknown } = {}) => {
    for (const l of [...listeners])
      l({ data, origin: from.origin ?? ORIGIN, source: 'source' in from ? from.source : parent })
  }
  return { self, parent, sent, dispatch, listeners }
}

describe('messages', () => {
  test('a chrome’s state and navigation parse, copied without extra fields', () => {
    const extra = { ...stateMessage(), state: { ...state, width: 390, preview: true }, more: 1 }
    expect(parseFrameMessage(extra)).toEqual(stateMessage())
    expect(
      parseFrameMessage({ channel: FRAME_CHANNEL, type: 'navigate', path: '/settings' }),
    ).toEqual({ channel: FRAME_CHANNEL, type: 'navigate', path: '/settings' })
    // a section link keeps its query: Settings opens at the section
    const section = {
      channel: FRAME_CHANNEL,
      type: 'navigate',
      path: '/settings?section=devices',
    } as const
    expect(parseFrameMessage(section)).toEqual(section)
  })

  test('anything off the channel, or with a value that isn’t one, is dropped', () => {
    const bad: unknown[] = [
      null,
      'state',
      { hs: 'state', state: defaultState },
      { ...stateMessage(), channel: 'other' },
      { ...stateMessage(), type: 'other' },
      { ...stateMessage(), input: 'mouse' },
      { ...stateMessage(), state: undefined },
      stateMessage({ data: 'busy' as never }),
      stateMessage({ role: 'root' as never }),
      stateMessage({ theme: 'neon' as never }),
      stateMessage({ connection: 'lan' as never }),
      stateMessage({ lan: 'maybe' as never }),
      stateMessage({ time: 'rewind' as never }),
      stateMessage({ sound: { admin: true } as never }),
      stateMessage({ largeText: 'yes' as never }),
      stateMessage({ reducedMotion: undefined as never }),
      // a route can't be another site's address
      { channel: FRAME_CHANNEL, type: 'navigate', path: 'https://example.com/' },
      { channel: FRAME_CHANNEL, type: 'navigate', path: '//example.com/' },
      { channel: FRAME_CHANNEL, type: 'navigate', path: 'settings' },
      { channel: FRAME_CHANNEL, type: 'navigate', path: `/${'a'.repeat(3000)}` },
      // a browser reads a backslash as a slash, so `/\\host` would be `//host`
      { channel: FRAME_CHANNEL, type: 'navigate', path: '/\\example.com/' },
      { channel: FRAME_CHANNEL, type: 'navigate', path: '/settings\n' },
      { channel: FRAME_CHANNEL, type: 'navigate', path: '/set\u0000tings' },
      { channel: FRAME_CHANNEL, type: 'navigate', path: '/set\u007ftings' },
      // a query doesn't loosen the rules
      { channel: FRAME_CHANNEL, type: 'navigate', path: '//example.com/?section=devices' },
      { channel: FRAME_CHANNEL, type: 'navigate', path: '/settings?section=\\devices' },
      { channel: FRAME_CHANNEL, type: 'navigate', path: '/settings?section=dev\nices' },
      { channel: FRAME_CHANNEL, type: 'navigate', path: '?section=devices' },
    ]
    for (const data of bad) expect(parseFrameMessage(data)).toBeNull()
  })

  test('a client’s ready, route and role parse; others are dropped', () => {
    const good: ClientMessage[] = [
      { channel: FRAME_CHANNEL, type: 'ready' },
      { channel: FRAME_CHANNEL, type: 'route', path: '/connect' },
      { channel: FRAME_CHANNEL, type: 'role', role: 'user' },
    ]
    for (const m of good) expect(parseClientMessage({ ...m, extra: true })).toEqual(m)
    for (const data of [
      { channel: FRAME_CHANNEL, type: 'role', role: 'root' },
      { channel: FRAME_CHANNEL, type: 'route', path: 'javascript:alert(1)' },
      stateMessage(),
      { hs: 'ready' },
    ])
      expect(parseClientMessage(data)).toBeNull()
  })

  test('only the same origin is accepted, never an opaque one', () => {
    expect(sameOrigin(ORIGIN, ORIGIN)).toBe(true)
    expect(sameOrigin('http://localhost:4501', ORIGIN)).toBe(false)
    expect(sameOrigin('null', 'null')).toBe(false)
    expect(sameOrigin('', '')).toBe(false)
  })

  test('nothing is posted to an opaque origin', () => {
    const w = windows()
    postFrame(w.parent, { channel: FRAME_CHANNEL, type: 'ready' }, 'null')
    postFrame(w.parent, { channel: FRAME_CHANNEL, type: 'ready' }, '')
    expect(w.sent).toEqual([])
  })

  test('the address’s states, each checked, and only those given', () => {
    const q = (s: string) => queryState(new URLSearchParams(s))
    expect(q('')).toEqual({})
    expect(
      q('data=empty&role=user&theme=oled&connection=remote&lan=asking&time=pause&sound=off'),
    ).toEqual({
      data: 'empty',
      role: 'user',
      theme: 'oled',
      connection: 'remote',
      lan: 'asking',
      time: 'pause',
      sound: { admin: false, web: false, mobile: false, tv: false },
    })
    expect(q('text=200&motion=reduced')).toEqual({ largeText: true, reducedMotion: true })
    expect(q('text=100&motion=full')).toEqual({ largeText: false, reducedMotion: false })
    expect(q('data=busy&theme=neon&sound=loud&ff=touch')).toEqual({})
  })

  test('importing it needs no DOM', () => {
    const entry = resolve(import.meta.dir, '../src/frame.ts')
    const script = `
      for (const name of ['window', 'document', 'localStorage', 'location'])
        Object.defineProperty(globalThis, name, { configurable: true, get() { throw new Error('touched ' + name) } })
      const { parseFrameMessage } = await import(${JSON.stringify(entry)})
      console.log(parseFrameMessage(null))
    `
    const run = Bun.spawnSync(['bun', '-e', script], { stderr: 'pipe' })
    expect(run.stderr.toString()).toBe('')
    expect(run.stdout.toString().trim()).toBe('null')
  })
})

describe('the client’s end', () => {
  test('it says it’s ready, and the chrome’s state reaches transport.setState', () => {
    const w = windows()
    const transport = createMockFetch({ latency: 0, storage: memoryStorage() })
    const patches: unknown[] = []
    const setState = transport.setState
    transport.setState = (patch) => {
      patches.push(patch)
      setState(patch)
    }
    const heard: string[] = []
    const link = linkFrame({
      self: w.self,
      parent: w.parent,
      origin: ORIGIN,
      transport,
      onState: (input) => heard.push(input),
    })
    expect(w.sent).toEqual([{ message: { channel: FRAME_CHANNEL, type: 'ready' }, origin: ORIGIN }])
    w.dispatch(stateMessage({ data: 'empty', role: 'admin', theme: 'oled', connection: 'remote' }))
    expect(patches).toHaveLength(1)
    expect(transport.state()).toMatchObject({
      data: 'empty',
      role: 'admin',
      theme: 'oled',
      connection: 'remote',
    })
    expect(heard).toEqual(['touch'])
    link.close()
    transport.dispose()
  })

  test('another window, another origin or a bad message changes nothing', () => {
    const w = windows()
    const patches: unknown[] = []
    const navigated: string[] = []
    const link = linkFrame({
      self: w.self,
      parent: w.parent,
      origin: ORIGIN,
      transport: { setState: (p) => patches.push(p) },
      onNavigate: (p) => navigated.push(p),
    })
    w.dispatch(stateMessage(), { source: {} })
    w.dispatch(stateMessage(), { origin: 'http://evil.example' })
    w.dispatch(stateMessage(), { origin: 'null' })
    w.dispatch({ ...stateMessage(), input: 'mouse' })
    w.dispatch({ channel: FRAME_CHANNEL, type: 'navigate', path: '//evil.example' })
    expect([patches, navigated]).toEqual([[], []])
    w.dispatch({ channel: FRAME_CHANNEL, type: 'navigate', path: '/settings' })
    w.dispatch({ channel: FRAME_CHANNEL, type: 'navigate', path: '/settings?section=devices' })
    expect(navigated).toEqual(['/settings', '/settings?section=devices'])
    link.close()
  })

  test('ready is repeated until the chrome’s first state, then stops', async () => {
    const w = windows()
    const link = linkFrame({
      self: w.self,
      parent: w.parent,
      origin: ORIGIN,
      transport: { setState: () => {} },
      retry: 5,
    })
    const readies = () => w.sent.filter((s) => (s.message as ClientMessage).type === 'ready').length
    await Bun.sleep(30)
    expect(readies()).toBeGreaterThan(2)
    w.dispatch(stateMessage())
    const after = readies()
    await Bun.sleep(30)
    expect(readies()).toBe(after)
    link.close()
  })

  test('close stops the repeat too', async () => {
    const w = windows()
    linkFrame({
      self: w.self,
      parent: w.parent,
      origin: ORIGIN,
      transport: { setState: () => {} },
      retry: 5,
    }).close()
    await Bun.sleep(20)
    expect(w.sent).toHaveLength(1)
  })

  test('the route and role go to the parent at the origin; close stops listening', () => {
    const w = windows()
    const link = linkFrame({
      self: w.self,
      parent: w.parent,
      origin: ORIGIN,
      transport: { setState: () => {} },
    })
    link.route('/connect')
    link.role('user')
    expect(w.sent.map((s) => s.message)).toEqual([
      { channel: FRAME_CHANNEL, type: 'ready' },
      { channel: FRAME_CHANNEL, type: 'route', path: '/connect' },
      { channel: FRAME_CHANNEL, type: 'role', role: 'user' },
    ])
    expect(w.sent.every((s) => s.origin === ORIGIN)).toBe(true)
    link.close()
    expect(w.listeners.size).toBe(0)
  })
})
