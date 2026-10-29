// SPDX-License-Identifier: AGPL-3.0-only
// The web app as the desktop app's page (4.4a), against a fake of its Rust side through Tauri's
// own IPC mock (https://v2.tauri.app/develop/tests/mocking/): choosing a server, the one found on
// this network, signing in as this computer, single sign-on through the browser, Unreachable and
// Switch server, the API through the `api` command, media through the `server` scheme, and links
// to other sites opened in the browser.
import './dom.ts'
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mockIPC, mockWindows } from '@tauri-apps/api/mocks'

// before the app's modules load: `inApp` is read once
mockWindows('main')
mockIPC((cmd, args) => rust(cmd, args as Record<string, unknown>), { shouldMockEvents: true })

const { act, cleanup, render, within } = await import('@testing-library/react')
const { default: userEvent } = await import('@testing-library/user-event')
const { emit } = await import('@tauri-apps/api/event')
const { App } = await import('../src/app.tsx')
const { inApp, media } = await import('../src/host.ts')

type Server = {
  id: string
  name: string
  addresses: { url: string; kind: 'local' | 'remote' }[]
  lastSeen: number
  signedIn: boolean
  current: boolean
}

type State = {
  servers: Server[]
  current: string | null
  /** Servers that answer at none of their addresses. */
  off: Set<string>
  /** Answering on this network. */
  nearby: { id: string; name: string; address: string }[]
  oidc: boolean
  signedIn: boolean
  calls: string[]
  bodies: Record<string, unknown>
}
let state: State

const HARBOR: Server = {
  id: 'srv_1',
  name: 'Harbor',
  addresses: [{ url: 'http://192.168.1.20:3000', kind: 'local' }],
  lastSeen: Math.floor(Date.now() / 1000) - 3600,
  signedIn: true,
  current: false,
}

const currentOf = (s: Server) => ({
  id: s.id,
  name: s.name,
  base: s.addresses[0]?.url ?? '',
  kind: s.addresses[0]?.kind ?? 'local',
})

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

type Reply = { status: number; headers: [string, string][]; body: string }
const json = (body: unknown, status = 200): Reply => ({
  status,
  headers: [['content-type', 'application/json']],
  body: JSON.stringify(body),
})
const refused = (code: string, message: string, status: number) =>
  json({ error: { code, message } }, status)

/** The server, as the Rust side's `api` command answers for it. */
function server(method: string, path: string, body: unknown): Reply {
  const u = new URL(path, 'http://x')
  state.calls.push(`${method} ${u.pathname}`)
  if (body !== undefined) state.bodies[`${method} ${u.pathname}`] = body
  switch (`${method} ${u.pathname}`) {
    case 'GET /api/v1/system/info/public':
      return json({
        id: 'srv_1',
        name: 'Harbor',
        version: '0.2.0',
        localAddresses: [],
        publicUrl: null,
        setupComplete: true,
        auth: { local: true, oidc: state.oidc ? { name: 'Pocket ID' } : null, passkeys: false },
        sources: [],
      })
    case 'POST /api/v1/auth/sign-in':
      if ((body as { password: string }).password !== 'theo theo theo')
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
      return json({ user: theo, deviceId: 'dev_1', expiresAt: null, method: 'password' })
    case 'GET /api/v1/system/server':
      return json({ name: 'Harbor', version: '0.2.0' })
    case 'GET /api/v1/home':
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
  }
  return refused('not-found', 'That isn’t here.', 404)
}

