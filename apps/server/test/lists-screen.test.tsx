// SPDX-License-Identifier: AGPL-3.0-only
// Settings › Import lists (checkpoint 8a), rendered against a fake of the API: each list's row with
// its last check, a change from the row saved at once, Add a list for the generic kind with Test,
// Trakt's device flow polled to connected, and an exclusion removed. The shell and Next's router
// are stood in for.
import './dom.ts'
import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'
import type { ReactNode } from 'react'

mock.module('next/navigation', () => ({
  useRouter: () => ({ push: () => {} }),
  usePathname: () => '/settings/lists',
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
const { TooltipProvider } = await import('@highsea-tv/ui-web')
const { ImportLists } = await import('../src/admin/lists.tsx')

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

type Req = { method: string; path: string; body: unknown }
let state: {
  lists: Record<string, unknown>[]
  trakt: { available: boolean; account: string | null }
  polls: string[]
  exclusions: Record<string, unknown>[]
  requests: Req[]
}

const LIST = {
  id: 'lst_1',
  kind: 'tmdb',
  name: 'Blender films',
  enabled: true,
  settings: { kind: 'tmdb', source: 'list', list: '8512345' },
  rootFolder: '/data/media/movies',
  qualityProfileId: 'qp-hd',
  languageProfileId: null,
  monitored: true,
  minimumAvailability: 'released',
  searchOnAdd: true,
  lastSync: new Date(Date.now() - 3_600_000).toISOString(),
  lastResult: { found: 8, added: 3, skipped: 5, unresolved: ['Not on TMDB'], error: null },
  items: 8,
}

async function api(url: string, init: RequestInit = {}): Promise<Response> {
  const u = new URL(url, 'http://localhost')
  const method = init.method ?? 'GET'
  const path = u.pathname
  if (path === '/api/v1/events')
    return new Response(new ReadableStream(), { headers: { 'content-type': 'text/event-stream' } })
  const body = init.body ? JSON.parse(String(init.body)) : undefined
  state.requests.push({ method, path, body })
  switch (`${method} ${path}`) {
    case 'GET /api/v1/import-lists':
      return json(state.lists)
    case 'POST /api/v1/import-lists': {
      const saved = {
        ...body,
        id: 'lst_2',
        kind: body.settings.kind,
        lastSync: null,
        lastResult: null,
        items: 0,
      }
      state.lists = [...state.lists, saved]
      return json(saved, 201)
    }
    case 'POST /api/v1/import-lists/test':
      return json({ ok: true, message: 'The list answered', found: 3 })
    case 'GET /api/v1/import-lists/trakt':
      return json(state.trakt)
    case 'POST /api/v1/import-lists/trakt/connect':
      return json({
        userCode: '5055CC52',
        verificationUrl: 'https://trakt.tv/activate',
        expiresAt: new Date(Date.now() + 600_000).toISOString(),
        interval: 0,
      })
    case 'POST /api/v1/import-lists/trakt/poll': {
      const state_ = state.polls.shift() ?? 'pending'
      if (state_ === 'connected') state.trakt = { available: true, account: 'highsea-owner' }
      return json({ state: state_ })
    }
    case 'GET /api/v1/import-lists/exclusions':
      return json(state.exclusions)
    case 'GET /api/v1/rootfolders':
      return json([
        { id: 'rf_1', path: '/data/media/movies', free: null, total: null, device: null },
      ])
    case 'GET /api/v1/qualityprofiles':
      return json([
        { id: 'qp-hd', name: 'HD 1080p' },
        { id: 'qp-uhd', name: 'Ultra HD' },
      ])
    case 'GET /api/v1/languageprofiles':
      return json([])
  }
  if (method === 'PUT' && path.startsWith('/api/v1/import-lists/')) {
    const id = path.split('/').pop()
    state.lists = state.lists.map((l) => (l.id === id ? { ...l, ...body } : l))
    return json(state.lists.find((l) => l.id === id))
  }
  if (method === 'DELETE' && path.startsWith('/api/v1/import-lists/exclusions/')) {
    const id = Number(path.split('/').pop())
    state.exclusions = state.exclusions.filter((e) => e.tmdbId !== id)
    return new Response(null, { status: 204 })
  }
  return json({ error: { code: 'not-found', message: `Nothing at ${path}.` } }, 404)
}

beforeEach(() => {
  state = {
    lists: [LIST],
    trakt: { available: true, account: null },
    polls: [],
    exclusions: [
      { tmdbId: 45745, title: 'Sintel', year: 2010, createdAt: new Date().toISOString() },
    ],
    requests: [],
  }
})
afterEach(() => cleanup())

const settle = () =>
  act(async () => {
    for (let i = 0; i < 6; i++) await new Promise((r) => setTimeout(r, 0))
  })

async function open() {
  const client = createClient({ fetch: api as never })
  await act(async () => {
    render(
      <ClientProvider client={client}>
        <TooltipProvider>
          <ImportLists />
        </TooltipProvider>
      </ClientProvider>,
    )
  })
  await settle()
  return { user: userEvent.setup(), page: within(document.body) }
}

const requested = (method: string, path: string) =>
  state.requests.filter((r) => r.method === method && r.path === path)

describe('Settings › Import lists', () => {
  test('a list’s row shows its last check, and turning it off saves at once', async () => {
    const { user, page } = await open()
    const lists = within(page.getByRole('list', { name: 'Lists' }))
    expect(lists.getByText('Blender films')).toBeTruthy()
    expect(lists.getByText(/TMDB · A list · 8 titles · adds and searches/)).toBeTruthy()
    expect(lists.getByText(/3 added, 5 already here or excluded/)).toBeTruthy()
    expect(lists.getByText('Couldn’t match on TMDB: Not on TMDB')).toBeTruthy()
    await user.click(lists.getByRole('switch', { name: 'Blender films: on' }))
    await settle()
    const [put] = requested('PUT', '/api/v1/import-lists/lst_1')
    expect(put?.body).toMatchObject({ enabled: false, settings: LIST.settings, name: LIST.name })
  })

  test('Add a list: a generic list, tested, then saved', async () => {
    const { user, page } = await open()
    await user.click(page.getByRole('button', { name: 'Add a list' }))
    await settle()
    const dialog = within(page.getByRole('dialog'))
    await user.click(dialog.getByRole('radio', { name: 'Generic list' }))
    await user.type(dialog.getByLabelText('Address'), 'https://lists.example/blender.json')
    await user.click(dialog.getByRole('button', { name: 'Test' }))
    await settle()
    expect(dialog.getByText('The list answered (3 titles)')).toBeTruthy()
    // a name is needed first
    await user.click(dialog.getByRole('button', { name: 'Save' }))
    expect(requested('POST', '/api/v1/import-lists')).toHaveLength(0)
    await user.type(dialog.getByLabelText('Name'), 'Blender, generic')
    await user.click(dialog.getByRole('button', { name: 'Save' }))
    await settle()
    const [post] = requested('POST', '/api/v1/import-lists')
    expect(post?.body).toEqual({
      name: 'Blender, generic',
      enabled: true,
      settings: { kind: 'generic', url: 'https://lists.example/blender.json' },
      rootFolder: '/data/media/movies',
      qualityProfileId: 'qp-hd',
      languageProfileId: null,
      monitored: true,
      minimumAvailability: 'released',
      searchOnAdd: false,
      tags: [],
    })
    expect(page.queryByRole('dialog')).toBeNull()
  })

  test('Trakt connects with a code, polled until it’s approved', async () => {
    const { user, page } = await open()
    const trakt = within(page.getByRole('region', { name: 'Trakt account' }))
    await user.click(trakt.getByRole('button', { name: 'Connect' }))
    await settle()
    expect(trakt.getByText('5055CC52')).toBeTruthy()
    expect(trakt.getByRole('link', { name: 'trakt.tv/activate' }).getAttribute('href')).toBe(
      'https://trakt.tv/activate',
    )
    // pending until approved on Trakt
    expect(requested('POST', '/api/v1/import-lists/trakt/poll').length).toBeGreaterThan(0)
    state.polls = ['connected']
    await settle()
    await settle()
    expect(trakt.getByText('Connected as highsea-owner.')).toBeTruthy()
  })

  test('without highsea’s Trakt application, Trakt says so', async () => {
    state.trakt = { available: false, account: null }
    const { page } = await open()
    const trakt = within(page.getByRole('region', { name: 'Trakt account' }))
    expect(trakt.getByText(/no Trakt application/)).toBeTruthy()
    expect(trakt.queryByRole('button', { name: 'Connect' })).toBeNull()
  })

  test('an exclusion removed lets lists add the movie again', async () => {
    const { user, page } = await open()
    const exclusions = within(page.getByRole('region', { name: 'Exclusions' }))
    await user.click(exclusions.getByRole('button', { name: 'Let lists add Sintel (2010) again' }))
    await settle()
    expect(requested('DELETE', '/api/v1/import-lists/exclusions/45745')).toHaveLength(1)
    expect(exclusions.getByText('No exclusions.')).toBeTruthy()
  })
})
