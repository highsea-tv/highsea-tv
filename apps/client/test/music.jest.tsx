// SPDX-License-Identifier: AGPL-3.0-only
// Music in the one client (src/music/, one-client-platform-b.md › B3), through Expo Router's test
// renderer over the real app directory and the mock server (./mock.ts): no network. Library's
// Music lists the albums and opens an album's page, with Play and its songs; an artist's and a
// playlist's pages have theirs; a page that isn't here says so; Home has Recently played and
// Search a section for albums. A server that doesn't serve music (as every real server is until
// music's phase) draws none of it, and music's addresses go Home: the client is as it was at B2.
import { act, cleanup, fireEvent, screen } from '@testing-library/react-native'
import { router } from 'expo-router'
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

// music is served unless a test is a real server's, which serves none yet
beforeEach(() => {
  fresh()
  if (!expect.getState().currentTestName?.includes('a server that')) serve('music')
})
afterEach(async () => {
  await cleanup()
  delete g.__formFactor
})

const go = async (path: string) => {
  await act(async () => router.navigate(path as never))
  await flush()
}

/** The mock's ids: an artist's name and an album's artist and title, made into slugs. */
const SINTEL = '/music/albums/jan-morgenstern-sintel-original-score'
const MORGENSTERN = '/music/artists/jan-morgenstern'
const FIELD = 'Search titles, genres and people'
const text = () => words(screen.toJSON())

describe('by touch', () => {
  test("Library's Music lists the albums, each opening its page", async () => {
    await signedIn()
    await acknowledge()
    await go('/library?view=music')
    // the grid draws the first screens' worth, so an album early in the alphabet
    const cover = screen.getAllByLabelText('Kindling, The Hollow Pines')[0]
    expect(cover).toBeTruthy()
    await fireEvent.press(cover as never)
    await flush()
    expect(screen.getByRole('header', { name: 'Kindling' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Play' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Shuffle' })).toBeTruthy()
    expect(text()).toMatch(/The Hollow Pines/)
  })

  test('an album that isn’t here says so', async () => {
    await signedIn()
    await acknowledge()
    await go('/music/albums/nowhere')
    expect(screen.getByText('This album isn’t here')).toBeTruthy()
  })

  test('a playlist’s page has its name, Play and its songs', async () => {
    await signedIn()
    await acknowledge()
    await go('/library?view=music&music=playlists')
    await fireEvent.press(screen.getAllByLabelText(/^Late night/)[0] as never)
    await flush()
    expect(screen.getByRole('header', { name: 'Late night' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Play' })).toBeTruthy()
    expect(screen.getAllByRole('button', { name: /^Play .+, .+, \d+:\d\d$/ }).length).toBe(9)
  })

  test('Home has Recently played, and Search a section for albums', async () => {
    await signedIn()
    await acknowledge()
    expect(screen.getByRole('header', { name: 'Recently played' })).toBeTruthy()
    await go('/search')
    await fireEvent.changeText(screen.getByLabelText(FIELD), 'sintel')
    await flush(500)
    expect(screen.getByRole('header', { name: /^Albums/ })).toBeTruthy()
  })
})

describe('with a pointer', () => {
  test('Music is in the top bar, and an artist’s page has their albums', async () => {
    g.__formFactor = 'regular-pointer'
    await signedIn()
    await acknowledge()
    expect(screen.getAllByRole('link', { name: 'Music' }).length).toBeGreaterThan(0)
    await go(MORGENSTERN)
    expect(screen.getByRole('header', { name: 'Jan Morgenstern' })).toBeTruthy()
    expect(text()).toMatch(/Sintel \(Original Score\)/)
  })

  test('a playlist renames from its ⋯, and deletes back to Playlists', async () => {
    g.__formFactor = 'regular-pointer'
    const r = await signedIn()
    await acknowledge()
    await go('/music/playlists')
    await fireEvent.press(screen.getAllByLabelText(/^Late night/)[0] as never)
    await flush()
    await fireEvent.press(screen.getByLabelText('More for Late night'))
    await flush()
    await fireEvent.press(screen.getByText('Rename…'))
    await flush()
    await fireEvent.changeText(screen.getByLabelText('Name'), 'After hours')
    await fireEvent.press(screen.getByRole('button', { name: 'Rename' }))
    await flush(500)
    expect(screen.getByRole('header', { name: 'After hours' })).toBeTruthy()
    await fireEvent.press(screen.getByLabelText('More for After hours'))
    await flush()
    await fireEvent.press(screen.getByText('Delete playlist…'))
    await flush()
    const confirm = screen.getAllByRole('button', { name: 'Delete playlist' })
    await fireEvent.press(confirm[confirm.length - 1] as never)
    await flush(500)
    expect(r.getPathname()).toBe('/music/playlists')
    expect(screen.queryAllByLabelText(/^After hours/)).toEqual([])
  })

  test('an artist that isn’t here says so', async () => {
    g.__formFactor = 'regular-pointer'
    await signedIn()
    await acknowledge()
    await go('/music/artists/nowhere')
    expect(screen.getByText('This artist isn’t here')).toBeTruthy()
  })
})

describe('on the TV', () => {
  test('an album’s page has its title and Play', async () => {
    g.__formFactor = 'tv'
    await tvSignedIn()
    await acknowledge()
    await go(SINTEL)
    expect(screen.getByRole('header', { name: 'Sintel (Original Score)' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Play' })).toBeTruthy()
    expect(screen.getAllByRole('button', { name: /^Play .+, Jan Morgenstern, / }).length).toBe(14)
  })
})

describe('a server that doesn’t serve music', () => {
  test('a server that doesn’t serve music has no Music, no music rows and no music in Search', async () => {
    g.__formFactor = 'regular-pointer'
    await signedIn()
    await acknowledge()
    expect(screen.queryAllByRole('link', { name: 'Music' })).toEqual([])
    expect(screen.queryByRole('header', { name: 'Recently played' })).toBeNull()
    await go('/search')
    await fireEvent.changeText(screen.getByLabelText(FIELD), 'sintel')
    await flush(500)
    expect(screen.queryByRole('header', { name: /^Albums/ })).toBeNull()
    expect(text()).toMatch(/Sintel/)
  })

  test('a server that doesn’t serve music sends music’s addresses Home', async () => {
    const r = await signedIn()
    await acknowledge()
    for (const path of ['/music', '/music/artists', SINTEL, MORGENSTERN]) {
      await go(path)
      expect(r.getPathname()).toBe('/')
      expect(screen.queryByText('This album isn’t here')).toBeNull()
      expect(screen.queryByRole('header', { name: 'Sintel (Original Score)' })).toBeNull()
      expect(screen.queryByRole('header', { name: 'Jan Morgenstern' })).toBeNull()
    }
  })
})
