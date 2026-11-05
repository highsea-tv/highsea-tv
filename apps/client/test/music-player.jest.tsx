// SPDX-License-Identifier: AGPL-3.0-only
// The music player (src/music-player/, one-client-platform-b.md › B3) at every form factor, through
// Expo Router's test renderer over the real app directory and the mock server (./mock.ts): no
// network. The toolbar's Music (`music=playing`, the address's query here) queues Sintel's score;
// by touch the mini player sits above the tabs and opens Now playing, with the queue in a sheet;
// with a pointer the bar sits at the window's foot and Close stops the music; on the TV Now playing
// joins the head. A server that doesn't serve music (as every real server is until music's phase)
// draws none of it, and its Now playing goes Home: the client is as it was at B2.
import { act, cleanup, fireEvent, screen } from '@testing-library/react-native'
import { router } from 'expo-router'
import { acknowledge, flush, fresh, serve, signedIn, tvSignedIn } from './mock.ts'

const g = globalThis as {
  __formFactor?: string
  __query?: Record<string, unknown>
  __filmsOnly?: boolean
}

jest.mock('../src/form-factor', () => ({
  formFactorOverride: () =>
    (globalThis as { __formFactor?: string }).__formFactor ?? 'compact-touch',
}))
// the mock's transport, its public info listing films only when a test asks (a real server's)
jest.mock('../src/transport.ts', () => {
  const m = require('./mock.ts').transportModule()
  const inner = m.transport
  const outer = Object.assign(async (url: string, init?: RequestInit) => {
    const res: Response = await inner(url, init)
    const live = globalThis as { __filmsOnly?: boolean }
    if (!live.__filmsOnly || !url.includes('/system/info/public')) return res
    const body = await res.json()
    const drafted = ['shows', 'music', 'profiles']
    return new Response(
      JSON.stringify({
        ...body,
        sources: body.sources.filter((s: string) => !drafted.includes(s)),
      }),
      { status: res.status, headers: res.headers },
    )
  }, inner)
  Object.defineProperty(outer, 'mock', { get: () => inner.mock })
  const mock = {
    ...m.mock,
    transport: outer,
    get query() {
      return (globalThis as { __query?: Record<string, unknown> }).__query ?? {}
    },
  }
  return { mock, transport: outer }
})
jest.mock(
  require('node:path').resolve(__dirname, '../../../packages/native/src/discovery.ts'),
  () => ({ browse: () => () => {} }),
)
jest.mock(
  require('node:path').resolve(__dirname, '../../../packages/native/src/server-store.ts'),
  () => require('./mock.ts').serverStore(),
)
jest.mock(
  require.resolve('expo-crypto', {
    paths: [require('node:path').resolve(__dirname, '../../../packages/native')],
  }),
  () => require('./mock.ts').cryptoModule(),
)
jest.mock('expo-crypto', () => require('./mock.ts').cryptoModule())
jest.mock('react-native-gesture-handler/ReanimatedSwipeable', () =>
  require('./mock.ts').swipeable(),
)
require('react-native-gesture-handler/jestSetup')

beforeEach(() => {
  fresh()
  serve('music')
  g.__query = { music: 'playing' }
})
afterEach(async () => {
  await cleanup()
  // the store is the app's one, kept between tests as between pages: each test starts with none
  require('../src/music-player/store.ts').musicPlayer.stop()
  require('../src/music-player/mount.tsx').forgetToolbar()
  delete g.__formFactor
  delete g.__query
  delete g.__filmsOnly
})

const go = async (path: string) => {
  await act(async () => router.navigate(path as never))
  await flush()
}

/** The mock's seed: Sintel's score, at its fourth cue. */
const SONG = /^Now playing: .+, Jan Morgenstern$/

describe('by touch', () => {
  test('the mini player sits above the tabs and opens Now playing, with the queue', async () => {
    await signedIn()
    await acknowledge()
    expect(screen.getByLabelText('Music player')).toBeTruthy()
    await fireEvent.press(screen.getByLabelText(SONG))
    await flush()
    expect(screen.getByText('Playing from')).toBeTruthy()
    // the tabs and the mini player give way to it
    expect(screen.queryByLabelText('Music player')).toBeNull()
    await fireEvent.press(screen.getByRole('button', { name: 'Pause' }))
    expect(screen.getByRole('button', { name: 'Play' })).toBeTruthy()
    await fireEvent.press(screen.getByRole('button', { name: /^Queue, up next: / }))
    await flush()
    expect(screen.getByText('Up next')).toBeTruthy()
  })

  test('with nothing queued, Now playing says so', async () => {
    await signedIn()
    await acknowledge()
    // stopped, as the bar's Close and Now playing's Stop do
    await act(async () => require('../src/music-player/store.ts').musicPlayer.stop())
    expect(screen.queryByLabelText('Music player')).toBeNull()
    await go('/now-playing')
    expect(screen.getByText('Nothing’s playing')).toBeTruthy()
  })
})

describe('with a pointer', () => {
  test('the bar sits at the foot, and Close the player stops the music', async () => {
    g.__formFactor = 'regular-pointer'
    const r = await signedIn()
    await acknowledge()
    expect(screen.getByLabelText('Music player')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Shuffle' })).toBeTruthy()
    await fireEvent.press(screen.getByRole('button', { name: 'Close the player' }))
    await flush()
    expect(screen.queryByLabelText('Music player')).toBeNull()
    // the bar is the pointer's player: Now playing's address goes Home
    await go('/now-playing')
    expect(r.getPathname()).toBe('/')
  })
})

describe('on the TV', () => {
  test('Now playing joins the head, and opens its screen', async () => {
    g.__formFactor = 'tv'
    await tvSignedIn()
    await acknowledge()
    await go('/')
    await fireEvent.press(screen.getByLabelText(SONG))
    await flush()
    expect(screen.getByRole('button', { name: 'Pause' })).toBeTruthy()
    expect(screen.getByText(/^Up next/)).toBeTruthy()
  })
})

describe('a server that does not serve music', () => {
  test('draws no player at any form factor, as at B2', async () => {
    g.__filmsOnly = true
    for (const formFactor of ['compact-touch', 'regular-pointer', 'tv']) {
      fresh()
      g.__formFactor = formFactor
      await (formFactor === 'tv' ? tvSignedIn() : signedIn())
      await acknowledge()
      await go('/')
      // signed in, with the shell's Home, and no player in it
      expect(screen.getAllByLabelText('Home').length).toBeGreaterThan(0)
      expect(screen.queryByLabelText('Music player')).toBeNull()
      expect(screen.queryByLabelText(SONG)).toBeNull()
      await cleanup()
    }
  })

  test('sends Now playing’s address Home', async () => {
    g.__filmsOnly = true
    const r = await signedIn()
    await acknowledge()
    await go('/now-playing')
    expect(r.getPathname()).toBe('/')
  })
})
