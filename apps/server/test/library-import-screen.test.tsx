// SPDX-License-Identifier: AGPL-3.0-only
// A17's Library import mode (6b) rendered against a fake of the API: opened with a root folder it
// looks inside on arrival; each folder shows TMDB's match, or why it can't be imported; Import
// sends the checked folders with Rename to my format and the profile; the job's progress shows
// while it runs. Manual import links to it. The shell is stood in for.
import './dom.ts'
import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'
import type { ReactNode } from 'react'

mock.module('next/navigation', () => ({
  useRouter: () => ({ push: () => {} }),
  usePathname: () => '/activity/import',
  useSearchParams: () => new URLSearchParams(),
}))
mock.module('../src/admin/shell.tsx', () => ({
  useShell: () => ({ role: 'owner' }),
  AdminPage: ({
    title,
    actions,
    children,
  }: {
    title: ReactNode
    actions?: ReactNode
    children?: ReactNode
  }) => (
    <main>
      <h1>{title}</h1>
      <div>{actions}</div>
      {children}
    </main>
  ),
}))

const { act, cleanup, render, within } = await import('@testing-library/react')
const { default: userEvent } = await import('@testing-library/user-event')
const { createClient } = await import('@highsea/sdk')
const { ClientProvider } = await import('@highsea/sdk/react')
const { TooltipProvider } = await import('@highsea/ui-web')
const { LibraryImport } = await import('../src/admin/library-import.tsx')
const { ManualImport } = await import('../src/admin/import.tsx')

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

const ROOT = '/data/media/movies'
const idle = {
  state: 'idle',
  root: null,
  rename: false,
  total: 0,
  done: 0,
  imported: 0,
  failures: [],
  startedAt: null,
  finishedAt: null,
}

type Req = { method: string; path: string; body: unknown }
let state: { status: Record<string, unknown>; requests: Req[]; noKey: boolean }

const candidate = (name: string, extra: Record<string, unknown> = {}) => ({
  folder: `${ROOT}/${name}`,
  name,
  file: `${ROOT}/${name}/${name}.mkv`,
  size: 2_000_000_000,
  quality: 'Bluray-1080p',
  match: null,
  inLibrary: false,
  skip: null,
  ...extra,
})

async function api(url: string, init: RequestInit = {}): Promise<Response> {
  const u = new URL(url, 'http://localhost')
  const method = init.method ?? 'GET'
  const path = u.pathname
  if (path === '/api/v1/events')
    return new Response(new ReadableStream(), { headers: { 'content-type': 'text/event-stream' } })
  const body = init.body ? JSON.parse(String(init.body)) : undefined
  state.requests.push({ method, path, body })
  switch (`${method} ${path}`) {
    case 'GET /api/v1/rootfolders':
      return json([
        {
          id: 'rf1',
          path: ROOT,
          accessible: true,
          free: 1e12,
          total: 2e12,
          movies: 0,
          device: null,
        },
      ])
    case 'GET /api/v1/qualityprofiles':
      return json([
        { id: 'qp-hd', name: 'HD-1080p' },
        { id: 'qp-any', name: 'Any' },
      ])
    case 'GET /api/v1/import/library':
      return json(state.status)
    case 'POST /api/v1/import/library/scan':
      if (state.noKey)
        return json(
          {
            error: {
              code: 'unavailable',
              message: 'Add a TMDB key.',
              details: { reason: 'no-tmdb-key' },
            },
          },
          503,
        )
      return json([
        candidate('Sintel (2010)', { match: { tmdbId: 45745, title: 'Sintel', year: 2010 } }),
        candidate('Mystery Film', { skip: 'No match on TMDB. Pick the movie to import it.' }),
        candidate('Metropolis (1927)', {
          match: { tmdbId: 19, title: 'Metropolis', year: 1927 },
          inLibrary: true,
          skip: 'Already in the library.',
        }),
      ])
    case 'POST /api/v1/import/library':
      state.status = {
        ...idle,
        state: 'running',
        root: ROOT,
        rename: body.rename,
        total: body.items.length,
        startedAt: new Date().toISOString(),
      }
      return json(state.status)
    case 'GET /api/v1/fs':
      return json({ path: '/data/downloads', parent: null, entries: [] })
    case 'POST /api/v1/import/scan':
      return json([])
    case 'GET /api/v1/movies':
      return json({ items: [], next: null, total: 0, counts: {} })
  }
  return json({ error: { code: 'not-found', message: `No fake for ${method} ${path}` } }, 404)
}

