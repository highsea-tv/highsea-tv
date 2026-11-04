// SPDX-License-Identifier: AGPL-3.0-only
// Shows in the one client (src/shows/, one-client-platform-b.md › B3), through Expo Router's test
// renderer over the real app directory and the mock server (./mock.ts): no network. Shows lists
// every show and opens its page, with Play, the seasons and their episodes; a show that isn't here
// says so; Home has New episodes and Recently added shows; Search has a section for each. A server
// that doesn't serve shows (as every real server is until shows' phase) draws none of it, and its
// show page goes Home: the client is as it was at B2.
import { act, cleanup, fireEvent, screen } from '@testing-library/react-native'
import { router } from 'expo-router'
import { showNumber } from '../../../packages/mock/src/kinds.ts'
import { acknowledge, flush, fresh, serve, signedIn, tvSignedIn, words } from './mock.ts'

const g = globalThis as { __formFactor?: string }

jest.mock('../src/form-factor', () => ({
  formFactorOverride: () =>
    (globalThis as { __formFactor?: string }).__formFactor ?? 'compact-touch',
}))
jest.mock('../src/transport.ts', () => require('./mock.ts').transportModule())
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

jest.setTimeout(30_000)
// shows are served unless a test is a real server's, which serves none yet
beforeEach(() => {
  fresh()
  if (!expect.getState().currentTestName?.startsWith('a server that')) serve('shows')
})
afterEach(async () => {
  await cleanup()
  delete g.__formFactor
})

const go = async (path: string) => {
  await act(async () => router.navigate(path as never))
  await flush()
}

const LANTERN = `/shows/${showNumber('the-lantern-keepers')}`
const FIELD = 'Search titles, genres and people'
const text = () => words(screen.toJSON())

describe('by touch', () => {
  test("Library's Shows lists every show, each opening its page", async () => {
    await signedIn()
    await acknowledge()
    await go('/library?view=shows')
    const poster = screen.getAllByLabelText(/^The Lantern Keepers, /)[0]
    expect(poster).toBeTruthy()
    await fireEvent.press(poster as never)
    await flush()
    expect(screen.getByRole('header', { name: 'The Lantern Keepers' })).toBeTruthy()
    expect(screen.getAllByText('Episodes').length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: /^(Play|Resume) / })).toBeTruthy()
  })

  test('a show that isn’t here says so', async () => {
    await signedIn()
    await acknowledge()
    await go('/shows/9')
    expect(screen.getByText('That show isn’t on this server.')).toBeTruthy()
    expect(screen.getByText('It may have been removed.')).toBeTruthy()
  })

  test('Home has New episodes and Recently added shows', async () => {
    await signedIn()
    await acknowledge()
    expect(screen.getByRole('header', { name: 'New episodes' })).toBeTruthy()
    expect(screen.getByRole('header', { name: 'Recently added shows' })).toBeTruthy()
  })

  test('Search has a section for shows and one for episodes', async () => {
    await signedIn()
    await acknowledge()
    await go('/search')
    await fireEvent.changeText(screen.getByLabelText(FIELD), 'lantern')
    await flush(500)
    expect(screen.getByRole('header', { name: /^Shows/ })).toBeTruthy()
    await fireEvent.changeText(screen.getByLabelText(FIELD), 'what the light saw')
    await flush(500)
    expect(screen.getByRole('header', { name: /^Episodes/ })).toBeTruthy()
  })
})

describe('with a pointer', () => {
  test('Shows is in the top bar, and a show’s page has its seasons', async () => {
    g.__formFactor = 'regular-pointer'
    await signedIn()
    await acknowledge()
    expect(screen.getAllByRole('link', { name: 'Shows' }).length).toBeGreaterThan(0)
    await go(LANTERN)
    expect(screen.getByRole('header', { name: 'The Lantern Keepers' })).toBeTruthy()
    expect(text()).toMatch(/Season 1/)
    expect(text()).toMatch(/Mark season as (un)?watched/)
  })

  test('a show that isn’t here leads back to Shows', async () => {
    g.__formFactor = 'regular-pointer'
    await signedIn()
    await acknowledge()
    await go('/shows/9')
    expect(screen.getByText('That show isn’t on this server.')).toBeTruthy()
    expect(
      screen.getByText('It may have been removed. Shows lists every show you can watch.'),
    ).toBeTruthy()
  })
})

describe('on the TV', () => {
  test('a show’s page has its seasons and episodes', async () => {
    g.__formFactor = 'tv'
    await tvSignedIn()
    await acknowledge()
    await go(LANTERN)
    expect(text()).toMatch(/The Lantern Keepers/)
    expect(text()).toMatch(/Episode 1/)
  })
})

describe('a server that doesn’t serve shows', () => {
  test('draws no Shows, no rows and no sections, as at B2', async () => {
    g.__formFactor = 'regular-pointer'
    await signedIn()
    await acknowledge()
    expect(screen.queryAllByRole('link', { name: 'Shows' })).toHaveLength(0)
    expect(screen.queryByRole('header', { name: 'New episodes' })).toBeNull()
    expect(screen.queryByRole('header', { name: 'Recently added shows' })).toBeNull()
    await go('/search')
    await fireEvent.changeText(screen.getByLabelText(FIELD), 'lantern')
    await flush(500)
    expect(screen.queryByRole('header', { name: /^Shows/ })).toBeNull()
    expect(screen.queryByRole('header', { name: /^Episodes/ })).toBeNull()
  })

  test('its show page goes Home', async () => {
    await signedIn()
    await acknowledge()
    await go(LANTERN)
    expect(screen.queryByRole('header', { name: 'The Lantern Keepers' })).toBeNull()
    expect(screen.queryByText('That show isn’t on this server.')).toBeNull()
  })
})
