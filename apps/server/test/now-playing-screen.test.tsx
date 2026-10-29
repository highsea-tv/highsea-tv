// SPDX-License-Identifier: AGPL-3.0-only
// Now playing (checkpoint 4.3a), rendered against a fake of the API: nobody watching; a stream of
// each kind with how it's sent and why; a transcode that can't keep up and one waiting for a slot;
// Stop with a message; and the last 30 days with its filter. The shell and Next's router are
// stood in for.
import './dom.ts'
import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'
import type { NowPlaying, StreamSession, WatchRecord } from '@highsea-tv/api-contract'
import type { ReactNode } from 'react'

mock.module('next/navigation', () => ({
  useRouter: () => ({ push: () => {} }),
  usePathname: () => '/now-playing',
  useSearchParams: () => new URLSearchParams(),
}))
mock.module('../src/admin/shell.tsx', () => ({
  useShell: () => ({ role: 'admin' }),
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
const { NowPlayingPage } = await import('../src/admin/now-playing.tsx')

const session = (over: Partial<StreamSession>): StreamSession => ({
  id: 's1',
  user: { id: 'u1', displayName: 'Sam' },
  deviceName: 'Living room TV',
  client: 'tvos',
  item: { tmdbId: 45745, title: 'Sintel', year: 2010, poster: null },
  version: '1080p · H.264 · 1.2 GB',
  kind: 'stream',
  state: 'playing',
  position: 372,
  runtime: 888,
  method: 'direct-play',
  reasons: [],
  sent: '1080p · H.264 · AAC stereo',
  mbps: 9.4,
  network: 'lan',
  address: '192.168.1.24',
  hardware: null,
  speed: null,
  startedAt: new Date().toISOString(),
  stopped: null,
  ...over,
})

const record = (over: Partial<WatchRecord>): WatchRecord => ({
  id: 'h1',
  user: { id: 'u1', displayName: 'Sam' },
  deviceName: 'Living room TV',
  client: 'tvos',
  item: { tmdbId: 45745, title: 'Sintel', year: 2010, poster: null },
  version: '1080p · H.264 · 1.2 GB',
  method: 'direct-play',
  network: 'lan',
  startedAt: new Date(Date.now() - 3 * 3600_000).toISOString(),
  endedAt: new Date(Date.now() - 2 * 3600_000).toISOString(),
  watched: 888,
  finished: true,
  ...over,
})

type State = {
  live: NowPlaying
  history: WatchRecord[]
  requests: { method: string; path: string; body?: unknown }[]
}
let state: State

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

async function api(url: string, init: RequestInit = {}): Promise<Response> {
  const u = new URL(url, 'http://localhost')
  const method = init.method ?? 'GET'
  if (u.pathname === '/api/v1/events') return new Response(new ReadableStream())
  const body = init.body ? JSON.parse(String(init.body)) : undefined
  state.requests.push({ method, path: u.pathname, body })
  if (`${method} ${u.pathname}` === 'GET /api/v1/sessions') return json(state.live)
  if (`${method} ${u.pathname}` === 'GET /api/v1/sessions/history') return json(state.history)
  const stop = u.pathname.match(/^\/api\/v1\/sessions\/([^/]+)\/stop$/)
  if (method === 'POST' && stop) {
    state.live = {
      ...state.live,
      sessions: state.live.sessions.map((s) =>
        s.id === stop[1]
          ? { ...s, stopped: { by: 'Ines', message: body.message || null, at: '' } }
          : s,
      ),
    }
    return json(state.live)
  }
  return json({ error: { code: 'not-found', message: 'Not here.' } }, 404)
}

beforeEach(() => {
  state = {
    live: { sessions: [], totalMbps: 0, remoteMbps: 0, transcodes: 0 },
    history: [],
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
          <NowPlayingPage />
        </TooltipProvider>
      </ClientProvider>,
    )
  })
  await settle()
  return { user: userEvent.setup(), page: within(document.body) }
}

describe('Now playing', () => {
  test('nobody watching', async () => {
    const { page } = await open()
    expect(page.getByRole('heading', { name: 'Now playing' })).toBeTruthy()
    expect(page.getByText('Nobody is watching')).toBeTruthy()
  })

  test('each stream with how it’s sent and why, and the totals', async () => {
    state.live = {
      sessions: [
        session({}),
        session({
          id: 's2',
          user: { id: 'u2', displayName: 'Noor' },
          deviceName: 'Phone',
          client: 'ios',
          item: { tmdbId: null, title: 'Old film', year: null, poster: null },
          method: 'transcode',
          reasons: ['The phone can’t play HEVC.'],
          network: 'remote',
          address: '203.0.113.9',
          speed: 0.7,
          mbps: 4,
        }),
        session({
          id: 's3',
          user: { id: 'u3', displayName: 'Ali' },
          method: 'transcode',
          state: 'waiting',
          reasons: ['The browser can’t play DTS.'],
        }),
        // on the graphics chip (4.3b)
        session({
          id: 's4',
          user: { id: 'u4', displayName: 'Jo' },
          method: 'transcode',
          hardware: 'vaapi',
          speed: 5.2,
          reasons: ['The browser can’t play HEVC.'],
        }),
      ],
      totalMbps: 13.4,
      remoteMbps: 4,
      transcodes: 2,
    }
    const { page } = await open()
    const sam = page.getByRole('listitem', { name: 'Sam, Sintel' })
    expect(within(sam).getByText('Playing')).toBeTruthy()
    expect(within(sam).getByText('Direct play')).toBeTruthy()
    expect(within(sam).getByText('6:12 of 14:48')).toBeTruthy()
    expect(within(sam).getByText('At home')).toBeTruthy()
    // the poster and the title both link to the film
    for (const link of within(sam).getAllByRole('link', { name: 'Sintel' }))
      expect(link.getAttribute('href')).toBe('/movies/45745')

    const noor = page.getByRole('listitem', { name: 'Noor, Old film' })
    expect(within(noor).getByText('Can’t keep up')).toBeTruthy()
    expect(within(noor).getByText('The processor, 0.7× real time')).toBeTruthy()
    expect(within(noor).getByText('The phone can’t play HEVC.')).toBeTruthy()
    expect(within(noor).getByText(/Noor’s player keeps waiting for it/)).toBeTruthy()
    // the title left the library: no link
    expect(within(noor).queryByRole('link', { name: 'Old film' })).toBeNull()

    const jo = page.getByRole('listitem', { name: 'Jo, Sintel' })
    expect(within(jo).getByText('VAAPI, 5.2× real time')).toBeTruthy()

    const ali = page.getByRole('listitem', { name: 'Ali, Sintel' })
    expect(within(ali).getByText('Waiting')).toBeTruthy()
    expect(within(ali).getByText(/Every transcode slot is in use/)).toBeTruthy()
    expect(within(ali).queryByText('Transcoded by')).toBeNull()

    expect(page.getByText('13.4')).toBeTruthy()
  })

  test('Stop, with a message', async () => {
    state.live = { sessions: [session({})], totalMbps: 9.4, remoteMbps: 0, transcodes: 0 }
    const { page, user } = await open()
    await user.click(page.getByRole('button', { name: 'Stop' }))
    const dialog = page.getByRole('dialog', { name: 'Stop Sam’s stream?' })
    await user.type(within(dialog).getByLabelText(/Message/), 'Restarting soon.')
    await user.click(within(dialog).getByRole('button', { name: 'Stop stream' }))
    await settle()
    expect(state.requests.find((r) => r.method === 'POST')).toEqual({
      method: 'POST',
      path: '/api/v1/sessions/s1/stop',
      body: { message: 'Restarting soon.' },
    })
  })

  test('the last 30 days, by person', async () => {
    state.history = [
      record({}),
      record({
        id: 'h2',
        user: { id: 'u2', displayName: 'Noor' },
        finished: false,
        watched: 1500,
        network: 'remote',
        method: 'transcode',
      }),
    ]
    const { page, user } = await open()
    await user.click(page.getByRole('tab', { name: 'Last 30 days' }))
    await settle()
    expect(page.getByText('2 films watched')).toBeTruthy()
    const table = page.getByRole('table')
    expect(within(table).getByText('All')).toBeTruthy()
    expect(within(table).getByText('away')).toBeTruthy()
    expect(within(table).getByText('Transcode')).toBeTruthy()
  })

  test('nothing watched yet', async () => {
    const { page, user } = await open()
    await user.click(page.getByRole('tab', { name: 'Last 30 days' }))
    await settle()
    expect(page.getByText('Nothing watched yet')).toBeTruthy()
  })
})
