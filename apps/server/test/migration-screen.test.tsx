// SPDX-License-Identifier: AGPL-3.0-only
// Settings › Migration (6b; ADR 0041), rendered against a fake of the API: Radarr's card tests the
// connection, previews (counts, root folders, the profile mapping nearest first and editable, what
// can't come across with the way to Indexers) and imports with the mapping chosen; qBittorrent's
// shows torrents waiting paused, and Resume asks first that qBittorrent is stopped. The area is the
// owner's alone. The shell and Next's router are stood in for.
import './dom.ts'
import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'
import type { ReactNode } from 'react'

mock.module('next/navigation', () => ({
  useRouter: () => ({ push: () => {} }),
  usePathname: () => '/settings/migration',
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
const { Migration } = await import('../src/admin/migration.tsx')
const { seesArea, areaGroupsFor } = await import('../src/admin/settings-areas.ts')

// ---------------------------------------------------------------- the fake API

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

const idle = {
  state: 'idle',
  total: 0,
  done: 0,
  imported: 0,
  skipped: 0,
  failures: [],
  startedAt: null,
  finishedAt: null,
}

const preview = {
  version: '5.14.0.9383',
  movies: { total: 3, withFiles: 1, inLibrary: 0, ready: 2 },
  profiles: [
    {
      radarrId: 4,
      name: 'HD-1080p',
      cutoff: 'Bluray-1080p',
      movies: 2,
      options: ['qp-hd', 'qp-uhd', 'qp-any'],
    },
    {
      radarrId: 5,
      name: 'Ultra-HD',
      cutoff: 'Remux-2160p',
      movies: 1,
      options: ['qp-uhd', 'qp-hd', 'qp-any'],
    },
  ],
  rootFolders: [
    { radarr: '/movies', path: '/data/media/movies', status: 'root-folder', movies: 2 },
    { radarr: '/srv/4k', path: '/srv/4k', status: 'outside', movies: 1 },
  ],
  tags: 2,
  blocklist: 1,
  naming: {
    rename: true,
    folderFormat: '{Movie Title} ({Release Year})',
    fileFormat: '{Movie Title}',
    problem: null,
  },
  kept: { indexers: ['Nyaa'], downloadClients: ['qBittorrent'] },
  problems: [{ title: 'Tears of Steel (2012)', message: 'Add a path mapping for /srv/4k.' }],
}

type Req = { method: string; path: string; body: unknown }
let state: {
  radarr: typeof idle
  qbt: typeof idle & { paused: number; checking: number; resumedAt: string | null }
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
    case 'GET /api/v1/qualityprofiles':
      return json(
        [
          ['qp-any', 'Any'],
          ['qp-hd', 'HD 1080p'],
          ['qp-uhd', 'Ultra HD'],
        ].map(([id, name]) => ({ id, name, items: [], cutoff: 'x', upgradesAllowed: true })),
      )
    case 'GET /api/v1/importers/radarr':
      return json(state.radarr)
    case 'POST /api/v1/importers/radarr/test':
      if ((body as { apiKey: string }).apiKey !== 'secret')
        return json(
          {
            error: {
              code: 'invalid',
              message: 'Radarr refused the API key.',
              details: { reason: 'bad-credentials', field: 'apiKey' },
            },
          },
          400,
        )
      return json({ version: '5.14.0.9383', movies: 3 })
    case 'POST /api/v1/importers/radarr/preview':
      return json(preview)
    case 'POST /api/v1/importers/radarr/run':
      state.radarr = {
        ...idle,
        state: 'running',
        total: 3,
        startedAt: new Date(0).toISOString(),
      } as never
      return json(state.radarr)
    case 'GET /api/v1/importers/qbittorrent':
      return json(state.qbt)
    case 'POST /api/v1/importers/qbittorrent/resume':
      state.qbt = { ...state.qbt, paused: 0, resumedAt: new Date(0).toISOString() }
      return json(state.qbt)
  }
  return json({ error: { code: 'not-found', message: `Nothing at ${path}.` } }, 404)
}

beforeEach(() => {
  state = {
    radarr: { ...idle },
    qbt: { ...idle, paused: 0, checking: 0, resumedAt: null },
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
          <Migration />
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

describe('Settings › Migration', () => {
  test('in Settings’ System group, the owner’s alone', () => {
    expect(seesArea('migration', 'owner')).toBe(true)
    expect(seesArea('migration', 'admin')).toBe(false)
    const system = areaGroupsFor('admin').find((g) => g.id === 'system')
    expect(system?.areas).toEqual([])
    expect(
      areaGroupsFor('owner')
        .find((g) => g.id === 'system')
        ?.areas.map((a) => a.id),
    ).toEqual(['migration'])
  })

  test('Radarr: a wrong key sits under its field; the right one connects', async () => {
    const { user, page } = await open()
    const radarr = within(page.getByRole('region', { name: 'Radarr' }))
    await user.type(radarr.getByLabelText('Address'), 'http://radarr:7878')
    await user.type(radarr.getByLabelText('API key'), 'nope')
    await user.click(radarr.getByRole('button', { name: 'Test' }))
    await settle()
    expect(radarr.getByText('Radarr refused the API key.')).toBeTruthy()
    await user.clear(radarr.getByLabelText('API key'))
    await user.type(radarr.getByLabelText('API key'), 'secret')
    await user.click(radarr.getByRole('button', { name: 'Test' }))
    await settle()
    expect(radarr.getByRole('status').textContent).toBe(
      'Connected to Radarr 5.14.0.9383, with 3 movies.',
    )
  })

  test('Radarr: the preview, the profile mapping nearest first, and the import with it', async () => {
    const { user, page } = await open()
    const radarr = within(page.getByRole('region', { name: 'Radarr' }))
    await user.type(radarr.getByLabelText('Address'), 'http://radarr:7878')
    await user.type(radarr.getByLabelText('API key'), 'secret')
    await user.click(radarr.getByRole('button', { name: 'Add a mapping' }))
    await user.type(radarr.getByLabelText('Their path'), '/movies')
    await user.type(radarr.getByLabelText('highsea’s path'), '/data/media/movies')
    await user.click(radarr.getByRole('button', { name: 'Preview' }))
    await settle()
    expect(requested('POST', '/api/v1/importers/radarr/preview')[0]?.body).toEqual({
      url: 'http://radarr:7878',
      apiKey: 'secret',
      pathMappings: [{ from: '/movies', to: '/data/media/movies' }],
    })

    expect(
      radarr.getByText('3 movies, 1 with files. 0 already in highsea, 2 ready to come across.'),
    ).toBeTruthy()
    const roots = within(radarr.getByRole('region', { name: 'Root folders' }))
    expect(roots.getByText('Can’t use')).toBeTruthy()
    // each Radarr profile starts on its nearest
    const hd = radarr.getByRole('combobox', { name: 'highsea’s profile for HD-1080p' })
    expect(hd.textContent).toContain('HD 1080p')
    expect(
      radarr.getByRole('combobox', { name: 'highsea’s profile for Ultra-HD' }).textContent,
    ).toContain('Ultra HD')

    // what can't come across, and the way to Indexers
    const kept = within(radarr.getByRole('region', { name: 'What can’t come across' }))
    expect(kept.getByText('Indexers: Nyaa')).toBeTruthy()
    expect(kept.getByRole('link', { name: 'Go to Indexers' }).getAttribute('href')).toBe(
      '/indexers',
    )

    // the owner leaves the naming behind
    await user.click(
      radarr.getByRole('switch', { name: 'Bring the naming format and file settings across' }),
    )
    await user.click(radarr.getByRole('button', { name: 'Import' }))
    await settle()
    expect(requested('POST', '/api/v1/importers/radarr/run')[0]?.body).toEqual({
      url: 'http://radarr:7878',
      apiKey: 'secret',
      pathMappings: [{ from: '/movies', to: '/data/media/movies' }],
      profiles: { '4': 'qp-hd', '5': 'qp-uhd' },
      settings: false,
    })
  })

  test('progress and failures show while and after an import runs', async () => {
    state.radarr = {
      ...idle,
      state: 'done',
      total: 3,
      done: 3,
      imported: 2,
      skipped: 0,
      failures: [{ name: 'Tears of Steel (2012)', message: 'Add a path mapping for /srv/4k.' }],
    } as never
    const { page } = await open()
    const radarr = within(page.getByRole('region', { name: 'Radarr' }))
    const progress = within(radarr.getByRole('region', { name: 'Import progress' }))
    expect(progress.getByText('Imported 2 items, skipped 0 already here.')).toBeTruthy()
    expect(progress.getByText('1 couldn’t come across')).toBeTruthy()
    expect(progress.getByText('Tears of Steel (2012)')).toBeTruthy()
  })

  test('qBittorrent: torrents waiting paused; Resume asks that qBittorrent is stopped', async () => {
    state.qbt = { ...state.qbt, state: 'done', total: 4, done: 4, imported: 4, paused: 4 } as never
    const { user, page } = await open()
    const qbt = within(page.getByRole('region', { name: 'qBittorrent' }))
    expect(qbt.getByText(/4 torrents wait paused\. Stop qBittorrent/)).toBeTruthy()
    await user.click(qbt.getByRole('button', { name: 'Resume torrents' }))
    const dialog = within(page.getByRole('alertdialog'))
    expect(dialog.getByText('Is qBittorrent stopped?')).toBeTruthy()
    expect(requested('POST', '/api/v1/importers/qbittorrent/resume')).toHaveLength(0)
    await user.click(dialog.getByRole('button', { name: 'qBittorrent is stopped, resume' }))
    await settle()
    expect(requested('POST', '/api/v1/importers/qbittorrent/resume')).toHaveLength(1)
  })
})
