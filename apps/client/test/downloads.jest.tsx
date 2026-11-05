// SPDX-License-Identifier: AGPL-3.0-only
// Downloads with a pointer (src/downloads/, one-client-platform-b.md › B2), through Expo Router's
// test renderer over the real app directory and the mock server (./mock.ts): no network. A browser
// can't keep films, so it says Downloads live in the desktop app, with Get the desktop app opening
// Get the apps, and a film's page has no Download; the desktop app draws the list, and Download
// beside the film's actions. Moved from the prototype's tests of web/settings.tsx's WebDownloads
// and DesktopDownloads.
import { SEED } from '@highsea-tv/mock/films'
import { act, cleanup, fireEvent, screen } from '@testing-library/react-native'
import { router } from 'expo-router'
import { acknowledge, flush, fresh, signedIn, words } from './mock.ts'

jest.mock('../src/form-factor', () => ({
  formFactorOverride: () =>
    (globalThis as { __formFactor?: string }).__formFactor ?? 'regular-pointer',
}))
// a browser, unless a test says it's the desktop app
jest.mock('../src/host', () => ({
  ...jest.requireActual('../src/host'),
  useDevice: () => 'web',
  useDesktopApp: () => (globalThis as { __desktop?: boolean }).__desktop === true,
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

beforeEach(fresh)
afterEach(async () => {
  await cleanup()
  delete (globalThis as { __toolbar?: object }).__toolbar
  delete (globalThis as { __desktop?: boolean }).__desktop
})

async function at(path: string) {
  const r = await signedIn()
  await acknowledge()
  await act(() => router.navigate(path as never))
  await flush(500)
  return r
}

const FILM = `/movies/${SEED.film.id}`

describe('Downloads in a browser', () => {
  test('live in the desktop app, and Get the desktop app opens Get the apps', async () => {
    await at('/downloads')
    expect(screen.getByText('Downloads live in the desktop app')).toBeTruthy()
    expect(screen.queryByLabelText('Downloads')).toBeNull()
    await fireEvent.press(screen.getByRole('button', { name: 'Get the desktop app' }))
    await flush()
    expect(screen.getByText('Get the apps')).toBeTruthy()
  })

  test('a film’s page has no Download', async () => {
    await at(FILM)
    expect(screen.getByRole('button', { name: 'Play' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Download' })).toBeNull()
  })
})

describe('Downloads in the desktop app', () => {
  test('before downloading is built: nothing downloaded, coming in the next update', async () => {
    ;(globalThis as { __desktop?: boolean }).__desktop = true
    ;(globalThis as { __toolbar?: object }).__toolbar = { app: 'desktop', downloads: 'later' }
    await at('/downloads')
    expect(screen.getByRole('header', { name: 'Downloads' })).toBeTruthy()
    expect(screen.getByText('Nothing downloaded')).toBeTruthy()
  })

  test('the list, with what the computer has free and no Wi-Fi switch', async () => {
    ;(globalThis as { __desktop?: boolean }).__desktop = true
    ;(globalThis as { __toolbar?: object }).__toolbar = { app: 'desktop' }
    await at('/downloads')
    const all = words(screen.toJSON())
    expect(screen.getByRole('header', { name: 'Downloads' })).toBeTruthy()
    expect(screen.getByLabelText('Downloads')).toBeTruthy()
    expect(all).toMatch(/free on this computer/)
    // the computer pauses where the phone waits for Wi-Fi
    expect(all).toMatch(/Paused · /)
    expect(all).not.toMatch(/Waiting for Wi-Fi/)
    expect(screen.getAllByRole('button', { name: /^Resume/ }).length).toBeGreaterThan(0)
    expect(screen.queryByLabelText('Download on Wi-Fi only')).toBeNull()
    expect(screen.getByLabelText(/^Quality/)).toBeTruthy()
  })

  test('a film’s page has Download beside its actions, which says where it goes', async () => {
    ;(globalThis as { __desktop?: boolean }).__desktop = true
    ;(globalThis as { __toolbar?: object }).__toolbar = { app: 'desktop' }
    await at(FILM)
    // the seed's are other films, so this one hasn't been downloaded
    await fireEvent.press(screen.getByRole('button', { name: 'Download' }))
    await flush()
    expect(screen.getByText('Downloading Tears of Steel')).toBeTruthy()
    expect(screen.getByText('To this computer.')).toBeTruthy()
    // on the list now, so the button gives way to where it's got to
    expect(screen.queryByRole('button', { name: 'Download' })).toBeNull()
  })
})