beforeEach(() => {
  state = { status: idle, requests: [], noKey: false }
})
afterEach(() => cleanup())

const settle = () =>
  act(async () => {
    for (let i = 0; i < 6; i++) await new Promise((r) => setTimeout(r, 0))
  })

async function open(screen: ReactNode) {
  const client = createClient({ fetch: api as never })
  await act(async () => {
    render(
      <ClientProvider client={client}>
        <TooltipProvider>{screen}</TooltipProvider>
      </ClientProvider>,
    )
  })
  await settle()
  return { user: userEvent.setup(), page: within(document.body) }
}

const requested = (method: string, path: string) =>
  state.requests.filter((r) => r.method === method && r.path === path)

describe('A17 Library import', () => {
  test('opened with a root folder it looks inside, and shows each folder’s match', async () => {
    const { page } = await open(<LibraryImport root={ROOT} />)
    expect(requested('POST', '/api/v1/import/library/scan')[0]?.body).toEqual({ root: ROOT })

    const sintel = within(page.getByRole('row', { name: /Sintel \(2010\)/ }))
    expect(sintel.getByText('Sintel (2010)', { selector: 'td:nth-child(3)' })).toBeTruthy()
    expect(
      (sintel.getByRole('checkbox', { name: 'Import Sintel (2010)' }) as HTMLElement).getAttribute(
        'data-state',
      ),
    ).toBe('checked')

    const mystery = within(page.getByRole('row', { name: /Mystery Film/ }))
    expect(mystery.getByText(/No match on TMDB\. Add \{tmdb-…\} with the movie’s id/)).toBeTruthy()
    expect(
      mystery.getByRole('checkbox', { name: 'Import Mystery Film' }).hasAttribute('disabled'),
    ).toBe(true)

    const metropolis = within(page.getByRole('row', { name: /Metropolis \(1927\)/ }))
    expect(metropolis.getByText('In the library')).toBeTruthy()
  })

  test('Import sends the checked folders, Rename to my format and the profile; progress shows', async () => {
    const { user, page } = await open(<LibraryImport root={ROOT} />)
    expect(page.getByText('Nothing is moved or renamed.')).toBeTruthy()
    await user.click(page.getByRole('checkbox', { name: 'Rename to my format' }))
    expect(page.getByText(/Folders and files take the naming formats/)).toBeTruthy()

    await user.click(page.getByRole('button', { name: 'Import 1 movie' }))
    await settle()
    expect(requested('POST', '/api/v1/import/library')[0]?.body).toEqual({
      items: [{ folder: `${ROOT}/Sintel (2010)`, tmdbId: 45745 }],
      rename: true,
    })
  })

  test('a run in progress shows how far it’s got', async () => {
    state.status = { ...idle, state: 'running', root: ROOT, total: 4, done: 1 }
    const { page } = await open(<LibraryImport root={ROOT} />)
    const progress = within(page.getByRole('region', { name: 'Importing' }))
    expect(progress.getByText('A library import is running.')).toBeTruthy()
    expect(progress.getByText('1 of 4 done')).toBeTruthy()
    expect(page.getByRole('button', { name: 'Import 1 movie' }).hasAttribute('disabled')).toBe(true)
  })

  test('without a TMDB key it says where to add one', async () => {
    state.noKey = true
    const { page } = await open(<LibraryImport root={ROOT} />)
    expect(page.getByText('Matching needs a TMDB key. Add one in Settings › General.')).toBeTruthy()
  })

  test('Manual import and Library import link to each other', async () => {
    const { page } = await open(<ManualImport />)
    const modes = within(page.getByRole('navigation', { name: 'What to import' }))
    expect(modes.getByRole('link', { name: 'Library import' }).getAttribute('href')).toBe(
      '/activity/import?mode=library',
    )
    expect(modes.getByRole('link', { name: 'Manual import' }).getAttribute('aria-current')).toBe(
      'page',
    )
  })
})
