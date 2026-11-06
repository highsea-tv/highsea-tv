// SPDX-License-Identifier: AGPL-3.0-only
// Settings › Appearance (A12), rendered against a fake of the API since D3 drew it with the
// library's native renderer: renaming the server through the Save bar, the default theme as a
// radio group, a new theme through the editor's contrast audit, the accent's colour well and its
// value, and the sounds' switches and volume. The shell and Next's router are stood in for.
import './dom.ts'
import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'
import type { ReactNode } from 'react'

mock.module('../src/navigation.tsx', () => ({
  useRouter: () => ({ push: () => {} }),
  usePathname: () => '/settings/appearance',
  useSearchParams: () => new URLSearchParams(),
}))
mock.module('../src/shell.tsx', () => ({
  useShell: () => ({ role: 'owner' }),
  AdminPage: ({ title, children }: { title: ReactNode; children?: ReactNode }) => (
    <main>
      <h1>{title}</h1>
      {children}
    </main>
  ),
}))

const { act, cleanup, render, within } = await import('@testing-library/react')
const { default: userEvent } = await import('@testing-library/user-event')
const { createClient } = await import('@highsea-tv/sdk')
const { ClientProvider } = await import('@highsea-tv/sdk/react')
const { ThemeProvider } = await import('@highsea-tv/ui/native')
const { Appearance } = await import('../src/appearance.tsx')

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

type Req = { method: string; path: string; body: unknown }
type Theme = { id: string; name: string; base: string; accent: string }
let state: {
  name: string
  accent: string | null
  defaultTheme: string
  themes: Theme[]
  sound: { tv: boolean; phone: boolean; web: boolean; volume: number; pack: string }
  requests: Req[]
}

const appearance = () => ({
  defaultTheme: state.defaultTheme,
  themes: state.themes,
  sound: state.sound,
  packs: [{ id: 'highsea', name: 'highsea', builtIn: true }],
  branding: { name: state.name, accent: state.accent, mark: null },
})

async function api(url: string, init: RequestInit = {}): Promise<Response> {
  const u = new URL(url, 'http://localhost')
  const method = init.method ?? 'GET'
  const path = u.pathname
  if (path === '/api/v1/events')
    return new Response(new ReadableStream(), { headers: { 'content-type': 'text/event-stream' } })
  const body = init.body ? JSON.parse(String(init.body)) : undefined
  state.requests.push({ method, path, body })
  if (method === 'GET' && path === '/api/v1/appearance') return json(appearance())
  if (method === 'PATCH' && path === '/api/v1/appearance') {
    Object.assign(state, body)
    return json(appearance())
  }
  if (method === 'PUT' && path.startsWith('/api/v1/appearance/themes/')) {
    const id = path.split('/').pop() ?? ''
    const theme = { id, ...(body as Omit<Theme, 'id'>) }
    state.themes = [...state.themes.filter((t) => t.id !== id), theme]
    return json(theme)
  }
  return json({ error: { code: 'not-found', message: `Nothing at ${path}.` } }, 404)
}

beforeEach(() => {
  state = {
    name: 'Harbor',
    accent: null,
    defaultTheme: 'default',
    themes: [],
    sound: { tv: true, phone: false, web: false, volume: 0.6, pack: 'highsea' },
    requests: [],
  }
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
          <Appearance />
        </ThemeProvider>
      </ClientProvider>,
    )
  })
  await settle()
  return { user: userEvent.setup(), page: within(document.body) }
}

const patches = () =>
  state.requests.filter((r) => r.method === 'PATCH' && r.path === '/api/v1/appearance')

describe('Settings › Appearance', () => {
  test('renaming the server goes through the Save bar', async () => {
    const { page, user } = await open()
    expect(page.queryByRole('region', { name: 'Unsaved changes' })).toBeNull()
    const name = page.getByLabelText('Name')
    await user.clear(name)
    await user.type(name, 'Lighthouse')
    expect(page.getByRole('region', { name: 'Unsaved changes' })).toBeTruthy()
    // the preview shows the name as the apps will
    expect(page.getByRole('figure', { name: 'In the apps' }).textContent).toContain('Lighthouse')
    await user.click(page.getByRole('button', { name: 'Save' }))
    await settle()
    // the bar clears when the server's `server.updated` refetches the settings, which this fake
    // doesn't send
    expect(patches().at(-1)?.body).toMatchObject({ name: 'Lighthouse', defaultTheme: 'default' })
  })

  test('the default theme is a radio group, its choice saved with the rest', async () => {
    const { page, user } = await open()
    const group = page.getByRole('radiogroup', { name: 'Default theme' })
    const radios = within(group).getAllByRole('radio')
    expect(radios.length).toBeGreaterThan(1)
    expect(radios.filter((r) => r.getAttribute('aria-checked') === 'true')).toHaveLength(1)
    const other = radios.find((r) => r.getAttribute('aria-checked') !== 'true')
    if (!other) throw new Error('a second theme')
    await user.click(other)
    expect(other.getAttribute('aria-checked')).toBe('true')
    await user.click(page.getByRole('button', { name: 'Save' }))
    await settle()
    expect(patches().at(-1)?.body).toMatchObject({ defaultTheme: expect.any(String) })
    expect(
      (patches().at(-1)?.body as { defaultTheme?: string } | undefined)?.defaultTheme,
    ).not.toBe('default')
  })

  test('a new theme passes the contrast audit and joins the defaults', async () => {
    const { page, user } = await open()
    await user.click(page.getByRole('button', { name: 'New theme' }))
    const editor = within(page.getByRole('region', { name: 'New theme' }))
    await user.type(editor.getByLabelText('Name'), 'Driftwood')
    expect(editor.getByText('Passes')).toBeTruthy()
    await user.click(editor.getByRole('button', { name: 'Add theme' }))
    await settle()
    expect(state.themes.map((t) => t.name)).toEqual(['Driftwood'])
    expect(page.queryByRole('region', { name: 'New theme' })).toBeNull()
  })

  test('the accent: a colour well beside its value, with the audit’s word', async () => {
    const { page, user } = await open()
    await user.click(page.getByRole('switch', { name: 'Use a brand accent' }))
    // the well is the native side here (its label names the colour); a browser's is web's
    // `<input type="color">`, tested in packages/ui/test/native/field-web.test.tsx
    expect(page.getByLabelText(/^Accent color/)).toBeTruthy()
    const value = page.getByLabelText('Accent value')
    await user.clear(value)
    await user.type(value, '#c04040')
    expect(page.getByLabelText('Accent color: #c04040')).toBeTruthy()
    await user.clear(value)
    await user.type(value, 'nope')
    expect(page.getByText('Not a color')).toBeTruthy()
  })

  test('sounds: a switch for each kind of app, the volume a slider in percent', async () => {
    const { page, user } = await open()
    const web = page.getByRole('switch', { name: 'Web and desktop' })
    expect(web.getAttribute('aria-checked')).toBe('false')
    await user.click(web)
    expect(page.getByRole('slider', { name: 'Volume' }).getAttribute('aria-valuetext')).toBe('60%')
    // Listen previews each sound, even with sound off
    expect(page.getByRole('button', { name: 'Select' })).toBeTruthy()
    await user.click(page.getByRole('button', { name: 'Save' }))
    await settle()
    expect(patches().at(-1)?.body).toMatchObject({ sound: { web: true, volume: 0.6 } })
  })
})
