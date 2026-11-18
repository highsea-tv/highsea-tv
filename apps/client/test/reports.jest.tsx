// SPDX-License-Identifier: AGPL-3.0-only
// What the app reports to its own server (src/shell/reports.tsx, ADR 0066), through Expo Router's
// test renderer over the real app directory with the mock server as the transport (./mock.ts): no
// network. A screen of the test's own that throws is caught by the shell's error boundary, which
// reports it once, with the app, its version, the device and the screen and nothing about the
// person, and offers the way home; a report the server refuses breaks nothing and isn't sent
// again; and a play that fails is reported with the profile the app named.
import { SEED } from '@highsea-tv/mock/films'
import { act, cleanup, fireEvent, screen } from '@testing-library/react-native'
import { router } from 'expo-router'
import { renderRouter } from 'expo-router/testing-library'
import { Text } from 'react-native'
import { appWith, flush, fresh, rewrite, sent, server, type } from './mock.ts'

jest.mock('../src/form-factor', () => ({
  formFactorOverride: () => 'touch',
}))
jest.mock('../src/transport.ts', () =>
  require('./mock.ts').transportModule({
    media: {
      clip: `/web/${require('@highsea-tv/mock/play').MOCK_CLIP.clip}`,
      subtitles: `/web/${require('@highsea-tv/mock/play').MOCK_CLIP.subtitles}`,
      duration: require('@highsea-tv/mock/play').MOCK_CLIP.duration,
    },
  }),
)
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

const FILM = SEED.film.id
const REPORTS = '/api/v1/system/client-reports'

/** The reports' bodies as they left the app. */
let bodies: Record<string, unknown>[] = []
let noise: jest.SpyInstance

beforeEach(() => {
  fresh()
  bodies = []
  rewrite((url, init) => {
    if (url.includes(REPORTS) && init.method === 'POST')
      bodies.push(JSON.parse(String(init.body)) as Record<string, unknown>)
    return undefined
  })
  // React logs an error a boundary caught; the test means it to happen
  noise = jest.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(async () => {
  noise.mockRestore()
  await cleanup()
})

/** A screen that fails as it draws. */
function Broken(): never {
  throw new TypeError('the poster has no title')
}

const Fine = () => <Text>A screen that works</Text>

/** Signs in on the phone with the test's routes laid over the app, and opens `path`. */
async function at(path: string) {
  await renderRouter(appWith({ '(in)/broken': Broken, '(in)/fine': Fine }), { initialUrl: '/' })
  await flush(5000)
  await fireEvent.press(screen.getByRole('button', { name: /^Harbor/ }))
  await flush()
  await type({ Username: 'ruth', Password: 'x' })
  await fireEvent.press(screen.getByRole('button', { name: 'Sign in' }))
  await flush()
  await act(() => router.navigate(path as never))
  await flush(500)
}

describe('the shell’s error boundary', () => {
  test('reports a screen that throws, once, and offers the way home', async () => {
    await at('/broken')
    expect(screen.getByRole('header', { name: 'Something went wrong' })).toBeTruthy()
    expect(bodies).toHaveLength(1)
    const [report] = bodies
    expect(report).toMatchObject({
      kind: 'error',
      app: 'ios',
      screen: '/broken',
      error: { name: 'TypeError', message: 'the poster has no title' },
    })
    expect(typeof report?.version).toBe('string')
    expect(typeof report?.device).toBe('string')
    expect(report?.error).toMatchObject({ componentStack: expect.stringContaining('Broken') })
    // the app, its version, the device, the screen and the error: nothing about the person
    expect(Object.keys(report ?? {}).sort()).toEqual([
      'app',
      'device',
      'error',
      'kind',
      'screen',
      'version',
    ])
    expect(JSON.stringify(report)).not.toContain('ruth')

    await fireEvent.press(screen.getByRole('button', { name: 'Go home' }))
    await flush(500)
    expect(screen.queryByText('Something went wrong')).toBeNull()

    // the same failure on the same screen isn't sent again
    await act(() => router.navigate('/broken' as never))
    await flush(500)
    expect(screen.getByText('Something went wrong')).toBeTruthy()
    expect(bodies).toHaveLength(1)
  })

  test('a report the server refuses breaks nothing and isn’t tried again', async () => {
    rewrite((url, init) =>
      url.includes(REPORTS) && init.method === 'POST'
        ? [url.replace(REPORTS, '/api/v1/nothing-here'), init]
        : undefined,
    )
    await at('/broken')
    expect(screen.getByText('Something went wrong')).toBeTruthy()
    await fireEvent.press(screen.getByRole('button', { name: 'Go home' }))
    await flush(500)
    await act(() => router.navigate('/fine' as never))
    await flush(500)
    expect(screen.getByText('A screen that works')).toBeTruthy()
    expect(bodies).toHaveLength(1)
    expect(sent(REPORTS)).toHaveLength(0)
    expect(sent('/api/v1/nothing-here')).toHaveLength(1)
  })
})

describe('a play that fails', () => {
  test('is reported with the title and the profile the app named', async () => {
    await at('/fine')
    server().setState({ stream: 'failed' } as never)
    await act(() => router.navigate(`/play/${FILM}` as never))
    await flush(2000)
    expect(screen.getByText('This film didn’t start')).toBeTruthy()
    expect(bodies).toHaveLength(1)
    expect(bodies[0]).toMatchObject({
      kind: 'play',
      app: 'ios',
      screen: `/play/${FILM}`,
      error: { name: 'PlaybackError' },
      play: { type: 'movie', id: FILM, profile: 'ios' },
    })
    // Try again fails the same way: one report for it
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }))
    await flush(500)
    expect(bodies).toHaveLength(1)
  })
})
