// SPDX-License-Identifier: AGPL-3.0-only
// A5's bulk bar (checkpoint 7a), rendered against a fake of the API: beside the quality profiles,
// a Subtitle languages menu lists the language profiles and moves the selected movies to one with
// the bulk route's `setLanguageProfile`. The shell and Next's router are stood in for.
import './dom.ts'
import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'
import type { ReactNode } from 'react'

mock.module('next/navigation', () => ({
  useRouter: () => ({ push: () => {} }),
  usePathname: () => '/movies',
  useSearchParams: () => new URLSearchParams(),
}))
mock.module('../src/admin/shell.tsx', () => ({
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
const { UIProvider } = await import('@highsea-tv/ui-web')
const { MoviesLibrary } = await import('../src/admin/library.tsx')

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

const movie = (id: number, title: string) => ({
  id,
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
  versions: [{ id: `v${id}`, label: '1080p', qualityProfileId: 'qp-hd', fileId: null }],
  gone: false,
})

type Request = { method: string; path: string; body: unknown }
let requests: Request[] = []

async function api(url: string, init: RequestInit = {}): Promise<Response> {
  const u = new URL(url, 'http://localhost')
  const method = init.method ?? 'GET'
  if (u.pathname === '/api/v1/events')
    return new Response(new ReadableStream(), { headers: { 'content-type': 'text/event-stream' } })
  const body = init.body ? JSON.parse(String(init.body)) : undefined
  requests.push({ method, path: u.pathname, body })
  switch (`${method} ${u.pathname}`) {
    case 'GET /api/v1/movies': {
      const items = [movie(45745, 'Sintel'), movie(10378, 'Big Buck Bunny')]
      return json({
        items,
        next: null,
        total: 2,
        counts: {
          all: 2,
          available: 2,
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
      return json([
        { id: 'lp-en', name: 'English', languages: [], cutoff: 'en', minScore: 80 },
        { id: 'lp-pt', name: 'English and Portuguese', languages: [], cutoff: null, minScore: 80 },
      ])
    case 'GET /api/v1/indexers':
      return json([])
    case 'GET /api/v1/import-lists':
      return json([{ id: 'lst_1' }])
    case 'POST /api/v1/movies/bulk':
      return json({ ids: body.ids, missing: [] })
  }
  return json({ error: { code: 'not-found', message: `Nothing at ${u.pathname}.` } }, 404)
}

beforeEach(() => {
  requests = []
  localStorage.setItem('highsea:movies-view', 'table')
})
afterEach(() => {
  cleanup()
  localStorage.clear()
})

const settle = () =>
  act(async () => {
    for (let i = 0; i < 6; i++) await new Promise((r) => setTimeout(r, 0))
  })

async function open() {
  const client = createClient({ fetch: api as never })
  await act(async () => {
    render(
      <ClientProvider client={client}>
        <UIProvider>
          <MoviesLibrary />
        </UIProvider>
      </ClientProvider>,
    )
  })
  await settle()
  return { user: userEvent.setup(), page: within(document.body) }
}

describe('A5’s bulk bar', () => {
  test('Subtitle languages moves the selected movies to a language profile', async () => {
    const { user, page } = await open()
    await user.click(page.getByRole('checkbox', { name: 'Select Sintel' }))
    await user.click(page.getByRole('checkbox', { name: 'Select Big Buck Bunny' }))
    const bar = within(page.getByRole('toolbar', { name: /./ }))
    await user.click(bar.getByRole('button', { name: 'Edit' }))
    await settle()
    expect(page.getByText('Subtitle languages')).toBeTruthy()
    await user.click(page.getByRole('menuitem', { name: 'English and Portuguese' }))
    await settle()
    const sent = requests.filter((r) => r.method === 'POST' && r.path === '/api/v1/movies/bulk')
    expect(sent.map((r) => r.body)).toEqual([
      { action: 'setLanguageProfile', ids: [45745, 10378], languageProfileId: 'lp-pt' },
    ])
    expect(
      page.getByText('Subtitle languages set to English and Portuguese for 2 movies'),
    ).toBeTruthy()
  })

  test('Remove, with an import list, can keep lists from adding them again', async () => {
    const { user, page } = await open()
    await user.click(page.getByRole('checkbox', { name: 'Select Sintel' }))
    const bar = within(page.getByRole('toolbar', { name: /./ }))
    await user.click(bar.getByRole('button', { name: 'Remove' }))
    await settle()
    const confirm = page.getByRole('alertdialog')
    await user.click(within(confirm).getByLabelText('Don’t add them again from lists'))
    await user.click(within(confirm).getByRole('button', { name: 'Remove' }))
    await settle()
    const sent = requests.filter((r) => r.method === 'POST' && r.path === '/api/v1/movies/bulk')
    expect(sent.map((r) => r.body)).toEqual([{ action: 'delete', ids: [45745], exclude: true }])
  })
})
