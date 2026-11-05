// SPDX-License-Identifier: AGPL-3.0-only
// Home and Alerts at the TV's rule (src/home/tv.tsx, src/app/(in)/index.tsx and alerts.tsx), as
// ./home.jest.tsx runs them on the phone: the form factor asked for is the TV's. An announcement
// that must be acknowledged stands alone first; then the featured card and the rows. The remote's
// Back, as react-native-tvos hands it to BackHandler's listeners: it closes Continue watching's
// menu, brings focus back to the featured card, and from there isn't taken, so highsea is left.
import { tvUnit } from '@highsea-tv/tokens/native'
import { focusOn, TV_HEAD_HEIGHT, TV_ROW_GAP } from '@highsea-tv/ui/tv'
import { act, cleanup, fireEvent, screen, within } from '@testing-library/react-native'
import { router } from 'expo-router'
import { BackHandler, Dimensions, StyleSheet } from 'react-native'
import { TV_ALERTS } from '../src/alerts/sizes.ts'
import { HOME } from '../src/home/sizes.ts'
import { TV_LIBRARY } from '../src/library/sizes.ts'
import { flush, fresh, open, rewrite, sent, server } from './mock.ts'

jest.mock('../src/form-factor', () => ({ formFactorOverride: () => 'tv' }))
// the library's focusOn, watched: where Home sends focus once its menu closes
jest.mock('@highsea-tv/ui/tv', () => {
  const actual = jest.requireActual('@highsea-tv/ui/tv')
  return { ...actual, focusOn: jest.fn(actual.focusOn) }
})
// the mock's transport, with GET /home held unanswered while a test looks at Home loading
jest.mock('../src/transport.ts', () => {
  const m = require('./mock.ts').transportModule()
  const inner = m.transport
  const wrapped = Object.assign(
    (url: string, init?: RequestInit) =>
      (globalThis as { __holdHome?: boolean }).__holdHome && /\/api\/v1\/home(\?|$)/.test(url)
        ? new Promise<Response>(() => {})
        : inner(url, init),
    inner,
  )
  Object.defineProperty(wrapped, 'mock', { get: () => inner.mock })
  return { ...m, mock: { ...m.mock, transport: wrapped }, transport: wrapped }
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

beforeEach(() => {
  fresh()
  jest.spyOn(BackHandler, 'addEventListener')
})
afterEach(async () => {
  await cleanup()
  delete (globalThis as { __holdHome?: boolean }).__holdHome
  jest.restoreAllMocks()
})

/** Opens the app, chooses Harbor from the servers answering, and waits for the phone's approval. */
const signedIn = async () => {
  const r = await open()
  await fireEvent.press(screen.getByLabelText(/^Harbor,/))
  await flush(20_000)
  return r
}

/** Signs in and acknowledges the announcement Home opens with. */
const home = async () => {
  const r = await signedIn()
  await fireEvent.press(screen.getByRole('button', { name: 'Got it' }))
  await flush()
  return r
}

/** The remote's Back: whether highsea took it (false lets the platform leave). */
const back = async () => {
  const listener = jest
    .mocked(BackHandler.addEventListener)
    .mock.calls.filter(([event]) => event === 'hardwareBackPress')
    .at(-1)?.[1] as (() => boolean | null | undefined) | undefined
  let taken: boolean | null | undefined
  await act(() => {
    taken = listener?.()
  })
  await flush()
  return taken
}

/** The featured card, a link named for its title and line. */
const featured = () => screen.getAllByRole('link', { name: /^Sintel, 2010 · / })[0] as never

/** Continue watching's cards: the wide stills, "Metropolis, 1h 32m left". */
const continuing = () =>
  screen.getAllByRole('link').filter((n) => / left$/.test(String(n.props.accessibilityLabel)))

/** Refuses the requests to this API path while `on()` says so, as a server that can't answer. */
const refuse = (path: RegExp, on: () => boolean) =>
  rewrite((url, init) =>
    on() && path.test(url) ? [url.replace(path, '/api/v1/nowhere'), init] : undefined,
  )

/** The TV's unit at the test's window, as the ThemeProvider works it out. */
const unit = () => tvUnit(Dimensions.get('window').width)

/** A host node's style, flattened. */
const styleOf = (n: { props: { style?: unknown } } | null | undefined) =>
  (StyleSheet.flatten(n?.props.style as never) ?? {}) as Record<string, unknown>

/** The nearest ancestor of this node whose style has `key`. */
const ancestorWith = (n: unknown, key: string) => {
  let at = (n as { parent?: unknown } | null)?.parent as {
    props: { style?: unknown }
    parent?: unknown
  } | null
  while (at && styleOf(at)[key] === undefined) at = at.parent as typeof at
  return at
}

describe('Home on the TV', () => {
  test('an announcement that must be acknowledged stands alone, then Home opens', async () => {
    await signedIn()
    expect(screen.getByText('Harbor has a new remote address')).toBeTruthy()
    expect(screen.getByText('From the server’s owner')).toBeTruthy()
    expect(screen.queryByText('Continue watching')).toBeNull()
    await fireEvent.press(screen.getByRole('button', { name: 'Got it' }))
    await flush()
    expect(sent('/announcements/an-new-address/seen')).toHaveLength(1)
    expect(featured()).toBeTruthy()
    expect(screen.getByText('Continue watching')).toBeTruthy()
  })

  test('Back brings focus to the featured card, and from there leaves highsea', async () => {
    const r = await home()
    // focus on a row: Back is taken, and focus goes back to the featured card
    await fireEvent(continuing()[0] as never, 'focus')
    await flush()
    expect(await back()).toBe(true)
    expect(r.getPathname()).toBe('/')
    // on the featured card: Back isn't taken, so the platform leaves highsea
    await fireEvent(featured(), 'focus')
    await flush()
    expect(await back()).toBe(false)
  })

  test('OK held on a Continue watching card opens its menu, which Back closes', async () => {
    await home()
    const card = continuing()[0]
    await fireEvent(card as never, 'longPress')
    await flush()
    expect(screen.getByRole('button', { name: 'Mark as watched' })).toBeTruthy()
    jest.mocked(focusOn).mockClear()
    expect(await back()).toBe(true)
    expect(screen.queryByRole('button', { name: 'Mark as watched' })).toBeNull()
    // focus goes back to its card
    expect(focusOn).toHaveBeenCalledTimes(1)
  })

  test('Go to the film leaves Home without moving focus on it', async () => {
    const r = await home()
    await fireEvent(continuing()[0] as never, 'longPress')
    await flush()
    jest.mocked(focusOn).mockClear()
    await fireEvent.press(screen.getByRole('button', { name: 'Go to the film' }))
    await flush()
    expect(r.getPathname()).toMatch(/^\/movies\//)
    expect(focusOn).not.toHaveBeenCalled()
  })

  test('Remove from Continue watching takes the card off the row', async () => {
    await home()
    const card = continuing()[0]
    const label = String(card?.props.accessibilityLabel)
    await fireEvent(card as never, 'longPress')
    await flush()
    await fireEvent.press(screen.getByRole('button', { name: 'Remove from Continue watching' }))
    await flush(500)
    expect(sent('/dismiss')).toHaveLength(1)
    expect(continuing().map((n) => n.props.accessibilityLabel)).not.toContain(label)
  })

  test('an empty library says so, offers Movies, and Back leaves highsea', async () => {
    server().setState({ data: 'empty' })
    await signedIn()
    const shown = screen.queryByRole('button', { name: 'Got it' })
    if (shown) {
      await fireEvent.press(shown)
      await flush()
    }
    expect(screen.getByText('Nothing to watch yet')).toBeTruthy()
    expect(screen.getAllByRole('button', { name: 'Movies' }).length).toBeGreaterThan(0)
    expect(await back()).toBe(false)
  })
})

describe('Home on the TV, as drawn', () => {
  test('Continue watching’s cards are 22 units wide, the rows 1.6 apart and clear of the head', async () => {
    await home()
    const u = unit()
    expect(HOME.tvContinueWidth).toBe(22)
    expect(TV_ROW_GAP).toBe(1.6)
    expect(styleOf(continuing()[0] as never).width).toBe(HOME.tvContinueWidth * u)
    const page = ancestorWith(featured(), 'gap')
    expect(styleOf(page).gap).toBe(TV_ROW_GAP * u)
    // the head lies over the page, which keeps clear of it
    expect(styleOf(page).paddingTop).toBe((TV_HEAD_HEIGHT + TV_ROW_GAP) * u)
  })

  test('while Home loads, it’s drawn as it will be, says it’s busy, and Back leaves highsea', async () => {
    ;(globalThis as { __holdHome?: boolean }).__holdHome = true
    await home()
    const find = (n: unknown): boolean => {
      const node = n as { props?: Record<string, unknown>; children?: unknown[] }
      return (
        node?.props?.['aria-busy'] === true ||
        (node?.children ?? []).some((c) => typeof c === 'object' && find(c))
      )
    }
    expect(find(screen.root)).toBe(true)
    expect(screen.queryByText('Continue watching')).toBeNull()
    expect(await back()).toBe(false)
  })

  test('a Home that can’t load says so, and Try again loads it', async () => {
    let down = true
    refuse(/\/api\/v1\/home(?=\?|$)/, () => down)
    await signedIn()
    await fireEvent.press(screen.getByRole('button', { name: 'Got it' }))
    await flush()
    expect(screen.getByText('Couldn’t load the home screen')).toBeTruthy()
    down = false
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }))
    await flush()
    expect(screen.queryByText('Couldn’t load the home screen')).toBeNull()
    expect(screen.getByText('Continue watching')).toBeTruthy()
  })

  test('Mark as watched says so, and a change that fails says why', async () => {
    await home()
    const first = continuing()[0]
    const title = String(first?.props.accessibilityLabel).split(',')[0]
    await fireEvent(first as never, 'longPress')
    await flush()
    await fireEvent.press(screen.getByRole('button', { name: 'Mark as watched' }))
    await flush(500)
    expect(sent('/played')).toHaveLength(1)
    expect(screen.getByText(new RegExp(`^${title} marked as watched`))).toBeTruthy()
    // the next one, with the server refusing it
    refuse(/\/dismiss$/, () => true)
    const next = continuing()[0]
    await fireEvent(next as never, 'longPress')
    await flush()
    await fireEvent.press(screen.getByRole('button', { name: 'Remove from Continue watching' }))
    await flush(500)
    expect(screen.getByText(/^That didn’t work: /)).toBeTruthy()
    expect(continuing().map((n) => n.props.accessibilityLabel)).toContain(
      next?.props.accessibilityLabel,
    )
  })
})

