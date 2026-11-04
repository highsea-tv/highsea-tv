// SPDX-License-Identifier: AGPL-3.0-only
// Home on the phone and with a pointer, and Alerts' list in the bell's popover (src/home/,
// src/app/(in)/index.tsx, src/alerts/list.tsx), through Expo Router's test renderer over the real app directory and the mock server
// (./mock.ts): no network. Home draws the featured titles and the rows, an announcement that must
// be acknowledged as a dialog over it, and the owner's card; Continue watching's menu marks a film
// watched or takes it off the row; an empty library says so, and a row with nothing in it isn't
// drawn. Home and Alerts that can't load say so, with Try again; pull to refresh ends.
import { act, cleanup, fireEvent, screen, within } from '@testing-library/react-native'
import { router } from 'expo-router'
import { flush, fresh, rewrite, sent, server, signedIn } from './mock.ts'

// the phone, unless a test asks for a pointer's window
jest.mock('../src/form-factor', () => ({
  formFactorOverride: () =>
    (globalThis as { __formFactor?: string }).__formFactor ?? 'compact-touch',
}))
// the mock's transport, with an empty row and an empty featured section, or a featured section
// last of all, added to GET /home's
// answer while a test asks (the mock leaves empty rows out, as the server does), and GET /home
// held unanswered while a test looks at Home loading
jest.mock('../src/transport.ts', () => {
  const m = require('./mock.ts').transportModule()
  const inner = m.transport
  const wrapped = Object.assign(async (url: string, init?: RequestInit) => {
    if ((globalThis as { __holdHome?: boolean }).__holdHome && /\/api\/v1\/home(\?|$)/.test(url))
      return new Promise<Response>(() => {})
    const answer: Response = await inner(url, init)
    const g = globalThis as { __emptyRows?: boolean; __lateHero?: boolean }
    if ((!g.__emptyRows && !g.__lateHero) || !/\/api\/v1\/home(\?|$)/.test(url)) return answer
    const sections = await answer.json()
    if (g.__emptyRows)
      sections.push(
        { id: 'fs-nothing', title: 'Nothing here', suffix: null, layout: 'row', items: [] },
        { id: 'fs-no-hero', title: 'No hero here', suffix: null, layout: 'hero', items: [] },
      )
    // a featured section the owner put last, below the rows
    if (g.__lateHero)
      sections.push({
        id: 'fs-late',
        title: 'Late featured',
        suffix: null,
        layout: 'hero',
        items: sections.find((x: { layout: string }) => x.layout !== 'hero')?.items ?? [],
      })
    return new Response(JSON.stringify(sections), {
      status: answer.status,
      headers: answer.headers,
    })
  }, inner)
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
jest.mock('expo-crypto', () => require('./mock.ts').cryptoModule())
jest.mock('react-native-gesture-handler/ReanimatedSwipeable', () =>
  require('./mock.ts').swipeable(),
)
require('react-native-gesture-handler/jestSetup')

// signing in and drawing every row takes a few seconds on a cold start
jest.setTimeout(30_000)
beforeEach(fresh)
afterEach(async () => {
  await cleanup()
  delete (globalThis as { __formFactor?: string }).__formFactor
  delete (globalThis as { __emptyRows?: boolean }).__emptyRows
  delete (globalThis as { __holdHome?: boolean }).__holdHome
  delete (globalThis as { __lateHero?: boolean }).__lateHero
})

/** The continue menu's choices: buttons on iOS, as the library reads a menu's items there (aria.ts). */
const CHOICES = /^(Go to the film|Mark as watched|Remove from Continue watching)$/

/** Where each of these labels or words first comes in the screen's tree, top to bottom. */
const orderOf = (names: string[]) => {
  const seen: string[] = []
  const walk = (n: unknown) => {
    if (typeof n === 'string') {
      if (names.includes(n) && !seen.includes(n)) seen.push(n)
      return
    }
    const node = n as { props?: Record<string, unknown>; children?: unknown[] } | null
    const label = node?.props?.accessibilityLabel ?? node?.props?.['aria-label']
    if (typeof label === 'string' && names.includes(label) && !seen.includes(label))
      seen.push(label)
    for (const c of node?.children ?? []) walk(c)
  }
  walk(screen.root)
  return seen
}

/** Pull to refresh's native control, as the scroll view draws it: its `refreshing` and `onRefresh`. */
// React Native's Jest preset mocks RefreshControl and keeps the mounted one as `latestRef`
const pullControl = () => {
  const mock = require('react-native/Libraries/Components/RefreshControl/RefreshControl')
    .default as {
    latestRef?: { props: { refreshing: boolean; onRefresh: () => void } }
  }
  if (!mock.latestRef) throw new Error('No pull to refresh on screen')
  return mock.latestRef.props
}

/** Refuses the requests to this API path while `on()` says so, as a server that can't answer. */
const refuse = (path: RegExp, on: () => boolean) =>
  rewrite((url, init) =>
    on() && path.test(url) ? [url.replace(path, '/api/v1/nowhere'), init] : undefined,
  )

/** Whether a placeholder that says it's busy is on screen (the skeleton's aria-busy). */
const busy = () => {
  const find = (n: unknown): boolean => {
    const node = n as { props?: Record<string, unknown>; children?: unknown[] }
    return (
      node?.props?.['aria-busy'] === true ||
      (node?.children ?? []).some((c) => typeof c === 'object' && find(c))
    )
  }
  return find(screen.root)
}

const pointer = () => {
  ;(globalThis as { __formFactor?: string }).__formFactor = 'regular-pointer'
}

/** Signs in and acknowledges the announcement Home opens with. */
async function home() {
  const r = await signedIn()
  await fireEvent.press(screen.getByRole('button', { name: 'Got it' }))
  await flush()
  return r
}

/** Continue watching's cards, which hold a menu: "Metropolis, 1h 32m left". */
const continuing = () =>
  screen
    .getAllByRole('link')
    .filter((n) =>
      (n.props.accessibilityActions ?? []).some((a: { name: string }) => a.name === 'longpress'),
    )

describe('Home on the phone', () => {
  test('an announcement that must be acknowledged comes first, and Got it says so to the server', async () => {
    await signedIn()
    expect(screen.getByText('Harbor has a new remote address')).toBeTruthy()
    await fireEvent.press(screen.getByRole('button', { name: 'Got it' }))
    await flush()
    expect(screen.queryByText('Harbor has a new remote address')).toBeNull()
    expect(sent('/announcements/an-new-address/seen')).toHaveLength(1)
  })

  test('the header’s switcher and account, the owner’s card, the featured titles and the rows', async () => {
    await home()
    expect(screen.getByRole('button', { name: 'Harbor, switch server' })).toBeTruthy()
    expect(screen.getByRole('link', { name: /, settings$/ })).toBeTruthy()
    expect(screen.getByText('Movie night is Friday')).toBeTruthy()
    expect(screen.getAllByRole('link', { name: 'Sintel' }).length).toBeGreaterThan(0)
    expect(screen.getByText('Continue watching')).toBeTruthy()
    expect(screen.getAllByText('Recently added').length).toBeGreaterThan(0)
  })

  test('the owner’s card is dismissed for good', async () => {
    await home()
    await fireEvent.press(screen.getByRole('button', { name: 'Dismiss' }))
    await flush()
    expect(screen.queryByText('Movie night is Friday')).toBeNull()
    expect(sent('/announcements/an-movie-night/seen')).toHaveLength(1)
  })

  test('an empty library says so', async () => {
    server().setState({ data: 'empty' })
    await signedIn()
    expect(screen.getByText('Nothing to watch yet')).toBeTruthy()
    expect(screen.queryByText('Continue watching')).toBeNull()
  })

  test('while Home loads, it’s drawn as it will be, and says it’s busy', async () => {
    ;(globalThis as { __holdHome?: boolean }).__holdHome = true
    await home()
    expect(busy()).toBe(true)
    expect(screen.queryByText('Continue watching')).toBeNull()
  })

  test('a row or featured section with nothing in it isn’t drawn', async () => {
    ;(globalThis as { __emptyRows?: boolean }).__emptyRows = true
    await home()
    expect(screen.getByText('Continue watching')).toBeTruthy()
    expect(screen.queryByText('Nothing here')).toBeNull()
    expect(screen.queryByLabelText('No hero here')).toBeNull()
  })

  test('the sections come in the server’s order, a featured section among the rows', async () => {
    ;(globalThis as { __lateHero?: boolean }).__lateHero = true
    await home()
    expect(orderOf(['Featured on Harbor', 'Continue watching', 'Late featured'])).toEqual([
      'Featured on Harbor',
      'Continue watching',
      'Late featured',
    ])
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

  test('pull to refresh fetches Home and the announcements, and the spinner ends', async () => {
    await home()
    const before = {
      home: sent('/api/v1/home').length,
      notes: sent('/api/v1/announcements').length,
    }
    await act(() => pullControl().onRefresh())
    await flush()
    expect(pullControl().refreshing).toBe(false)
    expect(sent('/api/v1/home').length).toBe(before.home + 1)
    expect(sent('/api/v1/announcements').length).toBeGreaterThan(before.notes)
  })

  test('a pull whose refresh fails ends the spinner, keeps the rows and says why', async () => {
    let down = false
    refuse(/\/api\/v1\/home(?=\?|$)/, () => down)
    await home()
    down = true
    await act(() => pullControl().onRefresh())
    await flush()
    expect(pullControl().refreshing).toBe(false)
    expect(screen.getByText('Continue watching')).toBeTruthy()
    expect(screen.getByText(/^Couldn’t refresh: /)).toBeTruthy()
  })

  test('a pull that gets no answer ends after 10 seconds', async () => {
    await home()
    ;(globalThis as { __holdHome?: boolean }).__holdHome = true
    await act(() => pullControl().onRefresh())
    await flush()
    expect(pullControl().refreshing).toBe(true)
    await flush(10_000)
    expect(pullControl().refreshing).toBe(false)
  })

  test('holding a Continue watching card opens its menu, and Mark as watched takes it off', async () => {
    await home()
    const card = continuing()[0]
    const title = String(card?.props.accessibilityLabel).replace(/, .*$/, '')
    await fireEvent(card as never, 'longPress')
    await flush()
    const items = () => screen.queryAllByRole('button', { name: CHOICES })
    expect(items()).toHaveLength(3)
    await fireEvent.press(screen.getByRole('button', { name: 'Mark as watched' }))
    await flush(500)
    expect(sent('/played')).toHaveLength(1)
    expect(items()).toHaveLength(0)
    expect(screen.getByText(`${title} marked as watched`)).toBeTruthy()
    expect(continuing().some((n) => n.props.accessibilityLabel.startsWith(`${title},`))).toBe(false)
  })
})

describe('Home with a pointer', () => {
  test('⋯ on a Continue watching card opens its menu, and Remove takes it off the row', async () => {
    pointer()
    await home()
    expect(screen.getByLabelText('Featured')).toBeTruthy()
    const more = screen.getAllByRole('button', { name: /^More for / })[0]
    const label = String(more?.props.accessibilityLabel)
    const title = label.replace(/^More for /, '')
    // the poster's quick actions take presses once a pointer is over the poster
    let poster = more?.parent ?? null
    while (poster && !poster.props.onPointerEnter) poster = poster.parent
    await fireEvent(poster as never, 'pointerEnter')
    await fireEvent.press(more as never)
    await flush()
    expect(
      screen.getByRole('button', { name: label, expanded: true, includeHiddenElements: true }),
    ).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Go to the film' })).toBeTruthy()
    await fireEvent.press(screen.getByRole('button', { name: 'Remove from Continue watching' }))
    await flush(500)
    expect(sent('/dismiss')).toHaveLength(1)
    expect(screen.getByText(`${title} removed from Continue watching`)).toBeTruthy()
    expect(screen.queryByRole('button', { name: label })).toBeNull()
  })

  test('while Home loads, it’s drawn as it will be, and says it’s busy', async () => {
    pointer()
    ;(globalThis as { __holdHome?: boolean }).__holdHome = true
    await home()
    expect(busy()).toBe(true)
    expect(screen.queryByText('Continue watching')).toBeNull()
  })

  test('the featured card pages through its titles', async () => {
    pointer()
    await home()
    expect(screen.getByRole('header', { name: 'Sintel' })).toBeTruthy()
    await fireEvent.press(screen.getByRole('button', { name: 'Next featured title' }))
    await flush()
    expect(screen.getByRole('header', { name: 'Spring' })).toBeTruthy()
  })
})

/** The list item holding this text: the nearest ancestor with one of the titles in it. */
const itemWith = (text: string, titles: string[]) => {
  let n = screen.getAllByText(text)[0]?.parent ?? null
  while (n && !titles.some((x) => within(n as never).queryByText(x))) n = n.parent
  return titles.find((x) => n && within(n as never).queryByText(x))
}

/** Opens the top bar's bell, Alerts with a pointer. */
const bell = async () => {
  await fireEvent.press(screen.getByRole('button', { name: /^Alerts/ }))
  await flush()
}

describe('Alerts with a pointer', () => {
  test('lists the live announcements, marks the unread New, and counts them as seen', async () => {
    pointer()
    await home()
    await bell()
    expect(screen.getByText('Harbor has a new remote address')).toBeTruthy()
    // a list of its items, the heading outside it
    const list = screen.getByLabelText('Announcements')
    expect(list.props.role).toBe('list')
    type Node = { props?: Record<string, unknown>; children?: unknown[] }
    const under = (n: unknown, hit: (x: Node) => boolean): Node[] =>
      ((n as Node)?.children ?? []).flatMap((c) =>
        typeof c === 'object' && c ? (hit(c as Node) ? [c as Node] : under(c, hit)) : [],
      )
    expect(under(list, (x) => x.props?.role === 'listitem').length).toBeGreaterThanOrEqual(2)
    // the one acknowledged on Home isn't new; the owner's card, unseen, is
    expect(screen.getAllByText('New')).toHaveLength(1)
    expect(itemWith('New', ['Movie night is Friday', 'Harbor has a new remote address'])).toBe(
      'Movie night is Friday',
    )
    expect(sent('/announcements/an-movie-night/seen')).toHaveLength(1)
  })

  test('Alerts’ address goes Home, since the bell’s popover is Alerts here', async () => {
    pointer()
    const r = await home()
    await act(() => router.push('/alerts'))
    await flush()
    expect(r.getPathname()).toBe('/')
  })

  test('a list that can’t load says so, and Try again loads it', async () => {
    pointer()
    let down = false
    refuse(/\/api\/v1\/announcements(?=\?|$)/, () => down)
    await home()
    down = true
    await bell()
    await flush()
    expect(screen.getByText('Couldn’t load the announcements')).toBeTruthy()
    down = false
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }))
    await flush()
    expect(screen.getByText('Movie night is Friday')).toBeTruthy()
  })
})
