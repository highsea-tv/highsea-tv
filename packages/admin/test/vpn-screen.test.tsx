// SPDX-License-Identifier: AGPL-3.0-only
// Settings › VPN (checkpoint 6a), rendered against a fake of the API: the status with its checks,
// Check now and Reconnect; the four modes, with built-in shown but not yet pickable; the container
// mode's address check, its write-only key and the server's refusal under the field it names; the
// interfaces and the compose block from the server; and highsea connects' compose lines, opened
// when the tunnel can't run for want of NET_ADMIN or on host networking. The shell and Next's router are stood in for.
import './dom.ts'
import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'
import type { ReactNode } from 'react'

mock.module('../src/navigation.tsx', () => ({
  useRouter: () => ({ push: () => {} }),
  usePathname: () => '/settings/vpn',
  useSearchParams: () => new URLSearchParams(),
}))
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
      <div>{actions}</div>
      {children}
    </main>
  ),
}))

const { act, cleanup, render, within } = await import('@testing-library/react')
const { default: userEvent } = await import('@testing-library/user-event')
const { createClient } = await import('@highsea-tv/sdk')
const { ClientProvider } = await import('@highsea-tv/sdk/react')
const { ThemeProvider } = await import('@highsea-tv/ui/native')
const { Vpn } = await import('../src/vpn.tsx')

// ---------------------------------------------------------------- the fake API

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const failure = (code: string, message: string, status: number, details?: unknown) =>
  json({ error: { code, message, details } }, status)

const settings = (extra: Record<string, unknown> = {}) => ({
  mode: 'off',
  provider: 'proton',
  configName: null,
  piaUsername: '',
  piaPasswordSet: false,
  piaRegion: '',
  staticPort: null,
  containerUrl: 'http://127.0.0.1:8000',
  containerKeySet: false,
  interface: '',
  useForwardedPort: true,
  indexersThroughVpn: false,
  echoUrl: 'https://echo.example.test',
  ...extra,
})

const off = {
  mode: 'off',
  provider: null,
  state: 'off',
  message: null,
  needsCapability: false,
  exitIp: null,
  country: null,
  forwardedPort: null,
  checks: [],
  checkedAt: null,
}

const connected = {
  ...off,
  mode: 'container',
  provider: 'gluetun',
  state: 'connected',
  exitIp: '185.159.157.12',
  country: 'Netherlands',
  forwardedPort: 51413,
  checkedAt: new Date(Date.now() - 5 * 60_000).toISOString(),
  checks: [
    { id: 'tunnel', label: 'Tunnel', result: 'pass', title: 'Up' },
    {
      id: 'exit',
      label: 'Exit address',
      result: 'pass',
      title: '185.159.157.12',
      detail: 'not your own',
    },
    { id: 'ipv6', label: 'IPv6', result: 'info', title: 'Not used.' },
  ],
}

type Req = { method: string; path: string; body: unknown }
let state: {
  settings: ReturnType<typeof settings>
  status: Record<string, unknown>
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
    case 'GET /api/v1/settings/vpn':
      return json(state.settings)
    case 'PUT /api/v1/settings/vpn': {
      if (body.containerKey === 'wrong')
        return failure('invalid', 'gluetun refused the API key.', 400, { field: 'containerKey' })
      const { containerKey, piaPassword, config, ...rest } = body
      state.settings = {
        ...state.settings,
        ...rest,
        ...(containerKey ? { containerKeySet: true } : {}),
      }
      return json(state.settings)
    }
    case 'GET /api/v1/vpn/status':
      return json(state.status)
    case 'POST /api/v1/vpn/check':
    case 'POST /api/v1/vpn/reconnect':
      return json(state.status)
    case 'GET /api/v1/vpn/providers':
      return json([
        {
          id: 'proton',
          name: 'Proton VPN',
          connect: 'config',
          steps: ['Sign in to Proton.'],
          portForwarding: 'natpmp',
          ipv6: false,
        },
        {
          id: 'mullvad',
          name: 'Mullvad',
          connect: 'config',
          steps: ['Sign in to Mullvad.'],
          portForwarding: 'none',
          ipv6: true,
        },
      ])
    case 'GET /api/v1/vpn/interfaces':
      return json([
        { name: 'eth0', ipv4: '192.168.1.20', ipv6: null },
        { name: 'wg0', ipv4: '10.2.0.15', ipv6: null },
      ])
    case 'POST /api/v1/vpn/compose':
      return json({ yaml: `services:\n  gluetun:\n    # for ${body.provider}` })
  }
  return failure('not-found', `Nothing at ${path}.`, 404)
}

