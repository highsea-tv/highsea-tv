// SPDX-License-Identifier: AGPL-3.0-only
// The web app (checkpoints 4.2a and 4.2b) against a fake of the API: signing in, Home, a title's
// page and its picks, one that isn't here, the remote pill, a server that stops answering, and the
// player: starting, its panel, a film that doesn't start, and leaving.
import './dom.ts'
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

const { act, cleanup, render, within } = await import('@testing-library/react')
const { default: userEvent } = await import('@testing-library/user-event')
const { App } = await import('../src/app.tsx')

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const refused = (code: string, message: string, status: number) =>
  json({ error: { code, message } }, status)

const item = (id: number, title: string, over: Record<string, unknown> = {}) => ({
  id,
  type: 'movie',
  title,
  year: 2010,
  runtimeMinutes: 15,
  genres: ['Animation'],
  synopsis: `${title}, the synopsis.`,
  rating: 3.6,
  voteCount: 100,
  releaseDate: '2010-09-30',
  addedAt: '2026-10-01T00:00:00.000Z',
  status: 'downloaded',
  playable: true,
  art: { poster: null, backdrop: null },
  progress: null,
  position: 0,
  watched: false,
  ...over,
})
const SINTEL = item(45745, 'Sintel', { progress: 0.4, position: 360 })
const DREAM = item(653, 'Elephants Dream', { year: 2006, runtimeMinutes: 11 })

const theo = {
  id: 'usr_theo',
  username: 'theo',
  displayName: 'Theo',
  role: 'user',
  permissions: [],
  libraries: ['movies'],
  twoFactor: false,
  passkeys: 0,
  hasPassword: true,
  email: null,
  lastSeen: null,
  invited: false,
  createdAt: '2026-10-01T00:00:00.000Z',
}

type State = {
  signedIn: boolean
  away: boolean
  down: boolean
  playFails: boolean
  calls: string[]
  bodies: Record<string, unknown>
}
let state: State

const version = (id: string, label: string) => ({
  id,
  label,
  detail: `${label} · 1.2 GB`,
  playable: true,
  audio: [
    {
      id: `${id}:1`,
      language: 'en',
      label: 'English · Stereo',
      detail: null,
      codec: 'aac',
      channels: 2,
      default: true,
    },
  ],
  subtitles: [
    {
      id: `${id}:s`,
      language: 'en',
      label: 'English',
      forced: false,
      hi: false,
      format: 'srt',
      kind: 'external',
    },
  ],
})

