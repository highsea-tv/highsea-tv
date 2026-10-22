// SPDX-License-Identifier: AGPL-3.0-only
// A7 Activity and A17 Manual import rendered against a fake of the API: the queue's rows, filters
// and fixes (by the queue row's id, not the torrent's), history's titles, failed downloads and Show
// more, the blocklist and Unblock; then the folder browser starting at the server's root, Look
// inside, and an import where one file goes in and one says why it didn't. The shell is stood in
// for.
import './dom.ts'
import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from 'bun:test'
import type { ReactNode } from 'react'

mock.module('next/navigation', () => ({
  useRouter: () => ({ push: () => {} }),
  usePathname: () => '/activity',
  useSearchParams: () => new URLSearchParams(),
}))
mock.module('../src/admin/shell.tsx', () => ({
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
const { toast, TooltipProvider } = await import('@highsea-tv/ui-web')
const { Activity } = await import('../src/admin/activity.tsx')
const { ManualImport } = await import('../src/admin/import.tsx')

// ---------------------------------------------------------------- the fake API

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

const SINTEL = 45745
const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString()

const item = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  torrentId: `t_${id}`,
  movieId: SINTEL,
  title: 'Sintel',
  year: 2010,
  release: 'Sintel.2010.1080p.BluRay.x264-GRP',
  quality: 'Bluray-1080p',
  size: 4_000_000_000,
  progress: 0.4,
  downRate: 2_000_000,
  upRate: 0,
  eta: 1800,
  ratio: 0,
  state: 'downloading',
  stateReason: null,
  ...extra,
})

const event = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  movieId: SINTEL,
  title: 'Sintel',
  year: 2010,
  type: 'grabbed',
  date: ago(5),
  sourceTitle: 'Sintel.2010.1080p.BluRay.x264-GRP',
  quality: 'Bluray-1080p',
  indexer: 'Fake Torznab',
  message: null,
  ...extra,
})

const candidate = (path: string, extra: Record<string, unknown> = {}) => ({
  path,
  size: 2_000_000_000,
  quality: 'Bluray-1080p',
  language: 'en',
  movieId: SINTEL,
  versionId: 'v_1',
  skip: null,
  becomes: 'Sintel (2010)/Sintel (2010) Bluray-1080p.mkv',
  ...extra,
})

type Req = { method: string; path: string; body: unknown }
let state: {
  queue: ReturnType<typeof item>[]
  history: ReturnType<typeof event>[][]
  blocklist: Record<string, unknown>[]
  extraCandidates: ReturnType<typeof candidate>[]
  requests: Req[]
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
    case 'GET /api/v1/queue':
      return json(state.queue)
    case 'GET /api/v1/history': {
      const page = Number(u.searchParams.get('cursor') ?? 0)
      const next = page + 1 < state.history.length ? String(page + 1) : null
      return json({ items: state.history[page] ?? [], next })
    }
    case 'GET /api/v1/blocklist':
      return json(state.blocklist)
    case 'GET /api/v1/movies':
      return json({
        items: [
          {
            id: SINTEL,
            title: 'Sintel',
            year: 2010,
            versions: [
              { id: 'v_1', label: '1080p', qualityProfileId: 'p_1', fileId: null },
              { id: 'v_2', label: '4K HDR', qualityProfileId: 'p_2', fileId: 'f_1' },
            ],
          },
        ],
        next: null,
        total: 1,
        counts: {},
      })
    case 'GET /api/v1/fs': {
      // with no path, the server starts in the downloads folder
      const at = u.searchParams.get('path') ?? '/data/downloads'
      return json(
        at === '/data'
          ? {
              path: '/data',
              parent: null,
              entries: [
                { name: 'downloads', path: '/data/downloads', kind: 'folder' },
                { name: 'highsea.db', path: '/data/highsea.db', kind: 'file', size: 10 },
              ],
            }
          : { path: at, parent: '/data', entries: [] },
      )
    }
    case 'POST /api/v1/import/scan':
      return json([
        candidate('/data/downloads/Sintel/Sintel.mkv'),
        candidate('/data/downloads/Sintel/Sintel.sample.mkv', { skip: 'It’s a sample.' }),
        ...state.extraCandidates,
        candidate('/data/downloads/Unknown.mkv', {
          movieId: null,
          versionId: null,
          becomes: null,
        }),
      ])
    case 'POST /api/v1/import':
      return json({
        results: (body as { files: { path: string }[] }).files.map((f) =>
          importsGoIn
            ? { path: f.path, ok: true, message: null }
            : { path: f.path, ok: false, message: 'There’s already a better file for Sintel.' },
        ),
      })
  }
  if (method === 'POST' && path.startsWith('/api/v1/queue/'))
    return path.endsWith('searchAlternative')
      ? new Response(null, { status: 204 })
      : json(item('q_1'))
  if (method === 'DELETE') return new Response(null, { status: 204 })
  return json({ error: { code: 'not-found', message: `No fake for ${method} ${path}` } }, 404)
}

