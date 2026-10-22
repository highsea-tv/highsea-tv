// SPDX-License-Identifier: AGPL-3.0-only
// Checkpoint 8c's editors against a fake of the API: a profile's (the wait before grabbing saved
// with the rest, a name the server refuses shown under the field, a new one going to its own page),
// a format's (a preset's note, the test box judging the draft, the save) and the sizes' (a row
// checked before saving, Reset to TRaSH's). The shell and Next's router are stood in for.
import './dom.ts'
import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'
import type { ReactNode } from 'react'

const navigated: string[] = []
mock.module('next/navigation', () => ({
  useRouter: () => ({
    push: (to: string) => navigated.push(to),
    replace: (to: string) => navigated.push(to),
  }),
  usePathname: () => '/',
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
      <div>{actions}</div>
      {children}
    </main>
  ),
}))

const { act, cleanup, fireEvent, render, within } = await import('@testing-library/react')
const { default: userEvent } = await import('@testing-library/user-event')
const { createClient } = await import('@highsea-tv/sdk')
const { ClientProvider } = await import('@highsea-tv/sdk/react')
const { TooltipProvider } = await import('@highsea-tv/ui-web')
const { defaultQualitySizes } = await import('@highsea-tv/quality/browser')
const { FormatEditor, ProfileEditor, SizeEditor } = await import('../src/admin/quality-editors.tsx')

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const failure = (code: string, message: string, status: number, details?: unknown) =>
  json({ error: { code, message, details } }, status)

const profile = () => ({
  id: 'qp-hd',
  name: 'HD 1080p',
  items: [
    { name: 'Remux-1080p', qualities: ['Remux-1080p'], allowed: false },
    { name: 'Bluray-1080p', qualities: ['Bluray-1080p'], allowed: true },
    { name: 'WEB 1080p', qualities: ['WEBDL-1080p', 'WEBRip-1080p'], allowed: true },
  ],
  cutoff: 'Bluray-1080p',
  upgradeAllowed: true,
  minFormatScore: 0,
  cutoffFormatScore: 10000,
  minUpgradeFormatScore: 1,
  formats: [{ formatId: 'cf-x265', score: -100 }],
  language: 'original',
  waitMinutes: 0,
  builtIn: true,
})

const x265 = () => ({
  id: 'cf-x265',
  name: 'x265',
  source: 'preset',
  trashId: 'abc',
  edited: false,
  conditions: [
    { kind: 'title', name: 'x265', value: '[xh][ .]?265|hevc', negate: false, required: false },
  ],
})

type Request = { method: string; path: string; body: unknown }
let requests: Request[] = []
let profiles = [profile()]
let formats = [x265()]
let sizes = [
  { quality: 'Bluray-1080p', min: 50.4, preferred: 95, max: 400 },
  {
    quality: 'Remux-2160p',
    min: 204.4,
    preferred: null as number | null,
    max: null as number | null,
  },
]

async function api(url: string, init: RequestInit = {}): Promise<Response> {
  const u = new URL(url, 'http://localhost')
  const method = init.method ?? 'GET'
  const path = u.pathname
  if (path === '/api/v1/events')
    return new Response(new ReadableStream(), { headers: { 'content-type': 'text/event-stream' } })
  const body = init.body ? JSON.parse(String(init.body)) : undefined
  requests.push({ method, path, body })
  switch (`${method} ${path}`) {
    case 'GET /api/v1/qualityprofiles':
      return json(profiles)
    case 'POST /api/v1/qualityprofiles': {
      const made = { ...profile(), ...body, id: 'qp-new', builtIn: false }
      profiles = [...profiles, made]
      return json(made, 201)
    }
    case 'PUT /api/v1/qualityprofiles/qp-hd':
      if (body.name === 'Ultra HD')
        return failure('conflict', 'There’s a profile called Ultra HD already.', 409, {
          reason: 'name-taken',
        })
      profiles = [{ ...profile(), ...body }]
      return json(profiles[0])
    case 'GET /api/v1/customformats':
      return json(formats)
    case 'PUT /api/v1/customformats/cf-x265':
      formats = [{ ...x265(), ...body, edited: true }]
      return json(formats[0])
    case 'GET /api/v1/settings/qualitySizes':
      return json(sizes)
    case 'PUT /api/v1/settings/qualitySizes':
      sizes = body
      return json(sizes)
  }
  return failure('not-found', `No fake for ${method} ${path}`, 404)
}

