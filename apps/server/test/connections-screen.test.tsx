// SPDX-License-Identifier: AGPL-3.0-only
// Settings › Connections (checkpoint 8b), rendered against a fake of the API: a connection's row
// with its events and last message, turning it off saved at once, Add a connection for Discord
// with Test, Edit sending a masked secret back as it came, the server's mail switch, and your
// browsers listed with Remove. The shell and Next's router are stood in for.
import './dom.ts'
import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'
import type { ReactNode } from 'react'

mock.module('next/navigation', () => ({
  useRouter: () => ({ push: () => {} }),
  usePathname: () => '/settings/connections',
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
const { createClient } = await import('@highsea/sdk')
const { ClientProvider } = await import('@highsea/sdk/react')
const { TooltipProvider } = await import('@highsea/ui-web')
const { Connections } = await import('../src/admin/connections.tsx')

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

type Req = { method: string; path: string; body: unknown }
let state: {
  connections: Record<string, unknown>[]
  subscriptions: Record<string, unknown>[]
  requests: Req[]
}

const now = new Date().toISOString()
const NTFY = {
  id: 'con_1',
  kind: 'ntfy',
  name: 'Phone',
  enabled: true,
  events: ['imported', 'health'],
  settings: { serverUrl: 'https://ntfy.sh', topic: 'highsea-home', token: '••••k3y9', priority: 3 },
  serverMail: false,
  createdAt: now,
  updatedAt: now,
  lastSentAt: new Date(Date.now() - 3_600_000).toISOString(),
  lastError: 'ntfy answered 429.',
}
const MAIL = {
  ...NTFY,
  id: 'con_2',
  kind: 'email',
  name: 'Mail',
  events: [],
  settings: {
    host: 'smtp.example.org',
    port: 587,
    security: 'starttls',
    from: 'highsea <media@example.org>',
    to: 'ines@example.org',
  },
  lastSentAt: null,
  lastError: null,
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
    case 'GET /api/v1/connections':
      return json(state.connections)
    case 'POST /api/v1/connections': {
      const saved = {
        ...body,
        id: 'con_3',
        serverMail: false,
        settings: { ...body.settings, webhookUrl: '••••wxyz' },
        createdAt: now,
        updatedAt: now,
        lastSentAt: null,
        lastError: null,
      }
      state.connections = [...state.connections, saved]
      return json(saved, 201)
    }
    case 'POST /api/v1/connections/test':
      return json({ ok: true, message: null })
    case 'GET /api/v1/me/push-subscriptions':
      return json(state.subscriptions)
  }
  if (method === 'PUT' && path.startsWith('/api/v1/connections/')) {
    const id = path.split('/').pop()
    state.connections = state.connections.map((c) => (c.id === id ? { ...c, ...body } : c))
    return json(state.connections.find((c) => c.id === id))
  }
  if (method === 'DELETE' && path.startsWith('/api/v1/me/push-subscriptions/')) {
    const id = path.split('/').pop()
    state.subscriptions = state.subscriptions.filter((s) => s.id !== id)
    return new Response(null, { status: 204 })
  }
  return json({ error: { code: 'not-found', message: `Nothing at ${path}.` } }, 404)
}

beforeEach(() => {
  state = {
    connections: [NTFY, MAIL],
    subscriptions: [
      {
        id: 'psb_1',
        label: 'Firefox on macOS',
        service: 'updates.push.services.mozilla.com',
        createdAt: now,
      },
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
          <Connections />
        </TooltipProvider>
      </ClientProvider>,
    )
  })
  await settle()
  return { user: userEvent.setup(), page: within(document.body) }
}

const requested = (method: string, path: string) =>
  state.requests.filter((r) => r.method === method && r.path === path)

describe('Settings › Connections', () => {
  test('a row shows its events and last message, and turning it off saves at once', async () => {
    const { user, page } = await open()
    const list = within(page.getByRole('list', { name: 'Notifications' }))
    expect(list.getByText('Phone')).toBeTruthy()
    expect(list.getByText('Imported')).toBeTruthy()
    expect(list.getByText('Health')).toBeTruthy()
    expect(list.getByText(/^Last sent/)).toBeTruthy()
    expect(list.getByText('The last message didn’t arrive: ntfy answered 429.')).toBeTruthy()
    expect(list.getByText('Hears nothing yet')).toBeTruthy()
    await user.click(list.getByRole('switch', { name: 'Phone: on' }))
    await settle()
    const [put] = requested('PUT', '/api/v1/connections/con_1')
    // the masked token goes back as it came, and keeps its value
    expect(put?.body).toMatchObject({ enabled: false, settings: NTFY.settings, name: 'Phone' })
  })

  test('the server’s mail is a switch on an email connection only', async () => {
    const { user, page } = await open()
    expect(page.queryByRole('switch', { name: 'Phone: sends the server’s mail' })).toBeNull()
    await user.click(page.getByRole('switch', { name: 'Mail: sends the server’s mail' }))
    await settle()
    const [put] = requested('PUT', '/api/v1/connections/con_2')
    expect(put?.body).toMatchObject({ serverMail: true, kind: 'email' })
  })

  test('Add a connection: Discord, tested, then saved with its events', async () => {
    const { user, page } = await open()
    await user.click(page.getByRole('button', { name: 'Discord' }))
    await settle()
    const dialog = within(page.getByRole('dialog'))
    expect(dialog.getByText('Add a Discord connection')).toBeTruthy()
    // the address is needed
    await user.click(dialog.getByRole('button', { name: 'Save' }))
    expect(requested('POST', '/api/v1/connections')).toHaveLength(0)
    expect(dialog.getByText('Needed.')).toBeTruthy()
    await user.type(
      dialog.getByLabelText('Webhook address'),
      'https://discord.com/api/webhooks/1/abcwxyz',
    )
    await user.click(dialog.getByRole('button', { name: 'Test' }))
    await settle()
    expect(dialog.getByText('The test message arrived.')).toBeTruthy()
    expect(requested('POST', '/api/v1/connections/test')[0]?.body).toEqual({
      kind: 'discord',
      settings: { webhookUrl: 'https://discord.com/api/webhooks/1/abcwxyz' },
    })
    await user.click(dialog.getByRole('checkbox', { name: 'Grabbed' }))
    await user.click(dialog.getByRole('checkbox', { name: 'Update' }))
    await user.click(dialog.getByRole('button', { name: 'Save' }))
    await settle()
    const [post] = requested('POST', '/api/v1/connections')
    expect(post?.body).toEqual({
      kind: 'discord',
      name: 'Discord',
      enabled: true,
      events: ['grabbed', 'imported', 'upgraded', 'download-failed', 'health'],
      settings: { webhookUrl: 'https://discord.com/api/webhooks/1/abcwxyz' },
      tags: [],
    })
    expect(page.queryByRole('dialog')).toBeNull()
  })

  test('Edit shows a saved secret as saved, and sends it back masked', async () => {
    const { user, page } = await open()
    await user.click(page.getByRole('button', { name: 'Edit Phone' }))
    await settle()
    const dialog = within(page.getByRole('dialog'))
    expect(dialog.getByText('Saved. Type a new one to change it.')).toBeTruthy()
    await user.clear(dialog.getByLabelText('Topic'))
    await user.type(dialog.getByLabelText('Topic'), 'highsea-away')
    await user.click(dialog.getByRole('button', { name: 'Save' }))
    await settle()
    const [put] = requested('PUT', '/api/v1/connections/con_1')
    expect(put?.body).toMatchObject({
      settings: { topic: 'highsea-away', token: '••••k3y9', priority: 3 },
    })
  })

  test('your browsers, and one removed', async () => {
    const { user, page } = await open()
    const browsers = within(page.getByRole('list', { name: 'Your browsers' }))
    expect(browsers.getByText('Firefox on macOS')).toBeTruthy()
    await user.click(
      browsers.getByRole('button', { name: 'Stop notifications in Firefox on macOS' }),
    )
    await settle()
    expect(requested('DELETE', '/api/v1/me/push-subscriptions/psb_1')).toHaveLength(1)
    expect(page.getByText('None of your browsers get notifications yet.')).toBeTruthy()
  })
})
