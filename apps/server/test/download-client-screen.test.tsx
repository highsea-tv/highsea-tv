// SPDX-License-Identifier: AGPL-3.0-only
// Settings › Download client (checkpoint 6a), rendered against a fake of the API: the VPN in one
// line with the way to Settings › VPN; Connections, with 6b's IP blocklist; the default seeding rule
// in hours; a save that sends Downloads' current speed limits rather than stale ones; 6b's watch
// folder and categories. The shell and Next's router are stood in for.
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
  categories: { name: string; folder: string; fixed: boolean; torrents: number }[]
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
    case 'GET /api/v1/torrents/categories':
      return json(state.categories)
    case 'POST /api/v1/torrents/categories': {
      const { name, folder } = body as { name: string; folder: string | null }
      if (name === 'movies')
        return json(
          {
            error: { code: 'invalid', message: 'movies is built in.', details: { field: 'name' } },
          },
          400,
        )
      const saved = { name, folder: folder ?? `/data/downloads/${name}`, fixed: false, torrents: 0 }
      state.categories = [...state.categories.filter((c) => c.name !== name), saved]
      return json(saved)
    }
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
  if (method === 'DELETE' && path.startsWith('/api/v1/torrents/categories/')) {
    const name = decodeURIComponent(path.split('/').pop() ?? '')
    state.categories = state.categories.filter((c) => c.name !== name)
    return new Response(null, { status: 204 })
  }
  return json({ error: { code: 'not-found', message: `Nothing at ${path}.` } }, 404)
}

beforeEach(() => {
  state = {
    client: {
      port: 6881,
      encryption: 'prefer',
      upnp: false,
      utp: true,
      maxActive: 3,
      downloadRate: 0,
      uploadRate: 0,
      seedRatio: 2,
      seedMinutes: 10_080,
      watchFolder: null,
      watchCategory: 'manual',
      blocklistUrl: '',
    },
    limits: { downloadRate: 0, uploadRate: 0 },
    categories: [
      { name: 'movies', folder: '/data/downloads/movies', fixed: true, torrents: 2 },
      { name: 'manual', folder: '/data/downloads/manual', fixed: true, torrents: 0 },
      { name: 'books', folder: '/data/downloads/books', fixed: false, torrents: 1 },
      { name: 'linux', folder: '/data/downloads/linux', fixed: false, torrents: 0 },
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
    // 6b: encryption and UPnP work, so the line saying they'd come later is gone
    expect(page.queryByText(/take effect in a later update/)).toBeNull()
  })

  test('the seeding rule shows in hours, and the save sends minutes with today’s limits', async () => {
    const { user, page } = await open()
    const hours = page.getByLabelText('Time, in hours') as HTMLInputElement
    expect(hours.value).toBe('168')
    await user.clear(hours)
    await user.type(hours, '72')
    await user.clear(page.getByLabelText('Ratio'))
    await user.click(page.getByRole('switch', { name: 'Open the port with UPnP' }))
    await user.click(page.getByRole('switch', { name: 'Connect to peers over uTP' }))
    // Downloads changed the limits since this page loaded
    state.limits = { downloadRate: 5_000_000, uploadRate: 1_000_000 }
    await user.click(page.getByRole('button', { name: 'Save' }))
    await settle()
    expect(requested('PUT', '/api/v1/settings/downloadClient')[0]?.body).toEqual({
      port: 6881,
      encryption: 'prefer',
      upnp: true,
      utp: false,
      maxActive: 3,
      blocklistUrl: '',
      seedRatio: null,
      seedMinutes: 4320,
      downloadRate: 5_000_000,
      uploadRate: 1_000_000,
      watchFolder: null,
      watchCategory: 'manual',
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

  test('the watch folder saves with the rest, in one of the categories but not movies', async () => {
    const { user, page } = await open()
    const watch = within(page.getByRole('region', { name: 'Watch folder' }))
    await user.type(watch.getByLabelText('Folder'), '/data/watch')
    await user.click(watch.getByRole('combobox'))
    expect((await page.findAllByRole('option')).map((o) => o.textContent)).toEqual([
      'manual',
      'books',
      'linux',
    ])
    await user.click(page.getByRole('option', { name: 'linux' }))
    await user.click(page.getByRole('button', { name: 'Save' }))
    await settle()
    expect(requested('PUT', '/api/v1/settings/downloadClient')[0]?.body).toMatchObject({
      watchFolder: '/data/watch',
      watchCategory: 'linux',
    })
  })

  test('categories: built in ones stay, one in use can’t go, others save and remove at once', async () => {
    const { user, page } = await open()
    const group = within(page.getByRole('region', { name: 'Categories' }))
    expect(group.queryByRole('button', { name: 'Remove movies' })).toBeNull()
    expect(
      (group.getByRole('button', { name: 'Remove books' }) as HTMLButtonElement).disabled,
    ).toBe(true)
    expect(group.getByText('A torrent uses it. Remove it from Downloads first.')).toBeTruthy()

    await user.type(group.getByLabelText('Name'), 'movies')
    await user.click(group.getByRole('button', { name: 'Save the category' }))
    await settle()
    expect(group.getByText('movies is built in.')).toBeTruthy()

    await user.clear(group.getByLabelText('Name'))
    await user.type(group.getByLabelText('Name'), 'music videos')
    await user.click(group.getByRole('button', { name: 'Save the category' }))
    await settle()
    expect(requested('POST', '/api/v1/torrents/categories')[1]?.body).toEqual({
      name: 'music videos',
      folder: null,
    })
    expect(group.getByText('/data/downloads/music videos')).toBeTruthy()

    await user.click(group.getByRole('button', { name: 'Remove linux' }))
    await settle()
    await user.click(
      within(page.getByRole('alertdialog')).getByRole('button', { name: 'Remove the category' }),
    )
    await settle()
    expect(requested('DELETE', '/api/v1/torrents/categories/linux')).toHaveLength(1)
    expect(group.queryByText('/data/downloads/linux')).toBeNull()
  })
})

describe('the IP blocklist', () => {
  test('an address is saved as typed, trimmed; another scheme is caught before saving', async () => {
    const { user, page } = await open()
    const field = page.getByLabelText('IP blocklist') as HTMLInputElement
    expect(field.value).toBe('')
    await user.type(field, 'ftp://lists.example/level1.gz')
    await user.click(page.getByRole('button', { name: 'Save' }))
    await settle()
    expect(
      page.getByText('Use an http or https address, or a file in the config folder.'),
    ).toBeTruthy()
    expect(requested('PUT', '/api/v1/settings/downloadClient')).toHaveLength(0)
    await user.clear(field)
    await user.type(field, ' https://lists.example/level1.gz ')
    await user.click(page.getByRole('button', { name: 'Save' }))
    await settle()
    expect(
      (requested('PUT', '/api/v1/settings/downloadClient')[0]?.body as { blocklistUrl?: string })
        ?.blocklistUrl,
    ).toBe('https://lists.example/level1.gz')
  })
})
