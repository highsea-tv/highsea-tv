// SPDX-License-Identifier: AGPL-3.0-only
// The shell around the destinations (src/app/(in)/_layout.tsx) and its announcements
// (src/shell/announcements.tsx) at every form factor, through Expo Router's test renderer over the
// real app directory and the mock server (./mock.ts): no network. An announcement that must be
// acknowledged shows over any destination and only Got it closes it: a dialog on the phone and with
// a pointer, and on the TV a screen of its own with the head hidden. With a pointer, toasts come one
// at a time, each counted as seen as it shows, and the bell says what's new. On the phone, Library
// stays marked on a collection's page.
import { act, cleanup, fireEvent, screen } from '@testing-library/react-native'
import { router } from 'expo-router'
import {
  acknowledge,
  flush,
  fresh,
  hold,
  rewrite,
  sent,
  server,
  signedIn,
  tvSignedIn,
} from './mock.ts'

// the phone, unless a test asks for another form factor
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
beforeEach(fresh)
afterEach(async () => {
  await cleanup()
  delete (globalThis as { __formFactor?: string }).__formFactor
})

const MUST = 'Harbor has a new remote address'

const formFactor = (name: string) => {
  ;(globalThis as { __formFactor?: string }).__formFactor = name
}

const go = async (path: string) => {
  await act(async () => router.navigate(path as never))
  await flush()
}

/** Two toast-placed announcements, live for everyone, which the mock's seed doesn't have. */
const addToasts = () => {
  const state = server().mock.servers.populated.state
  const base = state.announcements.find((x) => x.id === 'an-movie-night')
  if (!base) throw new Error('The seed has no an-movie-night')
  for (const n of [1, 2])
    state.announcements.push({
      ...base,
      id: `an-toast-${n}`,
      title: `Toast number ${n}`,
      body: `The **${n}** toast.`,
      image: null,
      placements: ['toast'],
      acknowledgement: 'dismiss',
    })
}

describe('the shell on the phone', () => {
  test('one that must be acknowledged shows over any destination, once, until Got it', async () => {
    await signedIn()
    expect(screen.getAllByText(MUST)).toHaveLength(1)
    await go('/search')
    expect(screen.getAllByText(MUST)).toHaveLength(1)
    // nothing closes it but its button
    expect(screen.queryByRole('button', { name: 'Close' })).toBeNull()
    await fireEvent.press(screen.getByRole('button', { name: 'Got it' }))
    await flush()
    expect(screen.queryByText(MUST)).toBeNull()
    expect(sent('/announcements/an-new-address/seen')).toHaveLength(1)
  })

  test('Escape and Android’s Back do nothing to it', async () => {
    await signedIn()
    // what Escape on the web and Back on Android call: the Modal's onRequestClose
    const modals = screen.root?.queryAll((n) => typeof n.props.onRequestClose === 'function') ?? []
    expect(modals.length).toBeGreaterThan(0)
    await act(async () => {
      for (const m of modals) m.props.onRequestClose()
    })
    await flush()
    expect(screen.getByText(MUST)).toBeTruthy()
  })

  test('Got it is held while the server hears it, so a second press sends nothing more', async () => {
    await signedIn()
    const got = screen.getByRole('button', { name: 'Got it' })
    const release = hold('/announcements/an-new-address/seen')
    await fireEvent.press(got)
    await flush()
    // the server hasn't answered yet: Got it is held, and the dialog with it
    expect(screen.getByRole('button', { name: 'Got it' })).toBeDisabled()
    await fireEvent.press(screen.getByRole('button', { name: 'Got it' }))
    expect(screen.getByText(MUST)).toBeTruthy()
    release()
    await flush()
    expect(sent('/announcements/an-new-address/seen')).toHaveLength(1)
    expect(screen.queryByText(MUST)).toBeNull()
  })

  test('when the server doesn’t hear Got it, the announcement stays and says so', async () => {
    let down = true
    rewrite((url, init) =>
      down && url.includes('/announcements/an-new-address/seen')
        ? [url.replace('/announcements/an-new-address/seen', '/nowhere'), init]
        : undefined,
    )
    await signedIn()
    await fireEvent.press(screen.getByRole('button', { name: 'Got it' }))
    await flush()
    expect(screen.getByText(MUST)).toBeTruthy()
    expect(screen.getByText('Couldn’t tell the server. Try Got it again.')).toBeTruthy()
    down = false
    await fireEvent.press(screen.getByRole('button', { name: 'Got it' }))
    await flush()
    expect(screen.queryByText(MUST)).toBeNull()
  })

  test('Alerts isn’t the phone’s: its address goes to Home', async () => {
    const r = await signedIn()
    await acknowledge()
    await go('/alerts')
    expect(r.getPathname()).toBe('/')
  })

  test.each(['/collections', '/collections/sc-staff'])(
    'Library stays marked on %s, and takes you back to Library',
    async (path) => {
      const r = await signedIn()
      await acknowledge()
      await go(path)
      expect(screen.getByRole('button', { name: 'Library', selected: true })).toBeTruthy()
      expect(screen.getByRole('button', { name: 'Home', selected: false })).toBeTruthy()
      await fireEvent.press(screen.getByRole('button', { name: 'Library' }))
      await flush()
      expect(r.getPathname()).toBe('/library')
    },
  )
})

