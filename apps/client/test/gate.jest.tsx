// SPDX-License-Identifier: AGPL-3.0-only
// The gate every client opens on (app/_layout.tsx), through Expo Router's own test renderer
// (https://docs.expo.dev/router/reference/testing/) over the real app directory, with the mock
// server as the transport (./mock.ts): no network. On the phone, each test from a mock server and
// a store of its own: choosing a server, a password, two-step verification, single sign-on, a
// refused token, a server that doesn't answer, forgetting a server, Settings and signing out.
import { act, cleanup, fireEvent, screen } from '@testing-library/react-native'
import { router } from 'expo-router'
import { flush, fresh, open, rewrite, server, signedIn, store, type } from './mock.ts'

jest.mock('../src/transport.ts', () => require('./mock.ts').transportModule())
// Bonjour is a native module; mock mode hands the servers provider the mock's own discovery
jest.mock(
  require('node:path').resolve(__dirname, '../../../packages/native/src/discovery.ts'),
  () => ({ browse: () => () => {} }),
)
// the servers it knows and their tokens, in memory (the device's file and keychain are native)
jest.mock(
  require('node:path').resolve(__dirname, '../../../packages/native/src/server-store.ts'),
  () => require('./mock.ts').serverStore(),
)
// PKCE's expo-crypto, as @highsea-tv/native resolves it (Bun's store keeps a copy per peer set)
jest.mock(
  require.resolve('expo-crypto', {
    paths: [require('node:path').resolve(__dirname, '../../../packages/native')],
  }),
  () => require('./mock.ts').cryptoModule(),
)
jest.mock('expo-crypto', () => require('./mock.ts').cryptoModule())
// the swipe to forget a server needs Reanimated's native side: its rows are drawn without it
jest.mock('react-native-gesture-handler/ReanimatedSwipeable', () =>
  require('./mock.ts').swipeable(),
)
require('react-native-gesture-handler/jestSetup')

beforeEach(fresh)

/** Opens Settings from the tab bar. */
const settings = async () => {
  await fireEvent.press(screen.getByRole('button', { name: 'You' }))
  await flush()
}

describe('the gate', () => {
  test('opens on Choose a server, with the servers found nearby', async () => {
    const r = await open()
    expect(r.getPathname()).toBe('/connect')
    expect(screen.getByRole('header', { name: 'Choose a server' })).toBeTruthy()
    expect(screen.getByRole('button', { name: /^Harbor/ })).toBeTruthy()
  })

  test('a server chosen asks for its sign-in, and the wrong password says so', async () => {
    const r = await open()
    await fireEvent.press(screen.getByRole('button', { name: /^Harbor/ }))
    await flush()
    expect(r.getPathname()).toBe('/sign-in')
    await type({ Username: 'ruth', Password: 'wrong' })
    await fireEvent.press(screen.getByRole('button', { name: 'Sign in' }))
    await flush()
    expect(r.getPathname()).toBe('/sign-in')
    expect(screen.getByText('That username and password don’t match.')).toBeTruthy()
  })

  test('signing in opens the shell, and reopened it opens signed in', async () => {
    const r = await signedIn()
    expect(r.getPathname()).toBe('/')
    // the phone's tab bar, and the owner's announcement that must be acknowledged over Home
    // iOS's tab bar: a container with the tab bar trait around buttons (src/kit.tsx's TAB_ROW)
    expect(screen.getByLabelText('Main').props.accessibilityRole).toBe('tabbar')
    expect(screen.getByRole('button', { name: 'Home', selected: true })).toBeTruthy()
    expect(screen.getByText('Harbor has a new remote address')).toBeTruthy()
    expect(store().tokens.size).toBe(1)
    await cleanup()
    const again = await open()
    expect(again.getPathname()).toBe('/')
  })

  test('a sign-in answered with no device token says so, and keeps nothing', async () => {
    const r = await open()
    await fireEvent.press(screen.getByRole('button', { name: /^Harbor/ }))
    await flush()
    // the server answers as it would a browser: the request names no device, so no token comes back
    rewrite((url, init) => {
      if (typeof init.body !== 'string' || !init.body.includes('"password"')) return
      const { device: _, ...body } = JSON.parse(init.body)
      return [url, { ...init, body: JSON.stringify(body) }]
    })
    await type({ Username: 'ruth', Password: 'x' })
    await fireEvent.press(screen.getByRole('button', { name: 'Sign in' }))
    await flush()
    expect(r.getPathname()).toBe('/sign-in')
    expect(
      screen.getByText(
        'Harbor signed you in but sent no sign-in for this device to keep. Try again.',
      ),
    ).toBeTruthy()
    expect(store().tokens.size).toBe(0)
  })

  test('a sign-in the keychain can’t keep says so, and stays on the sign-in', async () => {
    const r = await open()
    await fireEvent.press(screen.getByRole('button', { name: /^Harbor/ }))
    await flush()
    store().writeToken = async () => {
      throw new Error('errSecInteractionNotAllowed')
    }
    await type({ Username: 'ruth', Password: 'x' })
    await fireEvent.press(screen.getByRole('button', { name: 'Sign in' }))
    await flush()
    expect(r.getPathname()).toBe('/sign-in')
    expect(
      screen.getByText('highsea couldn’t keep your sign-in in this iPhone’s keychain. Try again.'),
    ).toBeTruthy()
    expect(store().tokens.size).toBe(0)
  })

  test('a known server that isn’t set up any more isn’t opened, and the words say where', async () => {
    const r = await signedIn()
    await act(() => router.push('/connect'))
    await flush()
    server().mock.servers.populated.state.server.setupComplete = false
    await fireEvent.press(screen.getByRole('button', { name: /^Harbor/ }))
    await flush()
    expect(r.getPathname()).toBe('/connect')
    expect(
      screen.getByText(/^Harbor isn’t set up yet\. Its owner sets it up in a browser, at /),
    ).toBeTruthy()
  })

  test('two-step verification asks for the code, says when it’s wrong, then signs in', async () => {
    const r = await open()
    await fireEvent.press(screen.getByRole('button', { name: /^Harbor/ }))
    await flush()
    // Ines has two-step verification on in the mock
    await type({ Username: 'ines', Password: 'x' })
    await fireEvent.press(screen.getByRole('button', { name: 'Sign in' }))
    await flush()
    expect(screen.getByText('Enter the 6-digit code from your authenticator app.')).toBeTruthy()
    await type({ Code: '000000' })
    await fireEvent.press(screen.getByRole('button', { name: 'Verify' }))
    await flush()
    expect(screen.getByText('That code didn’t work. Codes change every 30 seconds.')).toBeTruthy()
    expect(r.getPathname()).toBe('/sign-in')
    await type({ Code: '123456' })
    await fireEvent.press(screen.getByRole('button', { name: 'Verify' }))
    await flush()
    expect(r.getPathname()).toBe('/')
  })

  test('single sign-on comes back with a code, which signs the phone in', async () => {
    const r = await open()
    await fireEvent.press(screen.getByRole('button', { name: /^Harbor/ }))
    await flush()
    await fireEvent.press(screen.getByRole('button', { name: 'Sign in with Authentik' }))
    await flush()
    expect(r.getPathname()).toBe('/')
    expect(store().tokens.size).toBe(1)
  })

  test('a token the server refuses is dropped, and the sign-in opens', async () => {
    const first = await signedIn()
    expect(first.getPathname()).toBe('/')
    await cleanup()
    // the server no longer knows this device: its session answers 401
    rewrite((url, init) => {
      if (!url.includes('/api/v1/auth/session')) return
      const headers = new Headers(init.headers)
      headers.delete('authorization')
      return [url, { ...init, headers }]
    })
    const r = await open()
    expect(r.getPathname()).toBe('/sign-in')
    expect(store().tokens.size).toBe(0)
  })

  test('a server that doesn’t answer opens the shell on Unreachable, with Try again', async () => {
    await signedIn()
    await cleanup()
    server().setState({ connection: 'offline' })
    await open()
    expect(screen.getByText('Can’t reach Harbor')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Forget this server' })).toBeTruthy()
    server().setState({ connection: 'local' })
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }))
    await flush(2000)
    expect(screen.queryByText('Can’t reach Harbor')).toBeNull()
  })

  test('forgetting a server from its sign-in asks first, then lists it no more', async () => {
    const r = await open()
    await fireEvent.press(screen.getByRole('button', { name: /^Harbor/ }))
    await flush()
    await fireEvent.press(screen.getByRole('button', { name: 'Forget this server' }))
    await flush()
    await fireEvent.press(screen.getByRole('button', { name: 'Forget Harbor' }))
    await flush()
    expect(r.getPathname()).toBe('/connect')
    expect(screen.queryByText('Your servers')).toBeNull()
  })
})

