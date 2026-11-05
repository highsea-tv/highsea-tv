// SPDX-License-Identifier: AGPL-3.0-only
// Search (src/app/(in)/search.tsx) on the phone, with a pointer and on the TV, against the mock
// server (./mock.ts): typing and the 150 ms before the results follow, the sections by kind in the
// server's order, nothing found, the quick picks, the text kept in the address as `?q=`, and on
// the TV the on-screen keys, with focus kept on them while typing and handed to the first result
// by a pick. Requests can be held back (`hold`), for what's shown while they're on their way.
import { act, cleanup, fireEvent, screen, within } from '@testing-library/react-native'
import { router } from 'expo-router'
import { StyleSheet } from 'react-native'
import { flush, fresh, open, rewrite, sent, signedIn, words } from './mock.ts'

jest.mock('../src/form-factor', () => ({
  formFactorOverride: () =>
    (globalThis as { __formFactor?: string }).__formFactor ?? 'compact-touch',
}))
// requests to a held path wait until the test lets them go (`hold`), the rest go at once
const mockHeld: { path: string; go: Promise<void> }[] = []
jest.mock('../src/transport.ts', () => {
  const real = require('./mock.ts').transportModule()
  const inner = real.transport
  const transport = Object.assign(
    async (input: string, init?: RequestInit) => {
      const held = mockHeld.find((h) => input.includes(h.path))
      if (held) {
        mockHeld.splice(mockHeld.indexOf(held), 1)
        await held.go
      }
      return inner(input, init)
    },
    {
      nearby: inner.nearby,
      oidc: inner.oidc,
      setState: inner.setState,
      state: inner.state,
      dispose: inner.dispose,
    },
  )
  Object.defineProperty(transport, 'mock', { get: () => inner.mock })
  return { ...real, mock: { ...real.mock, transport }, transport }
})
// Bonjour is a native module; mock mode hands the servers provider the mock's own discovery
jest.mock(
  require('node:path').resolve(__dirname, '../../../packages/native/src/discovery.ts'),
  () => ({ browse: () => () => {} }),
)
// the servers it knows and their tokens, in memory (the device's file and keychain are native)
jest.mock(
  require('node:path').resolve(__dirname, '../../../packages/native/src/server-store.ts'),
  () => require('./mock.ts').serverStore(),
)
// PKCE's expo-crypto, as @highsea-tv/native resolves it (Bun's store keeps a copy per peer set)
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
// what asked for tvOS's preferred focus, render by render: a result asks for it only in the render
// it arrives in, so the tree after a flush no longer shows it
const asked: string[] = []
jest.mock('@highsea-tv/ui', () => {
  const actual = jest.requireActual('@highsea-tv/ui')
  const { createElement } = require('react')
  return {
    ...actual,
    Poster: (p: { preferred?: boolean; title: string }) => {
      if (p.preferred) asked.push(p.title)
      return createElement(actual.Poster, p)
    },
  }
})
// the stops Search hands the TV's head for Down (kit's useHeadDown), render by render
const headDown: unknown[] = []
jest.mock('../src/kit.tsx', () => {
  const actual = jest.requireActual('../src/kit.tsx')
  return {
    ...actual,
    useHeadDown: (stop: unknown) => {
      headDown.push(stop)
      return actual.useHeadDown(stop)
    },
  }
})
const focused: unknown[] = []
jest.mock('@highsea-tv/ui/tv', () => {
  const actual = jest.requireActual('@highsea-tv/ui/tv')
  return {
    ...actual,
    focusOn: (h: unknown) => {
      focused.push(h)
      actual.focusOn(h)
    },
  }
})

const FIELD = 'Search titles, genres and people'

const formFactor = (name: string) => {
  ;(globalThis as { __formFactor?: string }).__formFactor = name
}

/** Holds the next request whose address has `path` in it; the call lets it go. */
function hold(path: string) {
  let go = () => {}
  mockHeld.push({ path, go: new Promise<void>((r) => (go = r)) })
  return go
}

beforeEach(() => {
  fresh()
  mockHeld.length = 0
  asked.length = 0
  focused.length = 0
  headDown.length = 0
})
afterEach(async () => {
  await cleanup()
  delete (globalThis as { __formFactor?: string }).__formFactor
})