/** Whether the fake imports every file, or refuses each with a reason. */
let importsGoIn = false

beforeEach(() => {
  importsGoIn = false
  state = {
    queue: [
      item('q_1'),
      item('q_2', {
        title: 'Big Buck Bunny',
        movieId: 10378,
        year: 2008,
        state: 'import-blocked',
        stateReason: 'One file is an executable, so highsea won’t import it.',
      }),
    ],
    history: [
      [
        event('h_1'),
        event('h_2', {
          type: 'download-failed',
          movieId: 10378,
          title: 'Big Buck Bunny',
          year: 2008,
        }),
      ],
      [event('h_3')],
    ],
    blocklist: [
      {
        id: 'b_1',
        movieId: SINTEL,
        title: 'Sintel',
        year: 2010,
        sourceTitle: 'Sintel.2010.CAM-BAD',
        indexer: null,
        quality: null,
        reason: 'It stalled with no seeds.',
        date: ago(60),
      },
    ],
    extraCandidates: [],
    requests: [],
  }
})
afterEach(() => cleanup())

const settle = () =>
  act(async () => {
    for (let i = 0; i < 6; i++) await new Promise((r) => setTimeout(r, 0))
  })

async function open(screen: ReactNode) {
  const client = createClient({ fetch: api as never })
  await act(async () => {
    render(
      <ClientProvider client={client}>
        <TooltipProvider>{screen}</TooltipProvider>
      </ClientProvider>,
    )
  })
  await settle()
  return { user: userEvent.setup(), page: within(document.body) }
}

const requested = (method: string, path: string) =>
  state.requests.filter((r) => r.method === method && r.path.split('?')[0] === path)

// ---------------------------------------------------------------- tests

describe('A7 Activity', () => {
  test('the queue: rows, status, the reason a row needs attention, and the filters', async () => {
    const { user, page } = await open(<Activity />)
    const row = within(page.getByRole('row', { name: /Sintel \(2010\)/ }))
    expect(row.getByText('Downloading')).toBeTruthy()
    expect(row.getByRole('link', { name: 'Sintel (2010)' }).getAttribute('href')).toBe(
      `/movies/${SINTEL}`,
    )
    const blocked = within(page.getByRole('row', { name: /Big Buck Bunny/ }))
    expect(blocked.getByText('Import blocked')).toBeTruthy()
    expect(blocked.getByText(/an executable/)).toBeTruthy()

    await user.click(page.getByRole('tab', { name: /Needs attention/ }))
    await settle()
    expect(page.queryByRole('row', { name: /Sintel \(2010\)/ })).toBeNull()
    expect(page.getByRole('row', { name: /Big Buck Bunny/ })).toBeTruthy()
  })

  test('fixes go by the queue row’s id', async () => {
    const { user, page } = await open(<Activity />)
    await user.click(page.getByRole('button', { name: 'Pause Sintel' }))
    await settle()
    expect(requested('POST', '/api/v1/queue/q_1/pause')).toHaveLength(1)

    await user.click(page.getByRole('button', { name: 'Find another' }))
    await settle()
    expect(requested('POST', '/api/v1/queue/q_2/searchAlternative')).toHaveLength(1)

    await user.click(page.getByRole('button', { name: 'More for Sintel' }))
    await user.click(page.getByRole('menuitem', { name: 'Remove from queue' }))
    await settle()
    const dialog = within(page.getByRole('alertdialog'))
    expect(dialog.getByText('Remove Sintel?')).toBeTruthy()
    await user.click(dialog.getByRole('button', { name: 'Remove' }))
    await settle()
    expect(requested('DELETE', '/api/v1/queue/q_1')[0]?.body).toEqual({
      deleteData: true,
      blocklist: false,
    })
  })

  test('history: each event’s movie, failed downloads, and Show more', async () => {
    const { user, page } = await open(<Activity />)
    await user.click(page.getByRole('tab', { name: 'History' }))
    await settle()
    expect(page.getByText('Grabbed')).toBeTruthy()
    const failed = within(page.getByRole('row', { name: /Download failed/ }))
    expect(failed.getByRole('link', { name: 'Big Buck Bunny' })).toBeTruthy()
    expect(page.getAllByRole('row')).toHaveLength(3)

    await user.click(page.getByRole('button', { name: 'Show more' }))
    await settle()
    expect(page.getAllByRole('row')).toHaveLength(4)
    expect(page.queryByRole('button', { name: 'Show more' })).toBeNull()
  })

  test('the blocklist, and Unblock', async () => {
    const { user, page } = await open(<Activity />)
    await user.click(page.getByRole('tab', { name: /Blocklist/ }))
    await settle()
    const row = within(page.getByRole('row', { name: /Sintel\.2010\.CAM-BAD/ }))
    expect(row.getByRole('link', { name: 'Sintel' })).toBeTruthy()
    expect(row.getByText('It stalled with no seeds.')).toBeTruthy()
    await user.click(row.getByRole('button', { name: 'Unblock Sintel.2010.CAM-BAD' }))
    await settle()
    expect(requested('DELETE', '/api/v1/blocklist/b_1')).toHaveLength(1)
  })

  test('an empty queue says so', async () => {
    state.queue = []
    const { page } = await open(<Activity />)
    expect(page.getByText('The queue is empty')).toBeTruthy()
  })
})

