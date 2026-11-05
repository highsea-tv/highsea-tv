// SPDX-License-Identifier: AGPL-3.0-only
// Choose a server in a real build, not mock mode, so nearby servers come from Bonjour
// (packages/native/src/discovery.ts, mocked here as the native module would answer): when browsing
// fails, the list settles at once with nothing found and says how to add one by address, rather
// than looking for the full settling time.
import { cleanup, screen } from '@testing-library/react-native'
import { renderRouter } from 'expo-router/testing-library'
import { APP, flush, fresh } from './mock.ts'

jest.mock('../src/transport.ts', () => ({ mock: undefined, transport: undefined }))
// Bonjour gives up as it starts, as it does when the network can't be browsed
jest.mock(
  require('node:path').resolve(__dirname, '../../../packages/native/src/discovery.ts'),
  () => ({
    browse: (on: { state: (s: { state: string }) => void }) => {
      const t = setTimeout(() => on.state({ state: 'failed' }), 0)
      return () => clearTimeout(t)
    },
  }),
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
})

test('discovery that fails settles at once, with nothing found and the way to add one', async () => {
  const r = await renderRouter(APP, { initialUrl: '/' })
  // well inside the 4 seconds a search is given to settle
  await flush(500)
  expect(r.getPathname()).toBe('/connect')
  expect(screen.queryByText('Looking…')).toBeNull()
  expect(
    screen.getByText(
      'No servers answered. They may be on another network, or discovery may be off: add one by address.',
    ),
  ).toBeTruthy()
})