beforeEach(() => {
  state = { settings: settings(), status: off, requests: [] }
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
        <ThemeProvider>
          <Vpn />
        </ThemeProvider>
      </ClientProvider>,
    )
  })
  await settle()
  return { user: userEvent.setup(), page: within(document.body) }
}

const requested = (method: string, path: string) =>
  state.requests.filter((r) => r.method === method && r.path === path)

// ---------------------------------------------------------------- tests

describe('Settings › VPN', () => {
  test('off: the warning, and highsea connects can be picked', async () => {
    const { page } = await open()
    const status = page.getByRole('status')
    expect(within(status).getByText('No VPN')).toBeTruthy()
    expect(page.queryByRole('button', { name: 'Check now' })).toBeNull()
    // each card is the radio (a Press with the radio role), so its state is aria-checked
    const builtin = page.getByRole('radio', { name: /highsea connects/ })
    expect(builtin.getAttribute('aria-disabled')).toBeNull()
    expect(page.queryByText(/Arrives in a later update/)).toBeNull()
    expect(page.getByRole('radio', { name: /^Off/ }).getAttribute('aria-checked')).toBe('true')
    // nothing to behave with while it's off
    expect(page.queryByRole('region', { name: 'Behaviour' })).toBeNull()
  })

  test('highsea connects: the provider’s steps, and a pasted configuration saved with it', async () => {
    const { user, page } = await open()
    await user.click(page.getByRole('radio', { name: /highsea connects/ }))
    await settle()
    expect(page.getByText('Sign in to Proton.')).toBeTruthy()
    await user.click(page.getByRole('button', { name: 'Paste instead' }))
    await user.type(page.getByLabelText('Paste the configuration'), 'not a real config')
    await user.click(page.getByRole('button', { name: 'Save' }))
    await settle()
    const saved = requested('PUT', '/api/v1/settings/vpn').at(-1)?.body as Record<string, unknown>
    expect(saved).toMatchObject({
      mode: 'builtin',
      provider: 'proton',
      config: 'not a real config',
    })
  })

  test('connected: the exit, the checks, Check now and when it last checked', async () => {
    state.settings = settings({ mode: 'container', containerKeySet: true })
    state.status = connected
    const { user, page } = await open()
    expect(page.getByText('Connected through gluetun')).toBeTruthy()
    expect(
      page.getByText('All torrent traffic leaves through 185.159.157.12 (Netherlands).'),
    ).toBeTruthy()
    const checks = within(page.getByRole('list', { name: 'Checks' }))
    expect(checks.getByText('Exit address')).toBeTruthy()
    expect(checks.getByText('not your own', { exact: false })).toBeTruthy()
    expect(page.getByText(/^Checked .*ago$/)).toBeTruthy()

    await user.click(page.getByRole('button', { name: 'Check now' }))
    await settle()
    expect(requested('POST', '/api/v1/vpn/check')).toHaveLength(1)
    await user.click(page.getByRole('button', { name: 'Reconnect' }))
    await settle()
    expect(requested('POST', '/api/v1/vpn/reconnect')).toHaveLength(1)
  })

  test('container: the address is checked, the key is write-only, a refusal shows under it', async () => {
    const { user, page } = await open()
    await user.click(page.getByRole('radio', { name: /A VPN container/ }))
    const address = page.getByLabelText('Control server')
    await user.clear(address)
    await user.type(address, 'gluetun')
    expect(page.getByText('Use a full address, like http://127.0.0.1:8000.')).toBeTruthy()
    await user.click(page.getByRole('button', { name: 'Save' }))
    await settle()
    expect(requested('PUT', '/api/v1/settings/vpn')).toHaveLength(0)

    await user.clear(address)
    await user.type(address, 'http://127.0.0.1:8000')
    await user.type(page.getByLabelText('API key'), 'wrong')
    await user.click(page.getByRole('button', { name: 'Save' }))
    await settle()
    expect(page.getAllByText('gluetun refused the API key.').length).toBeGreaterThan(0)

    const key = page.getByLabelText('API key')
    await user.clear(key)
    await user.type(key, 'right')
    await user.click(page.getByRole('button', { name: 'Save' }))
    await settle()
    const saved = requested('PUT', '/api/v1/settings/vpn').at(-1)?.body as Record<string, unknown>
    expect(saved).toMatchObject({ mode: 'container', containerKey: 'right' })
    expect(saved).not.toHaveProperty('containerKeySet')
    expect(saved).not.toHaveProperty('piaPassword')
    // the saved settings say a key is set, never what it is
    expect(page.getByText('Set. Type a new one to replace it.')).toBeTruthy()
    expect((page.getByLabelText('API key') as HTMLInputElement).value).toBe('')
  })

  test('container: the compose block comes from the server, per provider', async () => {
    state.settings = settings({ mode: 'container' })
    const { user, page } = await open()
    // the native Disclosure draws what's inside only once it's open
    await user.click(page.getByRole('button', { name: 'Compose for your provider' }))
    await settle()
    const block = page.getByRole('figure', { name: 'Compose block' })
    expect(within(block).getByText(/for proton/)).toBeTruthy()
    expect(requested('POST', '/api/v1/vpn/compose')[0]?.body).toEqual({ provider: 'proton' })
  })

  test('interface: the server’s interfaces with their addresses', async () => {
    state.settings = settings({ mode: 'interface', interface: 'wg0' })
    const { page } = await open()
    expect(page.getByText('wg0 · 10.2.0.15')).toBeTruthy()
    // a VPN interface has no forwarded port to use
    expect(page.queryByText('Use the forwarded port')).toBeNull()
    expect(page.getByText('Send indexer searches through the VPN too')).toBeTruthy()
  })

  test('without NET_ADMIN, highsea connects’ compose lines open', async () => {
    state.settings = settings({ mode: 'builtin', configName: 'nl.conf' })
    state.status = {
      ...off,
      mode: 'builtin',
      provider: 'Proton VPN',
      state: 'failed',
      needsCapability: true,
      hostNetwork: false,
      message: 'highsea needs the NET_ADMIN capability.',
    }
    const { page } = await open()
    expect(page.getByText('highsea can’t run the tunnel yet')).toBeTruthy()
    expect(page.getByText(/Compose for highsea connects, under Connection/)).toBeTruthy()
    const lines = page.getByRole('figure', { name: 'Compose lines' })
    expect(within(lines).getByText(/cap_add: \[NET_ADMIN\]/)).toBeTruthy()
    expect(within(lines).getByText(/"7368:7368\/udp"/)).toBeTruthy()
    expect((page.getByRole('button', { name: 'Reconnect' }) as HTMLButtonElement).disabled).toBe(
      true,
    )
  })

  test('on host networking, the status says so and the lines open', async () => {
    state.settings = settings({ mode: 'builtin', configName: 'nl.conf' })
    state.status = {
      ...off,
      mode: 'builtin',
      provider: 'Proton VPN',
      state: 'failed',
      needsCapability: false,
      hostNetwork: true,
      message: 'On host networking, the tunnel would land in the host’s network.',
    }
    const { page } = await open()
    const status = within(page.getByRole('status'))
    expect(status.getByText('highsea is on host networking')).toBeTruthy()
    expect(status.getByText(/would land in the host’s network/)).toBeTruthy()
    expect(page.getByRole('button', { name: /Compose for highsea connects/ })).toBeTruthy()
    expect(page.getByRole('figure', { name: 'Compose lines' })).toBeTruthy()
    expect((page.getByRole('button', { name: 'Reconnect' }) as HTMLButtonElement).disabled).toBe(
      true,
    )
  })

  test('the other modes don’t mind host networking: a failure there says only that', async () => {
    state.settings = settings({ mode: 'interface', interface: 'wg0' })
    state.status = {
      ...off,
      mode: 'interface',
      provider: 'wg0',
      state: 'failed',
      needsCapability: false,
      hostNetwork: true,
      message: 'wg0 has no address.',
    }
    const { page } = await open()
    const status = within(page.getByRole('status'))
    expect(status.getByText('Couldn’t connect')).toBeTruthy()
    expect(status.queryByText('highsea is on host networking')).toBeNull()
  })

  test('connected through highsea connects, the lines stay folded until opened', async () => {
    state.settings = settings({ mode: 'builtin', configName: 'nl.conf' })
    state.status = { ...connected, mode: 'builtin', provider: 'Proton VPN', hostNetwork: false }
    const { user, page } = await open()
    expect(page.queryByRole('figure', { name: 'Compose lines' })).toBeNull()
    await user.click(page.getByRole('button', { name: /Compose for highsea connects/ }))
    await settle()
    expect(page.getByRole('figure', { name: 'Compose lines' })).toBeTruthy()
  })
})
