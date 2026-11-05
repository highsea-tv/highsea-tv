// SPDX-License-Identifier: AGPL-3.0-only
// The gate over the web's store (packages/native/src/server-store.web.ts), which signs requests
// with the session cookie when it keeps no token: every server is signed in until its session says
// otherwise, so the gate asks it, and a 401 is the sign-in, once, with no loop. A sign-in that names
// a device (the mock's phone and TV frames) keeps its device token, so its requests carry it and a
// reopen opens signed in. The phone's frame here; ./web-store-tv.jest.tsx pairs the TV's.
import { cleanup, fireEvent, screen } from '@testing-library/react-native'
import { flush, fresh, open, sent, store, type } from './mock.ts'

jest.mock('../src/transport.ts', () => require('./mock.ts').transportModule())
jest.mock(
  require('node:path').resolve(__dirname, '../../../packages/native/src/discovery.ts'),
  () => ({ browse: () => () => {} }),
)
// the web's store: the cookie on, tokens kept only when a sign-in sends one
jest.mock(
  require('node:path').resolve(__dirname, '../../../packages/native/src/server-store.ts'),
  () => require('./mock.ts').serverStore(true),
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
})

describe('the gate over the cookie', () => {
  test('a server with no session opens its sign-in once, and stays there', async () => {
    const r = await open()
    await fireEvent.press(screen.getByRole('button', { name: /^Harbor/ }))
    await flush(10_000)
    expect(r.getPathname()).toBe('/sign-in')
    expect(screen.getByLabelText('Username')).toBeTruthy()
    // asked once, refused, and not asked again in a loop
    expect(sent('/api/v1/auth/session').length).toBeLessThanOrEqual(2)
  })

  test('signing in keeps the device token, sends it, and a reopen opens signed in', async () => {
    const r = await open()
    await fireEvent.press(screen.getByRole('button', { name: /^Harbor/ }))
    await flush()
    await type({ Username: 'ruth', Password: 'x' })
    const before = sent('/api/v1/auth/session').length
    await fireEvent.press(screen.getByRole('button', { name: 'Sign in' }))
    await flush(10_000)
    expect(r.getPathname()).toBe('/')
    expect(store().tokens.size).toBe(1)
    const after = sent('/api/v1/auth/session').slice(before)
    expect(after.length).toBeGreaterThan(0)
    expect(after.length).toBeLessThanOrEqual(2)
    expect(after.every((q) => q.bearer)).toBe(true)
    await cleanup()
    const again = await open()
    expect(again.getPathname()).toBe('/')
  })
})
