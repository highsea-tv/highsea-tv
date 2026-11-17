// SPDX-License-Identifier: AGPL-3.0-only
// A14 Wanted (wanted.md), rendered against a fake of the API: Missing and Cutoff unmet with their
// counts in the tabs, Search for one and Search all, the tabs in the address, the calendar's month
// with its entries linking to their movies, and the feed's address turned off with a confirmation.
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
    case 'GET /api/v1/qualityprofiles':
      return json([{ id: 1, name: 'HD', cutoff: 'Bluray-1080p' }])
    case 'POST /api/v1/wanted/search':
      return json({ queued: (body as { ids?: number[] }).ids?.length ?? 1 })
    case 'GET /api/v1/calendar':
      return json([{ date: today, kind: 'digital', movie: movie(45745, 'Sintel') }])
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
    expect(tabs.getByRole('tab', { name: /Cutoff unmet/ }).textContent).toContain('2')
    const table = within(page.getByRole('table', { name: 'Missing' }))
    expect(table.getByRole('link', { name: 'Sintel (2010)' }).getAttribute('href')).toBe(
      '/movies/45745',
    )
    expect(table.getByText('HD')).toBeTruthy()
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
    await user.click(page.getByRole('button', { name: 'Search all 2' }))
    await settle()
    expect(requested('POST', '/api/v1/wanted/search')[0]?.body).toEqual({ all: 'cutoff' })
  })

  test('the calendar shows this month’s releases, linking to each movie', async () => {
    const { page } = await open('/wanted/calendar')
    const month = new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric' }).format(now)
    expect(page.getByRole('heading', { name: month })).toBeTruthy()
    expect(requested('GET', '/api/v1/calendar')[0]?.path).toContain(`from=${today.slice(0, 8)}01`)
    // happy-dom lays nothing out, so the window reads as compact and the month is a list.
    const list = within(page.getByRole('list', { name: `Releases in ${month}` }))
    const entry = list.getByRole('link', { name: /Sintel/ })
    expect(entry.getAttribute('href')).toBe('/movies/45745')
    expect(entry.textContent).toContain('Digital')
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
