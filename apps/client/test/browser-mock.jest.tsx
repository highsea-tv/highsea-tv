// SPDX-License-Identifier: AGPL-3.0-only
// A plain browser in mock mode, as the prototypes and the sweeps open the web export: no home
// server, so it starts at Choose a server, and it signs in to Harbor at Harbor's own address with the
// session cookie, over the web's real store (packages/native/src/server-store.web.ts). The cookie
// goes with every request (the SDK's `credentials: 'include'`, which the mock honours as Fetch does),
// so the sign-in sticks: the server in use is asked for its session whenever no token is kept.
import { cleanup, fireEvent, screen } from '@testing-library/react-native'
import { flush, fresh, open, sent, type } from './mock.ts'

jest.mock('../src/form-factor', () => ({ formFactorOverride: () => 'regular-pointer' }))
jest.mock('../src/transport.ts', () => require('./mock.ts').transportModule())
// the web's host in mock mode with a browser's frame: no device named, no list of servers kept
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
jest.mock(
  require('node:path').resolve(__dirname, '../../../packages/native/src/server-store.ts'),
  () =>
    jest.requireActual(
      require('node:path').resolve(__dirname, '../../../packages/native/src/server-store.web.ts'),
    ),
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

const g = globalThis as { localStorage?: Storage }

beforeEach(() => {
  fresh()
  g.localStorage = memoryStorage()
})
afterEach(async () => {
  await cleanup()
})
afterAll(() => {
  delete g.localStorage
})

test('a browser signs in to a server by its cookie, and the sign-in sticks', async () => {
  const r = await open()
  expect(r.getPathname()).toBe('/connect')
  await fireEvent.press(screen.getByRole('button', { name: /^Harbor/ }))
  await flush()
  expect(r.getPathname()).toBe('/sign-in')
  await type({ Username: 'ruth', Password: 'x' })
  await fireEvent.press(screen.getByRole('button', { name: 'Sign in' }))
  await flush(2000)
  expect(r.getPathname()).toBe('/')
  expect(screen.queryByLabelText('Username')).toBeNull()
  // no device token: the session was asked by the cookie alone
  expect(sent('/api/v1/auth/session').at(-1)?.bearer).toBe(false)
  expect(
    Object.keys(
      Object.fromEntries([...Array(localStorage.length)].map((_, i) => [localStorage.key(i), 1])),
    ),
  ).not.toContain('highsea.session.srv-harbor')
  // and a reload opens signed in, on the cookie it still has
  await cleanup()
  const again = await open()
  expect(again.getPathname()).toBe('/')
})
