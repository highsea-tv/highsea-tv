// SPDX-License-Identifier: AGPL-3.0-only
// A8 Downloads rendered against a fake of the API: the table with its state badges and filters,
// the VPN line when off and when connected, adding a magnet and a .torrent file, the speed limits,
// and the detail sheet (pause, a file's priority, not-contacted trackers, the seeding rule's
// minimum, removing with the data). The shell is stood in for.
import './dom.ts'
import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'
import type { ReactNode } from 'react'

const pushed: string[] = []
mock.module('next/navigation', () => ({
  useRouter: () => ({ push: (href: string) => pushed.push(href) }),
  usePathname: () => '/downloads',
  useSearchParams: () => new URLSearchParams(),
}))
mock.module('../src/admin/shell.tsx', () => ({
  useShell: () => ({ role: 'admin' }),
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
const { Downloads } = await import('../src/admin/downloads.tsx')

// ---------------------------------------------------------------- the fake API

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

const torrent = (extra: Record<string, unknown> = {}) => ({
  id: 'tr_1',
  name: 'Sintel.2010.1080p.BluRay.x264-GRP',
  infoHash: 'ab'.repeat(20),
  movieId: 45745,
  category: 'movies',
  size: 2_000_000_000,
  downloaded: 1_000_000_000,
  uploaded: 0,
  progress: 0.5,
  downRate: 3_000_000,
  upRate: 0,
  eta: 330,
  peers: { connected: 4, total: 30 },
  seeds: { connected: 12, total: 80 },
  ratio: 0,
  state: 'downloading',
  stateReason: null,
  indexer: 'Fake Torznab',
  quality: 'Bluray-1080p',
  addedAt: new Date(Date.now() - 10 * 60_000).toISOString(),
  completedAt: null,
  savePath: '/data/downloads/movies',
  private: true,
  files: [
    { path: 'Sintel/Sintel.mkv', size: 1_900_000_000, progress: 0.5, priority: 'normal' },
    { path: 'Sintel/Sample.mkv', size: 100_000_000, progress: 0, priority: 'normal' },
  ],
  trackers: [
    { url: 'udp://tracker.test:6969', status: 'working', peers: 30, message: null },
    { url: 'https://slow.test/announce', status: 'not-contacted', peers: 0, message: null },
  ],
  seedingRule: { ratio: 1.5, minutes: null, minMinutes: 4320 },
  ...extra,
})

const STALLED = torrent({
  id: 'tr_2',
  name: 'Something.Else',
  movieId: null,
  category: 'manual',
  indexer: null,
  state: 'stalled',
  stateReason: 'No one in the swarm has the rest.',
  downRate: 0,
  private: false,
})

const vpnStatus = (extra: Record<string, unknown> = {}) => ({
  mode: 'off',
  provider: null,
  state: 'off',
  message: null,
  needsCapability: false,
  exitIp: null,
  country: null,
  forwardedPort: null,
  checks: [],
  checkedAt: null,
  ...extra,
})

type Req = { method: string; path: string; body: unknown }
let state: {
  torrents: ReturnType<typeof torrent>[]
  vpn: ReturnType<typeof vpnStatus>
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
    case 'GET /api/v1/torrents':
      return json(state.torrents)
    case 'GET /api/v1/torrents/limits':
      return json(state.limits)
    case 'PATCH /api/v1/torrents/limits':
      state.limits = { ...state.limits, ...(body as object) }
      return json(state.limits)
    case 'GET /api/v1/vpn/status':
      return json(state.vpn)
    case 'POST /api/v1/torrents':
      return json(
        torrent({ id: 'tr_3', name: 'Added', movieId: null, category: 'manual', state: 'paused' }),
        201,
      )
    case 'POST /api/v1/torrents/tr_1/pause':
      return json(torrent({ state: 'paused' }))
    case 'PATCH /api/v1/torrents/tr_1/files':
      return json(torrent())
    case 'DELETE /api/v1/torrents/tr_1':
      return new Response(null, { status: 204 })
  }
  return json({ error: { code: 'not-found', message: `No fake for ${method} ${path}` } }, 404)
}

beforeEach(() => {
  pushed.length = 0
  state = {
    torrents: [torrent(), STALLED],
    vpn: vpnStatus(),
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
          <Downloads />
        </TooltipProvider>
      </ClientProvider>,
    )
  })
  await settle()
  return { user: userEvent.setup(), page: within(document.body) }
}

const sent = (method: string, path: string) =>
  state.requests.filter((r) => r.method === method && r.path === path)

// ---------------------------------------------------------------- tests

describe('A8 Downloads', () => {
  test('the table: states, by hand, totals, and the filters', async () => {
    const { user, page } = await open()
    const sintel = within(page.getByRole('row', { name: /Sintel\.2010/ }))
    expect(sintel.getByText('Downloading')).toBeTruthy()
    expect(sintel.getByText('movies · Fake Torznab')).toBeTruthy()
    expect(sintel.getByText('12/4')).toBeTruthy()
    const other = within(page.getByRole('row', { name: /Something\.Else/ }))
    expect(other.getByText('Stalled')).toBeTruthy()
    expect(other.getByText('manual · Added by hand')).toBeTruthy()

    await user.click(page.getByRole('tab', { name: /Needs attention/ }))
    await settle()
    expect(page.queryByRole('row', { name: /Sintel\.2010/ })).toBeNull()
    expect(page.getByRole('row', { name: /Something\.Else/ })).toBeTruthy()
    await user.click(page.getByRole('tab', { name: /Paused/ }))
    await settle()
    expect(page.getByText('No torrents match.')).toBeTruthy()
  })

  test('no torrents: the empty state offers Add', async () => {
    state.torrents = []
    const { page } = await open()
    expect(page.getByText('No torrents')).toBeTruthy()
    expect(page.getAllByRole('button', { name: 'Add torrent' })).toHaveLength(2)
  })

  test('the VPN line: off links to Settings › VPN, with the limits', async () => {
    state.limits = { downloadRate: 5_000_000, uploadRate: 0 }
    const { page } = await open()
    const status = within(page.getByRole('status'))
    expect(status.getByText('No VPN')).toBeTruthy()
    expect(status.getByRole('link', { name: 'Set up a VPN' }).getAttribute('href')).toBe(
      '/settings/vpn',
    )
    expect(status.getByText(/↓ 5(\.0)? MB\/s/)).toBeTruthy()
    expect(status.getByText(/↑ unlimited/)).toBeTruthy()
  })

  test('the VPN line: connected through a provider, with the exit and port', async () => {
    state.vpn = vpnStatus({
      mode: 'builtin',
      provider: 'Proton VPN',
      state: 'connected',
      exitIp: '185.1.2.3',
      country: 'Netherlands',
      forwardedPort: 51413,
    })
    const { page } = await open()
    const status = within(page.getByRole('status'))
    expect(status.getByText('Through Proton VPN')).toBeTruthy()
    expect(status.getByText('185.1.2.3 (Netherlands) · Port 51413')).toBeTruthy()
    expect(status.queryByRole('link')).toBeNull()
  })

  test('Add: a magnet, paused when Start right away is off; a bad link is refused first', async () => {
    const { user, page } = await open()
    await user.click(page.getAllByRole('button', { name: 'Add torrent' })[0] as HTMLElement)
    await settle()
    const dialog = within(page.getByRole('dialog'))
    const link = dialog.getByLabelText('Magnet link or .torrent URL')
    await user.type(link, 'not a link')
    await user.click(dialog.getByRole('button', { name: 'Add' }))
    await settle()
    expect(dialog.getByText('That isn’t a magnet link or an address.')).toBeTruthy()
    expect(sent('POST', '/api/v1/torrents')).toHaveLength(0)

    const magnet = `magnet:?xt=urn:btih:${'cd'.repeat(20)}&dn=Something`
    await user.clear(link)
    await user.click(link)
    await user.paste(magnet)
    await user.click(dialog.getByRole('checkbox'))
    await user.click(dialog.getByRole('button', { name: 'Add' }))
    await settle()
    expect(sent('POST', '/api/v1/torrents')[0]?.body).toEqual({ urlOrMagnet: magnet, paused: true })
    expect(page.queryByRole('dialog')).toBeNull()
  })

  test('Add: a .torrent file goes as base64, instead of the link', async () => {
    const { user, page } = await open()
    await user.click(page.getAllByRole('button', { name: 'Add torrent' })[0] as HTMLElement)
    await settle()
    const dialog = within(page.getByRole('dialog'))
    const file = new File([new Uint8Array([100, 56, 58, 101])], 'sintel.torrent', {
      type: 'application/x-bittorrent',
    })
    await user.upload(dialog.getByLabelText('Or a .torrent file') as HTMLInputElement, file)
    await settle()
    expect(
      (dialog.getByLabelText('Magnet link or .torrent URL') as HTMLInputElement).disabled,
    ).toBe(true)
    await user.click(dialog.getByRole('button', { name: 'Add' }))
    await settle()
    expect(sent('POST', '/api/v1/torrents')[0]?.body).toEqual({
      torrent: btoa('d8:e'),
      paused: false,
    })
  })

  test('Limits sends bytes per second, 0 for no limit', async () => {
    const { user, page } = await open()
    await user.click(page.getByRole('button', { name: 'Limits' }))
    await settle()
    const dialog = within(page.getByRole('dialog'))
    const down = dialog.getByLabelText('Download')
    await user.clear(down)
    await user.type(down, '2.5')
    await user.click(dialog.getByRole('button', { name: 'Save' }))
    await settle()
    expect(sent('PATCH', '/api/v1/torrents/limits')[0]?.body).toEqual({
      downloadRate: 2_500_000,
      uploadRate: 0,
    })
  })

  test('the sheet: details, pause, a file’s priority, trackers, the seeding rule', async () => {
    const { user, page } = await open()
    await user.click(page.getByRole('button', { name: 'Sintel.2010.1080p.BluRay.x264-GRP' }))
    await settle()
    const sheet = within(page.getByRole('dialog'))
    expect(sheet.getByText('Downloading · 2.0 GB')).toBeTruthy()
    expect(sheet.getByText(/^Private/)).toBeTruthy()

    await user.click(sheet.getByRole('button', { name: 'Open the movie' }))
    expect(pushed).toEqual(['/movies/45745'])

    await user.click(sheet.getByRole('button', { name: 'Pause' }))
    await settle()
    expect(sent('POST', '/api/v1/torrents/tr_1/pause')).toHaveLength(1)

    await user.click(sheet.getByRole('tab', { name: /Files/ }))
    await settle()
    await user.click(sheet.getByRole('combobox', { name: 'Priority for Sample.mkv' }))
    await user.click(await page.findByRole('option', { name: 'Don’t download' }))
    await settle()
    expect(sent('PATCH', '/api/v1/torrents/tr_1/files')[0]?.body).toEqual({
      path: 'Sintel/Sample.mkv',
      priority: 'skip',
    })

    await user.click(sheet.getByRole('tab', { name: /Trackers/ }))
    await settle()
    expect(sheet.getByText('Not contacted yet')).toBeTruthy()
    expect(sheet.getByText('Working')).toBeTruthy()

    await user.click(sheet.getByRole('tab', { name: /Seeding/ }))
    await settle()
    expect(sheet.getByText('1.5').tagName).toBe('STRONG')
    expect(sheet.getByText('ever').tagName).toBe('STRONG')
    expect(sheet.getByText(/It never stops before/)).toBeTruthy()
  })

  test('the sheet: a torrent added by hand has no movie, and shows why it’s stalled', async () => {
    const { user, page } = await open()
    await user.click(page.getByRole('button', { name: 'Something.Else' }))
    await settle()
    const sheet = within(page.getByRole('dialog'))
    expect(sheet.queryByRole('button', { name: 'Open the movie' })).toBeNull()
    expect(sheet.getByText('No one in the swarm has the rest.')).toBeTruthy()
    expect(sheet.getByText('Public')).toBeTruthy()
  })

  test('Remove asks first, and can delete the data', async () => {
    const { user, page } = await open()
    await user.click(page.getByRole('button', { name: 'Sintel.2010.1080p.BluRay.x264-GRP' }))
    await settle()
    await user.click(within(page.getByRole('dialog')).getByRole('button', { name: 'Remove' }))
    await settle()
    const confirm = within(page.getByRole('alertdialog'))
    await user.click(confirm.getByLabelText('Also delete the downloaded data'))
    await user.click(confirm.getByRole('button', { name: 'Remove' }))
    await settle()
    expect(sent('DELETE', '/api/v1/torrents/tr_1')[0]?.body).toEqual({ deleteData: true })
  })
})
