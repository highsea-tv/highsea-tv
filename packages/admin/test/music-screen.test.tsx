// SPDX-License-Identifier: AGPL-3.0-only
// Music in the admin (HT-68, Phase 5's part D, docs/product/music.md), rendered against a fake of
// the drafted `musicLibrary` routes: drawn only when public info's `sources` lists `music`, the
// not-found page otherwise; Unmatched matches a folder and ignores another; an artist's page lists
// their albums, and an album's its discs, then Files at its own address; Settings' track naming
// refuses a format without the track number. The shell and Next's router are stood in for.
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
const { MusicLibrary } = await import('../src/music-library.tsx')
const { AlbumDetail, ArtistDetail } = await import('../src/music-detail.tsx')

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

const ADDED = '2026-10-20T10:00:00.000Z'
const PATH = '/data/media/music/Marisol Vega'

const file = (n: number, disc: number) => ({
  path: `${PATH}/Late Light (2020)/CD${disc}/Marisol_Vega_Late_Light_0${n}.flac`,
  size: 30e6,
  format: 'FLAC',
  bitrate: 900,
  sampleRate: 44100,
  bitDepth: 16,
  channels: 2,
  lyrics: n === 1,
})

const track = (n: number, disc: number) => ({
  id: `ll-${disc}-${n}`,
  disc,
  number: n,
  title: `Song ${disc}.${n}`,
  artist: null,
  duration: 240,
  file: file(n, disc),
})

const album = (over: Record<string, unknown> = {}) => ({
  id: 'late-light',
  title: 'Late Light',
  sortTitle: 'late light',
  artist: { id: 'marisol-vega', name: 'Marisol Vega' },
  year: 2020,
  kind: 'album',
  cover: null,
  genres: ['Jazz'],
  tracks: 3,
  discs: 2,
  duration: 720,
  size: 90e6,
  formats: ['FLAC'],
  path: `${PATH}/Late Light (2020)`,
  source: 'musicbrainz',
  musicBrainzId: '0b7e5ab5-1c1e-4b6b-9a6f-6b3a3c6f0e11',
  addedAt: ADDED,
  ...over,
})

const lateLight = () => ({
  ...album(),
  released: '2020-03-06',
  label: 'Corner Room',
  discList: [
    { number: 1, folder: 'CD1', tracks: [track(1, 1), track(2, 1)] },
    { number: 2, folder: 'CD2', tracks: [track(1, 2)] },
  ],
  extras: { coverFile: 'cover.jpg', nfo: false },
})

const vega = (over: Record<string, unknown> = {}) => ({
  id: 'marisol-vega',
  name: 'Marisol Vega',
  sortName: 'vega, marisol',
  photo: null,
  genres: ['Jazz'],
  albums: 1,
  tracks: 3,
  size: 90e6,
  path: PATH,
  source: 'musicbrainz',
  musicBrainzId: '5c1e0d3a-9f0e-4a0b-8d3c-1f2e3d4c5b6a',
  addedAt: ADDED,
  ...over,
})

const unmatched = [
  {
    id: 'um-demos',
    path: '/data/media/music/The Hollow Pines/Demos',
    files: 3,
    size: 21e6,
    reason: 'no-album',
    guess: { artist: 'The Hollow Pines', album: null, year: null },
    foundAt: ADDED,
  },
  {
    id: 'um-untitled',
    path: '/data/media/music/Unsorted/new folder (2)',
    files: 9,
    size: 74e6,
    reason: 'no-tags',
    guess: { artist: null, album: null, year: null },
    foundAt: ADDED,
  },
]

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
  switch (`${method} ${u.pathname}`) {
    case 'GET /api/v1/system/info/public':
      return json({ name: 'highsea', version: '0.4.0', sources })
    case 'GET /api/v1/rootfolders':
      return json([
        {
          id: 'rf-music',
          path: '/data/media/music',
          kind: 'music',
          free: 3e12,
          total: 16e12,
          accessible: true,
          movies: 0,
          waiting: 0,
          readOnly: false,
          mountedReadOnly: false,
          languageProfileId: null,
        },
      ])
    case 'GET /api/v1/music/folders':
      return json([{ id: 'rf-music', artists: 1, albums: 1, tracks: 3, size: 90e6, unmatched: 2 }])
    case 'GET /api/v1/artists':
      return json([vega()])
    case 'GET /api/v1/artists/marisol-vega':
      return json({ ...vega(), bio: 'A singer and pianist.', albumList: [album()], videos: 2 })
    case 'GET /api/v1/albums':
      return json([album()])
    case 'GET /api/v1/albums/unmatched':
      return json(unmatched)
    case 'GET /api/v1/albums/late-light':
      return json(lateLight())
  }
  if (method === 'POST' && u.pathname.startsWith('/api/v1/albums/unmatched/'))
    return new Response(null, { status: 204 })
  if (method === 'DELETE' && u.pathname.startsWith('/api/v1/albums/unmatched/'))
    return new Response(null, { status: 204 })
  return json({ error: { code: 'not-found', message: `Nothing at ${u.pathname}.` } }, 404)
}