describe('A17 Manual import', () => {
  test('starts in the downloads folder and looks inside; Up reaches the root', async () => {
    const { user, page } = await open(<ManualImport />)
    expect((page.getByRole('textbox') as HTMLInputElement).value).toBe('/data/downloads')
    expect(requested('POST', '/api/v1/import/scan')[0]?.body).toEqual({ path: '/data/downloads' })
    const nav = within(page.getByRole('navigation', { name: 'Folders here' }))

    await user.click(nav.getByRole('button', { name: 'Up' }))
    await settle()
    expect((page.getByRole('textbox') as HTMLInputElement).value).toBe('/data')
    expect(nav.queryByRole('button', { name: 'Up' })).toBeNull()
    expect(nav.getByRole('button', { name: 'downloads' })).toBeTruthy()
    expect(nav.queryByRole('button', { name: 'highsea.db' })).toBeNull()
  })

  test('a file that couldn’t go in says why', async () => {
    // the downloads folder was looked inside on arrival
    const { user, page } = await open(<ManualImport />)
    expect(requested('POST', '/api/v1/import/scan')[0]?.body).toEqual({ path: '/data/downloads' })

    const sample = within(page.getByRole('row', { name: /Sintel\.sample\.mkv/ }))
    expect(sample.getByText('It’s a sample.')).toBeTruthy()
    const unknown = within(page.getByRole('row', { name: /Unknown\.mkv/ }))
    expect(unknown.getByText('Didn’t match a movie. Choose one.')).toBeTruthy()
    expect(page.getAllByText('Sintel (2010)/Sintel (2010) Bluray-1080p.mkv')).toHaveLength(2)

    await user.click(page.getByRole('button', { name: 'Import 1 file' }))
    await settle()
    expect(requested('POST', '/api/v1/import')[0]?.body).toEqual({
      files: [{ path: '/data/downloads/Sintel/Sintel.mkv', movieId: SINTEL, versionId: 'v_1' }],
      mode: 'hardlink',
    })
    const sintel = within(page.getByRole('row', { name: /Sintel\.mkv/ }))
    expect(sintel.getByText('There’s already a better file for Sintel.')).toBeTruthy()
  })

  test('a file that went in says so, and that subtitles are next', async () => {
    importsGoIn = true
    const success = spyOn(toast, 'success')
    const { user, page } = await open(<ManualImport />)
    await user.click(page.getByRole('button', { name: 'Import 1 file' }))
    await settle()
    expect(success).toHaveBeenCalledWith('1 file imported', {
      description: 'Renamed into the library. Subtitles are next.',
    })
    success.mockRestore()
  })

  test('opened on a torrent’s folder, it looks inside that folder', async () => {
    await open(<ManualImport initialPath="/data/downloads/books/Sintel" />)
    expect(requested('POST', '/api/v1/import/scan').map((r) => r.body)).toEqual([
      { path: '/data/downloads/books/Sintel' },
    ])
  })

  test('each file picks a version; two files for one version are refused', async () => {
    state.extraCandidates = [candidate('/data/downloads/Sintel/Sintel.4k.mkv')]
    const { user, page } = await open(<ManualImport />)
    const first = page.getByRole('combobox', { name: 'Sintel.mkv: version' })
    expect(first.textContent).toContain('1080p')
    expect(page.getAllByText('Pick another version for one of these.')).toHaveLength(2)
    expect(
      (page.getByRole('button', { name: 'Import 2 files' }) as HTMLButtonElement).disabled,
    ).toBe(true)

    await user.click(page.getByRole('combobox', { name: 'Sintel.4k.mkv: version' }))
    await user.click(await page.findByRole('option', { name: '4K HDR · has a file' }))
    await settle()
    expect(page.queryByText('Pick another version for one of these.')).toBeNull()
    await user.click(page.getByRole('button', { name: 'Import 2 files' }))
    await settle()
    expect(requested('POST', '/api/v1/import')[0]?.body).toEqual({
      files: [
        { path: '/data/downloads/Sintel/Sintel.mkv', movieId: SINTEL, versionId: 'v_1' },
        { path: '/data/downloads/Sintel/Sintel.4k.mkv', movieId: SINTEL, versionId: 'v_2' },
      ],
      mode: 'hardlink',
    })
  })
})
