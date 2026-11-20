// SPDX-License-Identifier: AGPL-3.0-only
// A14 Wanted (wanted.md), rendered against a fake of the API: Missing and Cutoff unmet with their
// counts in the tabs, Search for one and Search all, the tabs in the address, the calendar's month
// with its entries linking to their movies, and the feed's address turned off with a confirmation.
// Episodes (HT-109): their rows beside the films', the kind filter, an episode's Search, and its
// chip on the calendar linking to its show.
// The shell and the host's router are stood in for.
import './dom.ts'
import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'
import type { ReactNode } from 'react'
import { navigation, Routed, router } from './router.tsx'

mock.module('../src/navigation.tsx', () => navigation)
mock.module('../src/shell.tsx', () => ({
  useShell: () => ({ role: 'owner' }),
  AdminPage: ({ title, children }: { title: ReactNode; children?: ReactNode }) => (
    <main>
      <h1>{title}</h1>
      {children}
    </main>
  ),
}))

const { act, cleanup, render, within } = await import('@testing-library/react')
const { default: userEvent } = await import('@testing-library/user-event')
const { createClient } = await import('@highsea-tv/sdk')
const { ClientProvider } = await import('@highsea-tv/sdk/react')
const { ThemeProvider } = await import('@highsea-tv/ui/native')
const { shown } = await import('./modal.ts')
const { Wanted } = await import('../src/wanted.tsx')

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

const movie = (id: number, title: string, status = 'wanted') => ({
  id,
  title,
  year: 2010,
  status,
  releaseDate: '2010-09-30',
  qualityProfileId: 1,
  art: { poster: null, backdrop: null },
  versions: [],
})

const episode = (number: number, status: string, quality: string | null = null) => ({
  show: {
    id: '1396',
    title: 'Pioneer One',
    year: 2010,
    poster: null,
    qualityProfileId: 1,
  },
  episode: {
    id: String(62000 + number),
    season: 1,
    number,
    title: `Episode ${number}`,
    aired: '2010-06-16',
    status,
    quality,
  },
})

