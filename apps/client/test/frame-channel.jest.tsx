// SPDX-License-Identifier: AGPL-3.0-only
// The frame channel's reduced motion (src/frame-channel.ts): the toolbar's Reduced motion on asks
// for it, and off is no choice at all, so ThemeProvider follows the OS's setting. From the address
// opened on its own (`mock.query`) and from the chrome's states when framed.
import { act, renderHook } from '@testing-library/react-native'

const mockLive = {
  query: {} as { reducedMotion?: boolean },
  onState: undefined as undefined | ((input: string, state: Record<string, unknown>) => void),
}

jest.mock('expo-router', () => ({ usePathname: () => '/', router: { navigate: jest.fn() } }))
jest.mock('../src/transport.ts', () => ({
  get mock() {
    return {
      query: mockLive.query,
      transport: { mock: { run: () => () => {} } },
      frame: {
        linkFrame: (o: { onState: typeof mockLive.onState }) => {
          mockLive.onState = o.onState
          return { route() {}, close() {}, role() {} }
        },
      },
      onRole: () => () => {},
    }
  },
}))

const g = globalThis as unknown as { window?: unknown }
const saved = Object.getOwnPropertyDescriptor(globalThis, 'window')

afterEach(() => {
  mockLive.query = {}
  mockLive.onState = undefined
  if (saved) Object.defineProperty(globalThis, 'window', saved)
  else delete g.window
})

const channel = () =>
  (require('../src/frame-channel.ts') as typeof import('../src/frame-channel.ts')).useFrameChannel

describe('reduced motion from the toolbar', () => {
  test('the address’s off follows the OS, and on asks for it', async () => {
    mockLive.query = { reducedMotion: false }
    expect((await renderHook(channel())).result.current.reducedMotion).toBeUndefined()
    mockLive.query = { reducedMotion: true }
    expect((await renderHook(channel())).result.current.reducedMotion).toBe(true)
  })

  test('framed, the chrome’s off follows the OS, and on asks for it', async () => {
    // a page inside the chrome: its parent is another window
    const parent = {}
    Object.defineProperty(globalThis, 'window', {
      value: { parent, location: { origin: 'http://localhost:4500' } },
      configurable: true,
      writable: true,
    })
    const { result } = await renderHook(channel())
    expect(mockLive.onState).toBeDefined()
    const state = { time: 'play', theme: undefined, largeText: false }
    await act(() => mockLive.onState?.('pointer', { ...state, reducedMotion: true }))
    expect(result.current.reducedMotion).toBe(true)
    await act(() => mockLive.onState?.('pointer', { ...state, reducedMotion: false }))
    expect(result.current.reducedMotion).toBeUndefined()
  })
})
