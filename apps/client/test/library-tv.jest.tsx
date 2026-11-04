// SPDX-License-Identifier: AGPL-3.0-only
// Movies and Collections at the TV's rule (src/library/), as ./tv.jest.tsx runs the gate: the
// first load gives the grid's first title focus, and once a person has moved, a sort, a filter or a
// genre picked keeps focus where it is (the owner's rule for the TV's library pages). Show
// everything starts the page over, so the grid takes focus again. Each test from a mock server and
// a store of its own (./mock.ts): no network.
import { genresOf } from '@highsea-tv/client/library'
import { SEED } from '@highsea-tv/mock/films'
import { focusedPlay } from '@highsea-tv/ui/tv'
import { act, cleanup, fireEvent, screen } from '@testing-library/react-native'
import { router } from 'expo-router'
import { BackHandler } from 'react-native'
import { acknowledge, flush, fresh, open, rewrite, server } from './mock.ts'

jest.mock('../src/form-factor', () => ({ formFactorOverride: () => 'tv' }))
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
jest.mock('react-native-gesture-handler/ReanimatedSwipeable', () =>
  require('./mock.ts').swipeable(),
)
require('react-native-gesture-handler/jestSetup')
// the stops the pages hand the head for Down (kit's useHeadDown), render by render
const mockHeadDown: unknown[] = []
jest.mock('../src/kit.tsx', () => {
  const actual = jest.requireActual('../src/kit.tsx')
  return {
    ...actual,
    useHeadDown: (stop: unknown) => {
      mockHeadDown.push(stop)
      return actual.useHeadDown(stop)
    },
  }
})
// where the pages send focus themselves
const mockFocused: unknown[] = []
jest.mock('@highsea-tv/ui/tv', () => {
  const actual = jest.requireActual('@highsea-tv/ui/tv')
  return {
    ...actual,
    focusOn: (h: unknown) => {
      mockFocused.push(h)
      actual.focusOn(h)
    },
  }
})

beforeEach(() => {
  fresh()
  mockHeadDown.length = 0
  mockFocused.length = 0
})

/** Sends requests whose address matches `path` nowhere: the server answers an error. */
const refuse = (path: RegExp) =>
  rewrite((url, init) =>
    path.test(url) ? [url.replace(path, '/api/v1/nowhere'), init] : undefined,
  )

/** The lowest view holding both nodes: two posters' row. */
function rowOf(a: unknown, b: unknown) {
  type N = { parent: N | null; children: unknown[] }
  const up = new Set<N>()
  for (let n = a as N | null; n; n = n.parent) up.add(n)
  for (let n = b as N | null; n; n = n.parent) if (up.has(n)) return n
  return null
}
afterEach(cleanup)

/** Opens the app, chooses Harbor, waits for the phone's approval, then opens the path given. */
async function at(path: string) {
  const r = await open()
  await fireEvent.press(screen.getByLabelText(/^Harbor,/))
  await flush(20_000)
  await acknowledge()
  await act(() => router.navigate(path as never))
  await flush(500)
  return r
}

/** The stops that take TV focus, by their label. */
const stops = () =>
  screen
    .queryAllByLabelText(/./)
    .filter((n) => 'hasTVPreferredFocus' in n.props)
    .map((n) => ({ node: n, label: String(n.props.accessibilityLabel), props: n.props }))

/** The grid's titles, "Sintel, 2010", and which of them would take focus. */
const tiles = () => stops().filter((s) => /, \d{4}$/.test(s.label))
const preferred = () => tiles().filter((s) => s.props.hasTVPreferredFocus === true)