describe('Settings on the phone', () => {
  test('You is Settings, with every section', async () => {
    const r = await signedIn()
    await settings()
    expect(r.getPathname()).toBe('/settings')
    expect(screen.getByRole('header', { name: 'Settings' })).toBeTruthy()
    for (const name of [
      'Theme',
      'Sounds',
      'Playback',
      'Home screen',
      'Servers',
      'Your devices',
      'About',
    ])
      expect(screen.getByRole('button', { name: new RegExp(`^${name},`) })).toBeTruthy()
  })

  test('a section opens on its own screen, and Back returns to the list', async () => {
    const r = await signedIn()
    await settings()
    await fireEvent.press(screen.getByRole('button', { name: /^About,/ }))
    await flush()
    expect(r.getSearchParams()).toEqual({ section: 'about' })
    expect(screen.getByRole('header', { name: 'About' })).toBeTruthy()
    // the prototype's two buttons that come later, and no Get the apps on a phone
    expect(screen.getByText('Open-source licences')).toBeTruthy()
    expect(screen.getByText('Send diagnostics')).toBeTruthy()
    expect(screen.queryByText('Get the apps')).toBeNull()
    expect(screen.queryByText('Source code')).toBeNull()
    await fireEvent.press(screen.getByRole('button', { name: 'Settings' }))
    await flush()
    expect(screen.getByRole('header', { name: 'Settings' })).toBeTruthy()
  })

  test('Servers offers Sign in a TV on the phone', async () => {
    await signedIn()
    await settings()
    await fireEvent.press(screen.getByRole('button', { name: /^Servers,/ }))
    await flush()
    expect(screen.getByRole('button', { name: 'Sign in a TV' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Add a server' })).toBeTruthy()
  })

  test('signing out asks first, in the prototype’s words, then opens the sign-in', async () => {
    const r = await signedIn()
    await settings()
    await fireEvent.press(screen.getByRole('button', { name: /^Sign out of Harbor/ }))
    await flush()
    expect(r.getPathname()).toBe('/settings')
    expect(
      screen.getByText('Your downloads stay on this phone. You can sign in again later.'),
    ).toBeTruthy()
    await fireEvent.press(screen.getByRole('button', { name: 'Sign out' }))
    await flush()
    expect(r.getPathname()).toBe('/sign-in')
    // the toast's words, on the screen that follows (client-settings.md › Stage 4)
    expect(screen.getByText('Signed out of Harbor')).toBeTruthy()
    expect(screen.getByText('Your downloads stay on this device.')).toBeTruthy()
    await flush(7000)
    expect(screen.queryByText('Signed out of Harbor')).toBeNull()
  })
})
