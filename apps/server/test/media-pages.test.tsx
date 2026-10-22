// SPDX-License-Identifier: AGPL-3.0-only
// A6 movie detail, person pages and collection pages (media-pages.md, movies.md § Movie detail),
// rendered against a fake of the checkpoint 4 API: the page in each state, adding and removing in
// place, the library layer's edits, trailers that load nothing before the click, live refetches,
// the Search tab once an indexer is enabled (checkpoint 5), and checkpoint 6's live states: Grab and
// Grab anyway, In the queue, Files with their streams and paged History; and checkpoint 7a's
// Subtitles tab. The shell and Next's router are stood in for; everything else is the real screen.
import './dom.ts'
import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from 'bun:test'
import type { ReactNode } from 'react'

let role: 'owner' | 'admin' = 'owner'
const pushed: string[] = []

mock.module('next/navigation', () => ({
  useRouter: () => ({ push: (path: string) => pushed.push(path) }),
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
const { UIProvider } = await import('@highsea/ui-web')
const { MovieDetail } = await import('../src/admin/movie-detail.tsx')
const { PersonPage } = await import('../src/admin/person.tsx')
const { CollectionPage } = await import('../src/admin/collection.tsx')
const { crewByDepartment, playerUrl } = await import('../src/admin/media-sections.tsx')
const { byTitle } = await import('../src/admin/person.tsx')

// ---------------------------------------------------------------- the fake API

const art = (name: string) => ({
  poster: `/api/v1/images/w342/${name}.jpg`,
  backdrop: `/api/v1/images/w780/${name}-b.jpg`,
})

const discover = (id: number, title: string, year: number, inLibrary: boolean) => ({
  id,
  title,
  year,
  runtimeMinutes: null,
  genres: ['Science Fiction'],
  synopsis: `${title}, in a sentence.`,
  rating: 4,
  voteCount: 1000 + id,
  releaseDate: `${year}-03-31`,
  art: art(`p${id}`),
  inLibrary,
})

const credit = (
  n: number,
  personId: number,
  name: string,
  department: string,
  part: { character?: string; job?: string },
) => ({
  id: `c${n}`,
  personId,
  name,
  photo: n % 2 ? `/api/v1/images/w185/f${n}.jpg` : null,
  department,
  character: part.character ?? null,
  job: part.job ?? null,
})

type State = {
  inLibrary: boolean
  gone: boolean
  movie: Record<string, unknown>
  versions: { id: string; label: string; qualityProfileId: string; fileId: string | null }[]
  /** Parts of the collection that are in the library, besides 603. */
  owned: Set<number>
  requests: { method: string; path: string; body?: unknown }[]
  push: ((topic: string) => void) | null
  /** Installed indexers: only whether each is enabled matters here. */
  indexers: { id: string; name: string; enabled: boolean }[]
  /** The last 30 minutes' results, as GET …/releases answers them. */
  cached: ReturnType<typeof release>[]
  queue: ReturnType<typeof queueItem>[]
  files: ReturnType<typeof mediaFile>[]
  history: ReturnType<typeof historyEvent>[]
  /** Guids the server refuses without `force`, as the blocklist does. */
  blocked: Set<string>
  /** The movie's sidecars (checkpoint 7a). */
  tracks: ReturnType<typeof track>[]
  /** What a subtitle search answers: results, or the server's refusal. */
  subtitleSearch: ReturnType<typeof subtitleResult>[] | { status: number; reason: string }
  /** How many import lists there are (checkpoint 8a): with one, Remove offers to exclude. */
  importLists: number
}
let state: State

const release = (n: number, approved: boolean, extra: Record<string, unknown> = {}) => ({
  guid: `g${n}`,
  title: `The.Matrix.1999.1080p.BluRay.x264-GRP${n}`,
  indexerId: 'ix1',
  indexer: 'Internet Archive',
  protocol: 'torrent',
  size: 8_000_000_000,
  seeders: 40,
  leechers: 2,
  grabs: null,
  publishedAt: null,
  ageHours: 48,
  details: null,
  quality: 'Bluray-1080p',
  customFormats: [],
  formatScore: 0,
  flags: [],
  languages: ['English'],
  approved,
  reasons: approved
    ? [{ kind: 'accepted', message: 'Bluray-1080p is in the profile.' }]
    : [{ kind: 'rejected', message: 'Smaller than the minimum size for Bluray-1080p.' }],
  ...extra,
})

const queueItem = (n: number, movieId: number | null, extra: Record<string, unknown> = {}) => ({
  id: `q${n}`,
  torrentId: `t${n}`,
  movieId,
  title: 'The Matrix',
  year: 1999,
  release: `The.Matrix.1999.1080p.BluRay.x264-GRP${n}`,
  quality: 'Bluray-1080p',
  size: 8_000_000_000,
  progress: 0.42,
  downRate: 2_500_000,
  upRate: 0,
  eta: 1800,
  ratio: 0,
  state: 'downloading',
  stateReason: null,
  ...extra,
})

const mediaFile = (versionId: string) => ({
  id: 'f1',
  movieId: 603,
  versionId,
  path: '/data/media/movies/The Matrix (1999)/The Matrix (1999) Bluray-1080p.mkv',
  size: 8_000_000_000,
  quality: { name: 'Bluray-1080p', resolution: '1080p', source: 'bluray', codec: 'x264' },
  releaseGroup: 'GRP1',
  sceneName: 'The.Matrix.1999.1080p.BluRay.x264-GRP1',
  edition: null,
  transfer: 'hardlink',
  addedAt: '2026-10-20T00:00:00.000Z',
  streams: [
    {
      index: 0,
      type: 'video',
      codec: 'h264',
      width: 1920,
      height: 1080,
      hdr: 'none',
      bitrate: 8e6,
    },
    {
      index: 1,
      type: 'audio',
      codec: 'dts',
      language: 'English',
      channels: '5.1',
      title: null,
      default: true,
    },
    {
      index: 2,
      type: 'subtitle',
      codec: 'subrip',
      language: 'English',
      forced: false,
      hi: true,
      default: false,
    },
  ],
})

const track = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  itemId: 603,
  fileId: 'f1',
  language: 'en',
  kind: 'external',
  format: 'srt',
  forced: false,
  hi: false,
  provider: 'OpenSubtitles.com',
  releaseName: 'The.Matrix.1999.1080p.BluRay.x264-GRP1',
  score: 99,
  matches: ['hash'],
  chosen: false,
  sync: {
    status: 'unsynced',
    confidence: null as number | null,
    offsetMs: 0,
    detail: null as string | null,
  },
  path: '/data/media/movies/The Matrix (1999)/The Matrix (1999) Bluray-1080p.en.srt',
  addedAt: '2026-10-21T00:00:00.000Z',
  ...extra,
})

const subtitleResult = (n: number, provider: string, attribution: string | null) => ({
  id: `r${n}`,
  language: 'en',
  releaseName: `The.Matrix.1999.1080p.BluRay.x264-GRP${n}`,
  provider,
  score: 90 - n,
  matches: ['title', 'year'],
  forced: false,
  hi: false,
  format: 'srt',
  attribution,
})

const historyEvent = (n: number, type: string, extra: Record<string, unknown> = {}) => ({
  id: `h${n}`,
  movieId: 603,
  type,
  date: new Date(Date.now() - n * 3_600_000).toISOString(),
  sourceTitle: `The.Matrix.1999.1080p.BluRay.x264-GRP${n}`,
  quality: 'Bluray-1080p',
  indexer: 'Internet Archive',
  message: null,
  ...extra,
})

/** History's page size in the fake: small, so Show more has something to show. */
const HISTORY_PAGE = 2

const metadata = () => ({
  ...discover(603, 'The Matrix', 1999, state.inLibrary),
  runtimeMinutes: 136,
  originalTitle: 'The Matrix',
  originalLanguage: 'en',
  tagline: 'Welcome to the Real World.',
  certification: 'R',
  budget: 63_000_000,
  revenue: 463_517_383,
  studios: ['Warner Bros. Pictures'],
  imdbId: 'tt0133093',
  wikidataId: null,
  cast: Array.from({ length: 12 }, (_, i) =>
    credit(i + 1, 100 + i, `Actor ${i + 1}`, 'Acting', { character: `Role ${i + 1}` }),
  ),
  crew: [
    credit(20, 9339, 'Lana Wachowski', 'Directing', { job: 'Director' }),
    credit(21, 9340, 'Lilly Wachowski', 'Directing', { job: 'Director' }),
    credit(22, 9339, 'Lana Wachowski', 'Writing', { job: 'Writer' }),
    credit(23, 9339, 'Lana Wachowski', 'Writing', { job: 'Screenplay' }),
    credit(24, 4000, 'Bill Pope', 'Camera', { job: 'Director of Photography' }),
    credit(25, 4001, 'Kym Barrett', 'Costume & Make-Up', { job: 'Costume Design' }),
  ],
  videos: [
    {
      id: 'v1',
      name: 'Official trailer',
      kind: 'Trailer',
      site: 'YouTube',
      key: 'vKQi3bBA1y8',
      official: true,
      publishedAt: '2021-12-01T00:00:00.000Z',
      still: '/api/v1/images/w780/p603-b.jpg',
    },
  ],
  collection: { id: 2344, name: 'The Matrix Collection' },
  gone: state.gone,
  fetchedAt: '2026-10-20T00:00:00.000Z',
})

const libraryMovie = () => ({
  ...discover(603, 'The Matrix', 1999, true),
  type: 'movie',
  originalTitle: 'The Matrix',
  sortTitle: 'matrix',
  status: 'wanted',
  monitored: true,
  minimumAvailability: 'released',
  languageProfileId: 'lp-en',
  qualityProfileId: state.versions[0]?.qualityProfileId,
  rootFolder: '/data/media/movies',
  path: '/data/media/movies/The Matrix (1999)',
  addedAt: '2026-10-20T00:00:00.000Z',
  versions: state.versions,
  gone: state.gone,
  ...state.movie,
})

const collection = () => ({
  id: 2344,
  name: 'The Matrix Collection',
  overview: 'The Matrix films.',
  art: art('c2344'),
  parts: [
    discover(603, 'The Matrix', 1999, state.inLibrary),
    discover(604, 'The Matrix Reloaded', 2003, state.owned.has(604)),
    discover(605, 'The Matrix Revolutions', 2003, state.owned.has(605)),
  ],
})

const credits = (d: ReturnType<typeof discover>, creditId: string, role: string, dep: string) => ({
  ...d,
  creditId,
  role,
  department: dep,
})

const person = () => ({
  id: 9339,
  name: 'Lana Wachowski',
  photo: null,
  knownFor: 'Directing',
  bio: null,
  born: { date: '1965-06-21', place: 'Chicago, Illinois, USA' },
  died: null,
  imdbId: null,
  wikidataId: null,
  credits: [
    credits(discover(605, 'The Matrix Revolutions', 2003, false), 'k1', 'Director', 'Directing'),
    credits(discover(605, 'The Matrix Revolutions', 2003, false), 'k2', 'Writer', 'Writing'),
    credits(discover(604, 'The Matrix Reloaded', 2003, true), 'k3', 'Director', 'Directing'),
    credits(discover(603, 'The Matrix', 1999, state.inLibrary), 'k4', 'Screenplay', 'Writing'),
  ],
})

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const notFound = () =>
  json({ error: { code: 'not-found', message: 'TMDB has no movie with that id.' } }, 404)

async function api(url: string, init: RequestInit = {}): Promise<Response> {
  const u = new URL(url, 'http://localhost')
  const method = init.method ?? 'GET'
  const path = u.pathname
  if (path === '/api/v1/events')
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
  const body = init.body ? JSON.parse(String(init.body)) : undefined
  state.requests.push({ method, path: path + u.search, body })
  const route = `${method} ${path}`
  switch (route) {
    case 'GET /api/v1/auth/session':
      return json({ user: { role, permissions: [] } })
    case 'GET /api/v1/me/preferences':
      return json({
        values: { theme: 'dark', sound: false, volume: 0.5, 'admin.addMovie.defaults': null },
      })
    case 'GET /api/v1/qualityprofiles':
      return json([
        { id: 'qp-hd', name: 'HD 1080p' },
        { id: 'qp-uhd', name: 'UHD 2160p' },
      ])
    case 'GET /api/v1/languageprofiles':
      return json([{ id: 'lp-en', name: 'English', languages: [] }])
    case 'GET /api/v1/rootfolders':
      return json([
        {
          id: 'rf1',
          path: '/data/media/movies',
          free: 1e12,
          total: 2e12,
          device: 'sda1',
          accessible: true,
          movies: 1,
        },
      ])
    case 'GET /api/v1/movies/604/metadata':
      return json(
        {
          error: {
            code: 'unavailable',
            message: 'No TMDB key is set.',
            details: { reason: 'no-tmdb-key' },
          },
        },
        503,
      )
    case 'GET /api/v1/movies/605/metadata':
      return json(
        {
          error: {
            code: 'invalid',
            message: 'Invalid API key.',
            details: { reason: 'tmdb-key-rejected' },
          },
        },
        400,
      )
    case 'GET /api/v1/movies/603/metadata':
      return json(metadata())
    case 'GET /api/v1/movies/603/recommendations':
      return json([discover(624, 'Hackers', 1995, false)])
    case 'GET /api/v1/collections/2344':
      return json(collection())
    case 'GET /api/v1/people/9339':
      return json(person())
    case 'GET /api/v1/movies/603':
      return state.inLibrary ? json(libraryMovie()) : notFound()
    case 'PATCH /api/v1/movies/603':
      state.movie = { ...state.movie, ...body }
      return json(libraryMovie())
    case 'GET /api/v1/import-lists':
      return json(Array.from({ length: state.importLists }, (_, i) => ({ id: `lst_${i}` })))
    case 'DELETE /api/v1/movies/603':
      state.inLibrary = false
      return new Response(null, { status: 204 })
    case 'POST /api/v1/movies/603/refresh':
      return new Response(null, { status: 202 })
    case 'POST /api/v1/movies/603/versions':
      state.versions = [
        ...state.versions,
        { id: `v${state.versions.length + 1}`, ...body, fileId: null },
      ]
      return json(libraryMovie(), 201)
    case 'GET /api/v1/indexers':
      return json(state.indexers)
    case 'GET /api/v1/movies/603/releases':
      return json(state.cached)
    case 'POST /api/v1/movies/603/search':
      return json({
        releases: [
          release(1, true),
          release(2, false, { size: null, seeders: null, leechers: null, ageHours: null }),
        ],
        searched: 2,
        failed: [{ indexerId: 'ix2', indexer: 'Slow tracker', message: 'it timed out' }],
      })
    case 'GET /api/v1/queue':
      return json(state.queue)
    case 'GET /api/v1/movies/603/files':
      return json(state.files)
    case 'GET /api/v1/movies/603/history': {
      const at = Number(u.searchParams.get('cursor') ?? 0)
      const items = state.history.slice(at, at + HISTORY_PAGE)
      const next = at + HISTORY_PAGE < state.history.length ? String(at + HISTORY_PAGE) : null
      return json({ items, next })
    }
    case 'POST /api/v1/movies/bulk':
      return new Response(null, { status: 202 })
    case 'GET /api/v1/movies/603/subtitles':
      return json(state.tracks)
    case 'GET /api/v1/subtitles/languages':
      return json([
        { code: 'en', name: 'English' },
        { code: 'fr', name: 'French' },
      ])
    case 'POST /api/v1/movies/603/subtitles/search': {
      const answer = state.subtitleSearch
      if (Array.isArray(answer)) return json(answer)
      return json(
        { error: { code: 'conflict', message: 'Refused', details: { reason: answer.reason } } },
        answer.status,
      )
    }
    case 'POST /api/v1/movies/603/subtitles': {
      const added = track('t-new', { chosen: true, provider: 'Subdl' })
      state.tracks.push(added)
      return json(added)
    }
    case 'POST /api/v1/movies': {
      if (body.tmdbId === 603) state.inLibrary = true
      else state.owned.add(body.tmdbId)
      return json({ ...libraryMovie(), id: body.tmdbId }, 201)
    }
  }
  const grab = /^\/api\/v1\/movies\/603\/releases\/([^/]+)\/grab$/.exec(path)
  if (method === 'POST' && grab) {
    const guid = decodeURIComponent(grab[1] ?? '')
    if (state.blocked.has(guid) && !body.force)
      return json(
        { error: { code: 'conflict', message: 'That release is on the blocklist.' } },
        409,
      )
    const item = queueItem(state.queue.length + 1, 603)
    state.queue.push(item)
    return json(item)
  }
  const subtitle = /^\/api\/v1\/subtitles\/([^/]+)\/(sync|offset)$/.exec(path)
  if (subtitle) {
    const found = state.tracks.find((t) => t.id === subtitle[1])
    if (!found) return json({ error: { code: 'not-found', message: 'Not found' } }, 404)
    found.sync =
      subtitle[2] === 'sync'
        ? { status: 'queued', confidence: null, offsetMs: 0, detail: null }
        : { ...found.sync, offsetMs: body.ms }
    // the server announces the track's change
    setTimeout(() => state.push?.('subtitles.updated'), 0)
    return json(found)
  }
  if (method === 'DELETE' && path.startsWith('/api/v1/subtitles/')) {
    state.tracks = state.tracks.filter((t) => t.id !== path.split('/').pop())
    return new Response(null, { status: 204 })
  }
  if (method === 'DELETE' && path.startsWith('/api/v1/movies/603/versions/')) {
    const versionId = path.split('/').pop()
    if (state.versions.length === 1)
      return json(
        { error: { code: 'conflict', message: 'A movie keeps at least one version.' } },
        409,
      )
    state.versions = state.versions.filter((v) => v.id !== versionId)
    return json(libraryMovie())
  }
  return notFound()
}

beforeEach(() => {
  role = 'owner'
  pushed.length = 0
  state = {
    inLibrary: false,
    gone: false,
    movie: {},
    versions: [{ id: 'v1', label: 'HD 1080p', qualityProfileId: 'qp-hd', fileId: null }],
    owned: new Set([604]),
    requests: [],
    push: null,
    indexers: [],
    cached: [],
    queue: [],
    files: [],
    history: [],
    blocked: new Set(),
    tracks: [],
    subtitleSearch: [],
    importLists: 0,
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
        <UIProvider>{ui}</UIProvider>
      </ClientProvider>,
    )
  })
  await settle()
  return { user: userEvent.setup(), page: within(document.body) }
}

