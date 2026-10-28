// SPDX-License-Identifier: AGPL-3.0-only
// Settings › Playback (checkpoint 4.3a), rendered against a fake of the API: the three groups and
// their saving, the numbers and the folder checked here and by the server, the cache's use and its
// warning over the limit, and Clear. The shell and Next's router are stood in for.
import './dom.ts'
import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'
import type { ReactNode } from 'react'

mock.module('next/navigation', () => ({
  useRouter: () => ({ push: () => {} }),
  usePathname: () => '/',
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
const { PlaybackSettingsPage } = await import('../src/admin/playback.tsx')

const GB = 1e9
type State = {
  settings: Record<string, unknown>
  cache: { transcodeBytes: number; trickplayBytes: number; limitBytes: number; over: boolean }
  failSettings: boolean
  requests: { method: string; path: string; body?: unknown }[]
}
let state: State

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

const status = () => ({ paths: [], inUse: null, cache: state.cache })

async function api(url: string, init: RequestInit = {}): Promise<Response> {
  const u = new URL(url, 'http://localhost')
  const method = init.method ?? 'GET'
  if (u.pathname === '/api/v1/events') return new Response(new ReadableStream())
  const body = init.body ? JSON.parse(String(init.body)) : undefined
  state.requests.push({ method, path: u.pathname, body })
  switch (`${method} ${u.pathname}`) {
    case 'GET /api/v1/settings/playback':
      if (state.failSettings)
        return json({ error: { code: 'unavailable', message: 'The server is busy.' } }, 503)
      return json(state.settings)
    case 'PUT /api/v1/settings/playback':
      if (body.cachePath === '/media/cache')
        return json(
          {
            error: {
              code: 'invalid',
              message:
                'Choose a folder outside your library and downloads. highsea removes what it makes there.',
            },
          },
          400,
        )
      state.settings = body
      return json(body)
    case 'GET /api/v1/playback/status':
      return json(status())
    case 'DELETE /api/v1/playback/cache':
      state.cache = { ...state.cache, transcodeBytes: 0, over: false }
      return json(status())
  }
  return json({ error: { code: 'not-found', message: 'Not here.' } }, 404)
}

beforeEach(() => {
  state = {
    settings: {
      acceleration: 'auto',
      toneMapping: true,
      maxTranscodes: 3,
      preset: 'balanced',
      remoteMaxMbps: 8,
      cachePath: '/config/transcodes',
      cacheLimitGb: 20,
    },
    cache: {
      transcodeBytes: 6.1 * GB,
      trickplayBytes: 12.3 * GB,
      limitBytes: 20 * GB,
      over: false,
    },
    failSettings: false,
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
          <PlaybackSettingsPage />
        </TooltipProvider>
      </ClientProvider>,
    )
  })
  await settle()
  return { user: userEvent.setup(), page: within(document.body) }
}

const puts = () =>
  state.requests
    .filter((r) => r.method === 'PUT' && r.path === '/api/v1/settings/playback')
    .map((r) => r.body)

describe('Settings › Playback', () => {
  test('Transcoding, Away from home and Cache, saved through the Save bar', async () => {
    const { page, user } = await open()
    expect(page.getByRole('heading', { name: 'Playback' })).toBeTruthy()
    for (const name of ['Transcoding', 'Away from home', 'Cache'])
      expect(page.getByRole('region', { name })).toBeTruthy()
    // hardware acceleration is 4.3b's
    expect(page.queryByRole('region', { name: 'Hardware acceleration' })).toBeNull()
    expect(
      page.getByText('Sharp pictures that start quickly. Right for most servers.'),
    ).toBeTruthy()

    await user.click(page.getByRole('radio', { name: 'Sharper' }))
    expect(page.getByText(/Sharper pictures at the same bitrate/)).toBeTruthy()
    const max = page.getByLabelText('Transcodes at once')
    await user.clear(max)
    await user.type(max, '2')
    await user.click(page.getByRole('button', { name: 'Save' }))
    await settle()
    expect(puts()).toEqual([{ ...state.settings, maxTranscodes: 2, preset: 'quality' }])
  })

  test('the numbers and the folder are checked here, and the folder by the server', async () => {
    const { page, user } = await open()
    const max = page.getByLabelText('Transcodes at once')
    await user.clear(max)
    await user.type(max, '9')
    const folder = page.getByLabelText('Folder')
    await user.clear(folder)
    await user.type(folder, 'cache')
    await user.click(page.getByRole('button', { name: 'Save' }))
    await settle()
    expect(page.getByText('A whole number from 1 to 8.')).toBeTruthy()
    expect(page.getByText('A full path, such as /transcodes.')).toBeTruthy()
    expect(puts()).toEqual([])

    await user.clear(max)
    await user.type(max, '3')
    await user.clear(folder)
    await user.type(folder, '/media/cache')
    await user.click(page.getByRole('button', { name: 'Save' }))
    await settle()
    expect(
      page.getByText(/Choose a folder outside your library and downloads/, { selector: '[id]' }),
    ).toBeTruthy()
  })

  test('the cache’s use, its warning over the limit, and Clear', async () => {
    state.cache = { ...state.cache, transcodeBytes: 23.4 * GB, over: true }
    const { page, user } = await open()
    const cache = page.getByRole('region', { name: 'Cache' })
    expect(within(cache).getByText('Over its limit')).toBeTruthy()
    expect(within(cache).getByText(/removes the oldest segments first/)).toBeTruthy()
    expect(within(cache).getByText(/Preview images for the scrubber take 12/)).toBeTruthy()
    await user.click(within(cache).getByRole('button', { name: 'Clear transcodes' }))
    await settle()
    expect(state.requests.some((r) => r.method === 'DELETE')).toBe(true)
  })

  test('an error loading says so, with Try again', async () => {
    state.failSettings = true
    const { page } = await open()
    expect(page.getByText('Couldn’t load the playback settings')).toBeTruthy()
    expect(page.getByRole('button', { name: 'Try again' })).toBeTruthy()
  })
})