async function api(input: string | URL | Request, init: RequestInit = {}) {
  const u = new URL(String(input), 'http://localhost')
  const method = init.method ?? 'GET'
  if (state.down) throw new TypeError('fetch failed')
  if (u.pathname === '/api/v1/events') return new Response(new ReadableStream())
  state.calls.push(`${method} ${u.pathname}`)
  const body = init.body ? JSON.parse(String(init.body)) : undefined
  if (body !== undefined) state.bodies[`${method} ${u.pathname}`] = body
  switch (`${method} ${u.pathname}`) {
    case 'GET /api/v1/system/info/public':
      return json({
        id: 'srv_1',
        name: 'Harbor',
        version: '0.1.1',
        localAddresses: [],
        publicUrl: null,
        setupComplete: true,
        auth: { local: true, oidc: null, passkeys: false },
        sources: [],
      })
    case 'POST /api/v1/auth/sign-in':
      if (body.password !== 'theo theo theo')
        return refused('unauthorized', 'That username and password don’t match.', 401)
      state.signedIn = true
      return json({
        status: 'signed-in',
        session: { user: theo, deviceId: 'dev_1', expiresAt: null, method: 'password' },
      })
  }
  if (!state.signedIn) return refused('unauthorized', 'Sign in first.', 401)
  switch (`${method} ${u.pathname}`) {
    case 'GET /api/v1/auth/session':
      return json({
        user: theo,
        deviceId: 'dev_1',
        expiresAt: null,
        method: 'password',
        away: state.away,
      })
    case 'GET /api/v1/system/server':
      return json({ name: 'Harbor', version: '0.1.1' })
    case 'GET /api/v1/home':
      return json([
        {
          id: 'hero',
          title: 'Tonight',
          suffix: null,
          layout: 'hero',
          items: [{ ...DREAM, tagline: 'A short one.' }],
        },
        {
          id: 'continue',
          title: null,
          suffix: null,
          layout: 'continue',
          items: [{ ...SINTEL, tagline: null }],
        },
        {
          id: 'picks',
          title: 'Blender picks',
          suffix: 'by Ines',
          layout: 'row',
          items: [
            { ...SINTEL, tagline: null },
            { ...DREAM, tagline: null },
          ],
        },
      ])
    case 'GET /api/v1/announcements':
    case 'GET /api/v1/me/devices':
      return json([])
    case 'GET /api/v1/me/preferences':
      return json({
        values: { theme: 'default', sound: false, volume: 0.6, 'admin.addMovie.defaults': null },
        from: { theme: 'server', sound: 'server', volume: 'server' },
        layers: { device: {}, client: {}, user: {} },
      })
    case 'GET /api/v1/appearance':
      return json({
        defaultTheme: 'default',
        themes: [],
        sound: { tv: true, phone: false, web: false, volume: 0.6, pack: 'default' },
        packs: [],
        branding: {},
      })
    case 'GET /api/v1/items/movie/45745':
      return json({
        item: SINTEL,
        originalTitle: 'Sintel',
        tagline: null,
        certification: null,
        studios: [],
        cast: [{ id: 'c1', personId: 1, name: 'Halina Reijn', photo: null, character: 'Sintel' }],
        directors: [{ id: 'd1', personId: 2, name: 'Colin Levy', photo: null, character: null }],
        videos: [],
        collection: null,
        versions: [version('v4k', '4K HDR'), version('v1080', '1080p')],
        related: [DREAM],
      })
    case 'GET /api/v1/items/movie/45745/prefs':
      return json({ versionId: null, audioId: null, subtitleId: null, subtitleOffsetMs: 0 })
    case 'PUT /api/v1/items/movie/45745/prefs':
      return json({
        versionId: null,
        audioId: null,
        subtitleId: null,
        subtitleOffsetMs: 0,
        ...body,
      })
    case 'POST /api/v1/items/movie/45745/played':
      return new Response(null, { status: 204 })
    case 'POST /api/v1/items/movie/45745/play':
      if (state.playFails) return refused('unplayable', 'The file can’t be read.', 409)
      return json({
        id: 'pls_1',
        decision: {
          method: 'direct-play',
          container: 'mp4',
          video: { action: 'copy' },
          audio: { id: `${body.versionId}:1`, action: 'copy', codec: 'aac', channels: 2 },
          subtitle: null,
          bitrate: 4_000_000,
          reasons: [],
        },
        url: '/stream/files/token-1',
        subtitles: [{ id: `${body.versionId}:s`, url: '/stream/subtitles/token-1.vtt' }],
        start: body.start ?? 360,
        duration: 888,
        expiresAt: '2026-10-28T01:00:00.000Z',
      })
    case 'POST /api/v1/playback/sessions/pls_1/progress':
      return json({ watched: false, expiresAt: '2026-10-28T01:00:00.000Z' })
    case 'DELETE /api/v1/playback/sessions/pls_1':
      return new Response(null, { status: 204 })
    case 'GET /api/v1/items/movie/45745/trickplay':
      return json({ versionId: u.searchParams.get('versionId') ?? 'v4k', manifest: null })
    case 'GET /api/v1/items/movie/45745/next':
      return json({ item: null })
  }
  return refused('not-found', 'That isn’t here.', 404)
}

beforeEach(() => {
  state = { signedIn: true, away: false, down: false, playFails: false, calls: [], bodies: {} }
  globalThis.fetch = api as typeof fetch
})
afterEach(() => cleanup())

const settle = () =>
  act(async () => {
    for (let i = 0; i < 8; i++) await new Promise((r) => setTimeout(r, 0))
  })

async function open(path: string) {
  window.history.replaceState(null, '', `/web${path}`)
  await act(async () => {
    render(<App />)
  })
  await settle()
  return { page: within(document.body), user: userEvent.setup() }
}

describe('signing in', () => {
  test('a wrong password says so; the right one opens Home', async () => {
    state.signedIn = false
    const { page, user } = await open('/')
    expect(page.getByRole('heading', { name: 'Sign in to Harbor' })).toBeTruthy()
    await user.type(page.getByLabelText('Username'), 'theo')
    await user.type(page.getByLabelText('Password'), 'not theo')
    await user.click(page.getByRole('button', { name: 'Sign in' }))
    await settle()
    expect(page.getByText('That username and password don’t match.')).toBeTruthy()

    await user.clear(page.getByLabelText('Password'))
    await user.type(page.getByLabelText('Password'), 'theo theo theo')
    await user.click(page.getByRole('button', { name: 'Sign in' }))
    await settle()
    // one Main for wide screens and one for narrow, each hidden by CSS at the other's width
    expect(page.getAllByRole('navigation', { name: 'Main' }).length).toBeGreaterThan(0)
    expect(page.getByRole('heading', { name: 'Continue watching' })).toBeTruthy()
  })
})

describe('Home', () => {
  test('the hero, Continue watching named by the app, and the owner’s rows', async () => {
    const { page } = await open('/')
    expect(page.getByRole('heading', { name: 'Elephants Dream' })).toBeTruthy()
    expect(page.getByRole('heading', { name: 'Continue watching' })).toBeTruthy()
    expect(page.getByRole('heading', { name: /Blender picks/ })).toBeTruthy()
    expect(page.queryByText('Connected remotely')).toBeNull()
  })

  test('away from home, the server’s name says Connected remotely', async () => {
    state.away = true
    const { page } = await open('/')
    expect(page.getByText('Connected remotely')).toBeTruthy()
  })
})