const requested = (method: string, path: string) =>
  state.requests.filter((r) => r.method === method && r.path === path)

// ---------------------------------------------------------------- not in the library

describe('a movie that isn’t in the library', () => {
  test('shows the metadata layer with Add movie, two tabs and the release line', async () => {
    const { page } = await open(<MovieDetail id="603" />)
    expect(page.getByRole('heading', { level: 1, name: 'The Matrix' })).toBeTruthy()
    expect(page.getByText('Not in the library')).toBeTruthy()
    expect(page.getByText('Released 31 March 1999')).toBeTruthy()
    expect(page.getByRole('button', { name: 'Add movie' })).toBeTruthy()
    const tabs = page.getAllByRole('tab').map((t) => t.textContent)
    expect(tabs).toEqual(['Overview', 'Cast and crew'])
    // no library calls beyond the metadata's own
    expect(requested('GET', '/api/v1/movies/603')).toHaveLength(0)
  })

  test('Overview: the top ten cast, the trailer by kind, the collection, More like this, About', async () => {
    const { page } = await open(<MovieDetail id="603" />)
    const cast = page.getByRole('region', { name: 'Cast' })
    expect(within(cast).getAllByRole('link')).toHaveLength(10)
    expect(page.getByRole('link', { name: /Lana Wachowski/ }).getAttribute('href')).toBe(
      '/people/9339',
    )
    // the trailer: its kind, no length
    expect(page.getByText('Trailer')).toBeTruthy()
    // the collection row names it, links it, counts the parts here and offers the rest
    expect(page.getByRole('link', { name: 'The Matrix Collection' }).getAttribute('href')).toBe(
      '/collections/2344',
    )
    expect(page.getByText('1 of 3 in the library')).toBeTruthy()
    expect(page.getByRole('button', { name: 'Add 2 missing' })).toBeTruthy()
    expect(page.getByText('This one', { exact: false })).toBeTruthy()
    expect(page.getByText('More like this')).toBeTruthy()
    // About: TMDB and IMDb; Wikidata is missing for this one, so it's left out
    const about = page.getByRole('region', { name: 'About' })
    expect(within(about).getByText('R')).toBeTruthy()
    expect(within(about).getByText('English')).toBeTruthy()
    expect(within(about).getByText('$63,000,000')).toBeTruthy()
    const links = within(about)
      .getAllByRole('link')
      .map((a) => a.getAttribute('href'))
    expect(links).toEqual([
      'https://www.themoviedb.org/movie/603',
      'https://www.imdb.com/title/tt0133093/',
    ])
  })

  test('a trailer loads nothing until it’s clicked, then plays from youtube-nocookie.com', async () => {
    const { page, user } = await open(<MovieDetail id="603" />)
    expect(document.querySelector('iframe')).toBeNull()
    // happy-dom refuses to load the frame (no network in tests) and logs that it didn't
    const quiet = spyOn(console, 'error').mockImplementation(() => {})
    await user.click(page.getByRole('button', { name: /Official trailer/ }))
    await settle()
    quiet.mockRestore()
    const dialog = page.getByRole('dialog', { name: 'Official trailer' })
    const frame = dialog.querySelector('iframe')
    expect(frame?.getAttribute('src')).toBe(
      'https://www.youtube-nocookie.com/embed/vKQi3bBA1y8?autoplay=1',
    )
    expect(within(dialog).getByText('Trailer · 1 December 2021')).toBeTruthy()
  })

  test('Cast and crew groups the crew by TMDB’s departments, with every job', async () => {
    const { page, user } = await open(<MovieDetail id="603" />)
    await user.click(page.getByRole('button', { name: 'All cast and crew' }))
    await settle()
    const crew = page.getByRole('region', { name: 'Crew' })
    const groups = within(crew)
      .getAllByRole('heading', { level: 3 })
      .map((h) => h.textContent)
    expect(groups).toEqual(['Directing', 'Writing', 'Camera', 'Costume and make-up'])
    const writing = within(crew).getByRole('region', { name: 'Writing' })
    expect(within(writing).getByText('Writer, Screenplay')).toBeTruthy()
  })

  test('Add movie adds it and the page gains the library layer in place', async () => {
    const { page, user } = await open(<MovieDetail id="603" />)
    await user.click(page.getByRole('button', { name: 'Add movie' }))
    await settle()
    const dialog = page.getByRole('dialog', { name: /Add The Matrix/ })
    await user.click(within(dialog).getByRole('button', { name: 'Add movie' }))
    await settle()
    expect(requested('POST', '/api/v1/movies')).toHaveLength(1)
    expect(page.getAllByRole('tab').map((t) => t.textContent)).toEqual([
      'Overview',
      'Cast and crew',
      'Files',
      'History',
      'Search',
      'Subtitles',
    ])
    expect(page.getByText('Wanted')).toBeTruthy()
    expect(pushed).toEqual([])
  })

  test('Add {n} missing opens the dialog for every part that isn’t here, this one too', async () => {
    state.owned.clear()
    const { page, user } = await open(<MovieDetail id="603" />)
    await user.click(page.getByRole('button', { name: 'Add 3 missing' }))
    await settle()
    const dialog = page.getByRole('dialog', { name: 'Add 3 movies' })
    expect(within(dialog).getByText('The Matrix Reloaded', { exact: false })).toBeTruthy()
  })

  test('an admin gets the owner’s page: one shape for staff (ADR 0032)', async () => {
    role = 'admin'
    const { page } = await open(<MovieDetail id="603" />)
    expect(page.getByRole('button', { name: 'Add movie' })).toBeTruthy()
  })

  test('without a TMDB key, a title the server hasn’t seen says where to add one', async () => {
    const { page, user } = await open(<MovieDetail id="604" />)
    expect(page.getByText('Add a TMDB key to find movies.')).toBeTruthy()
    await user.click(page.getByRole('button', { name: 'Go to Settings' }))
    expect(pushed).toEqual(['/settings/general#metadata'])
  })

  test('a key TMDB stopped accepting says to copy it again, and where', async () => {
    const { page, user } = await open(<MovieDetail id="605" />)
    expect(page.getByText('TMDB didn’t accept that key.')).toBeTruthy()
    expect(page.getByText('Copy it again from your TMDB account.')).toBeTruthy()
    await user.click(page.getByRole('button', { name: 'Go to Settings' }))
    expect(pushed).toEqual(['/settings/general#metadata'])
  })

  test('an id TMDB doesn’t know, or one that isn’t an id, says so', async () => {
    const { page, user } = await open(<MovieDetail id="999999" />)
    expect(page.getByText('TMDB doesn’t know that title')).toBeTruthy()
    await user.click(page.getByRole('button', { name: 'Go to Discover' }))
    expect(pushed).toEqual(['/discover'])
    cleanup()
    const again = await open(<MovieDetail id="the-matrix" />)
    expect(again.page.getByText('TMDB doesn’t know that title')).toBeTruthy()
  })
})

