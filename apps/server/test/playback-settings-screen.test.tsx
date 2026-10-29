// SPDX-License-Identifier: AGPL-3.0-only
// Settings › Playback (checkpoints 4.3a and 4.3b), rendered against a fake of the API: the groups
// and their saving, the numbers and the folder checked here and by the server, the cache's use and
// its warning over the limit, and Clear; hardware acceleration with nothing found, a path found and
// checked, one in use, a failed check, and Use and tone mapping saved. The shell and Next's router are stood in for.
import './dom.ts'
import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from 'bun:test'
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
const { toast, TooltipProvider } = await import('@highsea-tv/ui-web')
const { PlaybackSettingsPage } = await import('../src/admin/playback.tsx')

const GB = 1e9
type Path = {
  id: string
  device: string | null
  name: string | null
  check: { result: 'pass' | 'fail'; fps: number | null; detail: string; at: string } | null
  unavailable: string | null
  checking: boolean
}
type State = {
  settings: Record<string, unknown>
  paths: Path[]
  inUse: string | null
  cache: { transcodeBytes: number; trickplayBytes: number; limitBytes: number; over: boolean }
  failSettings: boolean
  requests: { method: string; path: string; body?: unknown }[]
}
let state: State

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

const status = () => ({ paths: state.paths, inUse: state.inUse, cache: state.cache })

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
    case 'POST /api/v1/playback/checks/vaapi':
      state.paths = state.paths.map((p) => (p.id === 'vaapi' ? { ...p, checking: true } : p))
      return json(status())
    case 'POST /api/v1/playback/checks/qsv':
      return json({ error: { code: 'conflict', message: 'A check is already running.' } }, 409)
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
    paths: none(),
    inUse: null,
    failSettings: false,
    requests: [],
  }
})

const path = (id: string, over: Partial<Path> = {}): Path => ({
  id,
  device: null,
  name: null,
  check: null,
  unavailable: null,
  checking: false,
  ...over,
})
const none = () => [
  path('vaapi', { unavailable: 'No /dev/dri in the container.' }),
  path('qsv', { unavailable: 'No /dev/dri in the container.' }),
  path('nvenc', { unavailable: 'No NVIDIA GPU in the container.' }),
  path('videotoolbox', { unavailable: 'Only when highsea runs on a Mac, outside Docker.' }),
]
const intel = { device: '/dev/dri/renderD128', name: 'Intel graphics (iHD 24.1.0)' }
const twoDaysAgo = () => new Date(Date.now() - 2 * 86_400_000).toISOString()
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
    for (const name of ['Hardware acceleration', 'Transcoding', 'Away from home', 'Cache'])
      expect(page.getByRole('region', { name })).toBeTruthy()
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

  test('no graphics chip: every path says why, with the lines to pass one through', async () => {
    const { page } = await open()
    const hw = within(page.getByRole('region', { name: 'Hardware acceleration' }))
    expect(hw.getByText('Transcoding with the processor, for now')).toBeTruthy()
    expect(hw.getByText(/found no graphics chip it can use/)).toBeTruthy()
    const found = within(hw.getByRole('list', { name: 'What highsea found' }))
    expect(found.getAllByRole('listitem')).toHaveLength(4)
    expect(found.getAllByLabelText('Not here')).toHaveLength(4)
    expect(found.queryByRole('button', { name: 'Check' })).toBeNull()
    expect(
      hw.getByRole('figure', { name: 'Compose lines for Intel and AMD' }).textContent,
    ).toContain('c 226:128 rw')
    expect(
      hw.getByRole('figure', { name: 'Commands for NVIDIA, on the host' }).textContent,
    ).toContain('nvidia-ctk runtime configure')
    expect(
      hw.getByRole('link', { name: /Hardware acceleration in the guide/ }).getAttribute('href'),
    ).toBe('https://docs.highsea.tv/install/hardware-acceleration/')
  })

  test('a path found and not checked; Check starts it, and a refusal says why', async () => {
    state.paths = [path('vaapi', intel), path('qsv', intel), ...none().slice(2)]
    const { page, user } = await open()
    const hw = within(page.getByRole('region', { name: 'Hardware acceleration' }))
    expect(hw.getByText(/checks the graphics it finds by itself/)).toBeTruthy()
    expect(hw.queryByRole('figure')).toBeNull()
    const items = within(hw.getByRole('list')).getAllByRole('listitem')
    const vaapi = within(items[0] as HTMLElement)
    expect(vaapi.getByText('Intel graphics (iHD 24.1.0)')).toBeTruthy()
    expect(vaapi.getByText('/dev/dri/renderD128')).toBeTruthy()
    expect(
      vaapi.getByText('Intel and AMD graphics on Linux, through /dev/dri. Not checked yet.'),
    ).toBeTruthy()
    await user.click(vaapi.getByRole('button', { name: 'Check' }))
    await settle()
    expect(state.requests.some((r) => r.path === '/api/v1/playback/checks/vaapi')).toBe(true)

    const failed = spyOn(toast, 'error')
    await user.click(within(items[1] as HTMLElement).getByRole('button', { name: 'Check' }))
    await settle()
    expect(failed).toHaveBeenCalledWith('Couldn’t check it', {
      description: 'A check is already running.',
    })
    failed.mockRestore()
  })

  test('a path in use, a failed one, and Use and tone mapping saved', async () => {
    state.paths = [
      path('vaapi', {
        ...intel,
        check: {
          result: 'pass',
          fps: 286,
          detail: 'Decodes 10-bit HEVC and encodes H.264. Tone maps HDR on the graphics chip.',
          at: twoDaysAgo(),
        },
      }),
      path('qsv', {
        ...intel,
        check: {
          result: 'fail',
          fps: null,
          detail: 'The Intel media driver didn’t load, so ffmpeg couldn’t open the GPU.',
          at: twoDaysAgo(),
        },
      }),
      ...none().slice(2),
    ]
    state.inUse = 'vaapi'
    const { page, user } = await open()
    const hw = within(page.getByRole('region', { name: 'Hardware acceleration' }))
    expect(hw.getByText('Transcoding with VAAPI')).toBeTruthy()
    expect(
      hw.getByText('Intel graphics (iHD 24.1.0). Its check passed, so highsea uses it.'),
    ).toBeTruthy()
    const [vaapi, qsv] = within(hw.getByRole('list')).getAllByRole('listitem') as HTMLElement[]
    expect(within(vaapi as HTMLElement).getByText('In use')).toBeTruthy()
    expect(
      within(vaapi as HTMLElement).getByText(
        '286 frames a second, checked 2 days ago. Decodes 10-bit HEVC and encodes H.264. Tone maps HDR on the graphics chip.',
      ),
    ).toBeTruthy()
    expect(within(vaapi as HTMLElement).getByRole('button', { name: 'Check again' })).toBeTruthy()
    expect(within(qsv as HTMLElement).getByLabelText('Failed')).toBeTruthy()
    expect(
      within(qsv as HTMLElement).getByText(/^Failed 2 days ago. The Intel media driver/),
    ).toBeTruthy()

    await user.click(hw.getByRole('switch', { name: /Convert HDR/ }))
    await user.click(page.getByRole('button', { name: 'Save' }))
    await settle()
    expect(puts()).toEqual([{ ...state.settings, toneMapping: false }])
  })

  test('an error loading says so, with Try again', async () => {
    state.failSettings = true
    const { page } = await open()
    expect(page.getByText('Couldn’t load the playback settings')).toBeTruthy()
    expect(page.getByRole('button', { name: 'Try again' })).toBeTruthy()
  })
})
