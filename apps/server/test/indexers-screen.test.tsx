// SPDX-License-Identifier: AGPL-3.0-only
// A9 Indexers rendered against a fake of the API: the catalog's version and What changed, the
// Installed table (health, backoff, Local, stats with no queries yet, enable, Retry now, Edit with
// priority), and the Catalog tab (one-click Add, Set up's generated form, a failing test shown in
// the dialog). The shell is stood in for.
import './dom.ts'
import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'
import type { ReactNode } from 'react'

mock.module('next/navigation', () => ({
  useRouter: () => ({ push: () => {} }),
  usePathname: () => '/indexers',
  useSearchParams: () => new URLSearchParams(),
}))
mock.module('../src/admin/shell.tsx', () => ({
  useShell: () => ({ role: 'owner' }),
  AdminPage: ({
    title,
    description,
    actions,
    children,
  }: {
    title: ReactNode
    description?: ReactNode
    actions?: ReactNode
    children?: ReactNode
  }) => (
    <main>
      <h1>{title}</h1>
      <div>{description}</div>
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
const { Indexers, isOneClick } = await import('../src/admin/indexers.tsx')

// ---------------------------------------------------------------- the fake API

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

const field = (key: string, label: string, extra: Record<string, unknown> = {}) => ({
  key,
  label,
  type: 'text',
  required: false,
  secret: false,
  help: null,
  ...extra,
})

const definition = (id: string, name: string, extra: Record<string, unknown> = {}) => ({
  id,
  version: '1.0.0',
  name,
  description: `${name}, for tests.`,
  privacy: 'public',
  language: 'en',
  kind: 'torznab',
  protocol: 'torrent',
  categories: ['Movies'],
  settings: [],
  source: { author: 'highsea', documentation: 'https://example.test/docs' },
  license: 'CC0-1.0',
  minEngineVersion: '1.0.0',
  starter: true,
  links: [],
  logo: null,
  local: false,
  origin: 'main',
  installed: 0,
  ...extra,
})

const TORZNAB = definition('generic-torznab', 'Torznab', {
  settings: [
    field('baseUrl', 'Address', { type: 'url', required: true, help: 'The indexer’s address.' }),
    field('apiKey', 'API key', { type: 'password', required: true, secret: true }),
  ],
})
const ARCHIVE = definition('internet-archive', 'Internet Archive', { kind: 'json' })
const PRIVATE = definition('bosun', 'Bosun', {
  privacy: 'private',
  language: 'es',
  local: true,
  settings: [field('passkey', 'Passkey', { required: true, secret: true })],
})

const indexer = (extra: Record<string, unknown> = {}) => ({
  id: 'ix_1',
  definitionId: 'generic-torznab',
  name: 'Fake Torznab',
  privacy: 'public',
  kind: 'torznab',
  protocol: 'torrent',
  enabled: true,
  priority: 25,
  health: 'backoff',
  backoffUntil: new Date(Date.now() + 9 * 60_000).toISOString(),
  failingSince: null,
  lastError: 'The indexer answered 503.',
  needsAttention: false,
  missing: false,
  local: true,
  definitionVersion: '1.0.0',
  logo: null,
  settings: { values: { baseUrl: 'https://fake.test/torznab' }, secrets: { apiKey: true } },
  stats: { queries24h: 0, grabs24h: 0, avgResponseMs: null, successRate: null },
  seeding: { ratio: null, minutes: null, minMinutes: null },
  addedAt: new Date().toISOString(),
  ...extra,
})

type Req = { method: string; path: string; body: unknown }
let state: { indexers: ReturnType<typeof indexer>[]; requests: Req[]; addFails: boolean }

async function api(url: string, init: RequestInit = {}): Promise<Response> {
  const u = new URL(url, 'http://localhost')
  const method = init.method ?? 'GET'
  const path = u.pathname
  if (path === '/api/v1/events')
    return new Response(new ReadableStream(), { headers: { 'content-type': 'text/event-stream' } })
  const body = init.body ? JSON.parse(String(init.body)) : undefined
  state.requests.push({ method, path: path + u.search, body })
  switch (`${method} ${path}`) {
    case 'GET /api/v1/catalog':
      return json({
        version: '2026.10.21',
        channel: 'stable',
        autoUpdate: true,
        engineVersion: '1.0.0',
        lastCheck: null,
        available: null,
        changes: [{ version: '2026.10.21', date: '2026-10-21', notes: ['The first definitions.'] }],
        extras: [],
        brokenLocal: [],
      })
    case 'GET /api/v1/catalog/indexers':
      return json([ARCHIVE, PRIVATE, TORZNAB])
    case 'GET /api/v1/indexers':
      return json(state.indexers)
    case 'POST /api/v1/indexers': {
      const test = { ok: !state.addFails, message: 'The indexer answered.', latencyMs: 40 }
      if (state.addFails)
        return json(
          {
            error: {
              code: 'invalid',
              message: 'The key was refused.',
              details: { field: 'settings', test: { ...test, message: 'The key was refused.' } },
            },
          },
          400,
        )
      return json({ indexer: indexer({ name: 'Internet Archive' }), test }, 201)
    }
    case 'POST /api/v1/indexers/ix_1/retry':
      return json(indexer({ health: 'healthy', backoffUntil: null }))
    case 'PATCH /api/v1/indexers/ix_1':
      return json(indexer(body as Record<string, unknown>))
  }
  return json({ error: { code: 'not-found', message: `No fake for ${method} ${path}` } }, 404)
}

beforeEach(() => {
  state = { indexers: [indexer()], requests: [], addFails: false }
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
          <Indexers />
        </TooltipProvider>
      </ClientProvider>,
    )
  })
  await settle()
  return { user: userEvent.setup(), page: within(document.body) }
}

const requested = (method: string, path: string) =>
  state.requests.filter((r) => r.method === method && r.path.split('?')[0] === path)

// ---------------------------------------------------------------- tests

describe('A9 Indexers', () => {
  test('one click only for public definitions with nothing required to fill in', () => {
    expect(isOneClick(ARCHIVE as never)).toBe(true)
    expect(isOneClick(TORZNAB as never)).toBe(false)
    expect(isOneClick(PRIVATE as never)).toBe(false)
  })

  test('the header shows the catalog’s version, and What changed its notes', async () => {
    const { user, page } = await open()
    expect(page.getByText('2026.10.21', { selector: 'span' })).toBeTruthy()
    await user.click(page.getByRole('button', { name: 'What changed' }))
    await settle()
    const dialog = within(page.getByRole('dialog'))
    expect(dialog.getByText('The first definitions.')).toBeTruthy()
  })

  test('Installed: health and backoff, Local, no stats yet, Retry now and enabling', async () => {
    const { user, page } = await open()
    const row = within(page.getByRole('row', { name: /Fake Torznab/ }))
    expect(row.getByText('Backing off')).toBeTruthy()
    expect(row.getByText(/The indexer answered 503\. Trying again in/)).toBeTruthy()
    expect(row.getByText('Local')).toBeTruthy()
    expect(row.getByText('Public · priority 25')).toBeTruthy()
    expect(row.getAllByText('—')).toHaveLength(2)

    await user.click(row.getByRole('button', { name: 'Retry now' }))
    await settle()
    expect(requested('POST', '/api/v1/indexers/ix_1/retry')).toHaveLength(1)

    await user.click(row.getByRole('switch', { name: 'Fake Torznab enabled' }))
    await settle()
    expect(requested('PATCH', '/api/v1/indexers/ix_1')[0]?.body).toEqual({ enabled: false })
  })

  test('Edit changes the name and priority, and leaves the saved settings alone', async () => {
    const { user, page } = await open()
    await user.click(page.getByRole('button', { name: 'More for Fake Torznab' }))
    await user.click(await page.findByRole('menuitem', { name: 'Edit' }))
    await settle()
    const dialog = within(page.getByRole('dialog'))
    expect((dialog.getByLabelText('Address') as HTMLInputElement).value).toBe(
      'https://fake.test/torznab',
    )
    expect(dialog.getByText('Saved. Leave it empty to keep it.')).toBeTruthy()
    const priority = dialog.getByLabelText('Priority')
    await user.clear(priority)
    await user.type(priority, '60')
    await user.click(dialog.getByRole('button', { name: 'Save' }))
    await settle()
    expect(dialog.getByText('Use a whole number from 1 to 50.')).toBeTruthy()
    await user.clear(priority)
    await user.type(priority, '10')
    await user.click(dialog.getByRole('button', { name: 'Save' }))
    await settle()
    expect(requested('PATCH', '/api/v1/indexers/ix_1')[0]?.body).toEqual({
      name: 'Fake Torznab',
      priority: 10,
    })
  })

  test('Edit sets the seeding rule in hours; empty fields use Download client’s', async () => {
    state.indexers = [indexer({ seeding: { ratio: 2, minutes: null, minMinutes: null } })]
    const { user, page } = await open()
    await user.click(page.getByRole('button', { name: 'More for Fake Torznab' }))
    await user.click(await page.findByRole('menuitem', { name: 'Edit' }))
    await settle()
    const dialog = within(page.getByRole('dialog'))
    expect((dialog.getByLabelText('Ratio') as HTMLInputElement).value).toBe('2')
    const minimum = dialog.getByLabelText('Minimum, in hours')
    await user.type(minimum, '-1')
    await user.click(dialog.getByRole('button', { name: 'Save' }))
    await settle()
    expect(dialog.getByText('Use a number of hours up to a year, or leave it empty.')).toBeTruthy()
    expect(requested('PATCH', '/api/v1/indexers/ix_1')).toHaveLength(0)

    await user.clear(minimum)
    await user.type(minimum, '72')
    await user.clear(dialog.getByLabelText('Ratio'))
    await user.type(dialog.getByLabelText('Time, in hours'), '1.5')
    await user.click(dialog.getByRole('button', { name: 'Save' }))
    await settle()
    expect(requested('PATCH', '/api/v1/indexers/ix_1')[0]?.body).toEqual({
      name: 'Fake Torznab',
      priority: 25,
      seeding: { ratio: null, minutes: 90, minMinutes: 4320 },
    })
  })

  test('the empty state points to the catalog', async () => {
    state.indexers = []
    const { user, page } = await open()
    expect(page.getByText('No indexers yet')).toBeTruthy()
    await user.click(page.getByRole('button', { name: 'Browse the catalog' }))
    await settle()
    expect(page.getByRole('button', { name: 'Add Internet Archive' })).toBeTruthy()
  })
})

describe('A9’s catalog', () => {
  async function catalogTab() {
    const opened = await open()
    await opened.user.click(opened.page.getByRole('tab', { name: 'Catalog' }))
    await settle()
    return opened
  }

  test('cards, filters and one-click Add', async () => {
    const { user, page } = await catalogTab()
    expect(page.getAllByText('English · v1.0.0 · CC0-1.0')).toHaveLength(2)
    expect(page.getByText('Spanish · v1.0.0 · CC0-1.0')).toBeTruthy()
    expect(page.getByRole('button', { name: 'Set up Torznab' })).toBeTruthy()
    expect(page.getByRole('button', { name: 'Set up Bosun' })).toBeTruthy()

    await user.type(page.getByLabelText('Search the catalog'), 'archive')
    expect(page.queryByRole('button', { name: 'Set up Torznab' })).toBeNull()

    await user.click(page.getByRole('button', { name: 'Add Internet Archive' }))
    await settle()
    expect(requested('POST', '/api/v1/indexers')[0]?.body).toEqual({
      definitionId: 'internet-archive',
    })
  })

  test('Set up checks required fields, then shows a failed test in the dialog', async () => {
    state.addFails = true
    const { user, page } = await catalogTab()
    await user.click(page.getByRole('button', { name: 'Set up Torznab' }))
    await settle()
    const dialog = within(page.getByRole('dialog'))
    await user.click(dialog.getByRole('button', { name: 'Test and save' }))
    await settle()
    expect(dialog.getByText('Enter your address.')).toBeTruthy()
    expect(dialog.getByText('Enter your api key.')).toBeTruthy()
    expect(requested('POST', '/api/v1/indexers')).toHaveLength(0)

    await user.type(dialog.getByLabelText('Address'), 'https://fake.test/torznab')
    await user.type(dialog.getByLabelText('API key'), 'secret-key')
    await user.click(dialog.getByRole('button', { name: 'Test and save' }))
    await settle()
    expect(requested('POST', '/api/v1/indexers')[0]?.body).toEqual({
      definitionId: 'generic-torznab',
      settings: { baseUrl: 'https://fake.test/torznab', apiKey: 'secret-key' },
    })
    expect(dialog.getByRole('alert').textContent).toBe('The key was refused.')
  })
})