describe('Movies on the TV', () => {
  test('the first load gives the first title focus', async () => {
    const r = await at('/movies')
    expect(r.getPathname()).toBe('/movies')
    expect(screen.getByRole('header', { name: 'Movies' })).toBeTruthy()
    expect(tiles().length).toBeGreaterThan(1)
    expect(preferred().map((s) => s.label)).toEqual([tiles()[0]?.label])
  })

  test('a sort picked keeps focus on it, and Show everything gives the grid focus again', async () => {
    await at('/movies')
    const first = tiles()[0]
    if (!first) throw new Error('no titles')
    // the person arrives in the grid, then goes up to the sorts
    await fireEvent(first.node, 'focus')
    await flush()
    await fireEvent.press(screen.getByRole('togglebutton', { name: 'Newest' }))
    await flush()
    expect(preferred()).toEqual([])
    await fireEvent.press(screen.getByRole('togglebutton', { name: 'Unwatched' }))
    await flush()
    expect(preferred()).toEqual([])
  })

  test('a genre picked closes the genres and keeps focus off the grid', async () => {
    await at('/movies')
    const first = tiles()[0]
    if (!first) throw new Error('no titles')
    await fireEvent(first.node, 'focus')
    await flush()
    await fireEvent.press(screen.getByLabelText('Genre: All genres'))
    await flush()
    const genre = genresOf(server().mock.servers.populated.state.items as never)[0]
    if (!genre) throw new Error('no genre')
    const before = tiles().length
    await fireEvent.press(screen.getAllByRole('button', { name: genre }).at(-1) as never)
    await flush()
    expect(screen.getByLabelText(`Genre: ${genre}`)).toBeTruthy()
    expect(tiles().length).toBeLessThanOrEqual(before)
    expect(preferred()).toEqual([])
  })

  test('Back with the genres open closes them and stays on Movies', async () => {
    jest.spyOn(BackHandler, 'addEventListener')
    const r = await at('/movies')
    await fireEvent.press(screen.getByLabelText('Genre: All genres'))
    await flush()
    expect(screen.getByRole('header', { name: 'Genre' })).toBeTruthy()
    // the remote's Back, as react-native-tvos hands it to BackHandler's listeners
    const back = jest.mocked(BackHandler.addEventListener).mock.calls.at(-1)?.[1] as
      | (() => boolean | null | undefined)
      | undefined
    await act(() => void back?.())
    await flush()
    expect(screen.queryByRole('header', { name: 'Genre' })).toBeNull()
    expect(r.getPathname()).toBe('/movies')
  })

  test('Play/Pause on a focused title plays it', async () => {
    const r = await at('/movies')
    const first = tiles()[0]
    if (!first) throw new Error('no titles')
    await fireEvent(first.node, 'focus')
    await flush()
    await act(() => void focusedPlay.current?.())
    await flush()
    expect(r.getPathname()).toMatch(/^\/play\//)
  })

  test('an empty library says so, and focus goes to the head', async () => {
    server().setState({ data: 'empty' })
    await at('/movies')
    expect(screen.getByText('No movies yet')).toBeTruthy()
    expect(tiles()).toEqual([])
    // the head's goal (kit's HeadGoal), the page having no stop of its own; no sorts for Down
    expect(mockFocused.length).toBeGreaterThan(0)
    expect(mockHeadDown.at(-1)).toBeNull()
  })

  test('Down from the head lands on the sorts', async () => {
    await at('/movies')
    const stop = mockHeadDown.at(-1) as { props?: { accessibilityLabel?: string } } | null
    expect(stop).toBeTruthy()
    // the first sort's handle, not a poster's
    expect(screen.getByRole('togglebutton', { name: 'A–Z' })).toBeTruthy()
    expect(tiles().some((t) => t.node === stop)).toBe(false)
  })

  test('the grid is seven posters a row', async () => {
    await at('/movies')
    const t = tiles()
    expect(t.length).toBeGreaterThan(7)
    const row = rowOf(t[0]?.node, t[6]?.node) as { children: unknown[] } | null
    expect(row?.children).toHaveLength(7)
    expect(rowOf(t[0]?.node, t[7]?.node)).not.toBe(row)
  })

  test('a library that can’t load says so, with Try again', async () => {
    refuse(/\/api\/v1\/items(?=\?|$)/)
    await at('/movies')
    expect(screen.getByText('Couldn’t load the library')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy()
  })
})

test('with everything watched, Unwatched offers Show everything, which gives the grid focus again', async () => {
  // every film watched to its end, for everyone, as the mock's Mark as watched leaves it
  const state = server().mock.servers.populated.state
  const users = [...new Set(state.watch.map((w) => w.userId))]
  for (const userId of users)
    for (const m of state.items) {
      state.watch = state.watch.filter((w) => !(w.userId === userId && w.itemId === m.id))
      state.watch.push({
        userId,
        itemId: m.id,
        position: m.runtimeMinutes * 60,
        updatedAt: new Date().toISOString(),
      })
    }
  await at('/movies')
  const first = tiles()[0]
  if (!first) throw new Error('no titles')
  await fireEvent(first.node, 'focus')
  await flush()
  await fireEvent.press(screen.getByRole('togglebutton', { name: 'Unwatched' }))
  await flush()
  expect(tiles()).toEqual([])
  expect(screen.getByText('Nothing matches')).toBeTruthy()
  await fireEvent.press(screen.getByRole('button', { name: 'Show everything' }))
  await flush()
  expect(preferred().map((s) => s.label)).toEqual([tiles()[0]?.label])
})

describe('Collections on the TV', () => {
  test('the first collection takes focus, and Audio says there are none', async () => {
    await at('/collections')
    expect(screen.getByRole('header', { name: 'Collections' })).toBeTruthy()
    const first = stops().find((s) => s.props.hasTVPreferredFocus === true)
    expect(first?.label).toBeTruthy()
    if (!first) return
    await fireEvent(first.node, 'focus')
    await flush()
    await fireEvent.press(screen.getByRole('togglebutton', { name: 'Audio' }))
    await flush()
    expect(stops().filter((s) => s.props.hasTVPreferredFocus === true)).toEqual([])
    expect(screen.getByText(/^No audio collections yet/)).toBeTruthy()
  })
})

describe('Collections on the TV, Down and errors', () => {
  test('Down from the head lands on the kinds', async () => {
    await at('/collections')
    expect(mockHeadDown.at(-1)).toBeTruthy()
  })

  test('collections that can’t load say so', async () => {
    refuse(/\/api\/v1\/library\/collections(?=\?|$)/)
    await at('/collections')
    expect(screen.getByText('Couldn’t load the collections')).toBeTruthy()
  })
})

describe('a collection on the TV', () => {
  test('Down from the head lands on its films', async () => {
    await at(`/collections/${SEED.collection.id}`)
    expect(mockHeadDown.at(-1)).toBeTruthy()
  })

  test('its page names it and lists its films, the first focused', async () => {
    const r = await at(`/collections/${SEED.collection.id}`)
    expect(r.getPathname()).toBe(`/collections/${SEED.collection.id}`)
    expect(screen.getByRole('header', { name: SEED.collection.name })).toBeTruthy()
    expect(stops().some((s) => s.props.hasTVPreferredFocus === true)).toBe(true)
  })
})
