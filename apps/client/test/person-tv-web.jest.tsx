// SPDX-License-Identifier: AGPL-3.0-only
// A person's page on the TV in a browser (the web export at the TV's form factor): it opens with
// its header in view, the first row asking the web's focus engine to land it 0.72 of the way down
// the screen (the TV prototype's data-keep on tv/person.tsx's first row) rather than at the page's
// keep, and its blurred backdrop clipped to the screen so the document is no wider than it. The
// preset is iOS's, so only Kept's marks are the web engine's (engine.web.tsx's keptProps).
import { SEED } from '@highsea-tv/mock/films'
import { act, cleanup, screen } from '@testing-library/react-native'
import { router } from 'expo-router'
import { StyleSheet } from 'react-native'
import { acknowledge, flush, fresh, tvSignedIn } from './mock.ts'

jest.mock('../src/form-factor', () => ({ formFactorOverride: () => 'tv' }))
jest.mock('../src/transport.ts', () => require('./mock.ts').transportModule())
jest.mock(
  require('node:path').resolve(__dirname, '../../../packages/ui/src/native/tv/engine.tsx'),
  () => {
    const tv = require('node:path').resolve(__dirname, '../../../packages/ui/src/native/tv')
    return {
      ...jest.requireActual(`${tv}/engine.tsx`),
      keptProps: jest.requireActual(`${tv}/engine.web.tsx`).keptProps,
    }
  },
)
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
jest.mock('react-native-gesture-handler/ReanimatedSwipeable', () =>
  require('./mock.ts').swipeable(),
)
require('react-native-gesture-handler/jestSetup')

jest.setTimeout(30_000)

beforeEach(fresh)
afterEach(async () => {
  await cleanup()
})

type Json = { props?: Record<string, unknown>; children?: unknown }
type Node = { props: Record<string, unknown>; parent: Node | null }

/** The nearest Kept part around a node, by the web engine's mark. */
function keptAround(node: Node) {
  for (let at: Node | null = node; at; at = at.parent) {
    const set = at.props.dataSet as Record<string, string> | undefined
    if (set?.kept) return set
  }
  return null
}

/** The style of the layer around each blurred image: the first that lets presses through. */
function blurredLayers(tree: unknown) {
  const layers: unknown[] = []
  const walk = (node: unknown, around: Json[]) => {
    if (!node || typeof node !== 'object') return
    if (Array.isArray(node)) {
      for (const n of node) walk(n, around)
      return
    }
    const n = node as Json
    if (n.props?.blurRadius !== undefined) {
      const layer = [...around].reverse().find((a) => a.props?.pointerEvents === 'none')
      layers.push(StyleSheet.flatten(layer?.props?.style as never))
    }
    walk(n.children, [...around, n])
  }
  walk(tree, [])
  return layers
}

test('the first row lands under the header, and the backdrop stays inside the screen', async () => {
  await tvSignedIn()
  await acknowledge()
  await act(() => router.navigate(`/people/${SEED.person.id}` as never))
  await flush(500)
  const name = screen.getByRole('header', { name: 'Buster Keaton' })
  // the header rests the page at its top, and the first row lands at its own keep, not the page's
  expect(keptAround(name as never)).toEqual({ kept: 'rest' })
  const first = screen
    .getAllByLabelText(/^(The General|Sherlock Jr\.),/)
    .find((n) => n.props.hasTVPreferredFocus === true)
  expect(first).toBeTruthy()
  expect(keptAround(first as never)).toEqual({ kept: 'center', keep: '0.72' })
  // the ambient art, drawn larger than the screen, is clipped to it
  const layers = blurredLayers(screen.toJSON())
  expect(layers.length).toBeGreaterThan(0)
  for (const style of layers) expect(style).toMatchObject({ overflow: 'hidden' })
})
