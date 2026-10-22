// SPDX-License-Identifier: AGPL-3.0-only
// Settings › Network and remote access, and Settings › Security, rendered against a fake of
// checkpoint 2's API: the drafts and the save bar, the external URL checked before it's sent and
// the server's refusal under the field it names, built-in TLS with its port and problem, the
// server's name and discovery port, an admin reading Network without saving it; Security's
// write-only client secret (kept, replaced or removed), the redirect URL from the external URL,
// and proxy sign-in. The shell and Next's router are stood in for.
import './dom.ts'
import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'
import type { ReactNode } from 'react'

let role = 'owner'
mock.module('next/navigation', () => ({
  useRouter: () => ({ push: () => {} }),
  usePathname: () => '/settings/network',
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
const { Network } = await import('../src/admin/network.tsx')
const { Security } = await import('../src/admin/security.tsx')

// ---------------------------------------------------------------- the fake API

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const failure = (code: string, message: string, status: number, details?: unknown) =>
  json({ error: { code, message, details } }, status)

const networkStatus = (extra: Record<string, unknown> = {}) => ({
  remoteAccess: 'local-only',
  externalUrl: '',
  trustedProxies: '',
  proxyHeaders: false,
  tls: 'off',
  httpsPort: 8443,
  discovery: true,
  localAddresses: ['http://192.168.1.20:3000'],
  discoveryPort: 7359,
  tlsProblem: null,
  ...extra,
})

const securitySettings = (extra: Record<string, unknown> = {}) => ({
  twoFactor: true,
  passkeys: true,
  sessionDays: 30,
  oidc: { enabled: false, name: '', issuer: '', clientId: '', clientSecretSet: false },
  proxyAuth: { enabled: false, header: 'Remote-User' },
  ...extra,
})

type Req = { method: string; path: string; body: unknown }
let state: {
  network: Record<string, unknown>
  security: Record<string, unknown>
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
    case 'GET /api/v1/system/info/public':
      return json({
        id: 'srv_1',
        name: 'Harbor',
        version: '0.1.0',
        localAddresses: [],
        publicUrl: null,
        setupComplete: true,
        auth: { local: true, oidc: null, passkeys: true },
        sources: [],
        attributions: [],
      })
    case 'GET /api/v1/settings/network':
      return json(state.network)
    case 'PUT /api/v1/settings/network': {
      if (body.trustedProxies.includes('nope'))
        return failure('invalid', 'These aren’t addresses or ranges: nope.', 400, {
          field: 'trustedProxies',
        })
      state.network = { ...state.network, ...body }
      return json(state.network)
    }
    case 'GET /api/v1/settings/security':
      return json(state.security)
    case 'PUT /api/v1/settings/security': {
      const { clientSecret, ...oidc } = body.oidc
      const current = state.security.oidc as { clientSecretSet: boolean }
      state.security = {
        ...body,
        oidc: {
          ...oidc,
          clientSecretSet:
            clientSecret === undefined ? current.clientSecretSet : clientSecret !== null,
        },
      }
      return json(state.security)
    }
  }
  return failure('not-found', `Nothing at ${path}.`, 404)
}

beforeEach(() => {
  role = 'owner'
  state = { network: networkStatus(), security: securitySettings(), requests: [] }
})
afterEach(() => cleanup())

const settle = () =>
  act(async () => {
    for (let i = 0; i < 6; i++) await new Promise((r) => setTimeout(r, 0))
  })

async function open(screen: ReactNode) {
  const client = createClient({ fetch: api as never })
  await act(async () => {
    render(
      <ClientProvider client={client}>
        <TooltipProvider>{screen}</TooltipProvider>
      </ClientProvider>,
    )
  })
  await settle()
  return { user: userEvent.setup(), page: within(document.body) }
}

const saves = (path: string) =>
  state.requests.filter((r) => r.method === 'PUT' && r.path === path).map((r) => r.body)

// ---------------------------------------------------------------- Network

describe('Settings › Network and remote access', () => {
  test('the settings, the server’s name and port, and the addresses it answers on', async () => {
    const { page } = await open(<Network />)
    expect(page.getByLabelText('Let apps on this network find Harbor')).toBeTruthy()
    expect(page.getByText(/published UDP port 7359/)).toBeTruthy()
    expect(
      within(page.getByRole('list', { name: 'On this network' })).getByText(
        'http://192.168.1.20:3000',
      ),
    ).toBeTruthy()
    expect(page.getByText(/passwords cross the network in the clear/)).toBeTruthy()
    // Check from outside is gone (the owner's call)
    expect(page.queryByRole('button', { name: 'Check from outside' })).toBeNull()
    // nothing changed, nothing to save
    expect(page.queryByRole('button', { name: 'Save' })).toBeNull()
  })

  test('a draft is checked, saved without the status fields, and discarded', async () => {
    const { user, page } = await open(<Network />)
    const url = page.getByLabelText('External URL')
    await user.type(url, 'harbor.example.net')
    await user.click(page.getByRole('button', { name: 'Save' }))
    await settle()
    expect(page.getByText('Use a full address, like https://harbor.example.net.')).toBeTruthy()
    expect(saves('/api/v1/settings/network')).toEqual([])

    await user.clear(url)
    await user.type(url, 'https://harbor.example.net')
    await user.click(page.getByRole('radio', { name: 'My proxy handles it' }))
    await user.type(page.getByLabelText('Trusted proxies'), '172.16.0.0/12')
    await user.click(page.getByRole('switch', { name: /X-Forwarded-For/ }))
    await user.click(page.getByRole('button', { name: 'Save' }))
    await settle()
    expect(saves('/api/v1/settings/network')).toEqual([
      {
        remoteAccess: 'local-only',
        externalUrl: 'https://harbor.example.net',
        trustedProxies: '172.16.0.0/12',
        proxyHeaders: true,
        tls: 'proxy',
        httpsPort: 8443,
        discovery: true,
      },
    ])
    expect(page.queryByRole('button', { name: 'Save' })).toBeNull()

    await user.click(page.getByRole('switch', { name: /find Harbor/ }))
    await user.click(page.getByRole('button', { name: 'Discard' }))
    expect(
      (page.getByRole('switch', { name: /find Harbor/ }) as HTMLElement).getAttribute(
        'aria-checked',
      ),
    ).toBe('true')
  })

  test('the server’s refusal shows under the field it names', async () => {
    const { user, page } = await open(<Network />)
    await user.type(page.getByLabelText('Trusted proxies'), 'nope')
    await user.click(page.getByRole('button', { name: 'Save' }))
    await settle()
    expect(page.getAllByText('These aren’t addresses or ranges: nope.').length).toBeGreaterThan(0)
  })

  test('built in: the HTTPS port, checked, and why it isn’t serving', async () => {
    state.network = networkStatus({
      tls: 'built-in',
      tlsProblem: 'No certificate at /config/tls/cert.pem.',
    })
    const { user, page } = await open(<Network />)
    expect(page.getByText('No certificate at /config/tls/cert.pem.')).toBeTruthy()
    const port = page.getByLabelText('HTTPS port')
    await user.clear(port)
    await user.type(port, '80')
    await user.click(page.getByRole('button', { name: 'Save' }))
    await settle()
    expect(page.getByText('Use a port from 1024 to 65535.')).toBeTruthy()
    expect(saves('/api/v1/settings/network')).toEqual([])
  })

  test('an admin reads it and can’t change it', async () => {
    role = 'admin'
    const { page } = await open(<Network />)
    expect(page.getByText('Only the owner can change how the server is reached.')).toBeTruthy()
    expect((page.getByLabelText('External URL') as HTMLInputElement).disabled).toBe(true)
    expect(page.queryByRole('radio', { name: 'Built in' })).toBeNull()
    expect(page.getByText('TLS: Off (LAN only)')).toBeTruthy()
  })
})

// ---------------------------------------------------------------- Security

describe('Settings › Security', () => {
  test('signing in, saved with the secret left out', async () => {
    const { user, page } = await open(<Security />)
    await user.click(page.getByRole('switch', { name: 'Allow passkeys' }))
    await user.click(page.getByRole('switch', { name: /sign-in header/ }))
    const header = page.getByLabelText('Header')
    await user.clear(header)
    await user.type(header, 'Remote User')
    await user.click(page.getByRole('button', { name: 'Save' }))
    await settle()
    expect(page.getByText('Use a header name like Remote-User.')).toBeTruthy()
    await user.clear(header)
    await user.type(header, 'X-Authentik-Username')
    await user.click(page.getByRole('button', { name: 'Save' }))
    await settle()
    const [saved] = saves('/api/v1/settings/security') as Record<string, unknown>[]
    expect(saved).toEqual({
      twoFactor: true,
      passkeys: false,
      sessionDays: 30,
      oidc: { enabled: false, name: '', issuer: '', clientId: '' },
      proxyAuth: { enabled: true, header: 'X-Authentik-Username' },
    })
  })

  test('single sign-on: checked, the redirect from the external URL, a new secret', async () => {
    state.network = networkStatus({ externalUrl: 'https://harbor.example.net' })
    const { user, page } = await open(<Security />)
    await user.click(page.getByRole('switch', { name: 'Offer single sign-on' }))
    expect((page.getByLabelText('Redirect URL') as HTMLInputElement).value).toBe(
      'https://harbor.example.net/api/v1/auth/oidc/callback',
    )
    await user.type(page.getByLabelText('Issuer URL'), 'http://auth.example.net')
    await user.click(page.getByRole('button', { name: 'Save' }))
    await settle()
    expect(
      page.getByText('Use the provider’s https address, like https://auth.example.net.'),
    ).toBeTruthy()
    expect(page.getByText('Paste the client ID from your provider.')).toBeTruthy()

    const issuer = page.getByLabelText('Issuer URL')
    await user.clear(issuer)
    await user.type(issuer, 'https://auth.example.net')
    await user.type(page.getByLabelText('Client ID'), 'highsea')
    await user.type(page.getByLabelText('Button label'), 'Authentik')
    await user.type(page.getByLabelText('Client secret'), 's3cret')
    await user.click(page.getByRole('button', { name: 'Save' }))
    await settle()
    const [saved] = saves('/api/v1/settings/security') as { oidc: unknown }[]
    expect(saved?.oidc).toEqual({
      enabled: true,
      name: 'Authentik',
      issuer: 'https://auth.example.net',
      clientId: 'highsea',
      clientSecret: 's3cret',
    })
    expect(page.getByText('Stored encrypted. Paste a new one to replace it.')).toBeTruthy()
  })

  test('a stored secret is removed; without an external URL the area says so', async () => {
    state.security = securitySettings({
      oidc: {
        enabled: true,
        name: 'Authentik',
        issuer: 'https://auth.example.net',
        clientId: 'highsea',
        clientSecretSet: true,
      },
    })
    const { user, page } = await open(<Security />)
    expect(page.getByText(/needs the server’s external URL/)).toBeTruthy()
    expect(page.getByRole('link', { name: 'Open Network' }).getAttribute('href')).toBe(
      '/settings/network',
    )
    await user.click(page.getByRole('button', { name: 'Remove the stored secret' }))
    await user.click(page.getByRole('button', { name: 'Save' }))
    await settle()
    const [saved] = saves('/api/v1/settings/security') as { oidc: { clientSecret?: unknown } }[]
    expect(saved?.oidc.clientSecret).toBeNull()
    expect(page.getByText('None stored. Paste the one from your provider.')).toBeTruthy()
  })
})