describe('a title’s page', () => {
  test('Resume and Play from the start, its versions, and its picks saved as they change', async () => {
    const { page, user } = await open('/movies/45745')
    expect(page.getByRole('heading', { name: 'Sintel', level: 1 })).toBeTruthy()
    expect(page.getByRole('link', { name: /Resume/ }).getAttribute('href')).toBe('/web/play/45745')
    expect(page.getByText('Directed by Colin Levy')).toBeTruthy()
    expect(page.getByRole('heading', { name: 'More like this' })).toBeTruthy()

    await user.click(page.getByRole('combobox', { name: 'Version' }))
    await user.click(page.getByRole('option', { name: /1080p/ }))
    await settle()
    expect(state.calls).toContain('PUT /api/v1/items/movie/45745/prefs')
  })

  test('Mark as watched, from More', async () => {
    const { page, user } = await open('/movies/45745')
    await user.click(page.getByRole('button', { name: 'More' }))
    await user.click(page.getByRole('menuitem', { name: 'Mark as watched' }))
    await settle()
    expect(state.calls).toContain('POST /api/v1/items/movie/45745/played')
  })

  test('one that isn’t here says so, with Go home', async () => {
    const { page } = await open('/movies/19')
    expect(page.getByText('This movie isn’t here')).toBeTruthy()
    expect(page.getByRole('link', { name: 'Go home' }).getAttribute('href')).toBe('/web/')
  })
})

describe('the server stops answering', () => {
  test('before signing in: Can’t reach, with Try again', async () => {
    state.down = true
    const { page } = await open('/')
    expect(page.getByText('Can’t reach localhost')).toBeTruthy()
    expect(page.getByRole('button', { name: 'Try again' })).toBeTruthy()
  })
})

describe('the player', () => {
  test('starts where the person stopped, on the first version, with the browser’s profile', async () => {
    const { page } = await open('/play/45745')
    expect(state.calls).toContain('POST /api/v1/items/movie/45745/play')
    const asked = state.bodies['POST /api/v1/items/movie/45745/play'] as Record<string, unknown>
    expect(asked.versionId).toBe('v4k')
    expect(typeof asked.profile).toBe('string')
    expect(asked.start).toBeUndefined()
    expect(document.querySelector('video')?.getAttribute('src')).toBe('/stream/files/token-1')
    expect(page.getByRole('button', { name: 'Back to details' })).toBeTruthy()
    expect(page.getByRole('slider', { name: 'Position' })).toBeTruthy()
  })

  test('Play from the start asks for 0', async () => {
    await open('/play/45745/start')
    const asked = state.bodies['POST /api/v1/items/movie/45745/play'] as Record<string, unknown>
    expect(asked.start).toBe(0)
  })

  test('Audio and subtitles lists the versions, the sound and the subtitles, and saves a pick', async () => {
    const { page, user } = await open('/play/45745')
    await user.click(page.getByRole('button', { name: 'Audio and subtitles' }))
    const panel = within(page.getByRole('complementary', { name: 'Audio and subtitles' }))
    expect(panel.getByRole('radiogroup', { name: 'Version' })).toBeTruthy()
    expect(panel.getByRole('radio', { name: /1080p/ })).toBeTruthy()
    expect(panel.getByRole('radio', { name: /English · Stereo/ })).toBeTruthy()
    await user.click(panel.getByText('English', { exact: true }))
    await settle()
    expect(state.calls).toContain('PUT /api/v1/items/movie/45745/prefs')
    expect(state.bodies['PUT /api/v1/items/movie/45745/prefs']).toEqual({ subtitleId: 'v4k:s' })
  })

  test('a film that doesn’t start says so, with Try again, which asks again', async () => {
    state.playFails = true
    const { page, user } = await open('/play/45745')
    const message = page.getByRole('alertdialog', { name: 'This film didn’t start' })
    expect(message).toBeTruthy()
    const again = within(message).getByRole('button', { name: 'Try again' })
    expect(document.activeElement).toBe(again)
    state.playFails = false
    state.calls = []
    await user.click(again)
    await settle()
    expect(state.calls).toContain('POST /api/v1/items/movie/45745/play')
    expect(page.queryByRole('alertdialog')).toBeNull()
  })

  test('leaving reports the place, paused, then ends the session', async () => {
    const { page, user } = await open('/play/45745')
    await user.click(page.getByRole('button', { name: 'Back to details' }))
    await settle()
    const report = state.calls.indexOf('POST /api/v1/playback/sessions/pls_1/progress')
    const end = state.calls.indexOf('DELETE /api/v1/playback/sessions/pls_1')
    expect(report).toBeGreaterThan(-1)
    expect(end).toBeGreaterThan(report)
    expect(state.bodies['POST /api/v1/playback/sessions/pls_1/progress']).toMatchObject({
      paused: true,
    })
    expect(window.location.pathname).toBe('/web/movies/45745')
  })

  test('one that isn’t here says so, with Go home', async () => {
    const { page } = await open('/play/19')
    expect(page.getByText('That title isn’t on this server.')).toBeTruthy()
    expect(page.getByRole('link', { name: 'Go home' }).getAttribute('href')).toBe('/web/')
  })
})