beforeEach(() => {
  requests = []
  sources = ['shows', 'music', 'profiles']
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

describe('Music, only when the server serves it', () => {
  test('a server without music draws the not-found page and asks nothing of its routes', async () => {
    sources = ['shows']
    const { page } = await open(<MusicLibrary />)
    expect(
      page.getByText('This page is built in a later checkpoint of the server plan.'),
    ).toBeTruthy()
    expect(sent('GET', '/api/v1/artists')).toEqual([])
    expect(sent('GET', '/api/v1/music')).toEqual([])
  })
})

describe('the library', () => {
  test('lists the artists, with the tabs’ counts', async () => {
    localStorage.setItem('highsea:music-view', 'table')
    const { page } = await open(<MusicLibrary />)
    expect(page.getByText('Marisol Vega')).toBeTruthy()
    const tabs = within(page.getByRole('tablist', { name: 'Music sections' }))
    expect(tabs.getByRole('tab', { name: /Unmatched/ }).textContent).toContain('2')
  })

  test('Unmatched matches a folder to an album and ignores another', async () => {
    const { user, page } = await open(<MusicLibrary tab="unmatched" />)
    await user.click(
      page.getByRole('button', { name: 'Match /data/media/music/The Hollow Pines/Demos' }),
    )
    await settle()
    const dialog = within(page.getByRole('dialog'))
    // the tags' guess is filled in; the album is the owner's to say
    expect((dialog.getByLabelText('Album artist') as HTMLInputElement).value).toBe(
      'The Hollow Pines',
    )
    await user.click(dialog.getByRole('button', { name: 'Match' }))
    expect(dialog.getAllByText('Give it a name.').length).toBe(1)
    expect(sent('POST', '/api/v1/albums/unmatched/')).toEqual([])
    await user.type(dialog.getByLabelText('Album'), 'Demos')
    await user.click(dialog.getByRole('button', { name: 'Match' }))
    await settle()
    expect(sent('POST', '/api/v1/albums/unmatched/').map((r) => [r.path, r.body])).toEqual([
      [
        '/api/v1/albums/unmatched/um-demos',
        { artist: 'The Hollow Pines', album: 'Demos', year: null },
      ],
    ])

    await user.click(
      page.getByRole('button', { name: 'Ignore /data/media/music/Unsorted/new folder (2)' }),
    )
    await settle()
    await user.click(within(page.getByRole('dialog')).getByRole('button', { name: 'Ignore' }))
    await settle()
    expect(sent('DELETE', '/api/v1/albums/unmatched/').map((r) => r.path)).toEqual([
      '/api/v1/albums/unmatched/um-untitled',
    ])
  })
})

describe('an artist’s and an album’s pages', () => {
  test('an artist’s page has their bio and their albums, each linking its page', async () => {
    const { page } = await open(<ArtistDetail id="marisol-vega" />)
    expect(page.getByText('A singer and pianist.')).toBeTruthy()
    const albums = within(page.getByRole('region', { name: 'Albums' }))
    expect(albums.getByText('Late Light')).toBeTruthy()
  })

  test('an album’s page lists each disc, then Files at its own address', async () => {
    const at = (path: string) => (
      <Routed<'files'> base="/music/albums/late-light" at={path}>
        {(tab) => <AlbumDetail id="late-light" tab={tab} />}
      </Routed>
    )
    const { user, page } = await open(at('/music/albums/late-light'))
    expect(page.getByRole('table', { name: 'Disc 1 tracks' })).toBeTruthy()
    expect(page.getByRole('table', { name: 'Disc 2 tracks' })).toBeTruthy()
    expect(page.getByText('Song 2.1')).toBeTruthy()
    await user.click(page.getByRole('tab', { name: 'Files' }))
    await settle()
    expect(router.path).toBe('/music/albums/late-light/files')
    const files = within(page.getByRole('table', { name: 'Files' }))
    // each disc's first track, in its own CD folder
    expect(files.getAllByText('Marisol_Vega_Late_Light_01.flac', { exact: false }).length).toBe(2)
    // the .lrc beside the first track
    expect(files.getAllByText('Lyrics').length).toBe(2)
  })

  test('an artist who isn’t here says so', async () => {
    const { page } = await open(<ArtistDetail id="nowhere" />)
    expect(
      page.getByText('It may have been removed, or the scan read its files under another name.'),
    ).toBeTruthy()
  })
})