// ---------------------------------------------------------------- in the library

describe('a movie in the library', () => {
  beforeEach(() => {
    state.inLibrary = true
  })

  test('shows its status, a tag per version, the path and the library’s tabs', async () => {
    const { page } = await open(<MovieDetail id="603" />)
    const summary = page.getByRole('region', { name: 'Summary' })
    expect(within(summary).getByText('Wanted')).toBeTruthy()
    expect(within(summary).getByText('HD 1080p')).toBeTruthy()
    expect(within(summary).getByText('/data/media/movies/The Matrix (1999)')).toBeTruthy()
    const lib = page.getByRole('region', { name: 'In the library' })
    expect(within(lib).getByText('HD 1080p (HD 1080p)')).toBeTruthy()
    expect(within(lib).getByText('English')).toBeTruthy()
    expect(within(lib).getByText('Released')).toBeTruthy()
    expect(within(lib).getByText('/data/media/movies')).toBeTruthy()
  })

  test('search waits for indexers: Search is disabled, the Search tab says why and links', async () => {
    const { page, user } = await open(<MovieDetail id="603" />)
    expect((page.getByRole('button', { name: 'Search' }) as HTMLButtonElement).disabled).toBe(true)
    await user.click(page.getByRole('button', { name: 'Interactive search' }))
    await settle()
    expect(page.getByText('Add an indexer to search for releases.')).toBeTruthy()
    await user.click(page.getByRole('button', { name: 'Indexers' }))
    expect(pushed).toEqual(['/indexers'])
  })

  describe('with an indexer enabled', () => {
    beforeEach(() => {
      state.indexers = [{ id: 'ix1', name: 'Internet Archive', enabled: true }]
    })

    test('Search queues a search for this movie', async () => {
      const { page, user } = await open(<MovieDetail id="603" />)
      const search = page.getByRole('button', { name: 'Search' }) as HTMLButtonElement
      expect(search.disabled).toBe(false)
      await user.click(search)
      await settle()
      expect(requested('POST', '/api/v1/movies/bulk')[0]?.body).toEqual({
        action: 'search',
        ids: [603],
      })
    })

    test('the tab searches when nothing is cached: dashes for what an indexer left out, a quiet note for one that failed', async () => {
      const { page, user } = await open(<MovieDetail id="603" />)
      await user.click(page.getByRole('button', { name: 'Interactive search' }))
      await settle()
      expect(requested('GET', '/api/v1/movies/603/releases')).toHaveLength(1)
      expect(requested('POST', '/api/v1/movies/603/search')).toHaveLength(1)
      expect(page.getByText('2 releases')).toBeTruthy()
      expect(page.getByText('1 accepted by your profile')).toBeTruthy()
      // size and age, then seeders and leechers
      expect(page.getAllByText('—')).toHaveLength(2)
      expect(page.getByText('—/—')).toBeTruthy()
      expect(page.getByRole('button', { name: /^Grab The\.Matrix/ })).toBeTruthy()
      expect(page.getByRole('button', { name: /^Grab anyway/ })).toBeTruthy()
      expect(page.getByText('Slow tracker didn’t answer: it timed out')).toBeTruthy()

      await user.click(page.getByRole('button', { name: /Rejected \(1\)/ }))
      expect(page.getByText('Smaller than the minimum size for Bluray-1080p.')).toBeTruthy()
      await user.click(page.getByRole('switch', { name: 'Show rejected' }))
      expect(page.queryByRole('button', { name: /^Grab anyway/ })).toBeNull()
    })

    test('recent results are shown without asking the indexers again; Search again asks', async () => {
      state.cached = [release(3, true)]
      const { page, user } = await open(<MovieDetail id="603" />)
      await user.click(page.getByRole('button', { name: 'Interactive search' }))
      await settle()
      expect(page.getByText('1 release')).toBeTruthy()
      expect(requested('POST', '/api/v1/movies/603/search')).toHaveLength(0)
      await user.click(page.getByRole('button', { name: 'Search again' }))
      await settle()
      expect(requested('POST', '/api/v1/movies/603/search')).toHaveLength(1)
      expect(page.getByText('2 releases')).toBeTruthy()
    })

    test('Grab sends the release’s indexer, and the row says Grabbed', async () => {
      const { page, user } = await open(<MovieDetail id="603" />)
      await user.click(page.getByRole('button', { name: 'Interactive search' }))
      await settle()
      await user.click(page.getByRole('button', { name: /^Grab The\.Matrix.*GRP1$/ }))
      await settle()
      expect(requested('POST', '/api/v1/movies/603/releases/g1/grab')[0]?.body).toEqual({
        indexerId: 'ix1',
      })
      expect(page.getAllByText('Grabbed').length).toBeGreaterThan(0)
      expect(page.getAllByText(/is downloading\. Follow it in Activity\./).length).toBeGreaterThan(
        0,
      )
    })

    test('Grab anyway sends force for a rejected release', async () => {
      const { page, user } = await open(<MovieDetail id="603" />)
      await user.click(page.getByRole('button', { name: 'Interactive search' }))
      await settle()
      await user.click(page.getByRole('button', { name: /^Grab anyway/ }))
      await settle()
      expect(requested('POST', '/api/v1/movies/603/releases/g2/grab')[0]?.body).toEqual({
        indexerId: 'ix1',
        force: true,
      })
    })

    test('a refused grab says why and leaves the button', async () => {
      state.blocked.add('g1')
      const { page, user } = await open(<MovieDetail id="603" />)
      await user.click(page.getByRole('button', { name: 'Interactive search' }))
      await settle()
      await user.click(page.getByRole('button', { name: /^Grab The\.Matrix.*GRP1$/ }))
      await settle()
      expect(page.getByText('Couldn’t grab it')).toBeTruthy()
      expect(page.getByText('That release is on the blocklist.')).toBeTruthy()
      expect(page.getByRole('button', { name: /^Grab The\.Matrix.*GRP1$/ })).toBeTruthy()
    })
  })

  test('In the queue: each of its downloads with live progress, and none of another movie’s', async () => {
    state.queue = [queueItem(1, 603), queueItem(2, 604, { release: 'Reloaded.2003' })]
    const { page } = await open(<MovieDetail id="603" />)
    const card = page.getByRole('region', { name: 'In the queue' })
    expect(within(card).getByText('The.Matrix.1999.1080p.BluRay.x264-GRP1')).toBeTruthy()
    expect(within(card).getByText('Downloading')).toBeTruthy()
    expect(within(card).getByText('42% · 2.5 MB/s · 30m left')).toBeTruthy()
    expect(within(card).queryByText('Reloaded.2003')).toBeNull()

    // the import is blocked: the badge, the bar and the reason follow the event
    state.queue = [
      queueItem(1, 603, {
        progress: 1,
        downRate: 0,
        eta: null,
        state: 'import-blocked',
        stateReason: 'No video file in the download',
      }),
    ]
    await act(async () => state.push?.('queue.updated'))
    await settle()
    const blocked = page.getByRole('region', { name: 'In the queue' })
    expect(within(blocked).getByText('Import blocked')).toBeTruthy()
    expect(within(blocked).getByText('100% · No video file in the download')).toBeTruthy()

    state.queue = []
    await act(async () => state.push?.('queue.updated'))
    await settle()
    expect(page.queryByRole('region', { name: 'In the queue' })).toBeNull()
  })

  test('Files: a version’s file with its streams; History pages with Show more', async () => {
    state.files = [mediaFile('v1')]
    state.history = [
      historyEvent(1, 'imported', { message: 'Hardlinked into the library' }),
      historyEvent(2, 'grabbed'),
      historyEvent(3, 'download-failed', { indexer: null }),
    ]
    const { page, user } = await open(<MovieDetail id="603" />)
    await user.click(page.getByRole('tab', { name: 'Files' }))
    await settle()
    const version = page.getByRole('region', { name: 'HD 1080p version' })
    expect(within(version).getByText('8.0 GB')).toBeTruthy()
    expect(within(version).getByText('H264 · 1920×1080 · 1.0 MB/s')).toBeTruthy()
    expect(within(version).getByText('DTS 5.1 · English · default')).toBeTruthy()
    expect(within(version).getByText('subrip · English · SDH')).toBeTruthy()
    expect(within(version).getByText('The.Matrix.1999.1080p.BluRay.x264-GRP1')).toBeTruthy()

    await user.click(page.getByRole('tab', { name: 'History' }))
    await settle()
    const rows = () => page.getAllByRole('row').map((r) => r.textContent)
    expect(rows()).toHaveLength(3)
    expect(rows()[1]).toContain('Imported')
    expect(rows()[1]).toContain('Hardlinked into the library')
    expect(rows()[2]).toContain('Grabbed')
    await user.click(page.getByRole('button', { name: 'Show more' }))
    await settle()
    expect(rows()).toHaveLength(4)
    // no indexer: a dash
    expect(rows()[3]).toContain('Download failed')
    expect(rows()[3]).toContain('—')
    expect(page.queryByRole('button', { name: 'Show more' })).toBeNull()
    expect(requested('GET', '/api/v1/movies/603/history?cursor=2').length).toBeGreaterThan(0)
  })

  test('Files and History show their empty states', async () => {
    const { page, user } = await open(<MovieDetail id="603" />)
    await user.click(page.getByRole('tab', { name: 'Files' }))
    await settle()
    expect(page.getByRole('region', { name: 'HD 1080p version' })).toBeTruthy()
    expect(page.getByText('No file yet')).toBeTruthy()
    await user.click(page.getByRole('tab', { name: 'History' }))
    await settle()
    expect(page.getByText('Nothing has happened yet')).toBeTruthy()
  })

  describe('Subtitles (checkpoint 7)', () => {
    test('sidecars with their offset, then the file’s own streams, read-only', async () => {
      state.files = [mediaFile('v1')]
      state.tracks = [
        track('t1'),
        track('t2', { kind: 'bundled', provider: null, score: 100, forced: true, language: 'fr' }),
      ]
      const { page, user } = await open(<MovieDetail id="603" />)
      await user.click(page.getByRole('tab', { name: 'Subtitles' }))
      await settle()
      expect(page.getByText('2 external · 1 embedded')).toBeTruthy()
      const rows = page.getAllByRole('row').map((r) => r.textContent)
      expect(rows[1]).toContain('English · SRT')
      expect(rows[1]).toContain('OpenSubtitles.com')
      expect(rows[1]).toContain('Not synced')
      expect(rows[2]).toContain('French · forced · SRT')
      expect(rows[2]).toContain('From the release')
      expect(rows[3]).toContain('Stream 2 in The Matrix (1999) Bluray-1080p.mkv')
      expect(rows[3]).toContain('Matches the video')
      expect(rows[1]).toContain('0 ms')
      expect(rows[3]).toContain('—')
      expect(page.getAllByRole('button', { name: /^Re-sync/ })).toHaveLength(2)

      await user.click(page.getByRole('button', { name: 'Delete English subtitles' }))
      await settle()
      expect(requested('DELETE', '/api/v1/subtitles/t1')).toHaveLength(1)
      expect(page.getByText('Subtitles deleted')).toBeTruthy()
    })

    test('Re-sync says it’s syncing, then the result; − and + move the track 50 ms', async () => {
      state.files = [mediaFile('v1')]
      state.tracks = [
        track('t1', {
          sync: {
            status: 'synced',
            confidence: 0.92,
            offsetMs: -1200,
            detail: 'Framerate corrected (25 → 23.976)',
          },
        }),
        track('t2', { kind: 'bundled', provider: null, format: 'sup', language: 'fr' }),
      ]
      const { page, user } = await open(<MovieDetail id="603" />)
      await user.click(page.getByRole('tab', { name: 'Subtitles' }))
      await settle()
      expect(page.getByText('Framerate corrected (25 → 23.976)')).toBeTruthy()
      expect(page.getByRole('status', { name: 'English offset' }).textContent).toBe('−1200 ms')
      // an image track has nothing to move
      expect(page.queryByRole('button', { name: 'Re-sync French' })).toBeNull()

      await user.click(page.getByRole('button', { name: 'Show English subtitles 50 ms later' }))
      await settle()
      expect(requested('PUT', '/api/v1/subtitles/t1/offset')[0]?.body).toEqual({ ms: -1150 })
      expect(page.getByRole('status', { name: 'English offset' }).textContent).toBe('−1150 ms')

      await user.click(page.getByRole('button', { name: 'Re-sync English' }))
      await settle()
      expect(requested('POST', '/api/v1/subtitles/t1/sync')).toHaveLength(1)
      expect(page.getByText('Syncing English to the audio')).toBeTruthy()
      // the result comes from the sync, not the read before it
      expect(page.queryByText('Synced English to the audio')).toBeNull()
      expect(page.getByText('Waiting to sync')).toBeTruthy()
      expect(
        (page.getByRole('button', { name: 'Re-sync English' }) as HTMLButtonElement).disabled,
      ).toBe(true)

      const [t1] = state.tracks
      if (t1) t1.sync = { status: 'synced', confidence: 0.98, offsetMs: -900, detail: null }
      await act(async () => state.push?.('subtitles.updated'))
      await settle()
      expect(page.getByText('Synced English to the audio')).toBeTruthy()
      expect(page.getByText('Offset −900 ms, 98% confidence.')).toBeTruthy()
    })

    test('Search, then Use; the attribution once under the results', async () => {
      state.files = [mediaFile('v1')]
      const credit = 'Subtitles provided by OpenSubtitles.com'
      state.subtitleSearch = [
        subtitleResult(1, 'OpenSubtitles.com', credit),
        subtitleResult(2, 'OpenSubtitles.com', credit),
        subtitleResult(3, 'Subdl', null),
      ]
      const { page, user } = await open(<MovieDetail id="603" />)
      await user.click(page.getByRole('tab', { name: 'Subtitles' }))
      await settle()
      await user.click(page.getByRole('button', { name: 'Search providers' }))
      await settle()
      expect(requested('POST', '/api/v1/movies/603/subtitles/search')[0]?.body).toEqual({
        language: 'en',
      })
      expect(page.getAllByText(credit)).toHaveLength(1)
      await user.click(
        page.getByRole('button', {
          name: 'Download The.Matrix.1999.1080p.BluRay.x264-GRP3 from Subdl',
        }),
      )
      await settle()
      expect(requested('POST', '/api/v1/movies/603/subtitles')[0]?.body).toEqual({ resultId: 'r3' })
      expect(page.getByText('Subtitles downloaded')).toBeTruthy()
      // the fake's track isn't waiting for a sync, as with Sync to the audio off
      expect(page.queryByText('Syncing to the audio in the background.')).toBeNull()
    })

    test('no provider on, or none answering, says so in place of the results', async () => {
      state.files = [mediaFile('v1')]
      state.subtitleSearch = { status: 409, reason: 'no-providers' }
      const { page, user } = await open(<MovieDetail id="603" />)
      await user.click(page.getByRole('tab', { name: 'Subtitles' }))
      await settle()
      await user.click(page.getByRole('button', { name: 'Search providers' }))
      await settle()
      expect(page.getByText('Turn on a subtitle provider in Subtitles to search.')).toBeTruthy()

      state.subtitleSearch = { status: 503, reason: 'providers-failed' }
      await user.click(page.getByRole('button', { name: 'Search providers' }))
      await settle()
      expect(
        page.getByText('No subtitle provider answered. Try again in a few minutes.'),
      ).toBeTruthy()
    })

    test('a movie without a file says subtitles come after the import', async () => {
      const { page, user } = await open(<MovieDetail id="603" />)
      await user.click(page.getByRole('tab', { name: 'Subtitles' }))
      await settle()
      expect(page.getByText('No file to find subtitles for yet')).toBeTruthy()
    })
  })

  test('Monitored saves at once', async () => {
    const { page, user } = await open(<MovieDetail id="603" />)
    const monitored = page.getByRole('switch', { name: 'Monitored' })
    expect(monitored.getAttribute('aria-checked')).toBe('true')
    await user.click(monitored)
    await settle()
    expect(requested('PATCH', '/api/v1/movies/603')[0]?.body).toEqual({ monitored: false })
    expect(page.getByRole('switch', { name: 'Monitored' }).getAttribute('aria-checked')).toBe(
      'false',
    )
  })

  test('versions: the last can’t be removed; one is added, then removed', async () => {
    const { page, user } = await open(<MovieDetail id="603" />)
    const lib = () => page.getByRole('region', { name: 'In the library' })
    const removeFirst = within(lib()).getByRole('button', { name: 'Remove HD 1080p' })
    expect((removeFirst as HTMLButtonElement).disabled).toBe(true)

    await user.click(within(lib()).getByRole('button', { name: 'Add version' }))
    await settle()
    const dialog = page.getByRole('dialog', { name: 'Add a version' })
    await user.type(within(dialog).getByLabelText('Name'), '4K HDR')
    await user.click(within(dialog).getByRole('button', { name: 'Add' }))
    await settle()
    expect(requested('POST', '/api/v1/movies/603/versions')[0]?.body).toEqual({
      label: '4K HDR',
      qualityProfileId: 'qp-hd',
    })
    expect(within(lib()).getByText('4K HDR (HD 1080p)')).toBeTruthy()

    await user.click(within(lib()).getByRole('button', { name: 'Remove 4K HDR' }))
    await settle()
    const confirm = page.getByRole('alertdialog', { name: 'Remove the 4K HDR version?' })
    await user.click(within(confirm).getByRole('button', { name: 'Remove' }))
    await settle()
    expect(requested('DELETE', '/api/v1/movies/603/versions/v2')).toHaveLength(1)
    expect(within(lib()).queryByText('4K HDR (HD 1080p)')).toBeNull()
  })

  test('Edit saves the movie’s own options', async () => {
    const { page, user } = await open(<MovieDetail id="603" />)
    await user.click(page.getByRole('button', { name: 'More actions' }))
    await settle()
    await user.click(page.getByRole('menuitem', { name: 'Edit' }))
    await settle()
    const dialog = page.getByRole('dialog', { name: 'Edit The Matrix' })
    await user.click(within(dialog).getByRole('switch', { name: 'Monitored' }))
    await user.click(within(dialog).getByRole('button', { name: 'Save' }))
    await settle()
    expect(requested('PATCH', '/api/v1/movies/603')[0]?.body).toEqual({
      rootFolder: '/data/media/movies',
      languageProfileId: 'lp-en',
      minimumAvailability: 'released',
      monitored: false,
    })
  })

  test('Refresh metadata queues the refresh', async () => {
    const { page, user } = await open(<MovieDetail id="603" />)
    await user.click(page.getByRole('button', { name: 'More actions' }))
    await settle()
    await user.click(page.getByRole('menuitem', { name: 'Refresh metadata' }))
    await settle()
    expect(requested('POST', '/api/v1/movies/603/refresh')).toHaveLength(1)
  })

  test('Remove, with its files, keeps the page where it is without the library layer', async () => {
    const { page, user } = await open(<MovieDetail id="603" />)
    await user.click(page.getByRole('button', { name: 'More actions' }))
    await settle()
    await user.click(page.getByRole('menuitem', { name: 'Remove from library' }))
    await settle()
    const confirm = page.getByRole('alertdialog', { name: 'Remove The Matrix?' })
    await user.click(within(confirm).getByLabelText('Also delete its files from disk'))
    await user.click(within(confirm).getByRole('button', { name: 'Remove' }))
    await settle()
    expect(requested('DELETE', '/api/v1/movies/603?deleteFiles=true')).toHaveLength(1)
    expect(page.getByText('Not in the library')).toBeTruthy()
    expect(pushed).toEqual([])
  })

  test('Remove, with an import list, can keep lists from adding it again', async () => {
    state.importLists = 1
    const { page, user } = await open(<MovieDetail id="603" />)
    await user.click(page.getByRole('button', { name: 'More actions' }))
    await settle()
    await user.click(page.getByRole('menuitem', { name: 'Remove from library' }))
    await settle()
    const confirm = page.getByRole('alertdialog', { name: 'Remove The Matrix?' })
    await user.click(within(confirm).getByLabelText('Don’t add it again from lists'))
    await user.click(within(confirm).getByRole('button', { name: 'Remove' }))
    await settle()
    expect(requested('DELETE', '/api/v1/movies/603?deleteFiles=false&exclude=true')).toHaveLength(1)
  })

  test('without import lists, Remove doesn’t mention them', async () => {
    const { page, user } = await open(<MovieDetail id="603" />)
    await user.click(page.getByRole('button', { name: 'More actions' }))
    await settle()
    await user.click(page.getByRole('menuitem', { name: 'Remove from library' }))
    await settle()
    const confirm = page.getByRole('alertdialog', { name: 'Remove The Matrix?' })
    expect(within(confirm).queryByLabelText('Don’t add it again from lists')).toBeNull()
  })

  test('a movie TMDB no longer has keeps its page and offers Discover to find its match', async () => {
    state.gone = true
    const { page, user } = await open(<MovieDetail id="603" />)
    expect(page.getByText('TMDB no longer has this movie')).toBeTruthy()
    expect(page.getByText('HD 1080p (HD 1080p)')).toBeTruthy()
    await user.click(page.getByRole('button', { name: 'Find it on Discover' }))
    expect(pushed).toEqual(['/discover?q=The%20Matrix'])
  })

  test('live: an update elsewhere refetches the movie in place', async () => {
    const { page } = await open(<MovieDetail id="603" />)
    state.movie = { status: 'available' }
    await act(async () => {
      state.push?.('movies.updated')
      await new Promise((r) => setTimeout(r, 10))
    })
    await settle()
    expect(
      within(page.getByRole('region', { name: 'Summary' })).getByText('Available'),
    ).toBeTruthy()
  })
})

