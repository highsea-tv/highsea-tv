// SPDX-License-Identifier: AGPL-3.0-only
// Movies shows the whole library (HT-57, the owner's of 2026-11-18): against a fake API of 450
// movies paged by cursor, the page reads every page with no Show more, draws only the rows near the
// screen in its scroller, selects every match from the header, and, sorted by title, draws the
// clients' A–Z index, whose letter scrolls to its first movie though its row isn't drawn yet.
// The shell is stood in for by the library's ScrollView, a scroll source as the shell's is.
import './dom.ts'
import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'
import type { ReactNode } from 'react'
import { shown } from './modal.ts'

let address = new URLSearchParams()
/** Where the page's scroller was last asked to scroll. */
let scrolledTo: number[] = []

const { ScrollView, tokens, useScrollSourceOrNull } = await import('@highsea-tv/ui/native')

/**
 * happy-dom lays nothing out, so the scroller's content would have no height and every scroll
 * would be held at 0: this reports the height a browser would, as the ScrollView's own
 * onContentSizeChange does.
 */
function Laid({ children }: { children: ReactNode }) {
  const source = useScrollSourceOrNull()
  if (source && source.content.height === 0) {
    source.viewport = { width: 1280, height: 800 }
    source.content = { width: 1280, height: 100_000 }
  }
  return <>{children}</>
}

mock.module('../src/navigation.tsx', () => ({
  useRouter: () => ({ push: () => {} }),
  usePathname: () => '/movies',
  useSearchParams: () => address,
}))
mock.module('../src/shell.tsx', () => ({
  useShell: () => ({ role: 'owner' }),
  AdminPage: ({ title, children }: { title: ReactNode; children?: ReactNode }) => (
    <ScrollView
      style={{ height: 800 }}
      ref={(node) => {
        if (!node) return
        ;(node as { scrollTo: unknown }).scrollTo = (to: { y?: number }) => {
          scrolledTo.push(to.y ?? 0)
        }
      }}
    >
      <Laid>
        <main>
          <h1>{title}</h1>
          {children}
        </main>
      </Laid>
    </ScrollView>
  ),
}))

const { act, cleanup, render, within } = await import('@testing-library/react')
const { default: userEvent } = await import('@testing-library/user-event')
const { createClient } = await import('@highsea-tv/sdk')
const { ClientProvider } = await import('@highsea-tv/sdk/react')
const { ThemeProvider } = await import('@highsea-tv/ui/native')
const { MoviesLibrary } = await import('../src/library.tsx')

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

/** 450 movies, 18 to each letter from A to Y: none under Z. */
const TOTAL = 450
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXY'
const titleOf = (i: number) => `${LETTERS[Math.floor(i / 18)]} film ${String(i).padStart(3, '0')}`

const movie = (i: number) => {
  const title = titleOf(i)
  return {
    id: i + 1,
    type: 'movie',
    title,
    originalTitle: title,
    sortTitle: title.toLowerCase(),
    year: 2010,
    runtimeMinutes: 90,
    genres: [],
    synopsis: '',
    rating: 4,
    voteCount: 10,
    releaseDate: '2010-09-30',
    art: { poster: null, backdrop: null, logo: null },
    status: 'available',
    monitored: true,
    minimumAvailability: 'released',
    languageProfileId: 'lp-en',
    qualityProfileId: 'qp-hd',
    rootFolder: '/data/media/movies',
    path: `/data/media/movies/${title} (2010)`,
    addedAt: '2026-10-20T10:00:00.000Z',
    versions: [],
    gone: false,
  }
}

type Request = { method: string; path: string; query: URLSearchParams; body: unknown }
let requests: Request[] = []

async function api(url: string, init: RequestInit = {}): Promise<Response> {
  const u = new URL(url, 'http://localhost')
  const method = init.method ?? 'GET'
  if (u.pathname === '/api/v1/events')
    return new Response(new ReadableStream(), { headers: { 'content-type': 'text/event-stream' } })
  const body = init.body ? JSON.parse(String(init.body)) : undefined
  requests.push({ method, path: u.pathname, query: u.searchParams, body })
  switch (`${method} ${u.pathname}`) {
    case 'GET /api/v1/movies': {
      // cursor paging as the server's: the cursor is where the next page starts
      const start = Number(u.searchParams.get('cursor') ?? 0)
      const end = Math.min(TOTAL, start + Number(u.searchParams.get('limit') ?? 60))
      return json({
        items: Array.from({ length: end - start }, (_, i) => movie(start + i)),
        next: end < TOTAL ? String(end) : null,
        total: TOTAL,
        counts: {
          all: TOTAL,
          available: TOTAL,
          wanted: 0,
          downloading: 0,
          'not-released': 0,
          unmonitored: 0,
        },
      })
    }
    case 'GET /api/v1/qualityprofiles':
      return json([{ id: 'qp-hd', name: 'HD 1080p' }])
    case 'GET /api/v1/languageprofiles':
    case 'GET /api/v1/indexers':
    case 'GET /api/v1/import-lists':
    case 'GET /api/v1/tags':
      return json([])
    case 'POST /api/v1/movies/bulk':
      return json({ ids: body.ids, missing: [] })
  }
  return json({ error: { code: 'not-found', message: `Nothing at ${u.pathname}.` } }, 404)
}

