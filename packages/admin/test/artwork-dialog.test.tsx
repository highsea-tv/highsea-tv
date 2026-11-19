// SPDX-License-Identifier: AGPL-3.0-only
// Change artwork (HT-66): the dialog's tabs, the image shown now and who chose it, TMDB's others
// with their language, size and the current one marked, choosing, Upload and Reset, against a fake
// of the artwork routes. The film's More menu and the collection page's button open it.
import './dom.ts'
import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'
import type { ReactNode } from 'react'
import { shown } from './modal.ts'
import { navigation } from './router.tsx'

mock.module('../src/navigation.tsx', () => navigation)

mock.module('../src/shell.tsx', () => ({
  useShell: () => ({ role: 'admin' }),
  AdminPage: ({ title, actions, children }: Record<string, ReactNode>) => (
    <main>
      <h1>{title}</h1>
      <div>{actions}</div>
      {children}
    </main>
  ),
}))

const { act, cleanup, render, within } = await import('@testing-library/react')
const { default: userEvent } = await import('@testing-library/user-event')
const { createClient } = await import('@highsea-tv/sdk')
const { ClientProvider } = await import('@highsea-tv/sdk/react')
const { ThemeProvider, Toaster } = await import('@highsea-tv/ui/native')
const { ArtworkDialog } = await import('../src/artwork-dialog.tsx')
const { CollectionPage } = await import('../src/collection.tsx')

type Kind = 'poster' | 'backdrop' | 'logo'
const KINDS: Kind[] = ['poster', 'backdrop', 'logo']
const img = (kind: Kind, file: string) => `/api/v1/images/movie/603/${kind}/w185${file}`

let state: {
  chosen: Partial<Record<Kind, { file: string; source: 'tmdb' | 'fanart' | 'upload' }>>
  tmdb: boolean
  /** fanart.tv on (HT-74): two of its posters after TMDB's */
  fanart: boolean
  requests: { method: string; path: string; body: unknown }[]
}

const options = (kind: Kind) =>
  [
    { file: `/${kind}-a.jpg`, language: 'en', width: 2000, height: 3000 },
    { file: `/${kind}-b.jpg`, language: null, width: 1400, height: 2100 },
    { file: `/${kind}-c.jpg`, language: 'de', width: 1000, height: 1500 },
  ]
    .filter((o) => kind !== 'logo' || o.language !== 'de')
    .map((o) => ({ ...o, source: 'tmdb' as const, likes: null, voteAverage: 5, voteCount: 3 }))

const fanartOptions = (kind: Kind) =>
  state.fanart && kind === 'poster'
    ? [
        { file: '/ftv_matrix-1.jpg', language: 'en', width: 1000, height: 1426, likes: 12 },
        { file: '/ftv_matrix-2.jpg', language: null, width: 1000, height: 1426, likes: 4 },
      ].map((o) => ({ ...o, source: 'fanart' as const, voteAverage: null, voteCount: null }))
    : []

