// SPDX-License-Identifier: AGPL-3.0-only
// Checkpoint 4's settings and the widgets the library switches on, rendered against a fake of the
// API: setup's TMDB key step (checked on Continue, skippable, sent with Finish), Settings › General
// › Metadata, Media management's root folders, Profiles and formats and Quality sizes (read-only),
// System › About with TMDB's notice, and the Upcoming, Calendar, Recently added and Storage widgets
// with and without the `movies` source. Checkpoint 5 adds setup's indexer step, Settings › General
// › Catalog, the catalog's version in About, and the Indexers widget. The shell and Next's router
// are stood in for.
import './dom.ts'
import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'
import type { ReactNode } from 'react'

let role: 'owner' | 'admin' = 'owner'

mock.module('next/navigation', () => ({
  useRouter: () => ({ push: () => {} }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}))
mock.module('../src/admin/shell.tsx', () => ({
  useShell: () => ({ role }),
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
const { TMDB_ATTRIBUTION } = await import('@highsea/api-contract')
const { Setup } = await import('../src/admin/setup.tsx')
const { General } = await import('../src/admin/general.tsx')
const { MediaManagement } = await import('../src/admin/media-management.tsx')
const { Profiles, QualitySizes } = await import('../src/admin/profiles.tsx')
const { System } = await import('../src/admin/system.tsx')
const { SettingsIndex } = await import('../src/admin/settings.tsx')
const { seesArea } = await import('../src/admin/settings-areas.ts')
const { widgetRenderers } = await import('../src/admin/widgets.tsx')
const { filmBytes, foldersOnDisk, localDay, MIB, releasesByDay } = await import(
  '../src/admin/library-figures.ts'
)
const { errorReason, maskedKey, metadataLocale, metadataOptions } = await import(
  '../src/admin/metadata-locale.ts'
)

// ---------------------------------------------------------------- the fake API

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const failure = (code: string, message: string, status: number, details?: unknown) =>
  json({ error: { code, message, details } }, status)
const noContent = () => new Response(null, { status: 204 })

/** Today on the local calendar, `YYYY-MM-DD`. */
const today = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const movie = (id: number, title: string, releaseDate: string | null, labels = ['HD 1080p']) => ({
  id,
  type: 'movie',
  title,
  originalTitle: title,
  sortTitle: title.toLowerCase(),
  year: releaseDate ? Number(releaseDate.slice(0, 4)) : null,
  runtimeMinutes: 120,
  genres: [],
  synopsis: '',
  rating: 4,
  voteCount: 10,
  releaseDate,
  art: { poster: `/api/v1/images/w342/p${id}.jpg`, backdrop: null },
  status: 'not-released',
  monitored: true,
  minimumAvailability: 'released',
  languageProfileId: null,
  qualityProfileId: 'qp-hd',
  rootFolder: '/data/media/movies',
  path: `/data/media/movies/${title}`,
  addedAt: '2026-10-19T10:00:00.000Z',
  versions: labels.map((label, i) => ({
    id: `v${i}`,
    label,
    qualityProfileId: 'qp-hd',
    fileId: null,
  })),
  gone: false,
})

const folder = (id: string, path: string, total: number | null, movies: number) => ({
  id,
  path,
  free: total === null ? null : total / 2,
  total,
  device: total === null ? null : 'sda1',
  accessible: total !== null,
  movies,
})

type Request = { method: string; path: string; body: unknown }
let state: {
  sources: string[]
  metadata: { key: { set: boolean; last4: string | null }; language: string; region: string }
  folders: ReturnType<typeof folder>[]
  upcoming: ReturnType<typeof movie>[]
  recent: ReturnType<typeof movie>[]
  requests: Request[]
  checkedAt: string | null
  catalog: {
    channel: 'stable' | 'beta'
    autoUpdate: boolean
    extras: { url: string; keyId: string; publicKey: string }[]
  }
  indexers: {
    id: string
    name: string
    enabled: boolean
    health: string
    backoffUntil: null
    stats: { grabs24h: number; avgResponseMs: number | null }
  }[]
}

const GOOD_KEY = 'eyJhbGciOiJIUzI1NiJ9.good-token-3f9a'

async function api(url: string, init: RequestInit = {}): Promise<Response> {
  const u = new URL(url, 'http://localhost')
  const method = init.method ?? 'GET'
  const path = u.pathname
  if (path === '/api/v1/events')
    return new Response(new ReadableStream(), { headers: { 'content-type': 'text/event-stream' } })
  const body = init.body ? JSON.parse(String(init.body)) : undefined
  state.requests.push({ method, path: path + u.search, body })
  switch (`${method} ${path}`) {
    case 'GET /api/v1/system/info/public':
      return json({
        id: 'srv_1',
        name: 'Harbor',
        version: '0.4.0',
        setupComplete: true,
        auth: { oidc: false, passkeys: true },
        sources: state.sources,
        attributions: [TMDB_ATTRIBUTION],
      })
    case 'GET /api/v1/setup/defaults':
      return json({
        dataDir: '/data',
        folders: { movies: '/data/media/movies', downloads: '/data/downloads' },
        serverName: '',
      })
    case 'GET /api/v1/setup/indexers':
      return json([
        {
          id: 'internet-archive',
          name: 'Internet Archive',
          description: 'Public-domain feature films, shared over BitTorrent.',
          privacy: 'public',
          starter: true,
          settings: [],
        },
      ])
    case 'GET /api/v1/setup/fs/hardlinks':
      return json({ ok: true, sameDevice: true, message: 'Both folders are on the same disk.' })
    case 'POST /api/v1/setup/metadata-key':
      if (body.key === GOOD_KEY) return noContent()
      if (body.key === 'offline')
        return failure('unavailable', 'TMDB can’t be reached.', 503, {
          reason: 'tmdb-unreachable',
        })
      return failure('invalid', 'Invalid API key.', 400, { reason: 'tmdb-key-rejected' })
    case 'POST /api/v1/setup':
      return json({ server: { id: 'srv_1', name: body.serverName } })
    case 'GET /api/v1/settings/metadata':
      return json(state.metadata)
    case 'PUT /api/v1/settings/metadata':
      if (body.key && body.key !== GOOD_KEY)
        return failure('invalid', 'Invalid API key.', 400, { reason: 'tmdb-key-rejected' })
      state.metadata = {
        ...state.metadata,
        ...(body.language ? { language: body.language } : {}),
        ...(body.region ? { region: body.region } : {}),
        ...(body.key ? { key: { set: true, last4: body.key.slice(-4) } } : {}),
      }
      return json(state.metadata)
    case 'DELETE /api/v1/settings/metadata':
      state.metadata = { ...state.metadata, key: { set: false, last4: null } }
      return json(state.metadata)
    case 'GET /api/v1/rootfolders':
      return json(state.folders)
    case 'POST /api/v1/rootfolders':
      if (body.path === '/nowhere')
        return failure('invalid', '/nowhere doesn’t exist.', 400, { reason: 'not-found' })
      if (body.path === '/data/media/movies/inner')
        return failure('conflict', 'Inside a root folder.', 409)
      state.folders = [...state.folders, folder('rf9', body.path, 4e12, 0)]
      return json(state.folders.at(-1), 201)
    case 'GET /api/v1/qualityprofiles':
      return json([
        {
          id: 'qp-hd',
          name: 'HD 1080p',
          items: [
            { name: 'Remux-1080p', qualities: ['Remux-1080p'], allowed: false },
            { name: 'Bluray-1080p', qualities: ['Bluray-1080p'], allowed: true },
            { name: 'WEB 1080p', qualities: ['WEBDL-1080p', 'WEBRip-1080p'], allowed: true },
          ],
          cutoff: 'Bluray-1080p',
          upgradeAllowed: true,
          minFormatScore: 0,
          cutoffFormatScore: 10000,
          minUpgradeFormatScore: 1,
          formats: [{ formatId: 'cf-x265', score: -100 }],
          language: 'original',
        },
      ])
    case 'GET /api/v1/customformats':
      return json([
        {
          id: 'cf-x265',
          name: 'x265',
          source: 'preset',
          trashId: null,
          conditions: [
            {
              kind: 'title',
              name: 'x265',
              value: '[xh][ .]?265|hevc',
              negate: false,
              required: false,
            },
          ],
        },
      ])
    case 'GET /api/v1/settings/qualitySizes':
      return json([
        { quality: 'Bluray-1080p', min: 50.4, preferred: 95, max: 400 },
        { quality: 'Remux-2160p', min: 204.4, preferred: null, max: null },
      ])
    case 'GET /api/v1/catalog':
    case 'POST /api/v1/catalog/check':
      if (method === 'POST') state.checkedAt = new Date().toISOString()
      return json({
        version: '2026.10.20',
        channel: state.catalog.channel,
        autoUpdate: state.catalog.autoUpdate,
        engineVersion: '1',
        lastCheck: state.checkedAt ? { at: state.checkedAt, ok: true, message: null } : null,
        available: null,
        changes: [],
        extras: [],
        brokenLocal: [],
      })
    case 'GET /api/v1/catalog/settings':
      return json(state.catalog)
    case 'PATCH /api/v1/catalog/settings':
      if (body.extras?.some((x: { url: string }) => !x.url.startsWith('https://')))
        return failure('invalid', 'Use an https address for an extra catalog.', 400)
      state.catalog = { ...state.catalog, ...body }
      return json(state.catalog)
    case 'GET /api/v1/indexers':
      return json(state.indexers)
    case 'GET /api/v1/movies/upcoming':
      return json(state.upcoming)
    case 'GET /api/v1/movies/recent':
      return json(state.recent)
    case 'GET /api/v1/system/status':
      return json({
        version: '0.4.0',
        startedAt: '2026-10-20T00:00:00.000Z',
        cpu: 3,
        memory: { used: 1, total: 2 },
        disks: [{ path: '/data', label: 'Media', free: 1e12, total: 2e12 }],
      })
  }
  if (method === 'DELETE' && path.startsWith('/api/v1/rootfolders/')) {
    const id = path.split('/').pop()
    state.folders = state.folders.filter((f) => f.id !== id)
    return noContent()
  }
  return failure('not-found', `Nothing at ${path}.`, 404)
}

beforeEach(() => {
  role = 'owner'
  localStorage.clear()
  state = {
    sources: ['system', 'movies'],
    metadata: { key: { set: true, last4: 'ab12' }, language: 'en-GB', region: 'GB' },
    folders: [folder('rf1', '/data/media/movies', 2e12, 3)],
    upcoming: [movie(1, 'Dune: Part Three', today(), ['HD 1080p', '4K HDR'])],
    recent: [movie(2, 'Sintel', '2010-09-30'), movie(3, 'Tears of Steel', '2012-09-26')],
    requests: [],
    checkedAt: null,
    catalog: { channel: 'stable', autoUpdate: true, extras: [] },
    indexers: [],
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

const requested = (method: string, path: string) =>
  state.requests.filter((r) => r.method === method && r.path.split('?')[0] === path)

// ---------------------------------------------------------------- setup

describe('setup’s TMDB key step', () => {
  async function toKeyStep() {
    const opened = await open(<Setup />)
    const { user, page } = opened
    await user.type(page.getByLabelText('Server name'), 'Harbor')
    await user.click(page.getByRole('button', { name: 'Continue' }))
    await user.type(page.getByLabelText('Your name'), 'Ana Lima')
    await user.type(page.getByLabelText('Username'), 'ana')
    await user.type(page.getByLabelText('Password'), 'correct horse battery')
    await user.type(page.getByLabelText('Confirm password'), 'correct horse battery')
    await user.click(page.getByRole('button', { name: 'Continue' }))
    await settle()
    expect(page.getByRole('heading', { level: 1, name: 'Add your TMDB key' })).toBeTruthy()
    return opened
  }

  async function toReview(
    user: ReturnType<typeof userEvent.setup>,
    page: ReturnType<typeof within>,
  ) {
    for (const heading of [
      'Choose your folders',
      'Add indexers',
      'Watching away from home',
      'Link to highsea cloud',
    ]) {
      expect(page.getByRole('heading', { level: 1, name: heading })).toBeTruthy()
      await user.click(page.getByRole('button', { name: 'Continue' }))
      await settle()
    }
    expect(page.getByRole('heading', { level: 1, name: 'Check and finish' })).toBeTruthy()
  }

  test('comes after the owner, links to TMDB’s key page and carries TMDB’s notice', async () => {
    const { page } = await toKeyStep()
    const link = page.getByRole('link', { name: /Open TMDB’s API page/ })
    expect(link.getAttribute('href')).toBe('https://www.themoviedb.org/settings/api')
    expect(page.getByText(TMDB_ATTRIBUTION.notice)).toBeTruthy()
    expect(page.getByRole('img', { name: 'TMDB' })).toBeTruthy()
  })

  test('Continue checks the key with TMDB: empty, rejected and unreachable say so in place', async () => {
    const { user, page } = await toKeyStep()
    const field = page.getByLabelText('TMDB API key or Read Access Token')
    await user.click(page.getByRole('button', { name: 'Continue' }))
    expect(page.getByText('Paste your TMDB key, or add it later in Settings.')).toBeTruthy()
    expect(requested('POST', '/api/v1/setup/metadata-key')).toHaveLength(0)

    await user.type(field, 'not-a-key')
    await user.click(page.getByRole('button', { name: 'Continue' }))
    await settle()
    expect(
      page.getByText('TMDB didn’t accept that key. Copy it again from your TMDB account.'),
    ).toBeTruthy()

    await user.clear(field)
    await user.type(field, 'offline')
    await user.click(page.getByRole('button', { name: 'Continue' }))
    await settle()
    expect(page.getByText(/Can’t reach TMDB right now/)).toBeTruthy()
    expect(page.getByRole('heading', { level: 1, name: 'Add your TMDB key' })).toBeTruthy()
  })

  test('an accepted key goes on, shows in Review by its last four, and is sent with Finish', async () => {
    const { user, page } = await toKeyStep()
    await user.type(page.getByLabelText('TMDB API key or Read Access Token'), GOOD_KEY)
    await user.click(page.getByRole('button', { name: 'Continue' }))
    await settle()
    expect(requested('POST', '/api/v1/setup/metadata-key')[0]?.body).toEqual({ key: GOOD_KEY })
    // the key never goes into storage
    expect(localStorage.getItem('highsea:setup')).not.toContain(GOOD_KEY)
    await toReview(user, page)
    expect(page.getByText('Added, ending in 3f9a')).toBeTruthy()
    await user.click(page.getByRole('button', { name: 'Finish setup' }))
    await settle()
    const sent = requested('POST', '/api/v1/setup')[0]?.body as { metadata: unknown }
    expect(sent.metadata).toEqual({ ...metadataLocale(navigator.language), key: GOOD_KEY })
  })

  test('“Add it later in Settings” skips without asking TMDB, and Finish sends no key', async () => {
    const { user, page } = await toKeyStep()
    await user.type(page.getByLabelText('TMDB API key or Read Access Token'), 'half-typed')
    await user.click(page.getByRole('button', { name: 'Add it later in Settings' }))
    await settle()
    expect(requested('POST', '/api/v1/setup/metadata-key')).toHaveLength(0)
    await toReview(user, page)
    expect(page.getByText('Not yet: add it later in Settings')).toBeTruthy()
    await user.click(page.getByRole('button', { name: 'Finish setup' }))
    await settle()
    const sent = requested('POST', '/api/v1/setup')[0]?.body as { metadata: { key?: string } }
    expect(sent.metadata.key).toBeUndefined()
  })
})

describe('setup’s indexer step', () => {
  async function toIndexers() {
    localStorage.setItem(
      'highsea:setup',
      JSON.stringify({
        step: 4,
        reached: 4,
        draft: {
          serverName: 'Harbor',
          owner: { displayName: 'Ana Lima', username: 'ana' },
          folders: { movies: '/data/media/movies', downloads: '/data/downloads' },
        },
      }),
    )
    const opened = await open(<Setup />)
    await settle()
    expect(opened.page.getByRole('heading', { level: 1, name: 'Add indexers' })).toBeTruthy()
    return opened
  }

  async function finish(user: ReturnType<typeof userEvent.setup>, page: ReturnType<typeof within>) {
    for (let i = 0; i < 3; i++) {
      await user.click(page.getByRole('button', { name: 'Continue' }))
      await settle()
    }
    expect(page.getByRole('heading', { level: 1, name: 'Check and finish' })).toBeTruthy()
  }

  const password = async (
    user: ReturnType<typeof userEvent.setup>,
    page: ReturnType<typeof within>,
  ) => {
    // the password isn't kept across the reload this test starts from
    await user.click(page.getByRole('button', { name: 'Finish setup' }))
    await settle()
    await user.type(page.getByLabelText('Password'), 'correct horse battery')
    await user.type(page.getByLabelText('Confirm password'), 'correct horse battery')
    await user.click(page.getByRole('button', { name: /Review/ }))
    await settle()
  }

  test('the public starters come checked, show in Review and are sent with Finish', async () => {
    const { user, page } = await toIndexers()
    const box = page.getByRole('checkbox', { name: /Internet Archive/ })
    expect(box.getAttribute('aria-checked')).toBe('true')
    await finish(user, page)
    expect(page.getByText('Internet Archive')).toBeTruthy()
    await password(user, page)
    await user.click(page.getByRole('button', { name: 'Finish setup' }))
    await settle()
    const sent = requested('POST', '/api/v1/setup')[0]?.body as { indexers: string[] }
    expect(sent.indexers).toEqual(['internet-archive'])
  })

  test('unchecked, it’s skipped: Review says none yet and the choice survives a reload', async () => {
    const { user, page } = await toIndexers()
    await user.click(page.getByRole('checkbox', { name: /Internet Archive/ }))
    await finish(user, page)
    expect(page.getByText('None yet')).toBeTruthy()
    cleanup()
    const again = await open(<Setup />)
    await settle()
    expect(again.page.getByText('None yet')).toBeTruthy()
  })
})

// ---------------------------------------------------------------- settings

describe('Settings', () => {
  test('Security and Backups are the owner’s; an admin doesn’t see them (ADR 0032)', async () => {
    const areas = (page: Awaited<ReturnType<typeof open>>['page']) =>
      page.getAllByRole('link').map((l) => l.textContent)
    const asOwner = await open(<SettingsIndex />)
    expect(areas(asOwner.page)).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^Security/),
        expect.stringMatching(/^Backups/),
      ]),
    )
    cleanup()
    role = 'admin'
    const asAdmin = await open(<SettingsIndex />)
    expect(areas(asAdmin.page).some((a) => /^(Security|Backups)/.test(a ?? ''))).toBe(false)
    expect(areas(asAdmin.page).some((a) => a?.startsWith('Users and devices'))).toBe(true)
    expect(seesArea('security', 'admin')).toBe(false)
    expect(seesArea('backups', 'owner')).toBe(true)
  })
})

describe('Settings › General › Metadata', () => {
  test('shows the key by its last four; Replace checks the new one on Save', async () => {
    const { user, page } = await open(<General />)
    const group = page.getByRole('region', { name: 'Metadata' })
    expect(within(group).getByText('Set')).toBeTruthy()
    expect(within(group).getByText(maskedKey('ab12'))).toBeTruthy()
    expect(page.getByText(/Language, time zone, updates and diagnostics arrive/)).toBeTruthy()

    await user.click(within(group).getByRole('button', { name: 'Replace' }))
    await user.type(within(group).getByLabelText('New TMDB key'), 'wrong')
    await user.click(page.getByRole('button', { name: 'Save' }))
    await settle()
    expect(
      page.getByText('TMDB didn’t accept that key. Copy it again from your TMDB account.'),
    ).toBeTruthy()
    expect(state.metadata.key.last4).toBe('ab12')

    await user.clear(within(group).getByLabelText('New TMDB key'))
    await user.type(within(group).getByLabelText('New TMDB key'), GOOD_KEY)
    await user.click(page.getByRole('button', { name: 'Save' }))
    await settle()
    expect(requested('PUT', '/api/v1/settings/metadata').at(-1)?.body).toEqual({
      language: 'en-GB',
      region: 'GB',
      key: GOOD_KEY,
    })
    expect(page.getByText(maskedKey('3f9a'))).toBeTruthy()
  })

  test('Remove asks first, then the group says no key is set', async () => {
    const { user, page } = await open(<General />)
    await user.click(page.getByRole('button', { name: 'Remove' }))
    const dialog = page.getByRole('alertdialog')
    expect(within(dialog).getByText(/The library and its pages keep working/)).toBeTruthy()
    await user.click(within(dialog).getByRole('button', { name: 'Remove key' }))
    await settle()
    expect(requested('DELETE', '/api/v1/settings/metadata')).toHaveLength(1)
    expect(page.getByText('Not set')).toBeTruthy()
    expect(page.getByLabelText('New TMDB key')).toBeTruthy()
  })

  test('admins see the settings but can’t change them', async () => {
    role = 'admin'
    const { page } = await open(<General />)
    expect(page.getByText(/Only the owner can change/)).toBeTruthy()
    expect(page.queryByRole('button', { name: 'Replace' })).toBeNull()
  })
})

describe('Settings › Media management › root folders', () => {
  test('each folder with its space, device and movies; one in use can’t be removed', async () => {
    state.folders.push(folder('rf2', '/mnt/old', null, 0))
    const { page } = await open(<MediaManagement />)
    const list = page.getByRole('list', { name: 'Root folders' })
    expect(within(list).getByText('1.0 TB free of 2.0 TB · 3 movies')).toBeTruthy()
    expect(within(list).getByText('Can’t be read now')).toBeTruthy()
    const inUse = page.getByRole('button', { name: 'Remove /data/media/movies' })
    expect(inUse.hasAttribute('disabled')).toBe(true)
    expect(page.getByText(/3 movies are filed under it/)).toBeTruthy()
  })

  test('adding checks the path; the server’s reasons read as plain sentences', async () => {
    const { user, page } = await open(<MediaManagement />)
    const field = page.getByLabelText('Add a root folder')
    await user.type(field, 'relative/path')
    await user.click(page.getByRole('button', { name: 'Add folder' }))
    expect(page.getByText('Use the full path, starting with /.')).toBeTruthy()
    expect(requested('POST', '/api/v1/rootfolders')).toHaveLength(0)

    await user.clear(field)
    await user.type(field, '/nowhere')
    await user.click(page.getByRole('button', { name: 'Add folder' }))
    await settle()
    expect(page.getByText('That folder doesn’t exist on the server.')).toBeTruthy()

    await user.clear(field)
    await user.type(field, '/data/media/movies/inner')
    await user.click(page.getByRole('button', { name: 'Add folder' }))
    await settle()
    expect(page.getByText(/a root folder already, or inside or around one/)).toBeTruthy()

    await user.clear(field)
    await user.type(field, '/data/media/films')
    await user.click(page.getByRole('button', { name: 'Add folder' }))
    await settle()
    expect(page.getByText('/data/media/films')).toBeTruthy()
  })

  test('removing an unused folder asks first', async () => {
    state.folders.push(folder('rf2', '/data/media/old', 2e12, 0))
    const { user, page } = await open(<MediaManagement />)
    await user.click(page.getByRole('button', { name: 'Remove /data/media/old' }))
    await user.click(
      within(page.getByRole('alertdialog')).getByRole('button', { name: 'Remove folder' }),
    )
    await settle()
    expect(requested('DELETE', '/api/v1/rootfolders/rf2')).toHaveLength(1)
    expect(page.queryByText('/data/media/old')).toBeNull()
  })
})

describe('Settings › Profiles and formats, Quality sizes', () => {
  test('profiles list their allowed qualities with the cutoff; editing is inert', async () => {
    const { page } = await open(<Profiles />)
    const profile = page.getByText('HD 1080p').closest('li') as HTMLElement
    expect(within(profile).queryByText('Remux-1080p')).toBeNull()
    expect(within(profile).getByText('Bluray-1080p, the cutoff')).toBeTruthy()
    expect(
      within(profile).getByText(/Upgrades until Bluray-1080p · 1 custom format score/),
    ).toBeTruthy()
    expect(
      within(profile).getByRole('button', { name: 'Edit HD 1080p' }).getAttribute('aria-disabled'),
    ).toBe('true')
    const formats = page.getByRole('table', { name: 'Custom formats' })
    expect(within(formats).getByText('x265')).toBeTruthy()
    expect(within(formats).getByText('Preset')).toBeTruthy()
  })

  test('sizes are read-only, in MiB, with what a 2-hour film comes to', async () => {
    const { page } = await open(<QualitySizes />)
    const table = page.getByRole('table', { name: 'Sizes per minute of runtime' })
    expect(within(table).queryByRole('spinbutton')).toBeNull()
    expect(within(table).getByText('6.3 GB–50.3 GB')).toBeTruthy()
    expect(within(table).getByText('No limit')).toBeTruthy()
    expect(page.getByText(/MB here are MiB/)).toBeTruthy()
  })
})

describe('System › About', () => {
  test('the server, its version and TMDB’s logo and notice', async () => {
    const { page } = await open(<System />)
    const about = page.getByRole('region', { name: 'About' })
    expect(within(about).getByText('Harbor')).toBeTruthy()
    expect(within(about).getByText('0.4.0')).toBeTruthy()
    expect(within(about).getByText(TMDB_ATTRIBUTION.notice)).toBeTruthy()
    expect(within(about).getByRole('link', { name: 'TMDB' }).getAttribute('href')).toBe(
      TMDB_ATTRIBUTION.url,
    )
  })
})

describe('System › About › Indexer catalog', () => {
  test('the installed version, and Check now asks the catalog service', async () => {
    const { user, page } = await open(<System />)
    const about = page.getByRole('region', { name: 'About' })
    expect(within(about).getByText('2026.10.20')).toBeTruthy()
    await user.click(within(about).getByRole('button', { name: 'Check now' }))
    await settle()
    expect(requested('POST', '/api/v1/catalog/check')).toHaveLength(1)
    expect(within(about).getByText(/^Checked .* ago$/)).toBeTruthy()
  })
})

describe('Settings › General › Indexer catalog', () => {
  test('the channel and automatic updates save at once', async () => {
    const { user, page } = await open(<General />)
    const group = page.getByRole('region', { name: 'Indexer catalog' })
    await user.click(within(group).getByRole('switch', { name: /Install new versions/ }))
    await settle()
    expect(requested('PATCH', '/api/v1/catalog/settings')[0]?.body).toEqual({ autoUpdate: false })
    expect(state.catalog.autoUpdate).toBe(false)
    // one Save bar on the page, Metadata's, and it stays hidden
    expect(page.queryByRole('button', { name: 'Save' })).toBeNull()
  })

  test('an extra catalog is added with its key, refused in place, and removed after asking', async () => {
    const { user, page } = await open(<General />)
    const group = page.getByRole('region', { name: 'Indexer catalog' })
    await user.click(within(group).getByRole('button', { name: 'Add catalog' }))
    expect(
      within(group).getByText(/Fill in the address, the key ID and the public key/),
    ).toBeTruthy()
    expect(requested('PATCH', '/api/v1/catalog/settings')).toHaveLength(0)

    await user.type(within(group).getByLabelText('Manifest address'), 'http://plain.example')
    await user.type(within(group).getByLabelText('Key ID'), 'friend')
    await user.type(within(group).getByLabelText('Public key'), 'AAAA')
    await user.click(within(group).getByRole('button', { name: 'Add catalog' }))
    await settle()
    expect(within(group).getByText('Use an https address for an extra catalog.')).toBeTruthy()

    await user.clear(within(group).getByLabelText('Manifest address'))
    await user.type(
      within(group).getByLabelText('Manifest address'),
      'https://friend.example/manifest.json',
    )
    await user.click(within(group).getByRole('button', { name: 'Add catalog' }))
    await settle()
    expect(state.catalog.extras).toEqual([
      { url: 'https://friend.example/manifest.json', keyId: 'friend', publicKey: 'AAAA' },
    ])
    expect(within(group).getByText('Key friend')).toBeTruthy()

    await user.click(
      within(group).getByRole('button', { name: 'Remove https://friend.example/manifest.json' }),
    )
    const dialog = page.getByRole('alertdialog')
    expect(within(dialog).getByText(/Its definitions go with it/)).toBeTruthy()
    await user.click(within(dialog).getByRole('button', { name: 'Remove catalog' }))
    await settle()
    expect(state.catalog.extras).toEqual([])
  })

  test('an admin gets a line saying it’s the owner’s, and nothing is read', async () => {
    role = 'admin'
    const { page } = await open(<General />)
    expect(page.getByText(/Only the owner can see and change the catalog/)).toBeTruthy()
    expect(requested('GET', '/api/v1/catalog/settings')).toHaveLength(0)
  })
})

// ---------------------------------------------------------------- widgets

const W = {
  upcoming: widgetRenderers.upcoming,
  calendar: widgetRenderers.calendar,
  recent: widgetRenderers['recently-added'],
  storage: widgetRenderers.storage,
}

const frame = (id: string, span = 2, rows = 3) => ({ span, rows, 'data-widget-id': id }) as never

describe('the Indexers widget', () => {
  const Indexers = widgetRenderers.indexers
  const ix = (id: string, name: string, health: string, ms: number | null) => ({
    id,
    name,
    enabled: health !== 'disabled',
    health,
    backoffUntil: null,
    stats: { grabs24h: 3, avgResponseMs: ms },
  })

  test('lists each indexer with its health and response time', async () => {
    state.sources = ['system', 'movies', 'indexers']
    state.indexers = [
      ix('ix1', 'Internet Archive', 'healthy', 412),
      ix('ix2', 'Torznab', 'failing', null),
    ]
    const { page } = await open(<Indexers frame={frame('i', 2)} settings={{}} />)
    expect(page.getByText('1 of 2 healthy')).toBeTruthy()
    expect(page.getByText(': Failing')).toBeTruthy()
    expect(page.getByText('412 ms')).toBeTruthy()
    expect(page.getByText('no queries yet')).toBeTruthy()
    expect(page.getAllByText('3 grabs')).toHaveLength(2)
  })

  test('with none installed it offers the catalog; without the source it calls nothing', async () => {
    state.sources = ['system', 'movies', 'indexers']
    const { page } = await open(<Indexers frame={frame('i', 1)} settings={{}} />)
    expect(page.getByText('No indexers yet')).toBeTruthy()
    cleanup()
    state.sources = ['system', 'movies']
    state.requests = []
    const again = await open(<Indexers frame={frame('i', 1)} settings={{}} />)
    expect(again.page.getByText('No indexers yet')).toBeTruthy()
    expect(requested('GET', '/api/v1/indexers')).toHaveLength(0)
  })
})

describe('the widgets the library switches on', () => {
  test('Upcoming lists monitored releases with their versions, linked by TMDB id', async () => {
    const { page } = await open(<W.upcoming frame={frame('u')} settings={{ days: 14 }} />)
    const link = page.getByRole('link', { name: 'Dune: Part Three' })
    expect(link.getAttribute('href')).toBe('/movies/1')
    expect(page.getByText('HD 1080p + 4K HDR')).toBeTruthy()
    expect(requested('GET', '/api/v1/movies/upcoming')[0]?.path).toBe(
      '/api/v1/movies/upcoming?days=14',
    )
  })

  test('Calendar marks today’s release; Recently added shows posters', async () => {
    const { page } = await open(
      <>
        <W.calendar frame={frame('c')} settings={{}} />
        <W.recent frame={frame('r')} settings={{}} />
      </>,
    )
    expect(page.getByText(': Dune: Part Three')).toBeTruthy()
    expect(page.queryByText('No releases this month.')).toBeNull()
    expect(page.getByRole('link', { name: /Sintel/ }).getAttribute('href')).toBe('/movies/2')
  })

  test('Storage names the root folders on the disk and how many movies each holds', async () => {
    state.folders.push(folder('rf2', '/elsewhere', 9e12, 5))
    const { page } = await open(<W.storage frame={frame('s', 1, 3)} settings={{}} />)
    expect(page.getByText('/data/media/movies')).toBeTruthy()
    expect(page.getByText('3 movies')).toBeTruthy()
    expect(page.queryByText('/elsewhere')).toBeNull()
  })

  test('without the movies source they keep their empty states and call nothing', async () => {
    state.sources = ['system']
    const { page } = await open(
      <>
        <W.upcoming frame={frame('u')} settings={{ days: 14 }} />
        <W.calendar frame={frame('c')} settings={{}} />
        <W.recent frame={frame('r')} settings={{}} />
        <W.storage frame={frame('s')} settings={{}} />
      </>,
    )
    expect(page.getByText('Nothing due in the next 14 days')).toBeTruthy()
    expect(page.getByText('Nothing added yet')).toBeTruthy()
    expect(page.getByText('No releases this month.')).toBeTruthy()
    expect(requested('GET', '/api/v1/movies/upcoming')).toHaveLength(0)
    expect(requested('GET', '/api/v1/movies/recent')).toHaveLength(0)
    expect(requested('GET', '/api/v1/rootfolders')).toHaveLength(0)
  })
})

// ---------------------------------------------------------------- the figures

describe('figures', () => {
  test('a release day is the local calendar day, not UTC’s', () => {
    const d = localDay('2026-10-24')
    expect([d.getFullYear(), d.getMonth(), d.getDate()]).toEqual([2026, 9, 24])
    const byDay = releasesByDay(
      [
        { title: 'A', releaseDate: '2026-10-24' },
        { title: 'B', releaseDate: '2026-10-24' },
        { title: 'C', releaseDate: '2026-11-01' },
        { title: 'D', releaseDate: null },
      ],
      2026,
      9,
    )
    expect([...byDay]).toEqual([[24, ['A', 'B']]])
  })

  test('quality sizes are MiB a minute', () => {
    expect(filmBytes(1)).toBe(120 * MIB)
    expect(filmBytes(10, 110)).toBe(1100 * 1024 * 1024)
  })

  test('a folder is on a disk by its filesystem’s size, or by path when it can’t be read', () => {
    const disk = { path: '/data', label: 'Media', free: 1, total: 2e12 }
    const folders = [
      folder('a', '/data/media/movies', 2e12, 0),
      folder('b', '/data/other-mount', 5e12, 0),
      folder('c', '/data/unplugged', null, 0),
      folder('d', '/mnt/same-size', 2e12, 0),
      folder('e', '/database', null, 0),
    ]
    expect(foldersOnDisk(folders, disk).map((f) => f.id)).toEqual(['a', 'c', 'd'])
  })

  test('the owner’s locale becomes the metadata language and region', () => {
    expect(metadataLocale('en-GB')).toEqual({ language: 'en-GB', region: 'GB' })
    expect(metadataLocale('fr')).toEqual({ language: 'fr-FR', region: 'FR' })
    expect(metadataLocale('zh-Hant-TW')).toEqual({ language: 'zh-TW', region: 'TW' })
    expect(metadataLocale('not a locale')).toEqual({})
    expect(metadataLocale(undefined)).toEqual({})
  })

  test('options are named in the admin’s locale and keep a saved value that isn’t listed', () => {
    const regions = metadataOptions('region', 'IS', 'en')
    expect(regions.find((o) => o.value === 'IS')?.label).toBe('Iceland')
    expect(metadataOptions('language', 'pt-BR', 'en').find((o) => o.value === 'pt-BR')?.label).toBe(
      'Brazilian Portuguese',
    )
    expect(errorReason({ details: { reason: 'tmdb-key-rejected' } })).toBe('tmdb-key-rejected')
    expect(errorReason(new Error('x'))).toBeUndefined()
  })
})