beforeEach(() => {
  requests = []
  navigated.length = 0
  profiles = [profile()]
  formats = [x265()]
  sizes = [
    { quality: 'Bluray-1080p', min: 50.4, preferred: 95, max: 400 },
    { quality: 'Remux-2160p', min: 204.4, preferred: null, max: null },
  ]
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

const sent = (method: string, path: string) =>
  requests.filter((r) => r.method === method && r.path === path).map((r) => r.body)

const field = (page: ReturnType<typeof within>, label: string) =>
  page.getByLabelText(label, { selector: 'input' }) as HTMLInputElement

// The profile editor lists every quality, each with a menu, so these look by selector: the
// accessible-name queries take minutes over a page that size under happy-dom.
const button = (name: string) => {
  const found = [...document.querySelectorAll('button')].find(
    (b) => (b.getAttribute('aria-label') ?? b.textContent?.trim()) === name,
  )
  if (!found) throw new Error(`No button called ${name}`)
  return found
}
const hasButton = (name: string) =>
  [...document.querySelectorAll('button')].some(
    (b) => (b.getAttribute('aria-label') ?? b.textContent?.trim()) === name,
  )
const saveBar = () => document.querySelector('section[aria-label="Unsaved changes"]')
const heading = () => document.querySelector('h1')?.textContent

describe('Settings › Profiles › a profile', () => {
  test('loads the profile; the wait is saved with the rest, scores of 0 left out', async () => {
    const { page, user } = await open(<ProfileEditor id="qp-hd" />)
    expect(heading()).toBe('Edit HD 1080p')
    expect(saveBar()).toBeNull()
    const wait = field(page, 'Wait before grabbing')
    expect(wait.value).toBe('0')
    fireEvent.change(wait, { target: { value: '120' } })
    fireEvent.change(field(page, 'x265: score'), { target: { value: '0' } })
    await user.click(button('Save'))
    await settle()
    expect(sent('PUT', '/api/v1/qualityprofiles/qp-hd')).toEqual([
      expect.objectContaining({ name: 'HD 1080p', waitMinutes: 120, formats: [] }),
    ])
    // saved: the draft is the profile again
    expect(saveBar()).toBeNull()
  })

  test('a wait over a week, and a name the server refuses, show under their fields', async () => {
    const { page, user } = await open(<ProfileEditor id="qp-hd" />)
    fireEvent.change(field(page, 'Wait before grabbing'), { target: { value: '20000' } })
    expect(page.getByText('Between 0 and 10080 minutes.')).toBeTruthy()
    await user.click(button('Save'))
    expect(sent('PUT', '/api/v1/qualityprofiles/qp-hd')).toEqual([])

    fireEvent.change(field(page, 'Wait before grabbing'), { target: { value: '60' } })
    const name = field(page, 'Name')
    await user.clear(name)
    await user.type(name, 'Ultra HD')
    await user.click(button('Save'))
    await settle()
    expect(page.getByText('There’s a profile called Ultra HD already.')).toBeTruthy()
  })

  test('a new one starts from HD Bluray + WEB, needs a name, then goes to its own page', async () => {
    const { page, user } = await open(<ProfileEditor id="new" />)
    expect(heading()).toBe('New profile')
    expect(hasButton('Delete')).toBe(false)
    await user.click(button('Save'))
    expect(page.getByText('Give the profile a name.')).toBeTruthy()
    expect(sent('POST', '/api/v1/qualityprofiles')).toEqual([])

    await user.type(field(page, 'Name'), 'Mine')
    await user.click(button('Save'))
    await settle()
    const [body] = sent('POST', '/api/v1/qualityprofiles') as Record<string, unknown>[]
    expect(body).toMatchObject({ name: 'Mine', cutoff: 'Bluray-1080p', waitMinutes: 0 })
    expect(body?.id).toBeUndefined()
    expect(navigated).toEqual(['/settings/profiles/qp-new'])
  })

  test('one that isn’t there says so', async () => {
    const { page } = await open(<ProfileEditor id="qp-gone" />)
    expect(page.getByText('There’s nothing here')).toBeTruthy()
  })
})

describe('Settings › Profiles › a format', () => {
  test('a preset says saving makes it yours; the test box judges the draft; Save sends it', async () => {
    const { page, user } = await open(<FormatEditor id="cf-x265" />)
    expect(page.getByText(/Saving a change makes it yours/)).toBeTruthy()
    const test = within(
      document.querySelector('section[aria-label="Try a release name"]') as HTMLElement,
    )
    // the default name is HEVC: it matches
    expect(test.getByText('Matches')).toBeTruthy()

    const pattern = field(page, 'Matches')
    fireEvent.change(pattern, { target: { value: '\\bav1\\b' } })
    expect(test.getByText('Doesn’t match')).toBeTruthy()
    fireEvent.change(pattern, { target: { value: '(' } })
    expect(page.getByText('“(” isn’t a valid regular expression')).toBeTruthy()
    await user.click(button('Save'))
    expect(sent('PUT', '/api/v1/customformats/cf-x265')).toEqual([])

    fireEvent.change(pattern, { target: { value: 'hevc' } })
    await user.click(button('Save'))
    await settle()
    expect(sent('PUT', '/api/v1/customformats/cf-x265')).toEqual([
      { name: 'x265', conditions: [expect.objectContaining({ kind: 'title', value: 'hevc' })] },
    ])
    // now it's yours
    expect(page.getByText(/Yours, changed from the catalog’s/)).toBeTruthy()
  })
})

describe('Settings › Quality › Edit sizes', () => {
  test('a row is checked before saving; the whole table is sent', async () => {
    const { page, user } = await open(<SizeEditor />)
    const min = page.getByLabelText('Bluray-1080p: minimum MB per minute') as HTMLInputElement
    expect(min.value).toBe('50.4')
    fireEvent.change(min, { target: { value: '500' } })
    expect(page.getByRole('alert')).toBeTruthy()
    await user.click(button('Save'))
    expect(sent('PUT', '/api/v1/settings/qualitySizes')).toEqual([])

    fireEvent.change(min, { target: { value: '60' } })
    fireEvent.change(page.getByLabelText('Remux-2160p: maximum MB per minute'), {
      target: { value: '1000' },
    })
    await user.click(button('Save'))
    await settle()
    expect(sent('PUT', '/api/v1/settings/qualitySizes')).toEqual([
      [
        { quality: 'Bluray-1080p', min: 60, preferred: 95, max: 400 },
        { quality: 'Remux-2160p', min: 204.4, preferred: null, max: 1000 },
      ],
    ])
  })

  test('Reset to TRaSH’s sizes is a draft until saved', async () => {
    const { user } = await open(<SizeEditor />)
    await user.click(button('Reset to TRaSH’s sizes'))
    await settle()
    expect(saveBar()).toBeTruthy()
    expect(document.querySelectorAll('tr')).toHaveLength(defaultQualitySizes().length + 1)
    expect(sent('PUT', '/api/v1/settings/qualitySizes')).toEqual([])
    await user.click(button('Discard'))
    await settle()
    expect(document.querySelectorAll('tr')).toHaveLength(3)
  })
})
