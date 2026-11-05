// SPDX-License-Identifier: AGPL-3.0-only
// The TV's frame over the web's store (packages/native/src/server-store.web.ts), as
// ./web-store.jest.tsx runs the phone's: a TV with no session opens on its code, and once the phone
// approves it, the device token is kept and sent, so it opens the head and doesn't pair again.
import { cleanup, fireEvent, screen } from '@testing-library/react-native'
import { flush, fresh, open, sent, store } from './mock.ts'

jest.mock('../src/form-factor', () => ({ formFactorOverride: () => 'tv' }))
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
jest.mock('react-native-gesture-handler/ReanimatedSwipeable', () =>
  require('./mock.ts').swipeable(),
)
require('react-native-gesture-handler/jestSetup')

beforeEach(fresh)
afterEach(async () => {
  await cleanup()
})

test('a TV over the cookie pairs once, keeps its token and opens the head', async () => {
  const r = await open()
  await fireEvent.press(screen.getByLabelText(/^Harbor,/))
  await flush()
  expect(r.getPathname()).toBe('/sign-in')
  expect(screen.getByRole('header', { name: 'Sign in with your phone' })).toBeTruthy()
  // the mock approves the code after 8 seconds
  await flush(20_000)
  expect(r.getPathname()).toBe('/')
  expect(store().tokens.size).toBe(1)
  // one code, and the head's session asked with the token, not sent back to pairing
  const pairings = sent('/api/v1/auth/pairing').filter(
    (q) => q.method === 'POST' && !q.url.includes('poll'),
  )
  expect(pairings.length).toBe(1)
  const sessions = sent('/api/v1/auth/session')
  expect(sessions.at(-1)?.bearer).toBe(true)
  await flush(20_000)
  expect(r.getPathname()).toBe('/')
  expect(sent('/api/v1/auth/pairing').filter((q) => !q.url.includes('poll')).length).toBe(1)
})