beforeEach(() => {
  requests = []
  scrolledTo = []
  address = new URLSearchParams()
})
afterEach(() => {
  cleanup()
  localStorage.clear()
})

const settle = async () => {
  await act(async () => {
    for (let i = 0; i < 10; i++) await new Promise((r) => setTimeout(r, 0))
  })
  shown()
}

async function open(view: 'grid' | 'table') {
  localStorage.setItem('highsea:movies-view', view)
  const client = createClient({ fetch: api as never })
  await act(async () => {
    render(
      <ClientProvider client={client}>
        <ThemeProvider formFactor={{ input: 'pointer', widthClass: 'regular' }} reducedMotion>
          <MoviesLibrary />
        </ThemeProvider>
      </ClientProvider>,
    )
  })
  await settle()
  return { user: userEvent.setup(), page: within(document.body) }
}

const listRequests = () => requests.filter((r) => r.method === 'GET' && r.path === '/api/v1/movies')

describe('the whole library', () => {
  test('reads every page by its cursor and never offers Show more', async () => {
    const { page } = await open('table')
    expect(listRequests().map((r) => [r.query.get('cursor'), r.query.get('limit')])).toEqual([
      [null, '200'],
      ['200', '200'],
      ['400', '200'],
    ])
    expect(page.queryByRole('button', { name: /more/i })).toBeNull()
    expect(page.getByRole('tab', { name: /All/ }).textContent).toContain('450')
  })

  test('the table draws only the rows near the screen', async () => {
    const { page } = await open('table')
    const rows = page.getAllByRole('checkbox', { name: /^Select [A-Y] film/ })
    expect(rows.length).toBeGreaterThan(0)
    expect(rows.length).toBeLessThan(TOTAL)
    expect(page.queryByRole('checkbox', { name: `Select ${titleOf(TOTAL - 1)}` })).toBeNull()
  })

  test('the grid draws only the rows near the screen', async () => {
    const { page } = await open('grid')
    const posters = page.getAllByRole('listitem')
    expect(posters.length).toBeGreaterThan(0)
    expect(posters.length).toBeLessThan(TOTAL)
    // each says its place in the whole
    expect(posters[0]?.getAttribute('aria-setsize')).toBe(String(TOTAL))
  })

  test('select all selects every movie that matches, drawn or not', async () => {
    const { user, page } = await open('table')
    await user.click(page.getByRole('checkbox', { name: 'Select every movie shown' }))
    expect(page.getByText('450 movies selected')).toBeTruthy()
    const bar = within(page.getByRole('toolbar', { name: /./ }))
    await user.click(bar.getByRole('button', { name: 'Edit' }))
    await settle()
    await user.click(page.getByRole('menuitem', { name: 'Monitor' }))
    await settle()
    const sent = requests.filter((r) => r.method === 'POST' && r.path === '/api/v1/movies/bulk')
    expect(sent.map((r) => (r.body as { ids: number[] }).ids.length)).toEqual([TOTAL])
  })
})

describe('the A–Z index', () => {
  test('shows while sorted by title, its letters without movies disabled', async () => {
    const { page } = await open('grid')
    const index = page.getByRole('navigation', { name: 'Jump to a letter' })
    expect(within(index).getAllByRole('button')).toHaveLength(27)
    expect(within(index).getByRole('button', { name: 'Z' }).getAttribute('aria-disabled')).toBe(
      'true',
    )
    expect(within(index).getByRole('button', { name: 'A' }).getAttribute('aria-disabled')).toBe(
      null,
    )
  })

  test('is gone under another sort', async () => {
    address = new URLSearchParams('sort=added')
    const { page } = await open('grid')
    expect(page.queryByRole('navigation', { name: 'Jump to a letter' })).toBeNull()
  })

  test('a letter in the table scrolls to its first movie, though its row isn’t drawn', async () => {
    const { user, page } = await open('table')
    const first = TOTAL - 18 // the first under Y
    expect(page.queryByRole('checkbox', { name: `Select ${titleOf(first)}` })).toBeNull()
    const index = page.getByRole('navigation', { name: 'Jump to a letter' })
    await user.click(within(index).getByRole('button', { name: 'Y' }))
    await settle()
    // the row's place by the rows' height, less the line it stays under, past what came before
    const at = scrolledTo.at(-1) ?? 0
    expect(at).toBeGreaterThanOrEqual(first * tokens.density.rowSingle - tokens.space['6'])
  })

  test('a letter in the grid scrolls to its first movie’s row', async () => {
    const { user, page } = await open('grid')
    const index = page.getByRole('navigation', { name: 'Jump to a letter' })
    await user.click(within(index).getByRole('button', { name: 'M' }))
    await settle()
    expect(scrolledTo.at(-1) ?? 0).toBeGreaterThan(0)
    await user.click(within(index).getByRole('button', { name: 'Y' }))
    await settle()
    const toY = scrolledTo.at(-1) ?? 0
    const toM = scrolledTo.at(-2) ?? 0
    expect(toY).toBeGreaterThan(toM)
  })
})
