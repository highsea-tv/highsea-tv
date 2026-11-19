// SPDX-License-Identifier: AGPL-3.0-only
// What the server is doing to a library item, in the admin (HT-106): a show with work in hand has
// a mark on its row that names the work; its page says the same beside its actions and turns
// Refresh metadata off while the refresh runs; when the refresh fails, `jobs.updated` brings the
// page's read again and a toast gives the reason. A fake of the routes; the shell and Next's router
// are stood in for.
import './dom.ts'
import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'
import type { ReactNode } from 'react'
import { shown } from './modal.ts'
import { navigation, Routed } from './router.tsx'

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

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

const ID = 'the-lantern-keepers'
const SINCE = '2026-11-19T10:00:00.000Z'

const show = {
  id: ID,
  tmdbId: 100,
  title: 'The Lantern Keepers',
  sortTitle: 'lantern keepers',
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
  path: '/data/media/tv/The Lantern Keepers (2024)',
  seasonFolders: true,
  addedAt: '2026-10-20T10:00:00.000Z',
  art: { poster: '', backdrop: '' },
  seasons: 1,
  episodes: { monitored: 1, have: 1, total: 1 },
  size: 1e9,
  nextAiring: null,
}

const detail = {
  ...show,
  seasonList: [
    {
      number: 1,
      title: 'Season 1',
      monitored: true,
      poster: '',
      episodes: [
        {
          id: 'lk-s01e01',
          show: ID,
          season: 1,
          number: 1,
          title: 'Episode 1',
          aired: '2026-01-01',
          runtimeMinutes: 50,
          monitored: true,
          status: 'available',
          file: null,
        },
      ],
    },
  ],
}

const job = (over: Record<string, unknown> = {}) => ({
  id: 'job-1',
  type: 'metadata.refresh',
  state: 'running',
  subject: { kind: 'show', id: ID },
  since: SINCE,
  retryAt: null,
  progress: 40,
  finishedAt: null,
  error: null,
  ...over,
})

const state = {
  active: [] as ReturnType<typeof job>[],
  finished: [] as ReturnType<typeof job>[],
  push: (_topic: string) => {},
}

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
              new TextEncoder().encode(
                `data: ${JSON.stringify({ id: ++id, topic, at: Date.parse(SINCE) })}\n\n`,
              ),
            )
        },
      }),
      { headers: { 'content-type': 'text/event-stream' } },
    )
  switch (`${method} ${u.pathname}`) {
    case 'GET /api/v1/system/info/public':
      return json({ name: 'highsea', version: '0.4.0', sources: ['shows'] })
    case 'GET /api/v1/series':
      return json([show, { ...show, id: 'small-town-radio', title: 'Small Town Radio' }])
    case 'GET /api/v1/series/unmatched':
      return json([])
    case `GET /api/v1/series/${ID}`:
      return json(detail)
    case 'GET /api/v1/qualityprofiles':
      return json([{ id: 'qp-hd', name: 'HD 1080p' }])
    case 'GET /api/v1/languageprofiles':
      return json([])
    case 'GET /api/v1/system/work':
      return json(state.active.length ? [{ kind: 'show', id: ID, jobs: state.active }] : [])
    case `GET /api/v1/system/work/show/${ID}`:
      return json({ kind: 'show', id: ID, active: state.active, finished: state.finished })
  }
  return json({ error: { code: 'not-found', message: `Nothing at ${u.pathname}.` } }, 404)
}

beforeEach(() => {
  state.active = []
  state.finished = []
  localStorage.setItem('highsea:shows-view', 'table')
})
afterEach(() => {
  cleanup()
  localStorage.clear()
})

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

describe('an item’s work', () => {
  test('a show’s row carries a mark that names the work, and only that show’s', async () => {
    state.active = [job()]
    const { page } = await open(<ShowsLibrary />)
    expect(page.getByText('Small Town Radio')).toBeTruthy()
    const marks = page.getAllByRole('img', { name: 'Refreshing metadata, 40%' })
    expect(marks).toHaveLength(1)

    // the work ends: the next read has none, and the mark goes without a reload
    state.active = []
    await act(async () => state.push('jobs.updated'))
    await settle()
    expect(page.queryByRole('img', { name: /Refreshing metadata/ })).toBeNull()
  })

  test('two kinds of work on a show and its episodes read as a count', async () => {
    state.active = [
      job(),
      job({
        id: 'job-2',
        type: 'subtitles.search',
        state: 'queued',
        subject: { kind: 'episode', id: '501' },
        progress: null,
      }),
    ]
    const { page } = await open(<ShowsLibrary />)
    expect(page.getByRole('img', { name: '2 tasks running' })).toBeTruthy()
  })

  test('the page says what’s in hand, turns Refresh off, and toasts the reason it failed', async () => {
    state.active = [job({ state: 'queued', progress: null })]
    const { user, page } = await open(
      <Routed<'files'> base={`/shows/${ID}`} at={`/shows/${ID}`}>
        {(tab) => <ShowDetail id={ID} tab={tab} />}
      </Routed>,
    )
    expect(page.getByText('Refreshing metadata, waiting to start')).toBeTruthy()
    await user.click(page.getByRole('button', { name: 'More actions' }))
    await settle()
    const refresh = page.getByRole('menuitem', { name: 'Refresh metadata' })
    expect(refresh.getAttribute('aria-disabled')).toBe('true')
    await user.keyboard('{Escape}')
    await settle()

    // it fails: the line goes, Refresh comes back, and the toast says why
    state.finished = [
      job({
        state: 'failed',
        progress: null,
        finishedAt: SINCE,
        error: 'TMDB answered 503. Try again in a minute.',
      }),
    ]
    state.active = []
    await act(async () => state.push('jobs.updated'))
    await settle()
    expect(page.queryByText('Refreshing metadata, waiting to start')).toBeNull()
    expect(page.getByText('Refreshing metadata didn’t finish')).toBeTruthy()
    expect(page.getByText('TMDB answered 503. Try again in a minute.')).toBeTruthy()
  })

  test('what finished before the page was opened isn’t toasted', async () => {
    state.finished = [job({ state: 'failed', finishedAt: SINCE, error: 'Old news.' })]
    const { page } = await open(
      <Routed<'files'> base={`/shows/${ID}`} at={`/shows/${ID}`}>
        {(tab) => <ShowDetail id={ID} tab={tab} />}
      </Routed>,
    )
    expect(page.getByText('The Lantern Keepers', { selector: 'h1' })).toBeTruthy()
    expect(page.queryByText('Old news.')).toBeNull()
  })
})
