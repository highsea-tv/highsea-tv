// SPDX-License-Identifier: AGPL-3.0-only
// Checkpoint 6's live states outside the movie page, rendered against a fake of the API: System's
// Health list, where the torrent client's and imports' problems show, and the dashboard's Network
// and Queue widgets, which come alive with the `downloads` source; and checkpoint 7a's Subtitles
// widget, alive with the `subtitles` source. The shell and Next's router are stood in for.
import './dom.ts'
import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'
import type { ReactNode } from 'react'

mock.module('next/navigation', () => ({
  useRouter: () => ({ push: () => {} }),
  usePathname: () => '/',
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
  requests: { method: string; path: string }[]
  push: ((topic: string) => void) | null
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
          state.push = (topic) =>
            c.enqueue(
              new TextEncoder().encode(`data: ${JSON.stringify({ id: ++id, topic, at: 0 })}\n\n`),
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
    requests: [],
    push: null,
  }
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
    const { page } = await open(<System />)
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
    const { page } = await open(<System />)
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