// ---------------------------------------------------------------- people and collections

describe('a person', () => {
  test('summary, one filmography row per title with every role, and its filters', async () => {
    const { page, user } = await open(<PersonPage id="9339" />)
    expect(page.getByRole('heading', { level: 1, name: 'Lana Wachowski' })).toBeTruthy()
    expect(page.getByText('Directing')).toBeTruthy()
    expect(page.getByText('21 June 1965, Chicago, Illinois, USA')).toBeTruthy()
    expect(page.getByText('TMDB has no biography for Lana Wachowski yet.')).toBeTruthy()
    expect(page.getByText('3 titles')).toBeTruthy()
    expect(page.getByText('Known for')).toBeTruthy()

    const table = () => page.getByRole('table')
    const rows = () => within(table()).getAllByRole('row').slice(1)
    expect(rows()).toHaveLength(3)
    expect(within(table()).getByText('Director, Writer')).toBeTruthy()
    expect(page.getByRole('link', { name: 'In library: The Matrix Reloaded' })).toBeTruthy()

    await user.click(page.getByRole('tab', { name: /Not in the library/ }))
    await settle()
    expect(rows()).toHaveLength(2)

    await user.click(page.getByRole('tab', { name: /^All/ }))
    await user.click(page.getByRole('combobox', { name: 'Department' }))
    await settle()
    await user.click(page.getByRole('option', { name: 'Writing' }))
    await settle()
    expect(rows()).toHaveLength(2)
    expect(within(table()).getByText('Writer')).toBeTruthy()

    await user.click(page.getByRole('button', { name: 'Add The Matrix Revolutions' }))
    await settle()
    expect(page.getByRole('dialog', { name: 'Add The Matrix Revolutions (2003)' })).toBeTruthy()
  })

  test('an unknown person says so', async () => {
    const { page } = await open(<PersonPage id="1" />)
    expect(page.getByText('TMDB doesn’t know that person')).toBeTruthy()
  })
})

