// SPDX-License-Identifier: AGPL-3.0-only
// A13's invite and reset links (checkpoint 8b): always shown to copy, and the dialog says so when
// the server's mail sent them too (`emailedTo`). Rendered against a fake of the API; the shell and
// Next's router are stood in for.
import './dom.ts'
import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'
import type { ReactNode } from 'react'

mock.module('next/navigation', () => ({
  useRouter: () => ({ push: () => {} }),
  usePathname: () => '/settings/users',
  useSearchParams: () => new URLSearchParams(),
}))
mock.module('../src/admin/shell.tsx', () => ({
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
const { createClient } = await import('@highsea/sdk')
const { ClientProvider } = await import('@highsea/sdk/react')
const { TooltipProvider } = await import('@highsea/ui-web')
const { Users } = await import('../src/admin/users.tsx')

const person = (over: Record<string, unknown>) => ({
  id: 'usr_owner',
  username: 'ines',
  displayName: 'Ines',
  role: 'owner',
  permissions: [],
  libraries: 'all',
  twoFactor: false,
  passkeys: 0,
  hasPassword: true,
  email: null,
  lastSeen: null,
  invited: false,
  createdAt: '2026-10-01T00:00:00.000Z',
  ...over,
})

let mail: boolean

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

async function api(url: string, init: RequestInit = {}): Promise<Response> {
  const u = new URL(url, 'http://localhost')
  const method = init.method ?? 'GET'
  if (u.pathname === '/api/v1/events') return new Response(new ReadableStream())
  const body = init.body ? JSON.parse(String(init.body)) : undefined
  const owner = person({})
  switch (`${method} ${u.pathname}`) {
    case 'GET /api/v1/auth/session':
      return json({ user: owner, deviceId: 'dev_1', expiresAt: null, method: 'password' })
    case 'GET /api/v1/users':
      return json([owner])
    case 'GET /api/v1/devices':
    case 'GET /api/v1/api-keys':
      return json([])
    case 'POST /api/v1/users/invites':
      return json({
        user: person({
          id: 'usr_mara',
          username: 'mara',
          displayName: body.displayName,
          role: body.role,
          email: body.email,
          invited: true,
        }),
        link: 'http://localhost/invite/abc',
        expiresAt: '2026-10-28T00:00:00.000Z',
        emailedTo: mail ? body.email : null,
      })
  }
  return json({ error: { code: 'not-found', message: 'Not here.' } }, 404)
}

beforeEach(() => {
  mail = false
})
afterEach(() => cleanup())

const settle = () =>
  act(async () => {
    for (let i = 0; i < 6; i++) await new Promise((r) => setTimeout(r, 0))
  })

async function invite(email: string) {
  const client = createClient({ fetch: api as never })
  await act(async () => {
    render(
      <ClientProvider client={client}>
        <TooltipProvider>
          <Users />
        </TooltipProvider>
      </ClientProvider>,
    )
  })
  await settle()
  const user = userEvent.setup()
  const page = within(document.body)
  await user.click(page.getByRole('button', { name: 'Invite someone' }))
  const dialog = within(page.getByRole('dialog'))
  await user.type(dialog.getByLabelText('Name'), 'Mara')
  await user.type(dialog.getByLabelText('Email'), email)
  await user.click(dialog.getByRole('button', { name: 'Create invite link' }))
  await settle()
  return within(page.getByRole('dialog'))
}

describe('A13 invite links', () => {
  test('shows the link, and says it was emailed when the server’s mail sent it', async () => {
    mail = true
    const dialog = await invite('mara@example.com')
    expect(dialog.getByText('Mara is invited')).toBeTruthy()
    expect(dialog.getByText('We also emailed it to mara@example.com.')).toBeTruthy()
  })

  test('without the server’s mail, only the link', async () => {
    const dialog = await invite('mara@example.com')
    expect(dialog.getByText('Mara is invited')).toBeTruthy()
    expect(dialog.queryByText(/emailed it/)).toBeNull()
  })
})
