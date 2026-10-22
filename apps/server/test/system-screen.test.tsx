// SPDX-License-Identifier: AGPL-3.0-only
// Checkpoint 6's live states outside the movie page, rendered against a fake of the API: System's
// Health list, where the torrent client's and imports' problems show, and the dashboard's Network
// and Queue widgets, which come alive with the `downloads` source; and checkpoint 7a's Subtitles
// widget, alive with the `subtitles` source; and checkpoint 8b's tabs: Status, Logs with crash
// reports, Events, Backups (the owner's, with a restore that waits out the restart) and Updates.
// The shell and Next's router are stood in for.
import './dom.ts'
import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'
import type { ReactNode } from 'react'

mock.module('next/navigation', () => ({
  useRouter: () => ({ push: () => {} }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}))
let role: 'owner' | 'admin' = 'owner'
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
const { System } = await import('../src/admin/system.tsx')
const { widgetRenderers } = await import('../src/admin/widgets.tsx')

// ---------------------------------------------------------------- the fake API

const queueItem = (n: number, state: string, extra: Record<string, unknown> = {}) => ({
  id: `q${n}`,
  torrentId: `t${n}`,
  movieId: 600 + n,
  title: `Movie ${n}`,
  year: 2010,
  release: `Movie.${n}.2010.1080p.BluRay.x264-GRP`,
  quality: 'Bluray-1080p',
  size: 4_000_000_000,
  progress: 0.5,
  downRate: state === 'downloading' ? 1_000_000 : 0,
  upRate: 0,
  eta: state === 'downloading' ? 600 : null,
  ratio: 0,
  state,
  stateReason: null,
  ...extra,
})

const backup = (id: string, kind: string, createdAt: string) => ({
  id,
  kind,
  createdAt,
  size: 3_200_000,
  version: '0.6.0',
  schema: '0010_notifications',
  problem: null as string | null,
})

const STATUS = {
  version: '0.6.0',
  startedAt: new Date(Date.now() - 2 * 3_600_000).toISOString(),
  uptime: 7200,
  clientsConnected: 3,
  catalogVersion: '2026.10.20',
  addresses: { local: ['http://192.168.1.20:3000'], public: 'https://harbor.example.net' },
  cpu: 12,
  memory: { used: 4e9, total: 16e9 },
  process: { cpu: 2, memory: 300e6 },
  disks: [
    {
      path: '/data',
      label: 'Media',
      free: 1e11,
      total: 2e12,
      usedBy: { movies: 1.5e12, downloads: 3e11, other: 0 },
    },
  ],
}

const LOG = [
  {
    at: '2026-10-21T12:00:03.000Z',
    level: 'error',
    source: 'downloads',
    message: 'Tracker refused',
  },
  {
    at: '2026-10-21T12:00:02.000Z',
    level: 'info',
    source: 'indexers',
    message: 'RSS sync found 3',
  },
  { at: '2026-10-21T12:00:01.000Z', level: 'debug', source: 'jobs', message: 'Tick' },
]

type State = {
  sources: string[]
  health: { id: string; source: string; level: string; message: string; since: string }[]
  tasks: Record<string, unknown>[]
  queue: ReturnType<typeof queueItem>[]
  torrents: { downRate: number; upRate: number; state: string }[]
  speeds: { at: string; down: number; up: number }[]
  vpn: string
  subtitleStats: {
    syncedToday: number
    waiting: number
    avgOffsetMs: number
    avgConfidence: number
  }
  backups: Record<string, unknown>[]
  /** Whether /api/health answers: off while the server restarts. */
  up: boolean
  requests: { method: string; path: string }[]
  push: ((topic: string, ids?: string[]) => void) | null
}
let state: State

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

async function api(url: string, init: RequestInit = {}): Promise<Response> {
  const u = new URL(url, 'http://localhost')
  const method = init.method ?? 'GET'
  if (u.pathname === '/api/v1/events')
    return new Response(
      new ReadableStream({
        start(c) {
          let id = 0
          state.push = (topic, ids) =>
            c.enqueue(
              new TextEncoder().encode(
                `data: ${JSON.stringify({ id: ++id, topic, ids, at: Date.parse('2026-10-21T12:34:56Z') })}\n\n`,
              ),
            )
        },
      }),
      { headers: { 'content-type': 'text/event-stream' } },
    )
  state.requests.push({ method, path: u.pathname })
  switch (`${method} ${u.pathname}`) {
    case 'GET /api/v1/system/info/public':
      return json({
        id: 'srv_1',
        name: 'Harbor',
        version: '0.6.0',
        setupComplete: true,
        auth: { oidc: false, passkeys: true },
        sources: state.sources,
        attributions: [],
      })
    case 'GET /api/health':
      if (!state.up) throw new TypeError('fetch failed')
      return json({ status: 'ok', checks: [] })
    case 'GET /api/v1/system/status':
      return json(STATUS)
    case 'GET /api/v1/system/logs': {
      const level = u.searchParams.get('level') ?? 'debug'
      const rank = ['debug', 'info', 'warn', 'error']
      return json({
        entries: LOG.filter((e) => rank.indexOf(e.level) >= rank.indexOf(level)),
        files: [
          { name: 'highsea-2026-10-20.log', date: '2026-10-20', size: 2048 },
          { name: 'highsea-2026-10-21.log', date: '2026-10-21', size: 2048 },
        ],
      })
    }
    case 'GET /api/v1/system/crashes':
      return json([
        {
          id: 'crash-1',
          at: '2026-10-21T09:00:00.000Z',
          origin: 'api',
          message: 'TypeError: Cannot read properties of undefined',
          size: 1200,
        },
      ])
    case 'GET /api/v1/settings/general':
      return json({
        language: 'en',
        timeZone: 'Europe/London',
        updateChannel: 'stable',
        logLevel: 'info',
        crashReports: false,
      })
    case 'GET /api/v1/system/backups':
      return json({
        backups: state.backups,
        nextRun: new Date(Date.now() + 3_600_000).toISOString(),
      })
    case 'POST /api/v1/system/backups': {
      const made = backup('highsea-manual', 'manual', '2026-10-21T12:00:00.000Z')
      state.backups.unshift(made)
      return json(made, 201)
    }
    case 'POST /api/v1/system/backups/highsea-scheduled/restore':
      state.up = false
      return new Response(null, { status: 202 })
    case 'DELETE /api/v1/system/backups/highsea-scheduled':
      state.backups = state.backups.filter((b) => b.id !== 'highsea-scheduled')
      return new Response(null, { status: 204 })
    case 'GET /api/v1/system/updates':
      return json({
        current: '0.6.0',
        channel: 'stable',
        latest: {
          version: '0.7.0',
          channel: 'stable',
          date: '2026-10-19',
          notes: ['Notifications', 'Backups and restore'],
        },
        available: true,
        checkedAt: new Date(Date.now() - 3_600_000).toISOString(),
      })
    case 'POST /api/v1/catalog/check':
      return json({ version: null, lastCheck: null, available: null })
    case 'GET /api/v1/catalog/status':
      return json({ version: null, lastCheck: null, available: null })
    case 'GET /api/v1/system/health':
      return json(state.health)
    case 'GET /api/v1/system/tasks':
      return json(state.tasks)
    case 'POST /api/v1/system/tasks/indexers.rss/run':
      return new Response(null, { status: 204 })
    case 'GET /api/v1/queue':
      return json(state.queue)
    case 'GET /api/v1/torrents':
      return json(state.torrents)
    case 'GET /api/v1/system/speeds':
      return json(state.speeds)
    case 'GET /api/v1/subtitles/stats':
      return json(state.subtitleStats)
    case 'GET /api/v1/vpn/status':
      return json({
        mode: state.vpn === 'off' ? 'off' : 'container',
        provider: null,
        state: state.vpn,
        message: null,
        needsCapability: false,
        exitIp: null,
        country: null,
        forwardedPort: null,
        checks: [],
        checkedAt: null,
      })
  }
  return json({ error: { code: 'not-found', message: 'Not here.' } }, 404)
}

beforeEach(() => {
  state = {
    sources: ['system', 'movies', 'indexers', 'downloads'],
    health: [],
    tasks: [],
    queue: [],
    torrents: [],
    speeds: [],
    vpn: 'off',
    subtitleStats: { syncedToday: 0, waiting: 0, avgOffsetMs: 0, avgConfidence: 0 },
    backups: [
      backup('highsea-scheduled', 'scheduled', '2026-10-20T03:30:00.000Z'),
      {
        ...backup('highsea-newer', 'manual', '2026-10-19T03:30:00.000Z'),
        problem: 'From a newer highsea',
      },
    ],
    up: true,
    requests: [],
    push: null,
  }
  role = 'owner'
})
afterEach(() => cleanup())

const settle = () =>
  act(async () => {
    for (let i = 0; i < 6; i++) await new Promise((r) => setTimeout(r, 0))
  })

async function open(ui: ReactNode) {
  const client = createClient({ fetch: api as never })
  await act(async () => {
    render(
      <ClientProvider client={client}>
        <TooltipProvider>{ui}</TooltipProvider>
      </ClientProvider>,
    )
  })
  await settle()
  return { user: userEvent.setup(), page: within(document.body) }
}

const requested = (path: string) => state.requests.filter((r) => r.path === path)

const frame = (id: string, span = 2, rows = 3) => ({ span, rows, 'data-widget-id': id }) as never

// ---------------------------------------------------------------- System

describe('System › Tasks', () => {
  test('names each schedule, shows a failure’s reason, and runs one now', async () => {
    const hour = 3_600_000
    state.tasks = [
      {
        id: 'indexers.rss',
        state: 'idle',
        interval: 900,
        lastRun: new Date(Date.now() - hour).toISOString(),
        nextRun: new Date(Date.now() + 10 * 60_000).toISOString(),
        lastError: null,
      },
      {
        id: 'lists.sync',
        state: 'failed',
        interval: 21_600,
        lastRun: new Date(Date.now() - 2 * hour).toISOString(),
        nextRun: new Date(Date.now() + 4 * hour).toISOString(),
        lastError: 'Trakt didn’t answer',
      },
      {
        id: 'some.new-job',
        state: 'running',
        interval: 60,
        lastRun: null,
        nextRun: null,
        lastError: null,
      },
    ]
    const { page, user } = await open(<System tab="tasks" />)
    const table = page.getByRole('table', { name: 'Scheduled tasks' })
    expect(within(table).getByText('RSS sync')).toBeTruthy()
    expect(within(table).getByText('Import lists')).toBeTruthy()
    expect(within(table).getByText('Failed')).toBeTruthy()
    expect(within(table).getByText('Trakt didn’t answer')).toBeTruthy()
    // a type without a name shows as it is, and can't run while it's running
    expect(within(table).getByText('some.new-job')).toBeTruthy()
    expect(
      (page.getByRole('button', { name: 'Run some.new-job now' }) as HTMLButtonElement).disabled,
    ).toBe(true)
    expect(within(table).getByText('Never')).toBeTruthy()
    await user.click(page.getByRole('button', { name: 'Run RSS sync now' }))
    await settle()
    expect(
      state.requests.some(
        (r) => r.method === 'POST' && r.path === '/api/v1/system/tasks/indexers.rss/run',
      ),
    ).toBe(true)
  })
})

describe('System › Health', () => {
  test('says everything’s healthy when nothing needs attention', async () => {
    const { page } = await open(<System tab="health" />)
    expect(page.getByText('Everything’s healthy')).toBeTruthy()
  })

  test('lists the torrent client’s and imports’ problems, and follows the queue', async () => {
    const since = new Date(Date.now() - 2 * 3_600_000).toISOString()
    state.health = [
      {
        id: 'torrent-client',
        source: 'Downloads',
        level: 'error',
        message: 'The torrent client can’t accept connections: port 6881 is in use',
        since,
      },
    ]
    const { page } = await open(<System tab="health" />)
    const list = page.getByRole('list', { name: 'Health checks' })
    expect(within(list).getByText('Error')).toBeTruthy()
    expect(within(list).getByText('Downloads')).toBeTruthy()
    expect(within(list).getByText(/port 6881 is in use/)).toBeTruthy()
    expect(within(list).getByText('since 2h ago')).toBeTruthy()

    state.health.push({
      id: 'import-blocked-d1',
      source: 'Downloads',
      level: 'warning',
      message: 'Sintel couldn’t be imported: no video file',
      since,
    })
    await act(async () => state.push?.('queue.updated'))
    await settle()
    expect(
      within(page.getByRole('list', { name: 'Health checks' })).getByText('Warning'),
    ).toBeTruthy()
  })
})

describe('System › Status', () => {
  test('opens the page: the figures, resources, addresses and what uses each disk', async () => {
    const { page } = await open(<System />)
    expect(page.getByRole('tab', { name: 'Status' }).getAttribute('aria-selected')).toBe('true')
    expect(page.getByText('apps connected')).toBeTruthy()
    expect(page.getByText('3')).toBeTruthy()
    const resources = page.getByRole('region', { name: 'Resources' })
    expect(within(resources).getByText('Memory: 4.0 GB of 16.0 GB')).toBeTruthy()
    const addresses = page.getByRole('region', { name: 'Addresses' })
    expect(within(addresses).getByText('https://harbor.example.net')).toBeTruthy()
    const disks = page.getByRole('region', { name: 'Disks' })
    expect(within(disks).getByText('Movies 1.5 TB · Downloads 300 GB')).toBeTruthy()
    expect(within(disks).getByRole('progressbar', { name: 'Media: 95% used' })).toBeTruthy()
    // About comes with Status
    expect(page.getByRole('region', { name: 'About' })).toBeTruthy()
  })
})

describe('System › Logs', () => {
  test('asks for a level, searches what came back, and lists crash reports', async () => {
    const { page, user } = await open(<System tab="logs" />)
    const log = page.getByRole('list', { name: 'Log' })
    expect(within(log).getByText('Tracker refused')).toBeTruthy()
    expect(within(log).getByText('RSS sync found 3')).toBeTruthy()
    // Info and up, by default: the debug line stays out
    expect(within(log).queryByText('Tick')).toBeNull()
    expect(state.requests.some((r) => r.path === '/api/v1/system/logs')).toBe(true)
    await user.type(page.getByRole('searchbox', { name: 'Search the log' }), 'tracker')
    expect(
      within(page.getByRole('list', { name: 'Log' })).queryByText('RSS sync found 3'),
    ).toBeNull()
    expect(page.getByRole('link', { name: 'Download logs' }).getAttribute('href')).toBe(
      '/api/v1/system/logs/download',
    )
    expect(page.getByText(/every line from the last 2 days, 4.1 kB/)).toBeTruthy()
    const crashes = page.getByRole('list', { name: 'Crash reports' })
    expect(within(crashes).getByText(/Cannot read properties/)).toBeTruthy()
    expect(within(crashes).getByRole('link').getAttribute('href')).toBe(
      '/api/v1/system/crashes/crash-1',
    )
    // they're off in General, so the group says where to turn them on
    expect(page.getByRole('link', { name: /Crash reports are off/ })).toBeTruthy()
  })
})

describe('System › Events', () => {
  test('shows each event as it arrives', async () => {
    const { page } = await open(<System tab="events" />)
    expect(page.getByText(/Listening/)).toBeTruthy()
    await act(async () => state.push?.('movies.updated', ['45745']))
    await settle()
    const events = page.getByRole('list', { name: 'Events' })
    expect(within(events).getByText('movies.updated')).toBeTruthy()
    expect(within(events).getByText('45745')).toBeTruthy()
  })
})

describe('System › Backups', () => {
  test('backs up now, refuses a backup it can’t restore, and deletes after asking', async () => {
    const { page, user } = await open(<System tab="backups" />)
    const table = page.getByRole('table', { name: 'Backups' })
    expect(within(table).getByText('Scheduled')).toBeTruthy()
    expect(within(table).getByText('From a newer highsea')).toBeTruthy()
    const restores = within(table).getAllByRole('button', { name: /^Restore the backup from/ })
    expect(restores.map((b) => (b as HTMLButtonElement).disabled)).toEqual([false, true])
    expect(
      within(table)
        .getAllByRole('link', { name: /^Download the backup from/ })[0]
        ?.getAttribute('href'),
    ).toBe('/api/v1/system/backups/highsea-scheduled/download')

    await user.click(page.getByRole('button', { name: 'Back up now' }))
    await settle()
    expect(
      within(page.getByRole('table', { name: 'Backups' })).getAllByText('Made by hand'),
    ).toHaveLength(2)

    await user.click(
      within(page.getByRole('table', { name: 'Backups' })).getAllByRole('button', {
        name: /^Delete the backup from/,
      })[1] as HTMLElement,
    )
    const dialog = page.getByRole('alertdialog')
    await user.click(within(dialog).getByRole('button', { name: 'Delete backup' }))
    await settle()
    expect(
      state.requests.some(
        (r) => r.method === 'DELETE' && r.path === '/api/v1/system/backups/highsea-scheduled',
      ),
    ).toBe(true)
  })

  test('a restore asks first, then waits for the server to come back', async () => {
    const { page, user } = await open(<System tab="backups" />)
    await user.click(
      page.getAllByRole('button', { name: /^Restore the backup from/ })[0] as HTMLElement,
    )
    const dialog = page.getByRole('alertdialog')
    expect(within(dialog).getByText(/anything since is lost/)).toBeTruthy()
    await user.click(within(dialog).getByRole('button', { name: 'Restore and restart' }))
    await settle()
    expect(page.getByRole('region', { name: 'Restoring' })).toBeTruthy()
    expect(page.getByText(/This page reloads when it’s back/)).toBeTruthy()
  })

  test('an admin doesn’t see the tab, and its address opens Status', async () => {
    role = 'admin'
    const { page } = await open(<System tab="backups" />)
    expect(page.queryByRole('tab', { name: 'Backups' })).toBeNull()
    expect(page.getByRole('tab', { name: 'Status' }).getAttribute('aria-selected')).toBe('true')
    expect(state.requests.some((r) => r.path === '/api/v1/system/backups')).toBe(false)
  })
})

describe('System › Updates', () => {
  test('the newer version with its notes, the Docker note, and Check now', async () => {
    const { page, user } = await open(<System tab="updates" />)
    const update = page.getByRole('region', { name: 'Update' })
    expect(within(update).getByText('highsea 0.7.0 is out. You have 0.6.0.')).toBeTruthy()
    expect(within(update).getByText('Backups and restore')).toBeTruthy()
    expect(within(update).getByText(/pull the new image/)).toBeTruthy()
    expect(within(update).queryByRole('button', { name: /Update and restart/ })).toBeNull()
    await user.click(within(update).getByRole('button', { name: 'Check now' }))
    await settle()
    expect(state.requests.some((r) => r.path === '/api/v1/catalog/check')).toBe(true)
  })
})

// ---------------------------------------------------------------- the widgets

describe('the Network widget', () => {
  const Network = widgetRenderers.network

  test('the torrents’ rates now, how many download, and the last minutes’ samples', async () => {
    state.torrents = [
      { downRate: 2_000_000, upRate: 500_000, state: 'downloading' },
      { downRate: 0, upRate: 250_000, state: 'seeding' },
    ]
    state.speeds = [{ at: new Date().toISOString(), down: 2_000_000, up: 750_000 }]
    const { page } = await open(<Network frame={frame('n')} settings={{ minutes: 10 }} />)
    expect(page.getByText('last 10 min')).toBeTruthy()
    expect(page.getByText('1 download')).toBeTruthy()
    expect(requested('/api/v1/system/speeds')).toHaveLength(1)
    expect(requested('/api/v1/vpn/status')).toHaveLength(1)
  })

  test('says it’s stopped while the VPN is down', async () => {
    state.vpn = 'down'
    const { page } = await open(<Network frame={frame('n')} settings={{}} />)
    expect(page.getByText('Stopped while the VPN is down')).toBeTruthy()
  })

  test('without the downloads source: zeros, and no calls', async () => {
    state.sources = ['system', 'movies', 'indexers']
    const { page } = await open(<Network frame={frame('n')} settings={{}} />)
    expect(page.getByText('No downloads yet')).toBeTruthy()
    expect(requested('/api/v1/system/speeds')).toHaveLength(0)
  })
})

describe('the Queue widget', () => {
  const Queue = widgetRenderers.activity

  test('the filter tabs with counts, each item’s state and progress, live', async () => {
    state.queue = [
      queueItem(1, 'downloading'),
      queueItem(2, 'import-blocked', { stateReason: 'No video file in the download' }),
      queueItem(3, 'seeding'),
    ]
    const { page, user } = await open(<Queue frame={frame('q', 4, 5)} settings={{}} />)
    expect(page.getByText('3 items · 1.0 MB/s')).toBeTruthy()
    expect(page.getByRole('tab', { name: /All/ }).textContent).toContain('3')
    expect(page.getByText('Import blocked')).toBeTruthy()
    // the reason is the row's title in the table, its line when stacked
    expect(
      page.queryByText('No video file in the download') ??
        document.querySelector('[title="No video file in the download"]'),
    ).toBeTruthy()
    expect(page.getByRole('progressbar', { name: 'Movie 1 progress' })).toBeTruthy()

    await user.click(page.getByRole('tab', { name: /Issues/ }))
    expect(page.queryByText('Movie 1')).toBeNull()
    expect(page.getByText('Movie 2')).toBeTruthy()

    state.queue = []
    await act(async () => state.push?.('queue.updated'))
    await settle()
    expect(page.getByText('The queue is empty')).toBeTruthy()
  })

  test('starts on the placement’s filter', async () => {
    state.queue = [queueItem(1, 'downloading'), queueItem(3, 'seeding')]
    const { page } = await open(<Queue frame={frame('q', 4, 5)} settings={{ filter: 'seeding' }} />)
    expect(page.queryByText('Movie 1')).toBeNull()
    expect(page.getByText('Movie 3')).toBeTruthy()
  })

  test('without the downloads source: the empty state, and no calls', async () => {
    state.sources = ['system']
    const { page } = await open(<Queue frame={frame('q', 4, 5)} settings={{}} />)
    expect(page.getByText('The queue is empty')).toBeTruthy()
    expect(requested('/api/v1/queue')).toHaveLength(0)
  })
})

describe('the Subtitles widget', () => {
  const Subtitles = widgetRenderers.subtitles

  test('today’s syncs and the tracks waiting, live', async () => {
    state.sources = ['system', 'subtitles']
    state.subtitleStats = { syncedToday: 0, waiting: 3, avgOffsetMs: 0, avgConfidence: 0 }
    const { page } = await open(<Subtitles frame={frame('s')} settings={{}} />)
    expect(page.getByText('3 waiting')).toBeTruthy()
    expect(page.getByRole('progressbar', { name: 'Subtitles synced today' })).toBeTruthy()

    state.subtitleStats = { syncedToday: 0, waiting: 0, avgOffsetMs: 0, avgConfidence: 0 }
    await act(async () => state.push?.('subtitles.updated'))
    await settle()
    expect(page.getByText('No subtitles yet')).toBeTruthy()
  })

  test('without the subtitles source: the empty state, and no calls', async () => {
    state.sources = ['system']
    const { page } = await open(<Subtitles frame={frame('s')} settings={{}} />)
    expect(page.getByText('No subtitles yet')).toBeTruthy()
    expect(requested('/api/v1/subtitles/stats')).toHaveLength(0)
  })
})
