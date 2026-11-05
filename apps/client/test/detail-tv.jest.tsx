// SPDX-License-Identifier: AGPL-3.0-only
// A film's page and a person's page at the TV's rule (src/detail/), as ./detail.jest.tsx runs them
// on the phone: Play takes the focus as the page opens, the actions follow it in the prototype's
// order, the picks open in a dialog at the right that the remote's Back closes, and a film or a
// person the server doesn't have says so with a way out.
import { SEED } from '@highsea-tv/mock/films'
import { act, cleanup, fireEvent, screen, within } from '@testing-library/react-native'
import { router } from 'expo-router'
import { BackHandler, StyleSheet } from 'react-native'
import { FILM_TV } from '../src/detail/layout.ts'
import { flush, fresh, open, sent, words } from './mock.ts'

jest.mock('../src/form-factor', () => ({ formFactorOverride: () => 'tv' }))
// the mock's transport, with a request held until the test lets it go, or the film's page in a
// collection: the mock's films in one aren't the seed's film (packages/mock)
jest.mock('../src/transport.ts', () => {
  const m = require('./mock.ts').transportModule()
  const inner = m.transport
  const wrapped = async (input: string, init: RequestInit = {}) => {
    const g = globalThis as { __held?: { path: string; go: Promise<void> }[]; __inSet?: string }
    const held = g.__held?.find((h) => input.endsWith(h.path))
    if (held) {
      g.__held?.splice(g.__held.indexOf(held), 1)
      await held.go
    }
    const res: Response = await inner(input, init)
    const film = g.__inSet
    if (!film || (init.method ?? 'GET') !== 'GET' || !input.endsWith(film) || !res.ok) return res
    const body = await res.json()
    const { SEED: seed } = require('@highsea-tv/mock/films')
    body.collection = { id: seed.collection.id, name: seed.collection.name }
    return new Response(JSON.stringify(body), { status: res.status, headers: res.headers })
  }
  Object.defineProperties(wrapped, Object.getOwnPropertyDescriptors(inner))
  return { mock: { ...m.mock, transport: wrapped }, transport: wrapped }
})
// the stop the page hands the head for Down (kit's useHeadDown), render by render
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
// where the page sends focus, and the remote's presses it hears (react-native-tvos's
// useTVEventHandler, which a test can't press)
const focused: unknown[] = []
const mockRemotes = new Set<(e: { eventType: string }) => void>()
jest.mock('@highsea-tv/ui/tv', () => {
  const actual = jest.requireActual('@highsea-tv/ui/tv')
  const { useEffect, useRef } = require('react')
  return {
    ...actual,
    focusOn: (h: unknown) => {
      focused.push(h)
      actual.focusOn(h)
    },
    useRemote: (handler: (e: { eventType: string }) => void) => {
      const latest = useRef(handler)
      latest.current = handler
      useEffect(() => {
        const hear = (e: { eventType: string }) => latest.current(e)
        mockRemotes.add(hear)
        return () => void mockRemotes.delete(hear)
      }, [])
      actual.useRemote(handler)
    },
  }
})
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

// the TV's pages draw more than the gate's, and the first render loads the TV's parts
jest.setTimeout(30_000)

beforeEach(() => {
  fresh()
  headDown.length = 0
  focused.length = 0
})
afterEach(async () => {
  const g = globalThis as { __held?: unknown; __inSet?: unknown; __release?: () => void }
  g.__release?.()
  await cleanup()
  delete g.__held
  delete g.__inSet
  delete g.__release
})

/** Holds the next request to `path` until the call it returns lets it go. */
function hold(path: string) {
  const g = globalThis as {
    __held?: { path: string; go: Promise<void> }[]
    __release?: () => void
  }
  let release = () => {}
  const go = new Promise<void>((r) => (release = r))
  g.__held = [...(g.__held ?? []), { path, go }]
  g.__release = release
  return release
}

/** The remote's press, as the page hears it. */
const press = async (eventType: string) => {
  await act(() => {
    for (const hear of mockRemotes) hear({ eventType })
  })
  await flush(50)
}

/** Focus arriving on the stop with this label, as the engine moves it there. */
const focus = async (label: string | RegExp) => {
  await fireEvent(screen.getAllByLabelText(label)[0] as never, 'focus')
}

type Node = { parent: Node | null }

/** Focus arriving on the first stop of the row with this title. */
const focusRow = async (title: string) => {
  let n: Node | null = screen.getByText(title) as unknown as Node
  while (n && within(n as never).queryAllByRole('button').length === 0) n = n.parent
  await fireEvent(within(n as never).getAllByRole('button')[0] as never, 'focus')
}

type Drawn = { props?: Record<string, unknown>; children?: unknown[] | null }