describe('Alerts on the TV', () => {
  test('lists the announcements, the new ones marked', async () => {
    await home()
    await act(() => router.push('/alerts'))
    await flush()
    expect(screen.getByRole('header', { name: 'Alerts' })).toBeTruthy()
    expect(screen.getByText('Movie night is Friday')).toBeTruthy()
    // the one acknowledged on Home isn't new; the owner's card, unseen, is
    expect(screen.getAllByText('New')).toHaveLength(1)
    let item = screen.getByText('New').parent
    while (
      item &&
      !within(item as never).queryByText(
        /^(Movie night is Friday|Harbor has a new remote address)$/,
      )
    )
      item = item.parent
    expect(within(item as never).getByText('Movie night is Friday')).toBeTruthy()
    expect(within(item as never).queryByText('Harbor has a new remote address')).toBeNull()
  })

  test('the title is a library page’s, and the list 60 units wide, 1.2 between its items', async () => {
    await home()
    await act(() => router.push('/alerts'))
    await flush()
    const u = unit()
    expect(TV_LIBRARY.pageTitle).toBe(2.6)
    expect(TV_LIBRARY.pageGap).toBe(1.6)
    expect(TV_ALERTS.width).toBe(60)
    expect(TV_ALERTS.gap).toBe(1.2)
    const title = screen.getByRole('header', { name: 'Alerts' })
    // the page's one heading, as the prototype's tv/alerts.tsx h1 and every library page's
    expect(title.props['aria-level']).toBe(1)
    expect(styleOf(title).fontSize).toBe(TV_LIBRARY.pageTitle * u)
    const page = ancestorWith(title, 'gap')
    expect(styleOf(page).gap).toBe(TV_LIBRARY.pageGap * u)
    // the head lies over the page, so the page clears it, as Movies and Collections do
    expect(styleOf(page).paddingTop).toBe((TV_HEAD_HEIGHT + TV_LIBRARY.pageGap) * u)
    // a list of its items, the title outside it
    const list = screen.getByLabelText('Announcements')
    expect(list.props.role).toBe('list')
    expect(styleOf(list).width).toBe(TV_ALERTS.width * u)
    expect(styleOf(list).gap).toBe(TV_ALERTS.gap * u)
    expect(
      (list.children as { props?: { role?: string } }[]).every((c) => c.props?.role === 'listitem'),
    ).toBe(true)
    const order = (page as unknown as { children: unknown[] }).children
    expect(order.indexOf(title)).toBeLessThan(order.indexOf(list))
  })

  test('a list that can’t load says so, and Try again loads it', async () => {
    let down = false
    refuse(/\/api\/v1\/announcements(?=\?|$)/, () => down)
    await home()
    down = true
    await act(() => router.push('/alerts'))
    await flush()
    expect(screen.getByText('Couldn’t load the announcements')).toBeTruthy()
    down = false
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }))
    await flush()
    expect(screen.getByText('Movie night is Friday')).toBeTruthy()
  })
})
