// SPDX-License-Identifier: AGPL-3.0-only
// A9 Indexers rendered against a fake of the API: the catalog's version and What changed, the
// Installed table (health, backoff, Local, stats with no queries yet, enable, Retry now, Edit with
// priority), and the Catalog tab (one-click Add, Set up's generated form, a failing test shown in
// the dialog), Report a problem's prefilled form (what it carries and what it never does), and the
// drafted upkeep lines (checked working, Beta, broken, retired) the mock serves for the owner's
// review. The shell is stood in for.
import './dom.ts'
import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from 'bun:test'
import type { ReactNode } from 'react'
import type { IndexersTab } from '../src/indexers.tsx'
import { navigation, Routed } from './router.tsx'

mock.module('../src/navigation.tsx', () => navigation)
mock.module('../src/shell.tsx', () => ({
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
const { createClient } = await import('@highsea-tv/sdk')
const { ClientProvider } = await import('@highsea-tv/sdk/react')
const { ThemeProvider, toast } = await import('@highsea-tv/ui/native')
const { shown } = await import('./modal.ts')
const { Indexers, isOneClick } = await import('../src/indexers.tsx')
const { Linking } = await import('react-native')

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
let state: {
  indexers: ReturnType<typeof indexer>[]
  catalog: (ReturnType<typeof definition> & { check?: unknown })[]
  requests: Req[]
  addFails: boolean
}

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
      return json(state.catalog)
    case 'GET /api/v1/system/server':
      return json({
        id: 'srv_1',
        name: 'Harbor',
        version: '0.4.7',
        branding: {},
        addresses: { local: ['http://192.168.1.20:3000'], public: 'https://harbor.example.net' },
        setupComplete: true,
        clientsConnected: 1,
        catalogVersion: '2026.10.21',
      })
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
  state = {
    indexers: [indexer()],
    catalog: [ARCHIVE, PRIVATE, TORZNAB],
    requests: [],
    addFails: false,
  }
})
afterEach(() => {
  cleanup()
  toast.clear()
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
        <ThemeProvider>
          <Routed<IndexersTab> base="/indexers">{(tab) => <Indexers tab={tab} />}</Routed>
        </ThemeProvider>
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
    expect(page.getByText('2026.10.21')).toBeTruthy()
    await user.click(page.getByRole('button', { name: 'What changed' }))
    await settle()
    shown()
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
    shown()
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
      tags: [],
    })
  })

  test('Edit sets the seeding rule in hours; empty fields use Download client’s', async () => {
    state.indexers = [indexer({ seeding: { ratio: 2, minutes: null, minMinutes: null } })]
    const { user, page } = await open()
    await user.click(page.getByRole('button', { name: 'More for Fake Torznab' }))
    await user.click(await page.findByRole('menuitem', { name: 'Edit' }))
    await settle()
    shown()
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
      tags: [],
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
    shown()
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

// ---------------------------------------------------------------- Report a problem

describe('Report a problem', () => {
  /** An indexer from highsea's own catalog, with everything the link must never carry. */
  const archive = () =>
    indexer({
      id: 'ix_1',
      definitionId: 'internet-archive',
      name: 'My films at home',
      local: false,
      health: 'failing',
      backoffUntil: null,
      lastError: 'Couldn’t reach https://secret.example.net/search?q=Sintel (timed out).',
      definitionVersion: '1.0.2',
      settings: {
        values: { baseUrl: 'https://private.example.org/feed' },
        secrets: { apiKey: true },
      },
    })

  async function report() {
    const opened = spyOn(Linking, 'openURL').mockResolvedValue(undefined)
    const { user, page } = await open()
    await user.click(page.getByRole('button', { name: 'More for My films at home' }))
    await user.click(await page.findByRole('menuitem', { name: 'Report a problem' }))
    const url = opened.mock.calls[0]?.[0] as string
    opened.mockRestore()
    return url
  }

  test('opens the indexer form filled in with the definition and highsea’s versions', async () => {
    state.indexers = [archive()]
    const url = new URL(await report())
    expect(`${url.origin}${url.pathname}`).toBe(
      'https://github.com/highsea-tv/highsea-tv/issues/new',
    )
    expect(Object.fromEntries(url.searchParams)).toEqual({
      template: 'indexer-broken.yml',
      title: '[Indexer] Internet Archive',
      indexer: 'internet-archive',
      'indexer-version': '1.0.2',
      'catalog-version': '2026.10.21',
      'highsea-version': '0.4.7',
      channel: 'Stable',
    })
    // a space is %20, as the catalog README's example has it
    expect(url.search).toContain('title=%5BIndexer%5D%20Internet%20Archive')
  })

  test('never carries the owner’s name for it, its settings, an address or the last error', async () => {
    state.indexers = [archive()]
    const url = decodeURIComponent(await report())
    for (const never of [
      'My films at home',
      'private.example.org',
      'secret.example.net',
      'Sintel',
      'timed out',
      '192.168.1.20',
      'harbor.example.net',
      'Harbor',
      'apiKey',
      'baseUrl',
    ])
      expect(url).not.toContain(never)
  })

  test('only for an indexer from highsea’s own catalog', async () => {
    // the default indexer is Local: its definition isn't the catalog's to fix
    const { user, page } = await open()
    await user.click(page.getByRole('button', { name: 'More for Fake Torznab' }))
    await page.findByRole('menuitem', { name: 'Edit' })
    expect(page.queryByRole('menuitem', { name: 'Report a problem' })).toBeNull()
  })
})

// ---------------------------------------------------------------- drafted upkeep lines

describe('the catalog’s upkeep, drafted for review', () => {
  const day = (daysAgo: number) =>
    new Date(Date.now() - daysAgo * 86_400_000).toISOString().slice(0, 10)
  const check = (extra: Record<string, unknown>) => ({
    verified: day(2),
    channel: 'stable',
    status: 'working',
    since: null,
    note: null,
    ...extra,
  })

  test('cards say when each was checked, Beta and Broken; a retired one leaves the list', async () => {
    state.catalog = [
      { ...ARCHIVE, check: check({}) },
      definition('yts', 'YTS', { check: check({ channel: 'beta', verified: null }) }),
      definition('knaben', 'Knaben', {
        check: check({
          verified: day(45),
          status: 'broken',
          since: day(3),
          note: 'A fix is coming.',
        }),
      }),
      definition('gone', 'Gone', {
        check: check({ status: 'retired', since: day(9), note: 'The site closed.' }),
      }),
      TORZNAB,
    ]
    const { user, page } = await open()
    await user.click(page.getByRole('tab', { name: 'Catalog' }))
    await settle()
    const card = (name: string) =>
      within(page.getByRole('heading', { name }).closest('[role="listitem"]') as HTMLElement)
    expect(card('Internet Archive').getByText(/^Checked working on /)).toBeTruthy()
    expect(card('YTS').getByText('Beta')).toBeTruthy()
    expect(card('YTS').getByText('Not checked yet.')).toBeTruthy()
    expect(card('Knaben').getByText('Broken')).toBeTruthy()
    expect(card('Knaben').getByText(/^Last checked working on /)).toBeTruthy()
    expect(card('Knaben').getByText(/^Broken since .+\. A fix is coming\.$/)).toBeTruthy()
    expect(page.queryByRole('heading', { name: 'Gone' })).toBeNull()
    // a definition the catalog says nothing about draws no line, as with the server today
    expect(card('Torznab').queryByText(/checked/i)).toBeNull()
  })

  test('the Installed row and the Edit dialog say it too', async () => {
    state.indexers = [
      indexer({
        definitionId: 'internet-archive',
        name: 'Internet Archive',
        local: false,
        health: 'healthy',
        backoffUntil: null,
        lastError: null,
      }),
    ]
    state.catalog = [
      {
        ...ARCHIVE,
        check: check({ status: 'retired', since: day(9), note: 'The site closed.' }),
      },
    ]
    const { user, page } = await open()
    const row = within(page.getByRole('row', { name: /Internet Archive/ }))
    expect(row.getByText('Retired')).toBeTruthy()
    expect(row.getByText(/^Retired on .+\. The site closed\.$/)).toBeTruthy()
    await user.click(row.getByRole('button', { name: 'More for Internet Archive' }))
    await user.click(await page.findByRole('menuitem', { name: 'Edit' }))
    await settle()
    shown()
    const dialog = within(page.getByRole('dialog'))
    expect(dialog.getByText(/^Definition v1\.0\.0\. Checked working on /)).toBeTruthy()
  })
})
