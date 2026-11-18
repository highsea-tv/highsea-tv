// SPDX-License-Identifier: AGPL-3.0-only
// A3 Dashboard on the library's native renderer (D2), rendered against a fake of the API: the
// grid of the person's layout, Customize with the editor's handles and the keyboard model's
// announcements, Add widget's side sheet, Remove, Cancel, Done saving the draft, and the owner's
// menu. The shell (its customize state) and Next's router are stood in for.
import './dom.ts'
import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from 'bun:test'
import { createContext, type ReactNode, useContext, useState } from 'react'

mock.module('../src/navigation.tsx', () => ({
  useRouter: () => ({ push: () => {} }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}))
type Shell = {
  role: 'owner' | 'admin'
  customizing: boolean
  setCustomizing: (on: boolean) => void
}
const ShellContext = createContext<Shell>({
  role: 'owner',
  customizing: false,
  setCustomizing: () => {},
})
mock.module('../src/shell.tsx', () => ({
  useShell: () => useContext(ShellContext),
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
const { ThemeProvider, toast } = await import('@highsea-tv/ui/native')
const { Dashboard } = await import('../src/dashboard.tsx')
const { shown } = await import('./modal.ts')

// ---------------------------------------------------------------- the fake API

type Placement = {
  id: string
  kind: string
  span: number
  rows: number
  settings?: Record<string, unknown>
}
const place = (kind: string, span = 1, rows = 2): Placement => ({
  id: `w-${kind}`,
  kind,
  span,
  rows,
})

let state: {
  widgets: Placement[]
  stale: boolean
  requests: { method: string; path: string; body?: unknown }[]
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

const layout = (widgets: Placement[], inherited = false) => ({
  scope: { kind: 'user', userId: 'u1' },
  widgets,
  updatedAt: inherited ? null : 1,
  inherited,
})

async function api(url: string, init: RequestInit = {}): Promise<Response> {
  const u = new URL(url, 'http://localhost')
  const method = (init.method ?? 'GET').toUpperCase()
  const body = typeof init.body === 'string' ? JSON.parse(init.body) : undefined
  state.requests.push({ method, path: u.pathname, body })
  switch (`${method} ${u.pathname}`) {
    case 'GET /api/v1/system/info/public':
      return json({
        id: 'srv_1',
        name: 'Harbor',
        version: '0.6.0',
        setupComplete: true,
        auth: { oidc: false, passkeys: true },
        sources: ['system'],
        attributions: [],
      })
    case 'GET /api/v1/widgets/network':
      return json({
        minutes: 10,
        samples: [
          { at: '2026-11-18T12:00:00.000Z', down: 2_000_000, up: 300_000, streams: 0 },
          { at: '2026-11-18T12:00:05.000Z', down: 2_500_000, up: 250_000, streams: 1_200_000 },
        ],
        downloads: 2,
        seeding: 4,
        streams: { local: 1, remote: 0 },
      })
    case 'GET /api/v1/widgets/weather':
      return json({
        latitude: 38.72,
        longitude: -9.14,
        timeZone: 'Europe/Lisbon',
        updatedAt: '2026-11-18T12:00:00.000Z',
        stale: state.stale,
        current: { temperature: 17, feelsLike: 16, condition: 'rain', wind: 14, humidity: 72 },
        days: [
          { day: '2026-11-18', high: 18, low: 12, condition: 'rain', rain: 80 },
          { day: '2026-11-19', high: 17, low: 11, condition: 'clear', rain: 0 },
        ],
      })
    case 'GET /api/v1/widgets/weather/places':
      return json([
        { name: 'Lisbon', detail: 'Lisbon, Portugal', latitude: 38.72, longitude: -9.13 },
      ])
    case 'GET /api/v1/settings/general':
      return json({ name: 'Harbor', language: 'en-GB', timeZone: 'Pacific/Kiritimati' })
    case 'GET /api/v1/me/dashboard':
      return json(layout(state.widgets))
    case 'PUT /api/v1/me/dashboard':
      state.widgets = body.widgets
      return json(layout(state.widgets))
    case 'DELETE /api/v1/me/dashboard':
      return json(layout([place('network')], true))
    case 'GET /api/v1/dashboard/defaults/owner':
      return json({ ...layout([place('network')], true), scope: { kind: 'role', role: 'owner' } })
    case 'PUT /api/v1/dashboard/defaults/admin':
      return json({
        ...layout(body.widgets),
        scope: { kind: 'role', role: 'admin' },
        dropped: [],
      })
  }
  return json({ error: { code: 'not-found', message: 'Not here.' } }, 404)
}

beforeEach(() => {
  state = { widgets: [place('network'), place('storage')], requests: [], stale: false }
})
afterEach(() => cleanup())

const settle = () =>
  act(async () => {
    for (let i = 0; i < 6; i++) await new Promise((r) => setTimeout(r, 0))
  })

/** The shell's customize state, as the real shell keeps it. */
function Shell({ role, children }: { role: Shell['role']; children: ReactNode }) {
  const [customizing, setCustomizing] = useState(false)
  return (
    <ShellContext.Provider value={{ role, customizing, setCustomizing }}>
      {children}
    </ShellContext.Provider>
  )
}

async function open(role: Shell['role'] = 'owner') {
  const client = createClient({ fetch: api as never })
  await act(async () => {
    render(
      <ClientProvider client={client}>
        <ThemeProvider>
          <Shell role={role}>
            <Dashboard />
          </Shell>
        </ThemeProvider>
      </ClientProvider>,
    )
  })
  await settle()
  return { user: userEvent.setup(), page: within(document.body) }
}

const saves = () =>
  state.requests.filter((r) => r.method === 'PUT' && r.path === '/api/v1/me/dashboard')

// ---------------------------------------------------------------- the dashboard

describe('Dashboard', () => {
  test('draws the saved layout, without handles until Customize', async () => {
    const { page } = await open()
    expect(page.getByRole('heading', { name: 'Network' })).toBeTruthy()
    expect(page.getByRole('heading', { name: 'Storage' })).toBeTruthy()
    expect(page.queryByRole('button', { name: 'Move Network' })).toBeNull()
    expect(page.queryByRole('button', { name: 'Add widget' })).toBeNull()
  })

  test('Customize gives each widget a handle that moves from the keyboard, announcing it', async () => {
    const { user, page } = await open()
    await user.click(page.getByRole('button', { name: 'Customize' }))
    const handle = page.getByRole('button', { name: 'Move Network' })
    expect(page.getByRole('button', { name: 'Move Storage' })).toBeTruthy()
    act(() => handle.focus())
    await user.keyboard(' ')
    expect(
      page.getByText(/Network picked up, position 1 of 2, 1 column wide and 2 rows tall/),
    ).toBeTruthy()
    await user.keyboard('{ArrowRight}')
    expect(page.getByText('Network moved to position 2 of 2.')).toBeTruthy()
    await user.keyboard(' ')
    expect(page.getByText('Network dropped at position 2 of 2.')).toBeTruthy()

    const success = spyOn(toast, 'success')
    await user.click(page.getByRole('button', { name: 'Done' }))
    await settle()
    expect(saves().at(-1)?.body).toEqual({
      widgets: [place('storage'), place('network')].map(({ id, kind, span, rows }) =>
        expect.objectContaining({ id, kind, span, rows }),
      ),
    })
    expect(success).toHaveBeenCalledWith('Dashboard saved')
    success.mockRestore()
    expect(page.queryByRole('button', { name: 'Move Network' })).toBeNull()
  })

  test('Escape puts a picked-up widget back', async () => {
    const { user, page } = await open()
    await user.click(page.getByRole('button', { name: 'Customize' }))
    act(() => page.getByRole('button', { name: 'Move Network' }).focus())
    await user.keyboard(' ')
    await user.keyboard('{ArrowRight}')
    await user.keyboard('{Escape}')
    expect(page.getByText('Move cancelled. Network is back where it was.')).toBeTruthy()
  })

  test('Add widget lists what’s missing in a side sheet and adds it at the end', async () => {
    const { user, page } = await open()
    await user.click(page.getByRole('button', { name: 'Customize' }))
    await user.click(page.getByRole('button', { name: 'Add widget' }))
    await settle()
    shown()
    const sheet = within(page.getByRole('dialog', { name: 'Add a widget' }))
    expect(sheet.queryByText('Network')).toBeNull()
    await user.click(sheet.getByText('Upcoming'))
    await settle()
    expect(page.getByRole('button', { name: 'Move Upcoming' })).toBeTruthy()

    await user.click(page.getByRole('button', { name: 'Remove Storage' }))
    expect(page.queryByRole('button', { name: 'Move Storage' })).toBeNull()

    await user.click(page.getByRole('button', { name: 'Done' }))
    await settle()
    expect(saves().at(-1)?.body).toEqual({
      widgets: [
        expect.objectContaining({ kind: 'network' }),
        expect.objectContaining({ kind: 'upcoming' }),
      ],
    })
  })

  test('Cancel drops the draft and saves nothing', async () => {
    const { user, page } = await open()
    await user.click(page.getByRole('button', { name: 'Customize' }))
    await user.click(page.getByRole('button', { name: 'Remove Network' }))
    await user.click(page.getByRole('button', { name: 'Cancel' }))
    await settle()
    expect(page.getByRole('heading', { name: 'Network' })).toBeTruthy()
    expect(saves()).toHaveLength(0)
  })

  test('the owner’s menu makes the draft the admins’ default; an admin’s only resets', async () => {
    const { user, page } = await open()
    await user.click(page.getByRole('button', { name: 'Customize' }))
    await user.click(page.getByRole('button', { name: 'More layout options' }))
    const success = spyOn(toast, 'success')
    await user.click(page.getByText('Make this the default for admins'))
    await settle()
    const put = state.requests.find((r) => r.path === '/api/v1/dashboard/defaults/admin')
    expect(put?.method).toBe('PUT')
    expect(success).toHaveBeenCalled()
    success.mockRestore()
    cleanup()

    const admin = await open('admin')
    await admin.user.click(admin.page.getByRole('button', { name: 'Customize' }))
    await admin.user.click(admin.page.getByRole('button', { name: 'More layout options' }))
    expect(admin.page.getByText('Reset to default')).toBeTruthy()
    expect(admin.page.queryByText('Make this the default for admins')).toBeNull()
  })
})

// ---------------------------------------------------------------- the widgets (HT-60)

const asked = (path: string) => state.requests.filter((r) => r.path === path)

describe('the widgets', () => {
  test('Network’s legend is its filter, with every series’ rate now', async () => {
    const { user, page } = await open()
    const legend = within(page.getByRole('radiogroup', { name: 'Show' }))
    const all = legend.getByRole('radio', { name: /All/ })
    expect(all.getAttribute('aria-checked')).toBe('true')
    expect(legend.getByRole('radio', { name: /Streams/ })).toBeTruthy()
    await user.click(legend.getByRole('radio', { name: /Uploads/ }))
    expect(legend.getByRole('radio', { name: /Uploads/ }).getAttribute('aria-checked')).toBe('true')
    expect(all.getAttribute('aria-checked')).toBe('false')
    expect(page.getByRole('img', { name: /Now: downloads .*, uploads .*, streams/ })).toBeTruthy()
  })

  test('Weather asks nothing without a place; Choose a place sets one and saves it', async () => {
    state.widgets = [place('weather', 1, 3)]
    const { user, page } = await open()
    expect(page.getByText('No place chosen')).toBeTruthy()
    expect(asked('/api/v1/widgets/weather')).toHaveLength(0)

    await user.click(page.getByRole('button', { name: 'Choose a place' }))
    await settle()
    shown()
    const sheet = within(page.getByRole('dialog', { name: 'Weather settings' }))
    expect(sheet.getByText(/Your browser’s location is never used/)).toBeTruthy()
    await user.type(sheet.getByRole('textbox', { name: 'Search for a place' }), 'Lis')
    await user.click(sheet.getByRole('button', { name: 'Search' }))
    await settle()
    expect(asked('/api/v1/widgets/weather/places')).toHaveLength(1)
    await user.click(sheet.getByText('Lisbon, Portugal'))
    await user.click(sheet.getByRole('radio', { name: '°F' }))
    await user.click(sheet.getByRole('button', { name: 'Save' }))
    await settle()
    expect(saves().at(-1)?.body).toEqual({
      widgets: [
        expect.objectContaining({
          kind: 'weather',
          settings: expect.objectContaining({
            place: expect.objectContaining({ name: 'Lisbon', latitude: 38.72 }),
            temperature: 'fahrenheit',
          }),
        }),
      ],
    })
    await settle()
    expect(asked('/api/v1/widgets/weather')).toHaveLength(1)
    // 17 °C in Fahrenheit, the condition in words, and Open-Meteo's credit
    expect(page.getByText('63°')).toBeTruthy()
    expect(page.getByRole('link', { name: 'Weather data by Open-Meteo.com' })).toBeTruthy()
  })

  test('Weather shows the last reading with its age while Open-Meteo is away', async () => {
    state.stale = true
    state.widgets = [
      {
        ...place('weather', 2, 3),
        settings: { place: { name: 'Lisbon', detail: '', latitude: 38.72, longitude: -9.14 } },
      },
    ]
    const { page } = await open()
    expect(page.getByRole('status').textContent).toMatch(/Open-Meteo can’t be reached/)
  })

  test('Recently added’s look is its setting, from the gear while customizing', async () => {
    state.widgets = [place('recently-added', 2, 3)]
    const { user, page } = await open()
    await user.click(page.getByRole('button', { name: 'Customize' }))
    await user.click(page.getByRole('button', { name: 'Recently added settings' }))
    await settle()
    shown()
    const sheet = within(page.getByRole('dialog', { name: 'Recently added settings' }))
    expect(sheet.getByRole('radio', { name: 'Featured' }).getAttribute('aria-checked')).toBe('true')
    await user.click(sheet.getByRole('radio', { name: 'List' }))
    await user.click(sheet.getByRole('button', { name: 'Save' }))
    await settle()
    // kept in the draft until Done
    expect(saves()).toHaveLength(0)
    await user.click(page.getByRole('button', { name: 'Done' }))
    await settle()
    expect(saves().at(-1)?.body).toEqual({
      widgets: [expect.objectContaining({ settings: { variant: 'list' } })],
    })
  })

  test('Date and time is the server’s, with yours when the zones differ', async () => {
    state.widgets = [place('clock', 1, 3)]
    const { page } = await open()
    expect(page.getByText(/Pacific\/Kiritimati · week \d+/)).toBeTruthy()
    expect(page.getByText(/^Your time /)).toBeTruthy()
  })
})
