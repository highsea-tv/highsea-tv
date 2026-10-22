// SPDX-License-Identifier: AGPL-3.0-only
// A10 Subtitles (checkpoint 7a), rendered against a fake of the API: the stats and the wanted
// list with its total and Show more; the providers' accounts, a throttled row, one this build
// can't use, one that needs an account first, the attribution, and Edit's Test and Save, which
// only the owner sees; a profile created and a refused delete; and the sync caption. The shell
// and Next's router are stood in for.
import './dom.ts'
import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'
import type { ReactNode } from 'react'

let role = 'owner'
mock.module('next/navigation', () => ({
  useRouter: () => ({ push: () => {} }),
  usePathname: () => '/subtitles',
  useSearchParams: () => new URLSearchParams(),
}))
mock.module('../src/admin/shell.tsx', () => ({
  useShell: () => ({ role }),
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
const { Subtitles } = await import('../src/admin/subtitles.tsx')

// ---------------------------------------------------------------- the fake API

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const failure = (code: string, message: string, status: number) =>
  json({ error: { code, message } }, status)

const later = () => new Date(Date.now() + 40 * 60_000).toISOString()

const provider = (extra: Record<string, unknown>) => ({
  enabled: false,
  requiresAuth: true,
  account: null,
  rateLimitRemaining: null,
  rateLimitMax: null,
  throttledUntil: null,
  throttleReason: null,
  attribution: null,
  unavailable: null,
  ...extra,
})

const providers = () => [
  provider({
    id: 'opensubtitles',
    name: 'OpenSubtitles.com',
    url: 'https://www.opensubtitles.com',
    enabled: true,
    account: 'ines',
    rateLimitRemaining: 0,
    rateLimitMax: 20,
    throttledUntil: later(),
    throttleReason: 'quota',
    attribution: 'Subtitles provided by OpenSubtitles.com',
    fields: [
      { key: 'username', secret: false, set: true, value: 'ines' },
      { key: 'password', secret: true, set: true, value: null },
    ],
  }),
  provider({
    id: 'subdl',
    name: 'Subdl',
    url: 'https://subdl.com',
    fields: [{ key: 'apiKey', secret: true, set: false, value: null }],
  }),
  provider({
    id: 'subsource',
    name: 'SubSource',
    url: 'https://subsource.net',
    unavailable: 'This build of highsea can’t reach SubSource.',
    fields: [{ key: 'apiKey', secret: true, set: false, value: null }],
  }),
]

const movie = (id: number, title: string) => ({
  movie: { id, title, year: 2010, path: `/movies/${title} (2010)` },
  missingLanguages: ['en', 'pt-BR'],
})

// 60 movies: the first page shows 50, Show more the rest
const WANTED = [
  movie(1, 'Sintel'),
  ...Array.from({ length: 58 }, (_, i) => movie(100 + i, `Movie ${i + 1}`)),
  movie(2, 'Tears of Steel'),
]

type Req = { method: string; path: string; query: URLSearchParams; body: unknown }
let state: { requests: Req[]; profiles: Record<string, unknown>[] }

async function api(url: string, init: RequestInit = {}): Promise<Response> {
  const u = new URL(url, 'http://localhost')
  const method = init.method ?? 'GET'
  const path = u.pathname
  if (path === '/api/v1/events')
    return new Response(new ReadableStream(), { headers: { 'content-type': 'text/event-stream' } })
  const body = init.body ? JSON.parse(String(init.body)) : undefined
  state.requests.push({ method, path, query: u.searchParams, body })
  switch (`${method} ${path}`) {
    case 'GET /api/v1/subtitles/stats':
      return json({ syncedToday: 0, waiting: 3, avgOffsetMs: 0, avgConfidence: 0 })
    case 'GET /api/v1/subtitles/wanted': {
      const from = Number(u.searchParams.get('cursor') ?? 0)
      const limit = Number(u.searchParams.get('limit') ?? 50)
      const items = WANTED.slice(from, from + limit)
      const next = from + limit < WANTED.length ? String(from + limit) : null
      return json({ items, next, total: WANTED.length })
    }
    case 'POST /api/v1/subtitles/wanted/search':
      return json({ queued: 2 })
    case 'GET /api/v1/subtitles/languages':
      return json([
        { code: 'en', name: 'English' },
        { code: 'pt-BR', name: 'Portuguese (Brazil)' },
        { code: 'fr', name: 'French' },
      ])
    case 'GET /api/v1/subtitles/providers':
      return json(providers())
    case 'POST /api/v1/subtitles/providers/subdl/test':
      return json(
        body.apiKey === 'good'
          ? { ok: true, message: 'Signed in to Subdl.', account: '••••good' }
          : { ok: false, message: 'Subdl refused the key. Check it and try again.', account: null },
      )
    case 'PUT /api/v1/subtitles/providers/subdl':
      return json({ ...providers()[1], account: '••••good' })
    case 'GET /api/v1/languageprofiles':
      return json(state.profiles)
    case 'POST /api/v1/languageprofiles': {
      const created = { id: 'lp-new', ...body }
      state.profiles.push(created)
      return json(created)
    }
    case 'DELETE /api/v1/languageprofiles/lp-en':
      return failure(
        'conflict',
        'Movies still use English. Move them to another profile first.',
        409,
      )
    case 'GET /api/v1/settings/subtitles':
      return json({
        minScore: 80,
        autoSync: true,
        minConfidence: 0.7,
        upgradeDays: 7,
        preferReleaseMatch: true,
      })
  }
  return failure('not-found', `Nothing at ${path}.`, 404)
}

beforeEach(() => {
  role = 'owner'
  state = {
    requests: [],
    profiles: [
      {
        id: 'lp-en',
        name: 'English',
        languages: [{ code: 'en', forced: 'also', hi: 'no' }],
        cutoff: 'en',
        minScore: 80,
      },
    ],
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
          <Subtitles />
        </TooltipProvider>
      </ClientProvider>,
    )
  })
  await settle()
  return { user: userEvent.setup(), page: within(document.body) }
}

const requested = (method: string, path: string) =>
  state.requests.filter((r) => r.method === method && r.path === path)

// ---------------------------------------------------------------- tests

describe('A10 Subtitles', () => {
  test('the stats, the tabs and the wanted list a page at a time', async () => {
    const { user, page } = await open()
    expect(page.getByText('waiting to sync')).toBeTruthy()
    for (const name of [/Wanted/, 'Providers', 'Languages', 'Scoring and sync'])
      expect(page.getByRole('tab', { name })).toBeTruthy()
    expect(page.getByText('60 movies missing a language')).toBeTruthy()
    expect(page.getByText('Sintel (2010)')).toBeTruthy()
    expect(page.getAllByText('Portuguese (Brazil)').length).toBeGreaterThan(0)
    expect(page.queryByText('Tears of Steel (2010)')).toBeNull()

    await user.click(page.getByRole('button', { name: 'Show more' }))
    await settle()
    expect(page.getByText('Tears of Steel (2010)')).toBeTruthy()
    expect(page.queryByRole('button', { name: 'Show more' })).toBeNull()

    await user.click(page.getByRole('button', { name: 'Search all' }))
    await settle()
    expect(requested('POST', '/api/v1/subtitles/wanted/search')).toHaveLength(1)
  })

  test('providers: accounts, a throttled row, one unavailable, one needing an account', async () => {
    const { user, page } = await open()
    await user.click(page.getByRole('tab', { name: 'Providers' }))
    await settle()
    expect(page.getByText('ines')).toBeTruthy()
    expect(page.getByText('0/20')).toBeTruthy()
    expect(page.getByText(/^Out of downloads for today\. Resumes in /)).toBeTruthy()
    expect(page.getByText('This build of highsea can’t reach SubSource.')).toBeTruthy()
    expect(page.getByText('Add your account first.')).toBeTruthy()
    expect(page.getAllByText('Needs an account')).toHaveLength(2)
    expect(page.getByText('Subtitles provided by OpenSubtitles.com')).toBeTruthy()
    const subdl = page.getByRole('switch', { name: 'Subdl enabled' }) as HTMLButtonElement
    const subsource = page.getByRole('switch', { name: 'SubSource enabled' }) as HTMLButtonElement
    expect(subdl.disabled).toBe(true)
    expect(subsource.disabled).toBe(true)
    expect(
      (page.getByRole('switch', { name: 'OpenSubtitles.com enabled' }) as HTMLButtonElement)
        .disabled,
    ).toBe(false)
  })

  test('Edit: Test says what the provider answered, then Save', async () => {
    const { user, page } = await open()
    await user.click(page.getByRole('tab', { name: 'Providers' }))
    await settle()
    await user.click(page.getByRole('button', { name: 'Edit Subdl' }))
    await settle()
    const dialog = within(page.getByRole('dialog'))
    const key = dialog.getByLabelText('API key')
    await user.type(key, 'wrong')
    await user.click(dialog.getByRole('button', { name: 'Test' }))
    await settle()
    expect(dialog.getByRole('alert').textContent).toBe(
      'Subdl refused the key. Check it and try again.',
    )
    await user.clear(key)
    await user.type(key, 'good')
    await user.click(dialog.getByRole('button', { name: 'Test' }))
    await settle()
    expect(dialog.getByText('Signed in to Subdl.')).toBeTruthy()
    await user.click(dialog.getByRole('button', { name: 'Save' }))
    await settle()
    expect(requested('PUT', '/api/v1/subtitles/providers/subdl').at(-1)?.body).toEqual({
      apiKey: 'good',
    })
    expect(page.queryByRole('dialog')).toBeNull()
  })

  test('Edit keeps a saved secret when it’s left empty', async () => {
    const { user, page } = await open()
    await user.click(page.getByRole('tab', { name: 'Providers' }))
    await settle()
    await user.click(page.getByRole('button', { name: 'Edit OpenSubtitles.com' }))
    await settle()
    const dialog = within(page.getByRole('dialog'))
    expect((dialog.getByLabelText('Username') as HTMLInputElement).value).toBe('ines')
    expect(dialog.getByText('Saved. Leave it empty to keep it.')).toBeTruthy()
  })

  test('an admin sees the providers but not Edit', async () => {
    role = 'admin'
    const { user, page } = await open()
    await user.click(page.getByRole('tab', { name: 'Providers' }))
    await settle()
    expect(page.getByText('Subdl')).toBeTruthy()
    expect(page.queryByRole('button', { name: /^Edit / })).toBeNull()
  })

  test('languages: a new profile is created, a profile in use isn’t deleted', async () => {
    const { user, page } = await open()
    await user.click(page.getByRole('tab', { name: 'Languages' }))
    await settle()
    expect(page.getByText('Stops upgrading once English is found.', { exact: false })).toBeTruthy()

    await user.click(page.getByRole('button', { name: 'New profile' }))
    await settle()
    expect(page.getByText('0 to 100. A hash match scores about 99.')).toBeTruthy()
    const editor = within(page.getByRole('region', { name: 'New profile' }))
    await user.type(editor.getByLabelText('Name'), 'Films')
    await user.click(page.getByRole('button', { name: 'Save profile' }))
    await settle()
    const created = requested('POST', '/api/v1/languageprofiles').at(-1)?.body
    expect(created).toEqual({
      name: 'Films',
      languages: [{ code: 'en', forced: 'also', hi: 'no' }],
      cutoff: null,
      minScore: 80,
    })

    await user.click(page.getByRole('button', { name: 'Edit English' }))
    await settle()
    await user.click(page.getByRole('button', { name: 'Delete' }))
    await settle()
    expect(requested('DELETE', '/api/v1/languageprofiles/lp-en')).toHaveLength(1)
    // still editing: the refusal is a toast, and the profile stays
    expect(page.getByRole('button', { name: 'Save profile' })).toBeTruthy()
  })

  test('scoring and sync has no note that sync comes later: it’s here', async () => {
    const { user, page } = await open()
    await user.click(page.getByRole('tab', { name: 'Scoring and sync' }))
    await settle()
    expect(page.queryByText('Sync arrives in the next update.')).toBeNull()
    expect(page.getByLabelText('Prefer release matches')).toBeTruthy()
  })
})
