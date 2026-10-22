// SPDX-License-Identifier: AGPL-3.0-only
// Checkpoint 8b's settings, rendered against a fake of the API: General's Region, Updates and
// Diagnostics, which share the page's Save bar with Metadata and save only what changed, read-only
// for an admin; and Settings › Backups, the folder checked here and by the server, its refusal
// shown on the field, and the note about the secret key. The shell and Next's router are
// stood in for.
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
  AdminPage: ({ title, children }: { title: ReactNode; children?: ReactNode }) => (
    <main>
      <h1>{title}</h1>
      {children}
    </main>
  ),
}))

const { act, cleanup, render, within } = await import('@testing-library/react')
const { default: userEvent } = await import('@testing-library/user-event')
const { createClient } = await import('@highsea/sdk')
const { ClientProvider } = await import('@highsea/sdk/react')
const { TooltipProvider } = await import('@highsea/ui-web')
const { General } = await import('../src/admin/general.tsx')
const { BackupsSettings } = await import('../src/admin/backups.tsx')

type State = {
  general: Record<string, unknown>
  metrics: { enabled: boolean }
  backups: Record<string, unknown>
  requests: { method: string; path: string; body?: unknown }[]
}
let state: State

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

async function api(url: string, init: RequestInit = {}): Promise<Response> {
  const u = new URL(url, 'http://localhost')
  const method = init.method ?? 'GET'
  if (u.pathname === '/api/v1/events') return new Response(new ReadableStream())
  const body = init.body ? JSON.parse(String(init.body)) : undefined
  state.requests.push({ method, path: u.pathname, body })
  switch (`${method} ${u.pathname}`) {
    case 'GET /api/v1/system/info/public':
      return json({
        id: 'srv_1',
        name: 'Harbor',
        version: '0.6.0',
        localAddresses: ['http://192.168.1.20:3000'],
        publicUrl: null,
        setupComplete: true,
        auth: { local: true, oidc: null, passkeys: true },
        sources: ['system'],
        attributions: [],
      })
    case 'GET /api/v1/settings/metadata':
      return json({ language: 'en-GB', region: 'GB', key: { set: true, last4: 'ab12' } })
    case 'GET /api/v1/settings/general':
      return json(state.general)
    case 'PUT /api/v1/settings/general':
      state.general = body
      return json(body)
    case 'GET /api/v1/settings/metrics':
      return json(state.metrics)
    case 'PUT /api/v1/settings/metrics':
      state.metrics = body
      return json(body)
    case 'GET /api/v1/catalog/settings':
      return json({ channel: 'stable', autoUpdate: true, extras: [] })
    case 'GET /api/v1/settings/backups':
      return json(state.backups)
    case 'PUT /api/v1/settings/backups':
      if (body.folder === '/readonly')
        return json(
          { error: { code: 'invalid', message: 'highsea can’t write to /readonly.' } },
          400,
        )
      state.backups = body
      return json(body)
  }
  return json({ error: { code: 'not-found', message: 'Not here.' } }, 404)
}

beforeEach(() => {
  role = 'owner'
  state = {
    general: {
      language: 'en',
      timeZone: 'Europe/London',
      updateChannel: 'stable',
      logLevel: 'info',
      crashReports: false,
    },
    metrics: { enabled: false },
    backups: { schedule: 'daily', time: '03:30', weekday: 0, keep: 7, folder: '/config/backups' },
    requests: [],
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

const puts = (path: string) =>
  state.requests.filter((r) => r.method === 'PUT' && r.path === path).map((r) => r.body)

describe('Settings › General (8b)', () => {
  test('Region, Updates and Diagnostics save what changed, through the one Save bar', async () => {
    const { page, user } = await open(<General />)
    expect(page.getByRole('region', { name: 'Region' })).toBeTruthy()
    const updates = page.getByRole('region', { name: 'Updates' })
    expect(within(updates).getByText(/pull the new image/)).toBeTruthy()
    expect(within(updates).queryByText(/on their own/)).toBeNull()
    const diagnostics = page.getByRole('region', { name: 'Diagnostics' })
    expect(within(diagnostics).queryByText(/usage counts/)).toBeNull()

    await user.click(within(updates).getByRole('radio', { name: 'Beta' }))
    await user.click(within(diagnostics).getByRole('switch', { name: 'Write crash reports' }))
    await user.click(within(diagnostics).getByRole('switch', { name: 'Metrics for Prometheus' }))
    expect(within(diagnostics).getByText('http://192.168.1.20:3000/metrics')).toBeTruthy()
    await user.click(page.getByRole('button', { name: 'Save' }))
    await settle()
    expect(puts('/api/v1/settings/general')).toEqual([
      {
        language: 'en',
        timeZone: 'Europe/London',
        updateChannel: 'beta',
        logLevel: 'info',
        crashReports: true,
      },
    ])
    expect(puts('/api/v1/settings/metrics')).toEqual([{ enabled: true }])
    // Metadata didn't change, so it isn't sent
    expect(puts('/api/v1/settings/metadata')).toEqual([])
  })

  test('an admin reads them and changes nothing', async () => {
    role = 'admin'
    const { page } = await open(<General />)
    expect(page.getByText('Only the owner can change these settings.')).toBeTruthy()
    expect(page.getByText('Stable channel')).toBeTruthy()
    expect(page.queryByRole('radio', { name: 'Beta' })).toBeNull()
    const crash = page.getByRole('switch', { name: 'Write crash reports' }) as HTMLButtonElement
    expect(crash.disabled).toBe(true)
  })
})

describe('Settings › Backups', () => {
  test('the folder is checked here and by the server, and the secret key’s note shows', async () => {
    const { page, user } = await open(<BackupsSettings />)
    expect(page.getByText(/never hold the server’s secret key/)).toBeTruthy()
    expect(page.getByText('In the server’s time zone, Europe/London.')).toBeTruthy()

    const folder = page.getByLabelText('Folder')
    await user.clear(folder)
    await user.type(folder, '/readonly')
    await user.click(page.getByRole('button', { name: 'Save' }))
    await settle()
    expect(page.getByText('highsea can’t write to /readonly.', { selector: '[id]' })).toBeTruthy()

    await user.clear(folder)
    await user.type(folder, 'relative')
    await user.click(page.getByRole('button', { name: 'Save' }))
    await settle()
    expect(page.getByText('A full path, such as /backups.')).toBeTruthy()

    await user.clear(folder)
    await user.type(folder, '/backups')
    const keep = page.getByLabelText(/Keep the last/)
    await user.clear(keep)
    await user.type(keep, '14')
    await user.click(page.getByRole('button', { name: 'Save' }))
    await settle()
    expect(puts('/api/v1/settings/backups').at(-1)).toEqual({
      schedule: 'daily',
      time: '03:30',
      weekday: 0,
      keep: 14,
      folder: '/backups',
    })
  })
})