/** The Rust side's commands (apps/desktop/src-tauri/src/lib.rs). */
function rust(cmd: string, args: Record<string, unknown>): unknown {
  state.calls.push(cmd)
  const use = (id: string) => {
    const s = state.servers.find((x) => x.id === id)
    if (!s) throw 'unknown'
    if (state.off.has(id)) throw 'unreachable'
    state.current = id
    return currentOf(s)
  }
  switch (cmd) {
    case 'app_device':
      return { name: 'Theo’s MacBook', client: 'desktop', appVersion: '0.2.0' }
    case 'servers_list':
      return state.servers.map((s) => ({ ...s, current: s.id === state.current }))
    case 'server_current': {
      const s = state.servers.find((x) => x.id === state.current)
      return s ? currentOf(s) : null
    }
    case 'server_use':
      return use(args.id as string)
    case 'server_add': {
      const found = state.nearby.find((n) => n.address === args.address)
      if (!found) throw 'unreachable'
      const s: Server = {
        id: found.id,
        name: found.name,
        addresses: [{ url: found.address, kind: 'local' }],
        lastSeen: Math.floor(Date.now() / 1000),
        signedIn: false,
        current: true,
      }
      state.servers = [...state.servers.filter((x) => x.id !== s.id), s]
      state.current = s.id
      return s
    }
    case 'server_leave':
      state.current = null
      return null
    case 'discover': {
      const channel = args.onFound as { onmessage: (f: unknown) => void }
      for (const n of state.nearby) channel.onmessage({ kind: 'server', ...n })
      channel.onmessage({ kind: 'done' })
      return null
    }
    case 'oidc_start':
    case 'stream_close':
    case 'plugin:opener|open_url':
      return null
    case 'stream_open':
      // the event stream: open, and quiet
      return { status: 200, headers: [['content-type', 'text/event-stream']] }
    case 'api': {
      const r = args.request as { method: string; path: string; body: string | null }
      if (!state.current) return { status: 0, headers: [], body: '' }
      return server(r.method, r.path, r.body ? JSON.parse(r.body) : undefined)
    }
  }
  throw `no fake for ${cmd}`
}

beforeEach(() => {
  state = {
    servers: [],
    current: null,
    off: new Set(),
    nearby: [],
    oidc: false,
    signedIn: false,
    calls: [],
    bodies: {},
  }
  try {
    localStorage.clear()
  } catch {}
})
afterEach(() => cleanup())

const settle = () =>
  act(async () => {
    for (let i = 0; i < 12; i++) await new Promise((r) => setTimeout(r, 0))
  })

async function open() {
  // the desktop build's base is `/`; tests have no Vite, so the routes stay under /web
  window.history.replaceState(null, '', '/web/')
  await act(async () => {
    render(<App />)
  })
  await settle()
  return { page: within(document.body), user: userEvent.setup() }
}

