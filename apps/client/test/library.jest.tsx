// SPDX-License-Identifier: AGPL-3.0-only
// The Library on the phone and with a pointer (src/library/), through Expo Router's test renderer
// over the real app directory and the mock server (./mock.ts): no network. The phone's Library has
// Movies and Collections in it, with the sheet's sorts and filters and the A–Z index; a pointer
// has Movies and Collections as destinations with selects. An empty library says so, and a
// collection's page lists its films.
import { letterOf, sortTitle } from '@highsea-tv/client/library'
import { SEED } from '@highsea-tv/mock/films'
import { act, cleanup, fireEvent, screen, within } from '@testing-library/react-native'
import { router } from 'expo-router'
import { FlatList, StyleSheet } from 'react-native'
import { acknowledge, flush, fresh, rewrite, server, signedIn } from './mock.ts'

// the phone, unless a test asks for a pointer's window
jest.mock('../src/form-factor', () => ({
  formFactorOverride: () =>
    (globalThis as { __formFactor?: string }).__formFactor ?? 'compact-touch',
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
// the films a pointer's letter jump focuses, by their poster's handle
const mockFocused: string[] = []
jest.mock('@highsea-tv/ui', () => {
  const actual = jest.requireActual('@highsea-tv/ui')
  const { createElement } = require('react')
  return {
    ...actual,
    Poster: (p: { title: string; ref?: unknown }) => {
      const given = p.ref
      // a ref callback gets a handle whose focus says which film it was
      const ref =
        typeof given === 'function'
          ? (node: object | null) =>
              given(node && { ...node, focus: () => mockFocused.push(p.title) })
          : given
      return createElement(actual.Poster, { ...p, ref })
    },
  }
})

beforeEach(() => {
  fresh()
  mockFocused.length = 0
})
afterEach(async () => {
  await cleanup()
  delete (globalThis as { __formFactor?: string }).__formFactor
})

/** Signs in and opens the path given. */
async function at(path: string) {
  const r = await signedIn()
  await acknowledge()
  await act(() => router.navigate(path as never))
  await flush(500)
  return r
}

/** The films' posters in the grid, in order: "Sintel, 2010". */
const posters = () =>
  screen
    .getAllByRole('link')
    .map((n) => String(n.props.accessibilityLabel ?? ''))
    .filter((l) => /, \d{4}$/.test(l))
const titles = () => posters().map((l) => l.replace(/, \d{4}$/, ''))
const years = () => posters().map((l) => Number(l.slice(-4)))
/** The phone's count, "28 of 30 movies": the grid draws only the rows near the screen. */
const count = () => {
  const line = screen.getByText(/^\d+ of \d+ movies$/)
  const [shown, total] = String(line.props.children).match(/\d+/g)?.map(Number) ?? []
  return { shown: shown ?? 0, total: total ?? 0 }
}
/** The library's own order by title (@highsea-tv/client/library's arrange). */
const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true })
const byTitle = (xs: string[]) =>
  [...xs].sort((a, b) => collator.compare(sortTitle(a), sortTitle(b)))

/** Marks the library's first film by title watched to its end, for everyone. */
function watchFirst() {
  const state = server().mock.servers.populated.state
  const users = [...new Set(state.watch.map((w) => w.userId))]
  const film = [...state.items].sort((a, b) =>
    collator.compare(sortTitle(a.title), sortTitle(b.title)),
  )[0]
  if (!film) throw new Error('no films')
  for (const userId of users) {
    state.watch = state.watch.filter((w) => !(w.userId === userId && w.itemId === film.id))
    state.watch.push({
      userId,
      itemId: film.id,
      position: film.runtimeMinutes * 60,
      updatedAt: new Date().toISOString(),
    })
  }
  return film
}

/** Sends requests whose address matches `path` nowhere while `on()`: the server answers an error. */
const refuse = (path: RegExp, on: () => boolean) =>
  rewrite((url, init) =>
    on() && path.test(url) ? [url.replace(path, '/api/v1/nowhere'), init] : undefined,
  )
const LIBRARY = /\/api\/v1\/items(?=\?|$)/
const COLLECTIONS = /\/api\/v1\/library\/collections(?=\?|$)/

/** Every film watched to its end, for everyone, as the mock's Mark as watched leaves it. */
function watchAll() {
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
}

/** The grid's first row, which names it: its cells, each with its place in the whole. */
const firstRow = (name: string) => {
  const row = screen.getAllByLabelText(name, { exact: true }).find((n) => n.props.role === 'list')
  if (!row) throw new Error(`no ${name} grid`)
  return row.children.filter(
    (n): n is Exclude<typeof n, string> => typeof n !== 'string' && n.props.role === 'listitem',
  )
}

/** The page's pull to refresh, as the scroller's RefreshControl hands it the pull. */
// React Native's Jest preset mocks RefreshControl and keeps the mounted one as `latestRef`
async function pull() {
  const mock = require('react-native/Libraries/Components/RefreshControl/RefreshControl')
    .default as { latestRef?: { props: { onRefresh: () => void } } }
  if (!mock.latestRef) throw new Error('no pull to refresh')
  const control = mock.latestRef
  await act(() => control.props.onRefresh())
  await flush(500)
}
/** Whether the pull's mark is still showing. */
const pulling = () =>
  (
    require('react-native/Libraries/Components/RefreshControl/RefreshControl').default as {
      latestRef?: { props: { refreshing: boolean } }
    }
  ).latestRef?.props.refreshing

describe('the Library on the phone', () => {
  test('lists every film sorted by title, with the count and the A–Z index', async () => {
    const r = await at('/library')
    expect(r.getPathname()).toBe('/library')
    expect(screen.getByRole('header', { name: 'Library' })).toBeTruthy()
    const shown = titles()
    expect(shown.length).toBeGreaterThan(1)
    expect(shown).toEqual(byTitle(shown))
    const { total } = count()
    expect(count().shown).toBe(total)
    expect(shown.length).toBeLessThanOrEqual(total)
    expect(screen.getByLabelText('Jump to a letter')).toBeTruthy()
  })

  test('the sheet sorts by year, which hides the index, and Reset puts it back', async () => {
    await at('/library')
    await fireEvent.press(screen.getByRole('button', { name: 'Sort and filter' }))
    await flush()
    await fireEvent.press(screen.getByRole('togglebutton', { name: 'Newest first' }))
    await flush()
    const ys = years()
    expect(ys).toEqual([...ys].sort((a, b) => b - a))
    expect(screen.queryByLabelText('Jump to a letter')).toBeNull()
    expect(screen.getByRole('button', { name: 'Sorted and filtered' })).toBeTruthy()
    await fireEvent.press(screen.getByRole('button', { name: 'Reset' }))
    await flush()
    expect(screen.getByLabelText('Jump to a letter')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Sort and filter' })).toBeTruthy()
  })

  test('a genre shows only its films, and says how many of all', async () => {
    await at('/library')
    const { total } = count()
    await fireEvent.press(screen.getByRole('button', { name: 'Sort and filter' }))
    await flush()
    const genres = screen.getByLabelText('Genre')
    // the first genre after All
    const genre = within(genres)
      .getAllByRole('togglebutton')
      .map((n) => String(n.props.accessibilityLabel ?? ''))
      .find((l) => l && l !== 'All')
    expect(genre).toBeTruthy()
    await fireEvent.press(screen.getByRole('togglebutton', { name: genre }))
    await flush()
    const { shown } = count()
    expect(shown).toBeGreaterThan(0)
    expect(shown).toBeLessThan(total)
    expect(count().total).toBe(total)
    expect(screen.getByRole('button', { name: `Show ${shown} movies` })).toBeTruthy()
  })

  test('Unwatched leaves out what’s been watched', async () => {
    const film = watchFirst()
    await at('/library')
    const { total } = count()
    expect(titles()).toContain(film.title)
    await fireEvent.press(screen.getByRole('button', { name: 'Sort and filter' }))
    await flush()
    await fireEvent.press(screen.getByRole('togglebutton', { name: 'Unwatched' }))
    await flush()
    expect(count().shown).toBeLessThan(total)
    expect(titles()).not.toContain(film.title)
    expect(screen.getByRole('button', { name: 'Sorted and filtered' })).toBeTruthy()
  })

  test('pull to refresh reads the library again, and the grid shows the answer', async () => {
    await at('/library')
    const { total } = count()
    // the owner removes a film while the page is open
    const state = server().mock.servers.populated.state
    const first = titles()[0]
    state.items = state.items.filter((m) => m.title !== first)
    await pull()
    expect(screen.getByText(`${total - 1} of ${total - 1} movies`)).toBeTruthy()
    expect(titles()).not.toContain(first)
  })

  test('the index jumps to a letter’s first title', async () => {
    const scrolls = jest.spyOn(FlatList.prototype, 'scrollToIndex').mockImplementation(() => {})
    await at('/library')
    const index = screen.getByLabelText('Jump to a letter')
    // VoiceOver's swipe down: the next letter with titles
    await fireEvent(index, 'accessibilityAction', { nativeEvent: { actionName: 'decrement' } })
    await flush()
    expect(scrolls).toHaveBeenCalledWith(
      expect.objectContaining({ index: expect.any(Number), animated: false }),
    )
    scrolls.mockRestore()
  })

  test('an empty library says so', async () => {
    server().setState({ data: 'empty' })
    await at('/library')
    expect(screen.getByText('No movies yet')).toBeTruthy()
    expect(screen.getByText('When the server’s owner adds movies, they show up here.')).toBeTruthy()
    expect(screen.queryByLabelText('Jump to a letter')).toBeNull()
  })

  test('Collections is the Library’s other view, and a collection opens its page', async () => {
    const r = await at('/library')
    await fireEvent.press(screen.getByRole('link', { name: 'Collections' }))
    await flush()
    expect(r.getSearchParams()).toMatchObject({ view: 'collections' })
    const tile = screen
      .getAllByRole('link')
      .find((n) => String(n.props.accessibilityLabel).startsWith(SEED.collection.name))
    expect(tile).toBeTruthy()
    await fireEvent.press(tile as never)
    await flush()
    expect(r.getPathname()).toBe(`/collections/${SEED.collection.id}`)
    expect(screen.getByRole('header', { name: SEED.collection.name })).toBeTruthy()
    expect(posters().length).toBeGreaterThan(0)
  })

  test('/movies and /collections lead to the Library’s views', async () => {
    const r = await at('/collections')
    expect(r.getPathname()).toBe('/library')
    expect(r.getSearchParams()).toMatchObject({ view: 'collections' })
    await act(() => router.navigate('/movies' as never))
    await flush(500)
    expect(r.getPathname()).toBe('/library')
    expect(r.getSearchParams().view).toBeUndefined()
  })

  test('the views are named for assistive tech', async () => {
    await at('/library')
    expect(
      screen
        .getAllByLabelText('Library', { exact: true })
        .some((n) => n.props.role === 'navigation'),
    ).toBe(true)
    // the grid's rows are lists, its cells placed in the whole, the first row naming it
    const cells = firstRow('Movies')
    expect(cells).toHaveLength(3)
    expect(cells[0]?.props['aria-posinset']).toBe(1)
    expect(cells[0]?.props['aria-setsize']).toBe(count().total)
    // the views: the one on view selected; Sort and filter opens a dialog
    const views = within(
      screen
        .getAllByLabelText('Library', { exact: true })
        .find((n) => n.props.role === 'navigation') as never,
    )
    expect(views.getByRole('link', { name: 'Movies' }).props.accessibilityState).toMatchObject({
      selected: true,
    })
    expect(
      views.getByRole('link', { name: 'Collections' }).props.accessibilityState?.selected,
    ).toBeFalsy()
    // the view shown is the page (aria-current), the other a link without it
    expect(views.getByRole('link', { name: 'Movies' }).props['aria-current']).toBe('page')
    expect(views.getByRole('link', { name: 'Collections' }).props['aria-current']).toBeUndefined()
    expect(screen.getByRole('button', { name: 'Sort and filter' }).props['aria-haspopup']).toBe(
      'dialog',
    )
  })

  test('a library that can’t load says so, and Try again loads it', async () => {
    let down = true
    refuse(LIBRARY, () => down)
    await at('/library')
    expect(screen.getByText('Couldn’t load the library')).toBeTruthy()
    down = false
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }))
    await flush(500)
    expect(screen.queryByText('Couldn’t load the library')).toBeNull()
    expect(posters().length).toBeGreaterThan(0)
  })

  test('Collections that can’t load say so', async () => {
    refuse(COLLECTIONS, () => true)
    await at('/library?view=collections')
    expect(screen.getByText('Couldn’t load the collections')).toBeTruthy()
  })

  test('choices that match nothing say why', async () => {
    watchAll()
    await at('/library')
    await fireEvent.press(screen.getByRole('button', { name: 'Sort and filter' }))
    await flush()
    await fireEvent.press(screen.getByRole('togglebutton', { name: 'Unwatched' }))
    await flush()
    expect(screen.getByText('No movies match')).toBeTruthy()
    expect(screen.queryByLabelText('Jump to a letter')).toBeNull()
  })

  test('a pull that fails ends, says so, and keeps what’s shown', async () => {
    await at('/library')
    const before = posters()
    refuse(LIBRARY, () => true)
    await pull()
    expect(pulling()).toBe(false)
    expect(screen.getByText('Couldn’t refresh')).toBeTruthy()
    expect(posters()).toEqual(before)
  })

  test('a collection that isn’t there says it may have been removed', async () => {
    await at('/collections/sc-gone')
    // the prototype's words, not the API's ("There’s no collection with that id.")
    expect(screen.getByText('That collection isn’t on this server.')).toBeTruthy()
    expect(screen.queryByText('There’s no collection with that id.')).toBeNull()
    expect(screen.getByText('It may have been removed.')).toBeTruthy()
    // Search is offered beside the tab bar's own
    expect(screen.getAllByRole('button', { name: 'Search' }).length).toBeGreaterThan(1)
  })
})

