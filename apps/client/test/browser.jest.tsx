// SPDX-License-Identifier: AGPL-3.0-only
// The client as a browser at its own server runs it, not in mock mode: the web's host (the page's
// own server at '', no device named, no list of servers kept), the web's real store
// (packages/native/src/server-store.web.ts over a localStorage of the test's own) and the
// platform's fetch, which the mock server answers as the page's own origin, with its session
// cookie. A valid cookie opens signed in, the server can't be switched or forgotten, a sign-out the
// server refuses says so, a server that doesn't answer is still the one in use, and a browser
// drawn for the TV signs in with a password.
import { act, cleanup, fireEvent, screen } from '@testing-library/react-native'
import { router } from 'expo-router'
import { flush, fresh, open, rewrite, type } from './mock.ts'

const g = globalThis as unknown as {
  __formFactor?: string
  localStorage?: Storage
}

jest.mock('../src/form-factor', () => ({
  formFactorOverride: () => (globalThis as { __formFactor?: string }).__formFactor,
}))
// a real build: no mock mode, so requests go through the store's platformFetch (globalThis.fetch)
jest.mock('../src/transport.ts', () => ({ mock: undefined, transport: undefined }))
// the web's host (./src/host.web.ts outside mock mode and outside the desktop app)
jest.mock('../src/host', () => ({
  HOME_SERVER: '',
  useDevice: () => 'web',
  useDeviceClient: () => 'web',
  useDeviceInput: () => () => undefined,
  useKeepsServers: () => false,
  useDesktopOs: () => undefined,
}))
jest.mock(
  require('node:path').resolve(__dirname, '../../../packages/native/src/discovery.ts'),
  () => ({ browse: () => () => {} }),
)
// the web's own store, as the browser bundles it, with its fetch (the page's globalThis.fetch,
// which Expo replaces with its own as its modules load) the test's
jest.mock(
  require('node:path').resolve(__dirname, '../../../packages/native/src/server-store.ts'),
  () => ({
    ...jest.requireActual(
      require('node:path').resolve(__dirname, '../../../packages/native/src/server-store.web.ts'),
    ),
    platformFetch: (input: string, init?: RequestInit) =>
      (globalThis as unknown as { __pageFetch: typeof fetch }).__pageFetch(input, init),
  }),
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

/** A localStorage that keeps what the page writes for the test's run. */
function memoryStorage(): Storage {
  const m = new Map<string, string>()
  return {
    get length() {
      return m.size
    },
    clear: () => m.clear(),
    getItem: (k) => m.get(k) ?? null,
    key: (i) => [...m.keys()][i] ?? null,
    removeItem: (k) => void m.delete(k),
    setItem: (k, v) => void m.set(k, String(v)),
  }
}

/** Puts a global in place for the test. */
const put = (name: 'location' | '__pageFetch', value: unknown) =>
  Object.defineProperty(globalThis, name, { value, configurable: true, writable: true })

const saved = {
  location: Object.getOwnPropertyDescriptor(globalThis, 'location'),
  __pageFetch: undefined,
}

beforeEach(() => {
  fresh()
  g.__formFactor = 'regular-pointer'
  g.localStorage = memoryStorage()
  put('location', { host: 'harbor.local:3000', origin: '', assign: jest.fn() })
  // the mock server as the page's own origin, through the test's rewrites
  put('__pageFetch', require('./mock.ts').transportModule().transport)
})
afterEach(async () => {
  await cleanup()
})
afterAll(() => {
  for (const [name, d] of Object.entries(saved)) {
    if (d) Object.defineProperty(globalThis, name, d)
    else delete (globalThis as Record<string, unknown>)[name]
  }
  delete g.localStorage
  delete g.__formFactor
})

/** Signs in with a password at the page's own server, which sets the session cookie. */
async function signIn() {
  const r = await open()
  expect(r.getPathname()).toBe('/sign-in')
  await type({ Username: 'ruth', Password: 'x' })
  await fireEvent.press(screen.getByRole('button', { name: 'Sign in' }))
  await flush()
  return r
}

describe('a browser at its own server', () => {
  test('a valid cookie opens signed in, and again after a reload', async () => {
    const r = await signIn()
    expect(r.getPathname()).toBe('/')
    // no device token: the cookie signs the requests
    expect(Object.keys(localStorage).filter((k) => k.startsWith('highsea.session.'))).toEqual([])
    expect([...Array(localStorage.length)].map((_, i) => localStorage.key(i))).toEqual([
      'highsea.servers',
    ])
    await cleanup()
    const again = await open()
    expect(again.getPathname()).toBe('/')
  })

  test('its one server: no Switch server, no Add a server, and Choose a server goes home', async () => {
    const r = await signIn()
    expect(screen.queryByRole('button', { name: /Switch server/ })).toBeNull()
    expect(screen.getByText('Harbor')).toBeTruthy()
    await act(() => router.push('/settings'))
    await flush()
    await fireEvent.press(screen.getByRole('button', { name: 'Servers' }))
    await flush()
    expect(screen.getByRole('button', { name: 'Sign out of Harbor' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Add a server' })).toBeNull()
    expect(screen.queryByRole('button', { name: /^Switch/ })).toBeNull()
    await act(() => router.push('/connect'))
    await flush()
    expect(r.getPathname()).toBe('/')
  })

  test('a sign-out the server refuses says so, and stays signed in', async () => {
    const r = await signIn()
    await act(() => router.push('/settings'))
    await flush()
    await fireEvent.press(screen.getByRole('button', { name: 'Servers' }))
    await flush()
    // the server answers the sign-out with an error, so its cookie may still be good
    rewrite((url, init) =>
      url.includes('/api/v1/auth/sign-out') ? ['/api/v1/nowhere', init] : undefined,
    )
    await fireEvent.press(screen.getByRole('button', { name: 'Sign out of Harbor' }))
    await flush()
    await fireEvent.press(screen.getByRole('button', { name: 'Sign out' }))
    await flush()
    expect(screen.getByText('Couldn’t sign out. Try again.')).toBeTruthy()
    expect(r.getPathname()).toBe('/settings')
    expect(screen.queryByLabelText('Username')).toBeNull()
  })

  test('a server that doesn’t answer at load is still the one in use, named by the address', async () => {
    put('__pageFetch', () => Promise.reject(new TypeError('Failed to fetch')))
    const r = await open()
    await flush(10_000)
    expect(r.getPathname()).not.toBe('/connect')
    expect(screen.getByText('Can’t reach harbor.local:3000')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy()
    // nothing kept, so the next load asks it again
    expect(localStorage.getItem('highsea.servers')).toBeNull()
  })

  test('drawn for the TV, it signs in with a password, with no code to offer', async () => {
    g.__formFactor = 'tv'
    const r = await open()
    expect(r.getPathname()).toBe('/sign-in')
    // the password form, its keys drawn for the remote
    expect(screen.getByText('Sign in to Harbor')).toBeTruthy()
    expect(screen.getByText('Password')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Use a code instead' })).toBeNull()
    expect(screen.queryByRole('header', { name: 'Sign in with your phone' })).toBeNull()
  })
})