describe('a collection', () => {
  test('its summary, its parts and Add 1 missing; the badges follow as parts are added', async () => {
    state.inLibrary = true
    const { page, user } = await open(<CollectionPage id="2344" />)
    expect(page.getByRole('heading', { level: 1, name: 'The Matrix Collection' })).toBeTruthy()
    expect(page.getAllByText('2 of 3 in the library')).toHaveLength(2)
    await user.click(page.getByRole('button', { name: 'Add 1 missing' }))
    await settle()
    const dialog = page.getByRole('dialog', { name: /Add The Matrix Revolutions/ })
    await user.click(within(dialog).getByRole('button', { name: 'Add movie' }))
    await settle()
    await act(async () => {
      state.push?.('movies.updated')
      await new Promise((r) => setTimeout(r, 10))
    })
    await settle()
    expect(page.getAllByText('3 of 3 in the library')).toHaveLength(2)
    expect(page.queryByRole('button', { name: /missing/ })).toBeNull()
  })
})

// ---------------------------------------------------------------- helpers

describe('helpers', () => {
  test('crew groups keep TMDB’s department order and leave Acting to the cast', () => {
    const groups = crewByDepartment([
      credit(1, 1, 'A', 'Sound', { job: 'Original Music Composer' }),
      credit(2, 2, 'B', 'Directing', { job: 'Director' }),
      credit(3, 2, 'B', 'Directing', { job: 'Director' }),
      credit(4, 3, 'C', 'Acting', { character: 'Neo' }),
    ] as never)
    expect(groups.map(([d, people]) => [d, people.map((p) => p.jobs)])).toEqual([
      ['Directing', [['Director']]],
      ['Sound', [['Original Music Composer']]],
    ])
  })

  test('Vimeo trailers play with Do Not Track', () => {
    expect(playerUrl({ site: 'Vimeo', key: '76979871' })).toBe(
      'https://player.vimeo.com/video/76979871?autoplay=1&dnt=1',
    )
  })

  test('a filmography groups credits by title, keeping the server’s order', () => {
    const rows = byTitle(person().credits as never)
    expect(rows.map((r) => [r.id, r.credits.map((c) => c.role)])).toEqual([
      [605, ['Director', 'Writer']],
      [604, ['Director']],
      [603, ['Screenplay']],
    ])
  })
})
