// SPDX-License-Identifier: AGPL-3.0-only
// Shows in the admin (D3 of the one client platform, answer 5), rendered against a fake of the
// drafted `series` routes: drawn only when public info's `sources` lists `shows`, the not-found
// page otherwise; the library's bulk bar edits each show in turn; a show's page monitors and
// searches a season and an episode, and opens Files at its own address; Discover's Shows adds one.
// The shell and Next's router are stood in for.
import './dom.ts'
import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'
import type { ReactNode } from 'react'
import { shown } from './modal.ts'
import { navigation, Routed, router } from './router.tsx'

mock.module('../src/navigation.tsx', () => navigation)
mock.module('../src/shell.tsx', () => ({
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
      {actions}
      {children}
    </main>
  ),
}))

const { act, cleanup, render, within } = await import('@testing-library/react')
const { default: userEvent } = await import('@testing-library/user-event')
const { createClient } = await import('@highsea-tv/sdk')
const { ClientProvider } = await import('@highsea-tv/sdk/react')
const { ThemeProvider, Toaster } = await import('@highsea-tv/ui/native')
const { ShowsLibrary } = await import('../src/shows-library.tsx')
const { ShowDetail } = await import('../src/show-detail.tsx')
const { DiscoverShows } = await import('../src/discover-shows.tsx')
const { Discover } = await import('../src/discover.tsx')

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

const episode = (n: number, over: Record<string, unknown> = {}) => ({
  id: `lk-s01e0${n}`,
  show: 'the-lantern-keepers',
  season: 1,
  number: n,
  title: `Episode ${n}`,
  aired: `2026-01-0${n}`,
  runtimeMinutes: 50,
  monitored: true,
  status: 'available',
  file: {
    path: `/data/media/tv/The Lantern Keepers (2024)/Season 01/S01E0${n}.mkv`,
    size: 1e9,
    quality: 'WEB 1080p',
    releaseGroup: 'NTb',
    episodes: [n],
  },
  ...over,
})

const show = (id: string, title: string, over: Record<string, unknown> = {}) => ({
  id,
  tmdbId: 100,
  title,
  sortTitle: title.toLowerCase(),
  year: 2024,
  endYear: null,
  airing: true,
  network: 'Channel 4',
  genres: ['Drama'],
  synopsis: 'Keepers of a light.',
  rating: 4,
  certification: '15',
  runtimeMinutes: 50,
  monitored: true,
  qualityProfileId: 'qp-hd',
  languageProfileId: 'lp-en',
  rootFolder: '/data/media/tv',
  path: `/data/media/tv/${title} (2024)`,
  seasonFolders: true,
  addedAt: '2026-10-20T10:00:00.000Z',
  art: { poster: '', backdrop: '' },
  seasons: 1,
  episodes: { monitored: 2, have: 1, total: 2 },
  size: 1e9,
  nextAiring: null,
  ...over,
})

const lantern = () => ({
  ...show('the-lantern-keepers', 'The Lantern Keepers'),
  seasonList: [
    {
      number: 1,
      title: 'Season 1',
      monitored: true,
      poster: '',
      episodes: [episode(1), episode(2, { status: 'missing', file: null })],
    },
  ],
})

let sources: string[] = []
type Request = { method: string; path: string; body: unknown }
let requests: Request[] = []

async function api(url: string, init: RequestInit = {}): Promise<Response> {
  const u = new URL(url, 'http://localhost')
  const method = init.method ?? 'GET'
  if (u.pathname === '/api/v1/events')
    return new Response(new ReadableStream(), { headers: { 'content-type': 'text/event-stream' } })
  const body = init.body ? JSON.parse(String(init.body)) : undefined
  requests.push({ method, path: u.pathname + u.search, body })
  const route = `${method} ${u.pathname}`
  switch (route) {
    case 'GET /api/v1/system/info/public':
      return json({ name: 'highsea', version: '0.4.0', sources })
    case 'GET /api/v1/series':
      return json([
        show('the-lantern-keepers', 'The Lantern Keepers'),
        show('small-town-radio', 'Small Town Radio', { airing: false }),
      ])
    case 'GET /api/v1/series/the-lantern-keepers':
      return json(lantern())
    case 'GET /api/v1/series/rootfolders':
      return json(['/data/media/tv'])
    case 'GET /api/v1/qualityprofiles':
      return json([{ id: 'qp-hd', name: 'HD 1080p' }])
    case 'GET /api/v1/languageprofiles':
      return json([{ id: 'lp-en', name: 'English', languages: [], cutoff: 'en', minScore: 80 }])
    case 'GET /api/v1/discover/shows':
      return json([
        {
          id: 'harbour-lights',
          tmdbId: 200,
          title: 'Harbour Lights',
          year: 2025,
          endYear: null,
          seasons: 1,
          network: 'BBC One',
          genres: [],
          synopsis: 'A harbour at night.',
          rating: 3.5,
          art: { poster: '', backdrop: '' },
          inLibrary: false,
        },
      ])
    case 'POST /api/v1/series':
      return json({ ...lantern(), id: 'harbour-lights', title: 'Harbour Lights' })
    case 'POST /api/v1/series/the-lantern-keepers/search':
      return json({ found: 1 })
  }
  if (method === 'PATCH' && u.pathname.startsWith('/api/v1/series/')) return json(lantern())
  if (method === 'PUT' && u.pathname.startsWith('/api/v1/series/')) return json(lantern())
  return json({ error: { code: 'not-found', message: `Nothing at ${u.pathname}.` } }, 404)
}

beforeEach(() => {
  requests = []
  sources = ['shows', 'music', 'profiles']
  localStorage.setItem('highsea:shows-view', 'table')
})
afterEach(() => {
  cleanup()
  localStorage.clear()
})