describe('the shell with a pointer', () => {
  test('one that must be acknowledged is a dialog over any destination, until Got it', async () => {
    formFactor('regular-pointer')
    await signedIn()
    await go('/movies')
    expect(screen.getAllByText(MUST)).toHaveLength(1)
    await fireEvent.press(screen.getByRole('button', { name: 'Got it' }))
    await flush()
    expect(screen.queryByText(MUST)).toBeNull()
  })

  test('the bell says how many are new', async () => {
    formFactor('regular-pointer')
    await signedIn()
    expect(screen.getByRole('button', { name: /^Alerts, \d+ new$/ })).toBeTruthy()
  })

  test('toasts all show as the app opens, stacked, each counted as seen, and go after a while', async () => {
    formFactor('regular-pointer')
    addToasts()
    await signedIn()
    expect(screen.getByText('Toast number 1')).toBeTruthy()
    expect(screen.getByText('Toast number 2')).toBeTruthy()
    expect(sent('/announcements/an-toast-1/seen')).toHaveLength(1)
    expect(sent('/announcements/an-toast-2/seen')).toHaveLength(1)
    await flush(6500)
    expect(screen.queryByText('Toast number 1')).toBeNull()
    expect(screen.queryByText('Toast number 2')).toBeNull()
  })

  test('the bell opens Alerts as a popover, counting the new ones as seen but not the one Got it is for', async () => {
    formFactor('regular-pointer')
    await signedIn()
    await acknowledge()
    await go('/movies')
    const bell = screen.getByRole('button', { name: /^Alerts/ })
    expect(bell.props.accessibilityState?.expanded).toBe(false)
    await fireEvent.press(bell)
    await flush()
    expect(screen.getByRole('button', { name: /^Alerts/ }).props.accessibilityState?.expanded).toBe(
      true,
    )
    expect(screen.getByText('Movie night is Friday')).toBeTruthy()
    expect(screen.getAllByText('New').length).toBeGreaterThan(0)
    expect(sent('/announcements/an-movie-night/seen')).toHaveLength(1)
    // it stays on the page it opened over
    expect(screen.getByRole('header', { name: 'Movies' })).toBeTruthy()
  })
})

describe('the shell on the TV', () => {
  test('one that must be acknowledged is a screen of its own, with the head hidden', async () => {
    formFactor('tv')
    await tvSignedIn()
    expect(screen.getByText(MUST)).toBeTruthy()
    expect(screen.getByText('From the server’s owner')).toBeTruthy()
    expect(screen.queryByLabelText('Main')).toBeNull()
    // it stays over another destination too
    await go('/movies')
    expect(screen.getByText(MUST)).toBeTruthy()
    expect(screen.queryByLabelText('Main')).toBeNull()
    await fireEvent.press(screen.getByRole('button', { name: 'Got it' }))
    await flush()
    expect(screen.queryByText(MUST)).toBeNull()
    expect(screen.getByLabelText('Main')).toBeTruthy()
    expect(sent('/announcements/an-new-address/seen')).toHaveLength(1)
  })

  test('Back on it leaves highsea, and a screen under it holds the key again once it’s gone', async () => {
    // what ../src/back-key.ts hands tvOS's TVEventControl: held (Back stays in highsea) or not
    const calls: string[] = []
    jest
      .spyOn(require('../src/back-key.ts'), 'holdMenuKey')
      .mockImplementation((held) => void calls.push(held ? 'hold' : 'go'))
    formFactor('tv')
    await tvSignedIn()
    await go('/movies')
    expect(calls.at(-1)).toBe('go')
    await fireEvent.press(screen.getByRole('button', { name: 'Got it' }))
    await flush()
    expect(calls.at(-1)).toBe('hold')
  })

  test('after Got it, the page under it shows again with its first stop to take focus', async () => {
    formFactor('tv')
    await tvSignedIn()
    await go('/movies')
    await fireEvent.press(screen.getByRole('button', { name: 'Got it' }))
    await flush()
    const first = screen
      .queryAllByLabelText(/, \d{4}$/)
      .find((n) => n.props.hasTVPreferredFocus === true)
    expect(first).toBeTruthy()
    // nothing above it is hidden any more
    for (let n = first?.parent ?? null; n; n = n.parent)
      expect(n.props.accessibilityElementsHidden ?? false).toBe(false)
  })

  test('when the server doesn’t hear Got it, the screen stays and says so at the foot', async () => {
    rewrite((url, init) =>
      url.includes('/announcements/an-new-address/seen')
        ? [url.replace('/announcements/an-new-address/seen', '/nowhere'), init]
        : undefined,
    )
    formFactor('tv')
    await tvSignedIn()
    await fireEvent.press(screen.getByRole('button', { name: 'Got it' }))
    await flush()
    expect(screen.getByText(MUST)).toBeTruthy()
    // drawn at the foot, beside the layer, which is modal to VoiceOver (accessibilityViewIsModal),
    // so the query reaches past it; the library's Toast announces itself to VoiceOver
    expect(
      screen.getByText('Couldn’t tell the server. Try Got it again.', {
        includeHiddenElements: true,
      }),
    ).toBeTruthy()
  })
})
