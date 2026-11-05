// SPDX-License-Identifier: AGPL-3.0-only
// The phone's header (kit's TouchHeader, the prototype's mobile/shell.tsx header) on two routes of
// the test's own laid over the real app directory (Expo Router's `overrides`), since no
// destination draws it yet: with a title, the title and the avatar; without one, the server
// switcher, whose Servers sheet lists the servers this phone knows and adds another. From the mock
// server (./mock.ts): no network.
import { act, cleanup, fireEvent, screen } from '@testing-library/react-native'
import { router } from 'expo-router'
import { renderRouter } from 'expo-router/testing-library'
import { TouchHeader } from '../src/kit.tsx'
import { acknowledge, appWith, flush, fresh, type } from './mock.ts'

jest.mock('../src/form-factor', () => ({ formFactorOverride: () => 'compact-touch' }))
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

beforeEach(fresh)
afterEach(cleanup)

/** Signs in as ruth, acknowledges the owner's announcement, and opens the route given. */
async function at(path: string) {
  const r = await renderRouter(
    appWith({
      '(in)/header-titled': () => <TouchHeader title="Library" />,
      '(in)/header-server': () => <TouchHeader />,
    }),
    { initialUrl: '/' },
  )
  await flush(5000)
  await fireEvent.press(screen.getByRole('button', { name: /^Harbor/ }))
  await flush()
  await type({ Username: 'ruth', Password: 'x' })
  await fireEvent.press(screen.getByRole('button', { name: 'Sign in' }))
  await flush()
  await acknowledge()
  await act(() => router.navigate(path as never))
  await flush(500)
  return r
}

describe('the phone’s header', () => {
  test('with a title, the title and the avatar going to You', async () => {
    const r = await at('/header-titled')
    expect(screen.getByRole('header', { name: 'Library' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /switch server/ })).toBeNull()
    await fireEvent.press(screen.getByRole('link', { name: /, settings$/ }))
    await flush()
    expect(r.getPathname()).toBe('/settings')
  })

  test('without one, the server switcher, whose sheet lists the servers and adds another', async () => {
    const r = await at('/header-server')
    await fireEvent.press(screen.getByRole('button', { name: 'Harbor, switch server' }))
    await flush()
    expect(screen.getByRole('header', { name: 'Servers' })).toBeTruthy()
    expect(screen.getByText('On this network')).toBeTruthy()
    await fireEvent.press(screen.getByRole('button', { name: 'Add a server' }))
    await flush()
    expect(r.getPathname()).toBe('/connect')
  })
})