/** Whether the screen shows a page while it loads (`aria-busy`). */
function busy(tree: unknown = screen.toJSON()): boolean {
  if (Array.isArray(tree)) return tree.some((x) => busy(x))
  if (!tree || typeof tree !== 'object') return false
  const n = tree as Drawn
  return n.props?.['aria-busy'] === true || (n.children ?? []).some((x) => busy(x))
}

/** Signs in on the TV and opens the path given while its read is held. */
async function loading(path: string, read: string) {
  await at('/')
  hold(read)
  await act(() => router.navigate(path as never))
  await flush(500)
}

/** Opens the app, chooses Harbor, waits for the phone's approval, then opens the path given. */
async function at(path: string) {
  const r = await open()
  await fireEvent.press(screen.getByLabelText(/^Harbor,/))
  await flush(20_000)
  // the owner's announcement that must be acknowledged stands over every page until it is
  const got = screen.queryAllByLabelText('Got it')
  if (got.length > 0) {
    await fireEvent.press(got[got.length - 1] as never)
    await flush(500)
  }
  await act(() => router.navigate(path as never))
  await flush(500)
  return r
}

/** The props of the focus stop with this label, as the TV's engine reads them. */
const stop = (label: string) =>
  screen.getAllByLabelText(label).find((n) => 'hasTVPreferredFocus' in n.props)?.props ?? {}

/** The labels drawn, in order, that are among those given. */
const order = (labels: string[]) =>
  (words(screen.toJSON()).match(/\[[^\]]+\]/g) ?? [])
    .map((l) => l.slice(1, -1))
    .filter((l, i, all) => labels.includes(l) && all.indexOf(l) === i)

const ACTIONS = [
  'Play',
  'Resume',
  'From the start',
  'Audio and subtitles',
  'Mark as watched',
  'Mark as unwatched',
]

/** His Girl Friday, which the TV's person (Ines, in the mock) has watched to the end. */
const WATCHED = 11110