describe('the desktop app', () => {
  test('is the app: the page knows, and loads media through the server scheme', () => {
    expect(inApp).toBe(true)
    expect(media('/api/v1/images/poster.jpg')).toBe('server://localhost/api/v1/images/poster.jpg')
    expect(media('https://image.tmdb.org/t/p/w500/a.jpg')).toBe(
      'https://image.tmdb.org/t/p/w500/a.jpg',
    )
    expect(media(null)).toBe(null)
  })

  test('with no servers, Choose a server finds one on this network; it signs in as this computer', async () => {
    state.nearby = [{ id: 'srv_1', name: 'Harbor', address: 'http://192.168.1.20:3000' }]
    const { page, user } = await open()
    expect(page.getByRole('heading', { name: 'Choose a server' })).toBeTruthy()
    expect(page.queryByRole('heading', { name: 'Your servers' })).toBeNull()

    await user.click(page.getByRole('button', { name: /Harbor/ }))
    await settle()
    expect(state.calls).toContain('server_add')
    expect(page.getByRole('heading', { name: 'Sign in to Harbor' })).toBeTruthy()
    expect(page.getByText('192.168.1.20:3000')).toBeTruthy()

    await user.type(page.getByLabelText('Username'), 'theo')
    await user.type(page.getByLabelText('Password'), 'theo theo theo')
    await user.click(page.getByRole('button', { name: 'Sign in' }))
    await settle()
    expect(state.bodies['POST /api/v1/auth/sign-in']).toEqual({
      username: 'theo',
      password: 'theo theo theo',
      device: { name: 'Theo’s MacBook', client: 'desktop', appVersion: '0.2.0' },
    })
    expect(page.getAllByRole('navigation', { name: 'Main' }).length).toBeGreaterThan(0)
    // the event stream comes through the Rust side too
    expect(state.calls).toContain('stream_open')
  })

  test('Back from sign-in returns to Choose a server', async () => {
    state.servers = [{ ...HARBOR, signedIn: false }]
    state.current = 'srv_1'
    const { page, user } = await open()
    expect(page.getByRole('heading', { name: 'Sign in to Harbor' })).toBeTruthy()
    await user.click(page.getByRole('button', { name: 'Back' }))
    await settle()
    expect(state.calls).toContain('server_leave')
    expect(page.getByRole('heading', { name: 'Choose a server' })).toBeTruthy()
    expect(page.getByRole('heading', { name: 'Your servers' })).toBeTruthy()
  })

  test('opens the server last signed in to', async () => {
    state.servers = [HARBOR]
    state.signedIn = true
    const { page } = await open()
    expect(state.calls).toContain('server_use')
    expect(page.getAllByRole('navigation', { name: 'Main' }).length).toBeGreaterThan(0)
  })

  test('a server that doesn’t answer is Unreachable, with Switch server', async () => {
    state.servers = [HARBOR]
    state.off.add('srv_1')
    const { page, user } = await open()
    expect(page.getByText('Can’t reach Harbor')).toBeTruthy()
    await user.click(page.getByRole('button', { name: 'Try again' }))
    await settle()
    expect(page.getByText('Can’t reach Harbor')).toBeTruthy()

    await user.click(page.getByRole('button', { name: 'Switch server' }))
    await settle()
    expect(page.getByRole('heading', { name: 'Choose a server' })).toBeTruthy()
  })

  test('single sign-on finishes in the browser, and says why when it doesn’t', async () => {
    state.servers = [{ ...HARBOR, signedIn: false }]
    state.current = 'srv_1'
    state.oidc = true
    const { page, user } = await open()
    await user.click(page.getByRole('button', { name: 'Sign in with Pocket ID' }))
    await settle()
    expect(state.calls).toContain('oidc_start')
    expect(page.getByText(/Finish signing in with Pocket ID in your browser/)).toBeTruthy()

    await act(() => emit('highsea://oidc', { status: 'failed', reason: 'oidc-denied' }))
    await settle()
    expect(
      page.getByText('Pocket ID didn’t sign you in. Try again, or sign in with a password.'),
    ).toBeTruthy()

    await user.click(page.getByRole('button', { name: 'Sign in with Pocket ID' }))
    await settle()
    state.signedIn = true
    await act(() => emit('highsea://oidc', { status: 'signedIn' }))
    await settle()
    expect(page.getAllByRole('navigation', { name: 'Main' }).length).toBeGreaterThan(0)
  })

  test('a link to another site opens in the browser', async () => {
    state.servers = [HARBOR]
    state.signedIn = true
    const { user } = await open()
    const a = document.createElement('a')
    a.href = 'https://github.com/highsea-tv/highsea-tv'
    a.target = '_blank'
    a.textContent = 'Source'
    document.body.append(a)
    await user.click(a)
    expect(state.calls).toContain('plugin:opener|open_url')
    a.remove()
  })

  test('Downloads is the app’s own, not the browser’s pointer to the app', async () => {
    state.servers = [HARBOR]
    state.signedIn = true
    const { page, user } = await open()
    await user.click(page.getAllByRole('link', { name: 'Downloads' })[0] as HTMLElement)
    await settle()
    expect(page.getByRole('heading', { name: 'Downloads' })).toBeTruthy()
    expect(page.getByText('Nothing downloaded')).toBeTruthy()
    expect(page.queryByText('Downloads live in the desktop app')).toBeNull()
  })
})