/** Signs in (on the TV, approved from the phone) and opens Search, at `path` if given. */
async function search(path = '/search') {
  let r: Awaited<ReturnType<typeof open>>
  if ((globalThis as { __formFactor?: string }).__formFactor === 'tv') {
    r = await open()
    await fireEvent.press(screen.getByLabelText(/^Harbor,/))
    await flush(20_000)
  } else r = await signedIn()
  // an announcement the mock puts up on the TV, acknowledged so it doesn't cover the screen
  const ack = screen.queryByLabelText('Got it')
  if (ack) {
    await fireEvent.press(ack)
    await flush()
  }
  await act(() => router.push(path as never))
  await flush()
  return r
}

/** The section headings shown, in order. */
const headings = () => screen.queryAllByRole('header').map((h) => words(h.props.children ?? h))

const searched = () => sent('/api/v1/search').map((q) => new URL(q.url, 'http://x').searchParams)

describe('Search on the phone', () => {
  test('opens empty, with the quick picks', async () => {
    const r = await search()
    expect(r.getPathname()).toBe('/search')
    expect(screen.getByRole('header', { name: 'Search' })).toBeTruthy()
    expect(screen.getByLabelText(FIELD)).toBeTruthy()
    for (const pick of ['Comedy', 'Animation', 'Science fiction'])
      expect(screen.getByText(pick)).toBeTruthy()
    expect(searched()).toHaveLength(0)
  })

  test('the results follow 150 ms after the last letter, a section per kind', async () => {
    const r = await search()
    await fireEvent.changeText(screen.getByLabelText(FIELD), 'tear')
    await act(() => jest.advanceTimersByTimeAsync(60))
    await fireEvent.changeText(screen.getByLabelText(FIELD), 'tears of')
    await act(() => jest.advanceTimersByTimeAsync(100))
    // still typing: nothing asked yet, and the quick picks stay
    expect(searched()).toHaveLength(0)
    expect(screen.getByText('Comedy')).toBeTruthy()
    await flush(200)
    // one request, for the text as it settled
    expect(searched().map((p) => p.get('query'))).toEqual(['tears of'])
    expect(screen.queryByText('Comedy')).toBeNull()
    expect(screen.getByRole('header', { name: /^Movies/ })).toBeTruthy()
    expect(screen.getByRole('link', { name: /^Tears of Steel/ })).toBeTruthy()
    // the settled text is in the address
    expect(r.getSearchParams().q).toBe('tears of')
  })

  test('a name that starts with the text puts People first, each opening their page', async () => {
    const r = await search()
    await fireEvent.changeText(screen.getByLabelText(FIELD), 'keaton')
    await flush(300)
    const kinds = headings().filter((h) => /^(Movies|Collections|People)/.test(h))
    expect(kinds[0]).toMatch(/^People/)
    const person = screen
      .getAllByRole('link')
      .find((l) => /keaton/i.test(l.props.accessibilityLabel))
    expect(person).toBeTruthy()
    await fireEvent.press(person as never)
    await flush()
    expect(r.getPathname()).toMatch(/^\/people\/\d+$/)
  })

  test('nothing is asked for 150 ms after the last letter, then it is', async () => {
    await search()
    await fireEvent.changeText(screen.getByLabelText(FIELD), 'sintel')
    await act(() => jest.advanceTimersByTimeAsync(149))
    expect(searched()).toHaveLength(0)
    await act(() => jest.advanceTimersByTimeAsync(2))
    await flush()
    expect(searched().map((p) => p.get('query'))).toEqual(['sintel'])
  })

  test('Searching… shows while the results are on their way, marked busy', async () => {
    await search()
    const go = hold('/api/v1/search')
    await fireEvent.changeText(screen.getByLabelText(FIELD), 'sintel')
    await flush(300)
    const busy = screen.getByText('Searching…')
    expect(busy.props.accessibilityState).toEqual({ busy: true })
    go()
    await flush()
    expect(screen.queryByText('Searching…')).toBeNull()
    expect(screen.getByRole('link', { name: /^Sintel/ })).toBeTruthy()
  })

  test('an answer that comes after a newer one is never shown', async () => {
    await search()
    const go = hold('query=tears')
    await fireEvent.changeText(screen.getByLabelText(FIELD), 'tears')
    await flush(300)
    await fireEvent.changeText(screen.getByLabelText(FIELD), 'sintel')
    await flush(300)
    expect(screen.getByRole('link', { name: /^Sintel/ })).toBeTruthy()
    go()
    await flush(300)
    expect(screen.getByRole('link', { name: /^Sintel/ })).toBeTruthy()
    expect(screen.queryByRole('link', { name: /^Tears of Steel/ })).toBeNull()
  })

  test('a search that fails says so', async () => {
    rewrite((url, init) =>
      url.includes('/api/v1/search')
        ? [url.replace('/api/v1/search', '/api/v1/nowhere'), init]
        : undefined,
    )
    await search()
    await fireEvent.changeText(screen.getByLabelText(FIELD), 'sintel')
    await flush(300)
    expect(screen.getByRole('alert').props.children).toMatch(/^Search didn’t work\./)
  })

  test('Back from a result finds the search as it was', async () => {
    const r = await search()
    await fireEvent.changeText(screen.getByLabelText(FIELD), 'tears of')
    await flush(300)
    await fireEvent.press(screen.getByRole('link', { name: /^Tears of Steel/ }))
    await flush()
    expect(r.getPathname()).toMatch(/^\/movies\/\d+$/)
    await act(() => router.back())
    await flush()
    expect(r.getPathname()).toBe('/search')
    expect(screen.getByLabelText(FIELD).props.value).toBe('tears of')
    expect(screen.getByRole('link', { name: /^Tears of Steel/ })).toBeTruthy()
  })

  test('a result opened before the text settles keeps the text off its address', async () => {
    const r = await search()
    await fireEvent.changeText(screen.getByLabelText(FIELD), 'tears')
    await flush(300)
    await fireEvent.changeText(screen.getByLabelText(FIELD), 'tears of')
    await fireEvent.press(screen.getAllByRole('link', { name: /^Tears of Steel/ })[0] as never)
    await flush(300)
    expect(r.getPathname()).toMatch(/^\/movies\/\d+$/)
    expect(r.getSearchParams().q).toBeUndefined()
  })

  test('Search opened again starts empty', async () => {
    const r = await search('/search?q=tears')
    await flush(300)
    // as the tab bar and the top bar open it
    await act(() => router.navigate('/' as never))
    await flush()
    await act(() => router.navigate('/search' as never))
    await flush(300)
    expect(r.getPathname()).toBe('/search')
    expect(screen.getByLabelText(FIELD).props.value).toBe('')
    expect(screen.getByText('Comedy')).toBeTruthy()
  })

  test('collections are found too, and each heading counts its section', async () => {
    const r = await search()
    // the mock's collections are TMDB's: Caminandes, by its name or its parts' titles
    await fireEvent.changeText(screen.getByLabelText(FIELD), 'caminandes')
    await flush(300)
    const region = screen.getByLabelText('Collections')
    // on the phone it says only how many films, no years
    const tile = within(region).getByRole('link', { name: /^Caminandes Collection/ })
    expect(tile.props.accessibilityLabel).toMatch(/\d+ movies?$/)
    await fireEvent.press(tile)
    await flush()
    expect(r.getPathname()).toMatch(/^\/collections\/\d+$/)
    await act(() => router.back())
    await flush(300)
    // each heading's number is how many results its section shows
    const seen = ['Movies', 'Collections', 'People'].filter((kind) => {
      const section = screen.queryByLabelText(kind)
      if (!section) return false
      const count = Number(words(within(section).getByRole('header')).match(/(\d+)$/)?.[1])
      expect(within(section).getAllByRole('link')).toHaveLength(count)
      return true
    })
    expect(seen).toEqual(expect.arrayContaining(['Movies', 'Collections']))
  })

  test('nothing found says so, with the server’s name', async () => {
    await search()
    await fireEvent.changeText(screen.getByLabelText(FIELD), 'zzzqx')
    await flush(300)
    expect(screen.getByText('Nothing on Harbor matches “zzzqx”.')).toBeTruthy()
  })

  test('a quick pick searches it', async () => {
    const r = await search()
    await fireEvent.press(screen.getByText('Animation'))
    await flush(300)
    expect(searched().map((p) => p.get('query'))).toEqual(['Animation'])
    expect(r.getSearchParams().q).toBe('Animation')
    expect(screen.getByLabelText(FIELD).props.value).toBe('Animation')
  })

  test('a linked search opens with its text and results', async () => {
    await search('/search?q=tears%20of')
    await flush(300)
    expect(screen.getByLabelText(FIELD).props.value).toBe('tears of')
    expect(screen.getByRole('link', { name: /^Tears of Steel/ })).toBeTruthy()
  })

  test('clearing the field goes back to the quick picks, and the address with it', async () => {
    const r = await search('/search?q=tears')
    await flush(300)
    await fireEvent.press(screen.getByLabelText('Clear search'))
    await flush(300)
    expect(screen.getByText('Comedy')).toBeTruthy()
    expect(r.getSearchParams().q).toBeUndefined()
  })
})