describe('a film’s page on the TV', () => {
  test('a film part watched resumes: Resume takes the focus, the actions follow in order', async () => {
    // Tears of Steel is part watched for Ines
    await at(`/movies/${SEED.film.id}`)
    expect(screen.getByRole('header', { name: 'Tears of Steel' })).toBeTruthy()
    expect(order(ACTIONS)).toEqual([
      'Resume',
      'From the start',
      'Audio and subtitles',
      'Mark as watched',
    ])
    expect(stop('Resume').hasTVPreferredFocus).toBe(true)
    for (const label of ['From the start', 'Audio and subtitles', 'Mark as watched'])
      expect(stop(label).hasTVPreferredFocus).toBeFalsy()
  })

  // the owner's call of 2026-11-02: no trailer on the TV until the server keeps trailer files,
  // though Tears of Steel has one (the phone and a pointer show it, detail.jest.tsx)
  test('has no Trailer, though the film has one', async () => {
    await at(`/movies/${SEED.film.id}`)
    expect(screen.getByRole('header', { name: 'Tears of Steel' })).toBeTruthy()
    expect(screen.queryByLabelText('Trailer')).toBeNull()
  })

  // the prototype's head stands in the page's flow above the words, and the art is absolute, so
  // More like this follows the words a row's gap below and peeks at the first screen's foot; the
  // B1 compare found the words under the head's place and the row pushed below a whole screen
  test('the words start under the head, and the first row follows them, not the art', async () => {
    await at(`/movies/${SEED.film.id}`)
    type Up = { parent: Up | null; props: { style?: unknown } }
    const styles: Record<string, unknown>[] = []
    for (
      let n = (screen.getByRole('header', { name: 'Tears of Steel' }) as unknown as Up).parent;
      n;
      n = n.parent
    )
      styles.push((StyleSheet.flatten(n.props.style as never) ?? {}) as Record<string, unknown>)
    const words = styles.find((x) => typeof x.paddingTop === 'number' && 'height' in x)
    expect(words).toBeTruthy()
    const { paddingTop, height } = words as { paddingTop: number; height: number }
    expect(paddingTop / height).toBeCloseTo(FILM_TV.top / (FILM_TV.top + FILM_TV.words))
    expect(styles.some((x) => 'minHeight' in x)).toBe(false)
  })

  test('a film watched plays from the start, with Mark as unwatched', async () => {
    await at(`/movies/${WATCHED}`)
    expect(order(ACTIONS)).toEqual(['Play', 'Audio and subtitles', 'Mark as unwatched'])
    expect(stop('Play').hasTVPreferredFocus).toBe(true)
  })

  test('the picks’ dialog saves a subtitle and closes, and Back closes it too', async () => {
    jest.spyOn(BackHandler, 'addEventListener')
    await at(`/movies/${SEED.film.id}`)
    await fireEvent.press(screen.getByLabelText('Audio and subtitles'))
    await flush()
    expect(screen.getByText('Back closes. Saved for this movie.')).toBeTruthy()
    // one audio track and one version: the subtitles' Off is picked
    expect(screen.getByRole('radio', { name: 'Off' }).props.accessibilityState).toMatchObject({
      checked: true,
    })
    await fireEvent.press(screen.getByRole('radio', { name: 'English · From the disc' }))
    await flush(500)
    expect(sent(`/items/movie/${SEED.film.id}/prefs`).some((q) => q.method === 'PUT')).toBe(true)
    expect(screen.queryByText('Back closes. Saved for this movie.')).toBeNull()
    expect(screen.getByText('4K · English · 5.1 · English · From the disc')).toBeTruthy()

    await fireEvent.press(screen.getByLabelText('Audio and subtitles'))
    await flush()
    expect(screen.getByText('Back closes. Saved for this movie.')).toBeTruthy()
    // the remote's Back, as react-native-tvos hands it to BackHandler's listeners
    const back = jest.mocked(BackHandler.addEventListener).mock.calls.at(-1)?.[1] as
      | (() => boolean | null | undefined)
      | undefined
    await act(() => void back?.())
    await flush()
    expect(screen.queryByText('Back closes. Saved for this movie.')).toBeNull()
  })

  test('while it loads, the page stands as it will be, with no spinner', async () => {
    await loading(`/movies/${SEED.film.id}`, `/items/movie/${SEED.film.id}`)
    expect(busy()).toBe(true)
    expect(screen.queryByRole('progressbar')).toBeNull()
    ;(globalThis as { __release?: () => void }).__release?.()
    await flush(500)
    expect(busy()).toBe(false)
    expect(screen.getByRole('header', { name: 'Tears of Steel' })).toBeTruthy()
  })

  test('Down from the head goes to Play, and Up from any row comes back to it', async () => {
    ;(globalThis as { __inSet?: string }).__inSet = `/items/movie/${SEED.film.id}`
    await at(`/movies/${SEED.film.id}`)
    const play = headDown.filter(Boolean).at(-1)
    expect(play).toBeTruthy()
    // from the collection's row, below the first
    await focus(/^Caminandes Collection/)
    await flush(500)
    await press('up')
    expect(focused.at(-1)).toBe(play)
    // the engine already moved focus up a row for this press: still back to the actions
    focused.length = 0
    await focus(/^Caminandes Collection/)
    await flush(500)
    await focusRow('More like this')
    await press('up')
    expect(focused.at(-1)).toBe(play)
    // from the first row Up is the engine's, which goes to the actions itself
    focused.length = 0
    await flush(500)
    await press('up')
    expect(focused).toEqual([])
  })

  test('Mark as watched says so and becomes Mark as unwatched', async () => {
    await at(`/movies/${SEED.film.id}`)
    await fireEvent.press(screen.getByLabelText('Mark as watched'))
    await flush(500)
    expect(
      sent(`/items/movie/${SEED.film.id}/played`).filter((q) => q.method === 'POST'),
    ).toHaveLength(1)
    expect(screen.getByText('Tears of Steel marked as watched')).toBeTruthy()
    expect(screen.getByLabelText('Mark as unwatched')).toBeTruthy()
  })

  test('a film the server doesn’t have says so, with Movies', async () => {
    const r = await at('/movies/99999999')
    expect(screen.getByText('That title isn’t on this server.')).toBeTruthy()
    const movies = screen.getAllByLabelText('Movies')
    await fireEvent.press(movies[movies.length - 1] as never)
    await flush(500)
    expect(r.getPathname()).toBe('/movies')
  })
})

describe('a person’s page on the TV', () => {
  test('a row of films for each department, the first taking the focus', async () => {
    await at(`/people/${SEED.person.id}`)
    expect(screen.getByRole('header', { name: 'Buster Keaton' })).toBeTruthy()
    const shown = words(screen.toJSON())
    expect(shown).toContain('The General')
    expect(shown).toContain('Sherlock Jr.')
    // the first row's first film: a poster named "The General, 1926" or the like
    const first = screen.getAllByLabelText(/^(The General|Sherlock Jr\.),/)
    expect(first.some((n) => n.props.hasTVPreferredFocus === true)).toBe(true)
  })

  test('while it loads, the page stands as it will be, with no spinner', async () => {
    await loading(`/people/${SEED.person.id}`, `/people/${SEED.person.id}`)
    expect(busy()).toBe(true)
    expect(screen.queryByRole('progressbar')).toBeNull()
  })

  test('someone the server doesn’t know says so', async () => {
    await at('/people/99999999')
    expect(screen.getByText('That person isn’t on this server.')).toBeTruthy()
  })
})
