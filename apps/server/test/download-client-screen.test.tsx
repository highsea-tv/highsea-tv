// SPDX-License-Identifier: AGPL-3.0-only
// Settings › Download client (checkpoint 6a), rendered against a fake of the API: the VPN in one
// line with the way to Settings › VPN; Connections, with encryption and UPnP stored for a later
// update; the default seeding rule in hours; and a save that sends Downloads' current speed limits
// rather than stale ones. The shell and Next's router are stood in for.
import './dom.ts'
import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'
import type { ReactNode } from 'react'

mock.module('next/navigation', () => ({
  useRouter: () => ({ push: () => {} }),
  usePathname: () => '/settings/downloads',
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
const { DownloadClient } = await import('../src/admin/download-client.tsx')
const { hoursText, minutesOf, ratioOf } = await import('../src/admin/download-client-seeding.ts')

// ---------------------------------------------------------------- the fake API

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

type Req = { method: string; path: string; body: unknown }
let state: {
  client: Record<string, unknown>
  limits: { downloadRate: number; uploadRate: number }
  requests: Req[]
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
    case 'GET /api/v1/settings/downloadClient':
      return json(state.client)
    case 'PUT /api/v1/settings/downloadClient':
      state.client = body
      return json(state.client)
    case 'GET /api/v1/torrents/limits':
      return json(state.limits)
    case 'GET /api/v1/vpn/status':
      return json({
        mode: 'container',
        provider: 'gluetun',
        state: 'connected',
        message: null,
        needsCapability: false,
        exitIp: '185.159.157.12',
        country: 'Netherlands',
        forwardedPort: null,
        checks: [],
        checkedAt: null,
      })
  }
  return json({ error: { code: 'not-found', message: `Nothing at ${path}.` } }, 404)
}

beforeEach(() => {
  state = {
    client: {
      port: 6881,
      encryption: 'prefer',
      upnp: false,
      maxActive: 3,
      downloadRate: 0,
      uploadRate: 0,
      seedRatio: 2,
      seedMinutes: 10_080,
    },
    limits: { downloadRate: 0, uploadRate: 0 },
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
          <DownloadClient />
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

describe('seeding fields', () => {
  test('hours in the form, minutes in the API; empty is no limit', () => {
    expect(hoursText(4320)).toBe('72')
    expect(hoursText(90)).toBe('1.5')
    expect(hoursText(null)).toBe('')
    expect(minutesOf('72')).toBe(4320)
    expect(minutesOf(' ')).toBeNull()
    expect(minutesOf('-1')).toBeUndefined()
    expect(minutesOf(String(24 * 366))).toBeUndefined()
    expect(ratioOf('1.5')).toBe(1.5)
    expect(ratioOf('101')).toBeUndefined()
  })
})

describe('Settings › Download client', () => {
  test('the VPN line leads to Settings › VPN; speed limits point to Downloads', async () => {
    const { page } = await open()
    const vpn = within(page.getByRole('region', { name: 'VPN' }))
    expect(vpn.getByText('Connected through gluetun')).toBeTruthy()
    expect(vpn.getByRole('link', { name: 'VPN settings' }).getAttribute('href')).toBe(
      '/settings/vpn',
    )
    expect(page.getByRole('link', { name: 'Downloads' }).getAttribute('href')).toBe('/downloads')
    expect(page.getByText(/Encryption and UPnP take effect in a later update/)).toBeTruthy()
  })

  test('the seeding rule shows in hours, and the save sends minutes with today’s limits', async () => {
    const { user, page } = await open()
    const hours = page.getByLabelText('Time, in hours') as HTMLInputElement
    expect(hours.value).toBe('168')
    await user.clear(hours)
    await user.type(hours, '72')
    await user.clear(page.getByLabelText('Ratio'))
    await user.click(page.getByRole('switch', { name: 'Open the port with UPnP' }))
    // Downloads changed the limits since this page loaded
    state.limits = { downloadRate: 5_000_000, uploadRate: 1_000_000 }
    await user.click(page.getByRole('button', { name: 'Save' }))
    await settle()
    expect(requested('PUT', '/api/v1/settings/downloadClient')[0]?.body).toEqual({
      port: 6881,
      encryption: 'prefer',
      upnp: true,
      maxActive: 3,
      seedRatio: null,
      seedMinutes: 4320,
      downloadRate: 5_000_000,
      uploadRate: 1_000_000,
    })
  })

  test('a port or a queue size out of range is caught before saving', async () => {
    const { user, page } = await open()
    const port = page.getByLabelText('Listening port')
    await user.clear(port)
    await user.type(port, '80')
    const active = page.getByLabelText('Downloading at once')
    await user.clear(active)
    await user.type(active, '0')
    await user.click(page.getByRole('button', { name: 'Save' }))
    await settle()
    expect(page.getByText('Use a port from 1024 to 65535.')).toBeTruthy()
    expect(page.getByText('Use a whole number from 1 to 20.')).toBeTruthy()
    expect(requested('PUT', '/api/v1/settings/downloadClient')).toHaveLength(0)
  })
})