const pad = (n: number) => String(n).padStart(2, '0')
const now = new Date()
const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`

type Req = { method: string; path: string; body: unknown }
let state: { requests: Req[]; feed: string | null }

async function api(url: string, init: RequestInit = {}): Promise<Response> {
  const u = new URL(url, 'http://localhost')
  const method = init.method ?? 'GET'
  const path = u.pathname
  if (path === '/api/v1/events')
    return new Response(new ReadableStream(), { headers: { 'content-type': 'text/event-stream' } })
  const body = init.body ? JSON.parse(String(init.body)) : undefined
  state.requests.push({ method, path: path + u.search, body })
  switch (`${method} ${path}`) {
    case 'GET /api/v1/wanted/missing':
      return json({ items: [movie(45745, 'Sintel')], next: null, total: 1, counts: {} })
    case 'GET /api/v1/wanted/cutoff':
      return json({
        items: [movie(10378, 'Big Buck Bunny', 'available'), movie(133701, 'Tears of Steel')],
        next: null,
        total: 2,
        counts: {},
      })
    case 'GET /api/v1/wanted/missing/episodes':
      return json({ items: [episode(3, 'missing')], next: null, total: 1 })
    case 'GET /api/v1/wanted/cutoff/episodes':
      return json({ items: [episode(2, 'cutoff-unmet', 'WEB 720p')], next: null, total: 1 })
    case 'GET /api/v1/qualityprofiles':
      return json([{ id: 1, name: 'HD', cutoff: 'Bluray-1080p' }])
    case 'POST /api/v1/wanted/search':
      return json({
        queued: (body as { ids?: number[] }).ids?.length ?? 1,
        episodes: (body as { episodes?: unknown[] }).episodes?.length ?? 1,
      })
    case 'GET /api/v1/calendar':
      return json([
        { date: today, kind: 'digital', movie: movie(45745, 'Sintel') },
        { date: today, kind: 'episode', episode: { ...episode(4, 'missing'), aired: today } },
      ])
    case 'GET /api/v1/me/calendar-key':
      return json({ url: state.feed })
    case 'DELETE /api/v1/me/calendar-key':
      state.feed = null
      return json({ url: null })
  }
  return json({ error: { code: 'not-found', message: `Nothing at ${path}.` } }, 404)
}

beforeEach(() => {
  state = { requests: [], feed: 'http://localhost/feed/v1/calendar.ics?key=k1' }
})
afterEach(() => cleanup())

const settle = (rounds = 6) =>
  act(async () => {
    for (let i = 0; i < rounds; i++) await new Promise((r) => setTimeout(r, 0))
  })

async function open(at = '/wanted') {
  const client = createClient({ fetch: api as never })
  await act(async () => {
    render(
      <ClientProvider client={client}>
        <ThemeProvider>
          <Routed<'cutoff' | 'calendar'> base="/wanted" at={at}>
            {(tab) => <Wanted tab={tab} />}
          </Routed>
        </ThemeProvider>
      </ClientProvider>,
    )
  })
  await settle()
  return { user: userEvent.setup(), page: within(document.body) }
}

const requested = (method: string, path: string) =>
  state.requests.filter((r) => r.method === method && r.path.split('?')[0] === path)

describe('Wanted', () => {
  test('Missing lists each movie with its profile, and searches for one', async () => {
    const { user, page } = await open()
    const tabs = within(page.getByRole('tablist', { name: 'Wanted sections' }))
    expect(tabs.getByRole('tab', { name: /Missing/ }).getAttribute('aria-selected')).toBe('true')
    // a tab counts its movies and its episodes
    expect(tabs.getByRole('tab', { name: /Cutoff unmet/ }).textContent).toContain('3')
    const table = within(page.getByRole('table', { name: 'Missing' }))
    expect(table.getByRole('link', { name: 'Sintel (2010)' }).getAttribute('href')).toBe(
      '/movies/45745',
    )
    // Sintel's profile, and the episode's
    expect(table.getAllByText('HD')).toHaveLength(2)
    await user.click(table.getByRole('button', { name: 'Search for Sintel' }))
    await settle()
    expect(requested('POST', '/api/v1/wanted/search')[0]?.body).toEqual({ ids: [45745] })
  })

  test('Cutoff unmet is its own address, and says what each profile wants', async () => {
    const { user, page } = await open()
    await user.click(page.getByRole('tab', { name: /Cutoff unmet/ }))
    await settle()
    expect(router.history).toEqual(['/wanted/cutoff'])
    const table = within(page.getByRole('table', { name: 'Cutoff unmet' }))
    expect(table.getAllByText('HD · Bluray-1080p')).toHaveLength(2)
    // an episode's row says what its file is and what the profile wants
    expect(table.getByText('WEB 720p · Bluray-1080p')).toBeTruthy()
    await user.click(page.getByRole('button', { name: 'Search all 3' }))
    await settle()
    expect(requested('POST', '/api/v1/wanted/search')[0]?.body).toEqual({ all: 'cutoff' })
  })

  test('episodes share the table: the kind filter, the show’s link and an episode’s Search', async () => {
    const { user, page } = await open()
    const table = () => within(page.getByRole('table', { name: 'Missing' }))
    const show = table().getByRole('link', { name: 'Pioneer One' })
    expect(show.getAttribute('href')).toBe('/shows/1396')
    expect(table().getByText('· S01E03 · Episode 3')).toBeTruthy()
    // the filter: episodes alone, then Search all asks for the episodes only
    await user.click(page.getByRole('radio', { name: 'Episodes · 1' }))
    await settle()
    expect(table().queryByRole('link', { name: 'Sintel (2010)' })).toBeNull()
    await user.click(page.getByRole('button', { name: 'Search all 1' }))
    await settle()
    expect(requested('POST', '/api/v1/wanted/search')[0]?.body).toEqual({
      all: 'missing',
      kind: 'episodes',
    })
    await user.click(table().getByRole('button', { name: 'Search for Pioneer One · S01E03' }))
    await settle()
    expect(requested('POST', '/api/v1/wanted/search')[1]?.body).toEqual({
      episodes: [{ show: '1396', season: 1, episode: 3 }],
    })
    // movies alone, and nothing left of that kind says so
    await user.click(page.getByRole('radio', { name: 'Movies · 1' }))
    await settle()
    expect(table().queryByRole('link', { name: 'Pioneer One' })).toBeNull()
  })

  test('the calendar shows this month’s releases, linking to each movie', async () => {
    const { page } = await open('/wanted/calendar')
    const month = new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric' }).format(now)
    expect(page.getByRole('heading', { name: month })).toBeTruthy()
    expect(requested('GET', '/api/v1/calendar')[0]?.path).toContain(`from=${today.slice(0, 8)}01`)
    // happy-dom lays nothing out, so the window reads as compact and the month is a list.
    const list = within(page.getByRole('list', { name: `Releases and episodes in ${month}` }))
    const entry = list.getByRole('link', { name: /Sintel/ })
    expect(entry.getAttribute('href')).toBe('/movies/45745')
    expect(entry.textContent).toContain('Digital')
    // an episode on its air date, linking to its show
    const aired = list.getByRole('link', { name: /Pioneer One · S01E04/ })
    expect(aired.getAttribute('href')).toBe('/shows/1396')
  })

  test('the feed’s address is turned off after a confirmation', async () => {
    const { user, page } = await open('/wanted/calendar')
    expect(
      (page.getByLabelText('Subscribe in your calendar app') as HTMLInputElement).value,
    ).toContain('key=k1')
    await user.click(page.getByRole('button', { name: 'Turn off' }))
    await settle()
    shown()
    const dialog = within(page.getByRole('dialog', { name: 'Turn off the calendar feed?' }))
    await user.click(dialog.getByRole('button', { name: 'Turn off' }))
    await settle()
    expect(requested('DELETE', '/api/v1/me/calendar-key')).toHaveLength(1)
    expect(page.getByText('There’s no feed address yet.')).toBeTruthy()
  })
})