/** Lets the fetches answer, then ends any dialog's fade (modal.ts). */
const settle = async () => {
  await act(async () => {
    for (let i = 0; i < 6; i++) await new Promise((r) => setTimeout(r, 0))
  })
  shown()
}

async function open(page: ReactNode) {
  const client = createClient({ fetch: api as never })
  await act(async () => {
    render(
      <ClientProvider client={client}>
        <ThemeProvider>
          {page}
          <Toaster label="Notifications" />
        </ThemeProvider>
      </ClientProvider>,
    )
  })
  await settle()
  return { user: userEvent.setup(), page: within(document.body) }
}

const sent = (method: string, prefix: string) =>
  requests.filter((r) => r.method === method && r.path.startsWith(prefix))

describe('Shows, only when the server serves them', () => {
  test('a server without shows draws the not-found page and asks nothing of /series', async () => {
    sources = []
    const { page } = await open(<ShowsLibrary />)
    expect(
      page.getByText('This page is built in a later checkpoint of the server plan.'),
    ).toBeTruthy()
    expect(sent('GET', '/api/v1/series')).toEqual([])
  })

  test('Discover’s Movies and Shows choice is there only beside a server with shows', async () => {
    sources = []
    const { page } = await open(<Discover />)
    expect(page.queryByRole('radiogroup', { name: 'Find' })).toBeNull()
    cleanup()
    sources = ['shows']
    const again = await open(<Discover />)
    expect(again.page.getByLabelText('Find')).toBeTruthy()
  })
})

describe('the library', () => {
  test('lists the shows, and the bulk bar monitors each selected show in turn', async () => {
    const { user, page } = await open(<ShowsLibrary />)
    expect(page.getByText('The Lantern Keepers')).toBeTruthy()
    expect(page.getByText('Small Town Radio')).toBeTruthy()
    await user.click(page.getByRole('checkbox', { name: 'Select every show shown' }))
    const bar = within(page.getByRole('toolbar', { name: 'Bulk edit' }))
    await user.click(bar.getByRole('button', { name: 'Edit' }))
    await settle()
    await user.click(page.getByRole('menuitem', { name: 'Stop monitoring' }))
    await settle()
    expect(sent('PATCH', '/api/v1/series/').map((r) => [r.path, r.body])).toEqual([
      // in the table's order, by title
      ['/api/v1/series/small-town-radio', { monitored: false }],
      ['/api/v1/series/the-lantern-keepers', { monitored: false }],
    ])
    expect(page.getByText('2 shows no longer monitored')).toBeTruthy()
  })
})

describe('a show’s page', () => {
  const at = (path: string) => (
    <Routed<'files'> base="/shows/the-lantern-keepers" at={path}>
      {(tab) => <ShowDetail id="the-lantern-keepers" tab={tab} />}
    </Routed>
  )

  test('monitors an episode, searches for one, and opens Files at its address', async () => {
    const { user, page } = await open(at('/shows/the-lantern-keepers'))
    expect(page.getByText('Episode 2')).toBeTruthy()
    await user.click(page.getByRole('switch', { name: 'Monitor S01E02 Episode 2' }))
    await settle()
    expect(sent('PUT', '/api/v1/series/').map((r) => [r.path, r.body])).toEqual([
      ['/api/v1/series/the-lantern-keepers/episodes/lk-s01e02/monitored', { monitored: false }],
    ])
    await user.click(page.getByRole('button', { name: 'Search for S01E02 Episode 2' }))
    await settle()
    expect(sent('POST', '/api/v1/series/the-lantern-keepers/search').map((r) => r.body)).toEqual([
      { episode: 'lk-s01e02' },
    ])
    expect(page.getByText('Searching for The Lantern Keepers S01E02')).toBeTruthy()
    await user.click(page.getByRole('tab', { name: 'Files' }))
    await settle()
    expect(router.history).toEqual(['/shows/the-lantern-keepers/files'])
    expect(page.getByText('S01E01.mkv')).toBeTruthy()
  })

  test('Remove can delete the files too', async () => {
    const { user, page } = await open(at('/shows/the-lantern-keepers'))
    await user.click(page.getByRole('button', { name: 'More actions' }))
    await settle()
    await user.click(page.getByRole('menuitem', { name: 'Remove from library' }))
    await settle()
    const confirm = page.getByRole('dialog', { name: /Remove/ })
    await user.click(
      within(confirm).getByRole('checkbox', { name: 'Also delete its files from disk' }),
    )
    await user.click(within(confirm).getByRole('button', { name: 'Remove' }))
    await settle()
    expect(sent('DELETE', '/api/v1/series/').map((r) => r.path)).toEqual([
      '/api/v1/series/the-lantern-keepers?deleteFiles=true',
    ])
  })
})

describe('Discover’s shows', () => {
  test('Add a show sends the dialog’s choices', async () => {
    const { user, page } = await open(<DiscoverShows />)
    await user.click(page.getByRole('button', { name: 'Add Harbour Lights' }))
    await settle()
    const dialog = page.getByRole('dialog', { name: /Add Harbour Lights/ })
    await user.click(within(dialog).getByRole('button', { name: 'Add and search' }))
    await settle()
    expect(sent('POST', '/api/v1/series').map((r) => r.body)).toEqual([
      {
        tmdbId: 200,
        title: 'Harbour Lights',
        year: 2025,
        rootFolder: '/data/media/tv',
        qualityProfileId: 'qp-hd',
        languageProfileId: 'lp-en',
        monitor: 'all',
        seasonFolders: true,
        search: true,
      },
    ])
    expect(page.getByText('Harbour Lights added')).toBeTruthy()
  })
})