describe('Search with a pointer', () => {
  beforeEach(() => formFactor('regular-pointer'))

  test('Try over the picks, the field focused, and the line saying what it covers', async () => {
    await search()
    expect(screen.getByRole('header', { name: 'Try' })).toBeTruthy()
    expect(screen.getByLabelText(FIELD).props.autoFocus).toBe(true)
    expect(
      screen.getByText(
        'Searches what’s on Harbor. Asking for something new comes with requests, later.',
      ),
    ).toBeTruthy()
  })

  test('the top bar marks Search by its icon’s colour alone, with no box behind it', async () => {
    await search()
    // the prototype's web/shell.tsx: the current destination is `text-text`, never a fill
    const link = screen.getByRole('link', { name: 'Search' })
    expect(link.props['aria-current']).toBe('page')
    const drawn = StyleSheet.flatten(
      typeof link.props.style === 'function' ? link.props.style({}) : link.props.style,
    )
    expect(drawn.backgroundColor ?? 'transparent').toBe('transparent')
  })

  test('people are links with what they’re in, and nothing found says what to try', async () => {
    await search()
    await fireEvent.changeText(screen.getByLabelText(FIELD), 'keaton')
    await flush(300)
    expect(screen.getByRole('link', { name: /keaton, \d+ movies? on this server$/i })).toBeTruthy()
    await fireEvent.changeText(screen.getByLabelText(FIELD), 'zzzqx')
    await flush(300)
    expect(
      screen.getByText(
        'Nothing on Harbor matches “zzzqx”. Try part of a title, a genre or a name.',
      ),
    ).toBeTruthy()
  })
})