describe('Movies and Collections with a pointer', () => {
  beforeEach(() => {
    ;(globalThis as { __formFactor?: string }).__formFactor = 'regular-pointer'
  })

  test('Movies has its selects and the index; sorting by year hides the index', async () => {
    const r = await at('/movies')
    expect(r.getPathname()).toBe('/movies')
    expect(screen.getByRole('header', { name: 'Movies' })).toBeTruthy()
    const shown = titles()
    expect(shown).toEqual(byTitle(shown))
    expect(screen.getByText(`${shown.length} movies`)).toBeTruthy()
    expect(screen.getByLabelText('Jump to a letter')).toBeTruthy()
    await fireEvent.press(screen.getByRole('button', { name: 'Sort' }))
    await flush()
    await fireEvent.press(screen.getByLabelText('Newest first'))
    await flush()
    const ys = years()
    expect(ys).toEqual([...ys].sort((a, b) => b - a))
    expect(screen.queryByLabelText('Jump to a letter')).toBeNull()
  })

  test('a letter jumps to its first title, and focuses it', async () => {
    const scrolls = jest.spyOn(FlatList.prototype, 'scrollToIndex').mockImplementation(() => {})
    await at('/movies')
    const shown = titles()
    const last = shown.at(-1)
    if (!last) throw new Error('no titles')
    const letter = letterOf(last)
    const target = shown.find((x) => letterOf(x) === letter)
    await fireEvent.press(screen.getByRole('button', { name: letter }))
    await flush()
    const call = scrolls.mock.calls.at(-1)?.[0]
    expect(call?.index).toBeGreaterThan(0)
    expect(mockFocused).toEqual([target])
    scrolls.mockRestore()
  })

  test('the grid fills the width with posters, more than the phone’s three a row', async () => {
    await at('/movies')
    expect(firstRow('Movies').length).toBeGreaterThan(3)
  })

  test('a narrow window keeps the posters filling it, and has no index', async () => {
    ;(globalThis as { __formFactor?: string }).__formFactor = 'compact-pointer'
    await at('/movies')
    expect(firstRow('Movies').length).toBeGreaterThan(3)
    expect(screen.queryByLabelText('Jump to a letter')).toBeNull()
  })

  test('in a narrow window the selects wrap inside it rather than run past its edge', async () => {
    ;(globalThis as { __formFactor?: string }).__formFactor = 'compact-pointer'
    await at('/movies')
    // a View doesn't shrink unless told (React Native's and react-native-web's flexShrink 0), so
    // the row of selects must ask to, or it keeps its one-line width at 390
    expect(StyleSheet.flatten(screen.getByTestId('movie-filters').props.style)).toMatchObject({
      flexShrink: 1,
      flexWrap: 'wrap',
    })
  })

  test('a library that can’t load says so', async () => {
    refuse(LIBRARY, () => true)
    await at('/movies')
    expect(screen.getByText('Couldn’t load the library')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy()
  })

  test('choices that match nothing offer Show everything', async () => {
    watchAll()
    await at('/movies')
    await fireEvent.press(screen.getByRole('button', { name: 'Show' }))
    await flush()
    await fireEvent.press(screen.getByLabelText('Unwatched'))
    await flush()
    expect(screen.getByText('Nothing matches')).toBeTruthy()
    await fireEvent.press(screen.getByRole('button', { name: 'Show everything' }))
    await flush()
    expect(posters().length).toBeGreaterThan(0)
  })

  test('the phone’s Library goes to Movies, and its Collections view to Collections', async () => {
    const r = await at('/library')
    expect(r.getPathname()).toBe('/movies')
    await act(() => router.navigate('/library?view=collections' as never))
    await flush(500)
    expect(r.getPathname()).toBe('/collections')
  })

  test('a collection’s page lists its films', async () => {
    const r = await at(`/collections/${SEED.collection.id}`)
    expect(r.getPathname()).toBe(`/collections/${SEED.collection.id}`)
    expect(screen.getByRole('header', { name: SEED.collection.name })).toBeTruthy()
    expect(posters().length).toBeGreaterThan(0)
  })

  test('a collection that isn’t there says so in the prototype’s words, with Collections', async () => {
    await at('/collections/sc-gone')
    expect(screen.getByText('That collection isn’t on this server.')).toBeTruthy()
    expect(screen.getByText('It may have been removed.')).toBeTruthy()
    expect(screen.getAllByRole('button', { name: 'Collections' }).length).toBeGreaterThan(0)
  })

  test('Collections lists the collections', async () => {
    await at('/collections')
    expect(screen.getByRole('header', { name: 'Collections' })).toBeTruthy()
    expect(
      screen
        .getAllByRole('link')
        .some((n) => String(n.props.accessibilityLabel).startsWith(SEED.collection.name)),
    ).toBe(true)
  })

  test('a smart collection’s tile is read with its mark', async () => {
    await at('/collections')
    const labels = screen.getAllByRole('link').map((n) => String(n.props.accessibilityLabel ?? ''))
    expect(labels.some((l) => l.includes(', smart collection, '))).toBe(true)
  })

  test('an empty library says so', async () => {
    server().setState({ data: 'empty' })
    await at('/movies')
    expect(screen.getByText('No movies yet')).toBeTruthy()
  })
})
