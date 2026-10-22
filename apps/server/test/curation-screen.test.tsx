// SPDX-License-Identifier: AGPL-3.0-only
// A11 Curation (checkpoint 8c), rendered against a fake of the API: the announcements with how far
// each has reached, ended from its menu; the sections in their order; the announcement composer,
// which checks before it publishes and previews the draft; the section composer with a rule; the
// dashboard's Announcement widget; and the admin's own banner, dismissed once. The shell and
// Next's router are stood in for.
import './dom.ts'
import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'
import type { ReactNode } from 'react'

const pushed: string[] = []
mock.module('next/navigation', () => ({
  useRouter: () => ({ push: (path: string) => pushed.push(path) }),
  usePathname: () => '/curation',
  useSearchParams: () => new URLSearchParams(),
}))
mock.module('../src/admin/shell.tsx', () => ({
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
const { createClient } = await import('@highsea/sdk')
const { ClientProvider } = await import('@highsea/sdk/react')
const { TooltipProvider } = await import('@highsea/ui-web')
const { Curation } = await import('../src/admin/curation.tsx')
const { AnnouncementEditor } = await import('../src/admin/curation-announcement.tsx')
const { SectionEditor } = await import('../src/admin/curation-section.tsx')
const { AnnouncementBanners } = await import('../src/admin/announcement-banners.tsx')
const { widgetRenderers } = await import('../src/admin/widgets.tsx')

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

const OWNER = {
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
}

const hourAgo = () => new Date(Date.now() - 3_600_000).toISOString()

const ANNOUNCEMENT = {
  id: 'ann_1',
  title: 'Movie night',
  body: 'Friday at **8**.',
  image: null,
  cta: null,
  severity: 'notice',
  placements: ['banner', 'card'],
  audience: { kind: 'everyone' },
  schedule: { start: hourAgo(), end: null },
  acknowledgement: 'dismiss',
  status: 'live',
  seenBy: 1,
  audienceSize: 3,
}

const SECTION = {
  id: 'sec_1',
  title: 'Staff picks',
  tagline: 'by Ines',
  layout: 'row',
  source: { kind: 'manual', itemIds: [45745] },
  overrides: [],
  audience: { kind: 'everyone' },
  schedule: { start: hourAgo(), end: null },
  order: 0,
  status: 'live',
  itemCount: 1,
  sample: [{ id: 45745, title: 'Sintel', poster: null }],
}

type Req = { method: string; path: string; body: unknown }
let state: {
  announcements: Record<string, unknown>[]
  sections: Record<string, unknown>[]
  active: Record<string, unknown>[]
  requests: Req[]
}

async function api(url: string, init: RequestInit = {}): Promise<Response> {
  const u = new URL(url, 'http://localhost')
  const method = init.method ?? 'GET'
  const path = u.pathname
  if (path === '/api/v1/events')
    return new Response(new ReadableStream(), { headers: { 'content-type': 'text/event-stream' } })
  const body = init.body ? JSON.parse(String(init.body)) : undefined
  state.requests.push({ method, path: path + u.search, body })
  switch (`${method} ${path}`) {
    case 'GET /api/v1/auth/session':
      return json({ user: OWNER, deviceId: 'dev_1', expiresAt: null, method: 'password' })
    case 'GET /api/v1/users':
      return json([OWNER])
    case 'GET /api/v1/system/info/public':
      return json({
        id: 'srv_1',
        name: 'Harbor',
        version: '0.4.0',
        setupComplete: true,
        auth: { oidc: false, passkeys: true },
        sources: ['movies', 'curation'],
        attributions: [],
      })
    case 'GET /api/v1/movies':
      return json({ items: [], total: 0 })
    case 'GET /api/v1/curation/announcements':
      return json(state.announcements)
    case 'POST /api/v1/curation/announcements': {
      const { draft, ...rest } = body
      return json({ ...rest, id: 'ann_2', status: draft ? 'draft' : 'live' }, 201)
    }
    case 'GET /api/v1/curation/sections':
      return json(state.sections)
    case 'POST /api/v1/curation/sections':
      return json({ ...body, id: 'sec_2', order: 1 }, 201)
    case 'PUT /api/v1/curation/sections/order':
      return new Response(null, { status: 204 })
    case 'POST /api/v1/curation/sections/resolve':
      return json({ items: [], total: 4 })
    case 'GET /api/v1/curation/rule-options':
      return json({ genres: ['Animation', 'Fantasy'], collections: [] })
    case 'POST /api/v1/curation/preview':
      return json({ sections: [], announcements: [], reaches: true })
    case 'GET /api/v1/announcements':
      return json(state.active)
  }
  if (method === 'POST' && path.endsWith('/end')) {
    state.announcements = state.announcements.map((a) =>
      a.id === path.split('/').at(-2) ? { ...a, status: 'ended' } : a,
    )
    return json(state.announcements[0])
  }
  if (method === 'POST' && path.endsWith('/seen')) {
    state.active = state.active.map((a) => ({ ...a, seen: true }))
    return new Response(null, { status: 204 })
  }
  return json({ error: { code: 'not-found', message: `Nothing at ${path}.` } }, 404)
}

beforeEach(() => {
  pushed.length = 0
  state = { announcements: [ANNOUNCEMENT], sections: [SECTION], active: [], requests: [] }
})
afterEach(() => cleanup())

const settle = (rounds = 6) =>
  act(async () => {
    for (let i = 0; i < rounds; i++) await new Promise((r) => setTimeout(r, 0))
  })
/** Past the composer's debounce, so the preview and the rule's picks are asked for. */
const debounce = () =>
  act(async () => {
    await new Promise((r) => setTimeout(r, 200))
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

const requested = (method: string, path: string) =>
  state.requests.filter((r) => r.method === method && r.path === path)

describe('Curation', () => {
  test('an announcement’s row shows how far it has reached, and End now ends it', async () => {
    const { user, page } = await open(<Curation />)
    const list = within(page.getByRole('list', { name: 'Announcements' }))
    expect(list.getByText('Movie night')).toBeTruthy()
    expect(list.getByText('Live')).toBeTruthy()
    expect(list.getByText('1 of 3')).toBeTruthy()
    await user.click(list.getByRole('button', { name: 'More for Movie night' }))
    await user.click(page.getByRole('menuitem', { name: 'End now' }))
    await settle()
    expect(requested('POST', '/api/v1/curation/announcements/ann_1/end')).toHaveLength(1)
  })

  test('no announcements says what they’re for', async () => {
    state.announcements = []
    const { page } = await open(<Curation />)
    expect(page.getByText('No announcements yet')).toBeTruthy()
  })

  test('the sections, in their home-screen order, with what each picks', async () => {
    const { page } = await open(<Curation tab="featured" />)
    const list = within(page.getByRole('list', { name: 'Featured sections' }))
    expect(list.getByText('Staff picks')).toBeTruthy()
    expect(list.getByText('by Ines')).toBeTruthy()
    expect(list.getByText(/Picked by hand/)).toBeTruthy()
    expect(list.getByText('1 title')).toBeTruthy()
    expect(list.getByRole('img', { name: 'Sintel' })).toBeTruthy()
  })
})

describe('the announcement composer', () => {
  test('publishing checks the title first, then saves and previews the draft', async () => {
    const { user, page } = await open(<AnnouncementEditor id="new" />)
    const form = within(page.getByRole('form', { name: 'Announcement' }))
    await user.click(form.getByRole('button', { name: 'Publish' }))
    expect(form.getByText('Give it a title. It’s the first thing people read.')).toBeTruthy()
    expect(requested('POST', '/api/v1/curation/announcements')).toHaveLength(0)

    await user.type(form.getByLabelText('Title'), 'Restart tonight')
    await debounce()
    await settle()
    const previews = requested('POST', '/api/v1/curation/preview')
    expect(previews.at(-1)?.body).toMatchObject({
      userId: 'usr_owner',
      draft: { kind: 'announcement', announcement: { title: 'Restart tonight', draft: false } },
    })

    await user.click(form.getByRole('button', { name: 'Publish' }))
    await settle()
    const [post] = requested('POST', '/api/v1/curation/announcements')
    expect(post?.body).toMatchObject({
      title: 'Restart tonight',
      placements: ['banner', 'card'],
      audience: { kind: 'everyone' },
      acknowledgement: 'dismiss',
      draft: false,
    })
    expect(pushed).toEqual(['/curation'])
  })

  test('a draft needs only its title', async () => {
    const { user, page } = await open(<AnnouncementEditor id="new" />)
    const form = within(page.getByRole('form', { name: 'Announcement' }))
    await user.type(form.getByLabelText('Title'), 'Half written')
    await user.click(form.getByRole('checkbox', { name: /Banner/ }))
    await user.click(form.getByRole('checkbox', { name: /Home card/ }))
    await user.click(form.getByRole('button', { name: 'Save as draft' }))
    await settle()
    const [post] = requested('POST', '/api/v1/curation/announcements')
    expect(post?.body).toMatchObject({ title: 'Half written', placements: [], draft: true })
  })
})

describe('the section composer', () => {
  test('a hand-picked section needs a title, and a rule shows what it picks', async () => {
    const { user, page } = await open(<SectionEditor id="new" />)
    const form = within(page.getByRole('form', { name: 'Featured section' }))
    await user.click(form.getByRole('button', { name: 'Add to home' }))
    expect(form.getByText('Add at least one title.')).toBeTruthy()

    await user.type(form.getByLabelText('Title'), 'Fresh in')
    await user.click(form.getByRole('radio', { name: 'Use a rule' }))
    await debounce()
    await settle()
    expect(requested('POST', '/api/v1/curation/sections/resolve').at(-1)?.body).toEqual({
      source: { kind: 'rule', rule: 'recently-added', value: '30d' },
    })
    expect(form.getByText(/Right now this picks 4 titles/)).toBeTruthy()

    await user.click(form.getByRole('button', { name: 'Add to home' }))
    await settle()
    const [post] = requested('POST', '/api/v1/curation/sections')
    expect(post?.body).toMatchObject({
      title: 'Fresh in',
      layout: 'row',
      source: { kind: 'rule', rule: 'recently-added', value: '30d' },
    })
    expect(pushed).toEqual(['/curation/featured'])
  })
})

describe('around the admin', () => {
  test('the dashboard’s Announcement widget shows the live one', async () => {
    const Widget = widgetRenderers.announcement
    const { page } = await open(
      <Widget frame={{ span: 2, rows: 3, 'data-widget-id': 'a' } as never} settings={{}} />,
    )
    expect(page.getByText('Movie night')).toBeTruthy()
    expect(page.getByText(/Everyone · banner \+ card/)).toBeTruthy()
    expect(page.getByText('Friday at 8.')).toBeTruthy()
  })

  test('the admin’s banner is dismissed once, for this person', async () => {
    const { id, title, body, image, cta, severity, placements, audience, schedule } = ANNOUNCEMENT
    state.active = [
      {
        ...{ id, title, body, image, cta, severity, placements, audience, schedule },
        acknowledgement: 'dismiss',
        seen: false,
      },
    ]
    const { user, page } = await open(<AnnouncementBanners />)
    expect(requested('GET', '/api/v1/announcements?client=admin')).toHaveLength(1)
    const banner = within(page.getByRole('region', { name: 'Movie night' }))
    await user.click(banner.getByRole('button', { name: 'Dismiss' }))
    await settle()
    expect(requested('POST', '/api/v1/announcements/ann_1/seen')).toHaveLength(1)
  })
})
