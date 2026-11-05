// SPDX-License-Identifier: AGPL-3.0-only
// The phone's Offline (src/downloads/, one-client-platform-b.md › B2), through Expo Router's test
// renderer over the real app directory and the mock server (./mock.ts): no network. In a mock build
// the list draws one download in each state, seeded from the library as the prototype's was, with
// each state's actions; the toolbar's `downloads=later` (and every real build) says downloading
// comes in the next update instead; and a film's page has Download under Play only while the list
// is drawn. Moved from the prototype's tests of mobile/more.tsx's MobileOffline. The store lives
// as long as the client does, so the tests that change it come after the ones that read it.
import { SEED } from '@highsea-tv/mock/films'
import { act, cleanup, fireEvent, screen } from '@testing-library/react-native'
import { router } from 'expo-router'
import { acknowledge, flush, fresh, signedIn, words } from './mock.ts'

jest.mock('../src/form-factor', () => ({
  formFactorOverride: () =>
    (globalThis as { __formFactor?: string }).__formFactor ?? 'compact-touch',
}))
jest.mock('../src/transport.ts', () => require('./mock.ts').transportModule())
// the toolbar's states, as the prototypes' chrome would set them
jest.mock('../src/frame-channel.ts', () => ({
  ...jest.requireActual('../src/frame-channel.ts'),
  useFrameState: () => (globalThis as { __toolbar?: object }).__toolbar ?? {},
}))
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

beforeEach(fresh)
afterEach(async () => {
  await cleanup()
  delete (globalThis as { __toolbar?: object }).__toolbar
})

async function at(path: string) {
  const r = await signedIn()
  await acknowledge()
  await act(() => router.navigate(path as never))
  await flush(500)
  return r
}

const FILM = `/movies/${SEED.film.id}`

describe('Offline before downloading is built', () => {
  test('says nothing is downloaded and that it comes in the next update', async () => {
    ;(globalThis as { __toolbar?: object }).__toolbar = { downloads: 'later' }
    await at('/offline')
    expect(screen.getByRole('header', { name: 'Offline' })).toBeTruthy()
    expect(screen.getByText('Nothing downloaded')).toBeTruthy()
    expect(screen.getByText(/next update/)).toBeTruthy()
    expect(screen.queryByLabelText('Downloads')).toBeNull()
  })

  test('a film’s page has no Download until then', async () => {
    ;(globalThis as { __toolbar?: object }).__toolbar = { downloads: 'later' }
    await at(FILM)
    expect(screen.getByRole('button', { name: 'Play' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Download' })).toBeNull()
  })
})

describe('Offline', () => {
  test('one download in each state, with the space they take and the settings', async () => {
    await at('/offline')
    const all = words(screen.toJSON())
    expect(screen.getByRole('header', { name: 'Offline' })).toBeTruthy()
    expect(screen.getByLabelText('Downloads')).toBeTruthy()
    // the space line: what's ready, what it takes, what's free on the phone
    expect(all).toMatch(/1 film ready · .+ free on this phone/)
    // each state's line (client-settings.md#offline)
    expect(all).toMatch(/plays offline for 26 more days/)
    expect(all).toMatch(/MB\/s · .+ to go/)
    expect(all).toMatch(/Waiting to download · /)
    expect(all).toMatch(/Waiting for Wi-Fi · /)
    expect(all).toMatch(/The download stopped when Harbor couldn’t be reached\./)
    expect(all).toMatch(/Connect to Harbor to keep watching it\./)
    expect(screen.getByText('Stopped')).toBeTruthy()
    expect(screen.getByText('Expired')).toBeTruthy()
    // the actions each state has
    expect(screen.getAllByRole('button', { name: /^Pause/ }).length).toBeGreaterThan(0)
    expect(screen.getAllByRole('button', { name: /^Try again/ }).length).toBeGreaterThan(0)
    expect(screen.getAllByRole('button', { name: /^Use mobile data/ }).length).toBeGreaterThan(0)
    // Quality, and Download on Wi-Fi only, which only the phone has
    expect(screen.getByLabelText(/^Quality/)).toBeTruthy()
    expect(screen.getByLabelText('Download on Wi-Fi only')).toBeTruthy()
  })

  test('a film’s page has Download under Play, which starts it and says so', async () => {
    await at(FILM)
    await fireEvent.press(screen.getByRole('button', { name: 'Download' }))
    await flush()
    expect(screen.getByText('Downloading Tears of Steel')).toBeTruthy()
    expect(screen.getByText('To this phone.')).toBeTruthy()
    // one of the seed's is downloading, so it waits its turn, with Cancel, in Download's place
    expect(screen.getByText('Waiting to download')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Download' })).toBeNull()
  })

  test('the failed one tries again, and Remove takes one off the list', async () => {
    await at('/offline')
    const before = words(screen.toJSON())
    expect(before).toMatch(/The download stopped/)
    const again = screen.getAllByRole('button', { name: /^Try again/ })[0]
    if (!again) throw new Error(`No Try again: ${before}`)
    await fireEvent.press(again)
    await flush()
    expect(words(screen.toJSON())).not.toMatch(/The download stopped/)
    const removes = screen.getAllByRole('button', { name: /^Remove/ })
    const first = removes[0]
    if (!first) throw new Error('No Remove')
    await fireEvent.press(first)
    await flush()
    expect(screen.getAllByRole('button', { name: /^Remove/ }).length).toBe(removes.length - 1)
  })
})
