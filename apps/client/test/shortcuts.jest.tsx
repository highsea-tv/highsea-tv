// SPDX-License-Identifier: AGPL-3.0-only
// The pointer's shortcuts (src/shell/shortcuts.tsx; desktop-web.md › Keyboard): `/` opens Search
// and `?` lists the shortcuts in the library's Dialog, closed by Close, while neither fires from a
// field or with ⌘ held. The preset is iOS's, whose page-keys side listens to nothing, so the web's
// listener is stood in for by one that keeps the handler for the test to press keys on.
import { act, cleanup, fireEvent, screen } from '@testing-library/react-native'
import { acknowledge, flush, fresh, signedIn } from './mock.ts'

jest.mock('../src/form-factor', () => ({ formFactorOverride: () => 'regular-pointer' }))
jest.mock('../src/shell/page-keys', () => ({
  usePageKeys: (onKey: (e: KeyboardEvent) => void) => {
    ;(globalThis as { __pageKeys?: typeof onKey }).__pageKeys = onKey
  },
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

beforeEach(fresh)
afterEach(cleanup)

/** Presses a key in the page, as the document's keydown hands it over. */
async function press(key: string, over: { metaKey?: boolean; target?: unknown } = {}) {
  const e = {
    key,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    isComposing: false,
    defaultPrevented: false,
    target: null,
    preventDefault: jest.fn(),
    ...over,
  }
  const onKey = (globalThis as { __pageKeys?: (e: unknown) => void }).__pageKeys
  if (!onKey) throw new Error('nothing listens to the page’s keys')
  await act(async () => onKey(e))
  await flush()
  return e
}

/** A field's element, as the event's target: `closest` finds the input it's in. */
const field = { closest: (s: string) => (s.includes('input') ? {} : null) }

describe('the pointer’s shortcuts', () => {
  test('/ opens Search, and isn’t typed', async () => {
    const r = await signedIn()
    await acknowledge()
    expect(r.getPathname()).toBe('/')
    const e = await press('/')
    expect(e.preventDefault).toHaveBeenCalled()
    expect(r.getPathname()).toBe('/search')
  })

  test('? lists the shortcuts in a dialog, which Close closes', async () => {
    await signedIn()
    await acknowledge()
    expect(screen.queryByText('Keyboard shortcuts')).toBeNull()
    await press('?')
    expect(screen.getByText('Keyboard shortcuts')).toBeTruthy()
    expect(screen.getByLabelText('Slash: Search')).toBeTruthy()
    expect(screen.getByLabelText('Question mark: These shortcuts')).toBeTruthy()
    expect(screen.getByLabelText('Space: Play or pause')).toBeTruthy()
    expect(screen.getByLabelText('Left or right arrow: Back or forward 10 seconds')).toBeTruthy()
    await fireEvent.press(screen.getByRole('button', { name: 'Close' }))
    await flush(500)
    expect(screen.queryByText('Keyboard shortcuts')).toBeNull()
  })

  test('neither fires from a field or with ⌘ held', async () => {
    const r = await signedIn()
    await acknowledge()
    await press('/', { target: field })
    await press('/', { metaKey: true })
    await press('?', { target: field })
    expect(r.getPathname()).toBe('/')
    expect(screen.queryByText('Keyboard shortcuts')).toBeNull()
  })
})