function view(owner: 'movie' | 'collection', id: number) {
  return {
    owner,
    id,
    tmdb: state.tmdb ? { available: true, reason: null } : { available: false, reason: 'no-key' },
    kinds: KINDS.map((kind) => {
      const chosen = state.chosen[kind]
      const automatic = `/${kind}-a.jpg`
      const current = chosen?.file ?? automatic
      return {
        kind,
        current: img(kind, current),
        automatic: img(kind, automatic),
        chosen: chosen
          ? {
              source: chosen.source,
              by: { id: 'u1', name: 'ruth' },
              at: new Date(Date.now() - 5 * 60_000).toISOString(),
              language: null,
              width: 2000,
              height: 3000,
            }
          : null,
        options: [...(state.tmdb ? options(kind) : []), ...fanartOptions(kind)].map((o) => ({
          ...o,
          url: img(kind, o.file),
          current: o.file === current,
        })),
      }
    }),
  }
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

async function api(url: string, init: RequestInit = {}): Promise<Response> {
  const u = new URL(url, 'http://localhost')
  const method = init.method ?? 'GET'
  const path = u.pathname
  const body = init.body ? JSON.parse(String(init.body)) : undefined
  state.requests.push({ method, path, body })
  if (path === '/api/v1/events') return new Response(new ReadableStream())
  const m =
    /^\/api\/v1\/artwork\/(movie|collection)\/(\d+)(?:\/(poster|backdrop|logo))?(\/upload)?$/.exec(
      path,
    )
  if (m) {
    const owner = m[1] as 'movie' | 'collection'
    const kind = m[3] as Kind | undefined
    if (kind && method === 'PUT' && m[4]) {
      if (String(body.data).length < 8)
        return json(
          {
            error: {
              code: 'invalid',
              message: 'A poster needs to be close to 2:3, taller than it’s wide.',
            },
          },
          400,
        )
      state.chosen[kind] = { file: '/hs_up.jpg', source: 'upload' }
    } else if (kind && method === 'PUT')
      state.chosen[kind] = {
        file: body.file,
        source: body.file.startsWith('/ftv_') ? 'fanart' : 'tmdb',
      }
    else if (kind && method === 'DELETE') delete state.chosen[kind]
    return json(view(owner, Number(m[2])))
  }
  if (path === '/api/v1/collections/2344')
    return json({
      id: 2344,
      name: 'The Matrix Collection',
      overview: '',
      art: { poster: null, backdrop: null, logo: null },
      parts: [],
    })
  return json({ error: { code: 'not-found', message: `no fake for ${method} ${path}` } }, 404)
}

beforeEach(() => {
  state = { chosen: {}, tmdb: true, fanart: false, requests: [] }
})
afterEach(() => cleanup())

const settle = async () => {
  await act(async () => {
    for (let i = 0; i < 6; i++) await new Promise((r) => setTimeout(r, 0))
  })
  shown()
}

async function open(ui: ReactNode) {
  const client = createClient({ fetch: api as never })
  await act(async () => {
    render(
      <ClientProvider client={client}>
        <ThemeProvider>
          {ui}
          <Toaster label="Notifications" />
        </ThemeProvider>
      </ClientProvider>,
    )
  })
  await settle()
  return { user: userEvent.setup(), page: within(document.body) }
}

const dialog = (page: ReturnType<typeof within>) => page.getByRole('dialog', { name: 'Artwork' })
const writes = () => state.requests.filter((r) => r.method !== 'GET')

describe('Change artwork', () => {
  test('a tab per kind; the image shown now; TMDB’s others with language and size', async () => {
    const { page, user } = await open(
      <ArtworkDialog owner="movie" id={603} title="The Matrix" open onOpenChange={() => {}} />,
    )
    const d = within(dialog(page))
    expect(d.getByText(/every app shows for The Matrix/)).toBeTruthy()
    expect(d.getByText('Automatic: highsea’s pick from TMDB')).toBeTruthy()
    expect(d.getByText(/at least 500 px wide and close to 2:3/)).toBeTruthy()
    const tiles = d.getAllByRole('radio')
    expect(tiles.map((t) => t.getAttribute('aria-label'))).toEqual([
      'Poster from TMDB, English, 2000 × 3000',
      'Poster from TMDB, No text, 1400 × 2100',
      'Poster from TMDB, German, 1000 × 1500',
    ])
    // fanart.tv is off: no section of its own
    expect(d.queryByText('From fanart.tv')).toBeNull()
    expect(tiles[0]?.getAttribute('aria-checked')).toBe('true')
    expect(d.getAllByText('Current')).toHaveLength(1)
    // no Reset while the automatic one is shown
    expect(d.queryByRole('button', { name: 'Reset' })).toBeNull()
    await user.click(d.getByRole('tab', { name: 'Logo' }))
    await settle()
    expect(within(dialog(page)).getByText(/A PNG with a transparent background/)).toBeTruthy()
    expect(within(dialog(page)).getAllByRole('radio')).toHaveLength(2)
  })

  test('a tap chooses one; it’s marked, who chose it shows, and Reset brings back the automatic', async () => {
    const { page, user } = await open(
      <ArtworkDialog owner="movie" id={603} title="The Matrix" open onOpenChange={() => {}} />,
    )
    await user.click(within(dialog(page)).getByRole('radio', { name: /No text/ }))
    await settle()
    expect(writes()).toEqual([
      {
        method: 'PUT',
        path: '/api/v1/artwork/movie/603/poster',
        body: { file: '/poster-b.jpg' },
      },
    ])
    const d = within(dialog(page))
    expect(d.getByRole('radio', { name: /No text/ }).getAttribute('aria-checked')).toBe('true')
    expect(d.getByText(/Chosen from TMDB by ruth · 5m ago/)).toBeTruthy()
    expect(page.getByText('Poster changed')).toBeTruthy()
    await user.click(d.getByRole('button', { name: 'Reset' }))
    await settle()
    expect(writes().at(-1)).toMatchObject({
      method: 'DELETE',
      path: '/api/v1/artwork/movie/603/poster',
    })
    expect(within(dialog(page)).getByText('Automatic: highsea’s pick from TMDB')).toBeTruthy()
    expect(page.getByText('Poster reset')).toBeTruthy()
  })

  test('with fanart.tv on, its images follow TMDB’s under their own heading, and one can be chosen', async () => {
    state.fanart = true
    const { page, user } = await open(
      <ArtworkDialog owner="movie" id={603} title="The Matrix" open onOpenChange={() => {}} />,
    )
    const d = within(dialog(page))
    expect(d.getByText('From TMDB')).toBeTruthy()
    expect(d.getByText('From fanart.tv')).toBeTruthy()
    expect(d.getAllByRole('radio').map((t) => t.getAttribute('aria-label'))).toEqual([
      'Poster from TMDB, English, 2000 × 3000',
      'Poster from TMDB, No text, 1400 × 2100',
      'Poster from TMDB, German, 1000 × 1500',
      'Poster from fanart.tv, English, 1000 × 1426',
      'Poster from fanart.tv, No text, 1000 × 1426',
    ])
    await user.click(d.getByRole('radio', { name: 'Poster from fanart.tv, English, 1000 × 1426' }))
    await settle()
    expect(writes().at(-1)).toEqual({
      method: 'PUT',
      path: '/api/v1/artwork/movie/603/poster',
      body: { file: '/ftv_matrix-1.jpg' },
    })
    expect(within(dialog(page)).getByText(/Chosen from fanart.tv by ruth/)).toBeTruthy()
    // the backdrop has none from fanart.tv: no empty section
    await user.click(within(dialog(page)).getByRole('tab', { name: 'Backdrop' }))
    await settle()
    expect(within(dialog(page)).queryByText('From fanart.tv')).toBeNull()
  })

  test('without TMDB, the dialog says so and Upload still works', async () => {
    state.tmdb = false
    const { page } = await open(
      <ArtworkDialog owner="movie" id={603} title="The Matrix" open onOpenChange={() => {}} />,
    )
    const d = within(dialog(page))
    expect(d.getByText('TMDB’s images can’t be listed right now')).toBeTruthy()
    expect(d.getByText(/Uploading and Reset still work. \(no-key\)/)).toBeTruthy()
    expect(d.queryAllByRole('radio')).toEqual([])
    expect(d.getByRole('button', { name: 'Upload' })).toBeTruthy()
  })

  test('a collection’s page opens it for the collection', async () => {
    const { page, user } = await open(<CollectionPage id="2344" />)
    await user.click(page.getByRole('button', { name: 'Change artwork' }))
    await settle()
    expect(state.requests.some((r) => r.path === '/api/v1/artwork/collection/2344')).toBe(true)
    expect(within(dialog(page)).getByText(/every app shows for The Matrix Collection/)).toBeTruthy()
  })
})