describe('Search on the TV', () => {
  beforeEach(() => formFactor('tv'))

  /** A key's or a button's focusable stop, by its label. */
  const stop = (label: string) =>
    screen.getAllByLabelText(label).find((n) => 'hasTVPreferredFocus' in n.props)?.props ?? {}

  /** Opens Search, and puts the remote on the first key as tvOS does. */
  async function keys(path?: string) {
    const r = await search(path)
    await fireEvent(screen.getByLabelText('a'), 'focus')
    asked.length = 0
    focused.length = 0
    return r
  }

  test('focus starts on the first key, and only as the screen opens', async () => {
    await search()
    expect(stop('a').hasTVPreferredFocus).toBe(true)
    await fireEvent(screen.getByLabelText('a'), 'focus')
    expect(stop('a').hasTVPreferredFocus).toBe(false)
  })

  test('the keys type into the field, and typing keeps focus on them', async () => {
    await keys()
    const field = screen.getByLabelText(FIELD)
    for (const k of ['t', 'e', 'a', 'r', 's']) await fireEvent.press(screen.getByLabelText(k))
    await fireEvent.press(screen.getByLabelText('Space'))
    await fireEvent.press(screen.getByLabelText('Delete'))
    expect(within(field).getByText('tears')).toBeTruthy()
    await flush(300)
    expect(searched().map((p) => p.get('query'))).toEqual(['tears'])
    expect(screen.getByLabelText(/^Tears of Steel/)).toBeTruthy()
    // no result asked for focus, and nothing moved it
    expect(asked).toEqual([])
    expect(focused).toEqual([])
  })

  test('typing while a pick waits for its results moves no focus', async () => {
    await keys()
    const go = hold('/api/v1/search')
    await fireEvent.press(screen.getByLabelText('Comedy'))
    await flush(300)
    await fireEvent.press(screen.getByLabelText('s'))
    go()
    await flush(300)
    expect(asked).toEqual([])
    expect(focused).toEqual([])
  })

  test('&123 swaps in the digits and symbols, and back', async () => {
    await keys()
    await fireEvent.press(screen.getByLabelText('Numbers and symbols'))
    expect(screen.getByLabelText('1')).toBeTruthy()
    expect(screen.queryByLabelText('a')).toBeNull()
    // the other layout's first key doesn't take focus from &123
    expect(stop('1').hasTVPreferredFocus).toBe(false)
    await fireEvent.press(screen.getByLabelText('Letters'))
    expect(screen.getByLabelText('a')).toBeTruthy()
  })

  test('a quick pick hands focus to the first result as the results come', async () => {
    await keys()
    await fireEvent.press(screen.getByLabelText('Comedy'))
    // until the results come, the picks stay, so focus has somewhere to be
    expect(screen.getByLabelText('Comedy')).toBeTruthy()
    await flush(300)
    expect(searched().map((p) => p.get('query'))).toEqual(['comedy'])
    expect(screen.queryByLabelText('Comedy')).toBeNull()
    // the first result asked for focus as it arrived, and nothing sent it back to the keys
    expect(asked).toHaveLength(1)
    expect(screen.getByLabelText(new RegExp(`^${asked[0]}`))).toBeTruthy()
    expect(focused).toEqual([])
  })

  test('a pick with nothing found sends focus back to the keys', async () => {
    await keys()
    await fireEvent.press(screen.getByLabelText('Saltmarsh'))
    await flush(300)
    expect(screen.getByText('Nothing on Harbor matches “saltmarsh”.')).toBeTruthy()
    expect(asked).toEqual([])
    expect(focused.filter(Boolean)).toHaveLength(1)
  })

  test('Down from the head lands on the first key', async () => {
    await keys()
    // the key itself, the stop the arrive effect sends focus back to when a pick finds nothing
    await fireEvent.press(screen.getByLabelText('Saltmarsh'))
    await flush(300)
    const key = focused.filter(Boolean)[0]
    expect(key).toBeTruthy()
    expect(headDown.at(-1)).toBe(key)
  })

  /** The nearest group around `node` that remembers where focus was (FocusGuide's autoFocus). */
  const groupOf = (node: { parent: unknown; props: { autoFocus?: boolean } } | null) => {
    let n = node
    while (n && n.props.autoFocus !== true) n = n.parent as typeof n
    return n
  }

  test('the keys and the results are each a group, side by side, for Right and Left', async () => {
    await keys('/search?q=tears')
    await flush(300)
    const keysGroup = groupOf(screen.getByLabelText('a') as never) as { parent: unknown } | null
    expect(keysGroup).toBeTruthy()
    // the results' column: what holds a result beside the keys' group, in the same row
    type Node = { parent: Node | null; props: { autoFocus?: boolean } }
    let column = screen.getAllByLabelText(/^Tears of Steel/)[0] as unknown as Node | null
    while (column && column.parent !== keysGroup?.parent) column = column.parent
    expect(column).toBeTruthy()
    expect(column === keysGroup).toBe(false)
    // a group of its own: Right from the keys' last column enters it, Left comes back
    expect(column?.props.autoFocus).toBe(true)
  })

  test('Back from a result leaves focus for its group to give back', async () => {
    const r = await keys('/search?q=tears')
    await flush(300)
    const before = screen.getAllByLabelText(/^Tears of Steel/)[0]
    await fireEvent.press(before as never)
    await flush()
    expect(r.getPathname()).toMatch(/^\/movies\/\d+$/)
    asked.length = 0
    focused.length = 0
    await act(() => router.back())
    await flush(300)
    // the same result, still mounted in its group, and nothing on Search took focus elsewhere
    const after = screen.getAllByLabelText(/^Tears of Steel/)[0]
    expect(after).toBe(before)
    expect(groupOf(after as never)).toBeTruthy()
    expect(asked).toEqual([])
    expect(focused).toEqual([])
    expect(stop('a').hasTVPreferredFocus).toBe(false)
  })

  test('Clear empties the field and brings back the picks', async () => {
    await keys('/search?q=tears')
    await flush(300)
    expect(within(screen.getByLabelText(FIELD)).getByText('tears')).toBeTruthy()
    await fireEvent.press(screen.getByLabelText('Clear search'))
    await flush(300)
    expect(screen.getByLabelText('Animation')).toBeTruthy()
  })
})
