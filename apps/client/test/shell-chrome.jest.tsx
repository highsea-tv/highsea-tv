// SPDX-License-Identifier: AGPL-3.0-only
// The chrome over a page that lays it over itself (kit's useChromeOverlay), on a route of the
// test's own laid over the real app directory (Expo Router's `overrides`): on the TV the head
// scrolls away with the page, as tv/kit.tsx's TvHead does, and never below its place; with a
// pointer the top bar stays, clear until the page scrolls under it and then glass with its line, as
// web/shell.tsx's TopBar does. From the mock server (./mock.ts): no network.
import { act, cleanup, fireEvent, screen } from '@testing-library/react-native'
import { router } from 'expo-router'
import { renderRouter } from 'expo-router/testing-library'
import { ScrollView, StyleSheet, View } from 'react-native'
import { useChromeOverlay } from '../src/kit.tsx'
import { APP, acknowledge, flush, fresh, type } from './mock.ts'

jest.mock('../src/form-factor', () => ({
  formFactorOverride: () => (globalThis as { __formFactor?: string }).__formFactor ?? 'tv',
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

jest.setTimeout(40_000)
beforeEach(fresh)
afterEach(async () => {
  await cleanup()
  delete (globalThis as { __formFactor?: string }).__formFactor
})

/** A page with art under the chrome, as a film's page has. */
function Under() {
  const chrome = useChromeOverlay()
  return (
    <ScrollView {...chrome} accessibilityLabel="The page">
      <View style={{ height: 2000 }} />
    </ScrollView>
  )
}

/** Signs in at the form factor given, acknowledges the owner's announcement, and opens the page. */
async function under(formFactor: 'tv' | 'regular-pointer') {
  ;(globalThis as { __formFactor?: string }).__formFactor = formFactor
  await renderRouter(
    { appDir: APP, overrides: { '(in)/under-chrome': Under } },
    { initialUrl: '/' },
  )
  await flush(5000)
  if (formFactor === 'tv') {
    await fireEvent.press(screen.getByLabelText(/^Harbor,/))
    await flush(20_000)
  } else {
    await fireEvent.press(screen.getByRole('button', { name: /^Harbor/ }))
    await flush()
    await type({ Username: 'ruth', Password: 'x' })
    await fireEvent.press(screen.getByRole('button', { name: 'Sign in' }))
    await flush()
  }
  await acknowledge()
  await act(() => router.navigate('/under-chrome' as never))
  await flush(500)
}

const scrollTo = async (y: number) => {
  await fireEvent.scroll(screen.getByLabelText('The page'), {
    nativeEvent: {
      contentOffset: { x: 0, y },
      contentSize: { width: 1000, height: 2000 },
      layoutMeasurement: { width: 1000, height: 600 },
    },
  })
  await flush(100)
}

type Node = { parent: Node | null; props: { style?: unknown } }

/** The nearest node at or above `node` whose flattened style passes `test`. */
function above(node: Node, test: (style: Record<string, unknown>) => boolean) {
  for (let n: Node | null = node; n; n = n.parent) {
    const style = StyleSheet.flatten(n.props.style as never) as Record<string, unknown> | undefined
    if (style && test(style)) return style
  }
  throw new Error('No node above has that style')
}

/** How far the TV's head has moved down: negative once it's gone up with the page. */
const headY = () => {
  const style = above(screen.getByLabelText('Main') as never, (s) => Array.isArray(s.transform))
  const t = (style.transform as { translateY?: number }[]).find((x) => 'translateY' in x)
  return Number(t?.translateY)
}

/** The top bar's own style: the row that holds the bell, with its line under it. */
const bar = () =>
  above(screen.getByRole('button', { name: /^Alerts/ }) as never, (s) => 'borderBottomColor' in s)

describe('the chrome over a page', () => {
  test('on the TV, the head scrolls away with the page, and never below its place', async () => {
    await under('tv')
    expect(headY()).toBe(0)
    await scrollTo(120)
    expect(headY()).toBe(-120)
    await scrollTo(-40)
    expect(headY()).toBe(0)
  })

  test('with a pointer, the top bar stays, clear until the page scrolls under it, then glass', async () => {
    await under('regular-pointer')
    expect(bar().borderBottomColor).toBe('transparent')
    expect(String(bar().backgroundImage)).toMatch(/^linear-gradient/)
    // laid from the border's edge, so the gradient's solid start isn't drawn again in the line
    expect((bar() as { backgroundOrigin?: string }).backgroundOrigin).toBe('border-box')
    await scrollTo(120)
    expect(bar().borderBottomColor).not.toBe('transparent')
    expect(bar().backgroundImage).toBeUndefined()
    expect(bar().backgroundColor).not.toBe('transparent')
    await scrollTo(0)
    expect(bar().borderBottomColor).toBe('transparent')
  })
})
