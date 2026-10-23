// SPDX-License-Identifier: AGPL-3.0-only
// A19 Collections (checkpoint 8d), rendered against a fake of the API: the list with what each
// holds; the editor, which checks before it saves, builds rules with groups and people, previews
// only the conditions that are filled in, and takes a draft from Movies › Save as smart
// collection; and a delete a featured section stands in the way of. The shell and Next's router
// are stood in for.
import './dom.ts'
import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'
import type { ReactNode } from 'react'

const pushed: string[] = []
mock.module('next/navigation', () => ({
  useRouter: () => ({ push: (path: string) => pushed.push(path) }),
  usePathname: () => '/collections',
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
const { createClient } = await import('@highsea-tv/sdk')
const { ClientProvider } = await import('@highsea-tv/sdk/react')
const { TooltipProvider } = await import('@highsea-tv/ui-web')
const { RULE_FIELDS, SmartCollectionInput } = await import('@highsea-tv/api-contract')
const { Collections } = await import('../src/admin/collections.tsx')
const { CollectionEditor, handoff } = await import('../src/admin/collections-editor.tsx')

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

const RULES = {
  kind: 'group',
  id: 'g-1',
  match: 'all',
  rules: [{ kind: 'condition', id: 'c-1', field: 'year', op: 'between', value: [2010, 2020] }],
}

const DECADE = {
  id: 'sc-1',
  name: '2010s',
  summary: '',
  artwork: null,
  rules: RULES,
  include: [],
  exclude: [],
  sort: 'rating',
  descending: true,
  limit: null,
  audience: { kind: 'everyone' },
  updatedAt: '2026-10-21T00:00:00.000Z',
  matched: 4,
  playable: 3,
  mosaic: [],
  words: 'Released 2010–2020',
  usedBy: [],
}

const PICKS = {
  ...DECADE,
  id: 'sc-2',
  name: 'Staff picks',
  rules: null,
  include: [45745],
  sort: 'manual',
  matched: 1,
  playable: 1,
  words: null,
  usedBy: [{ id: 'sec_1', title: 'Friday night' }],
}

/** Every field, as the server offers it, with a few choices. */
const FIELDS = Object.entries(RULE_FIELDS).map(([field, f]) => ({
  field,
  type: f.type,
  ops: f.ops,
  ...(field === 'videoCodec'
    ? {
        options: [
          { value: 'hevc', label: 'hevc' },
          { value: 'theora', label: 'theora' },
        ],
      }
    : f.type === 'choice' || f.type === 'list'
      ? {
          options: [
            { value: 'en', label: 'English' },
            { value: 'fr', label: 'French' },
          ],
        }
      : {}),
  ...(field === 'watched' || field === 'lastPlayed' ? { disabled: 'playback' } : {}),
}))

const PREVIEW = {
  matched: 2,
  playable: 1,
  items: [
    { id: 45745, title: 'Sintel', year: 2010, poster: null, playable: true },
    { id: 133701, title: 'Tears of Steel', year: 2012, poster: null, playable: false },
  ],
  words: 'Released 2010–2020',
}

type Req = { method: string; path: string; body: unknown }
let state: { collections: Record<string, unknown>[]; requests: Req[] }

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
    case 'GET /api/v1/curation/collections':
      return json(state.collections)
    case 'POST /api/v1/curation/collections':
      return json({ ...body, id: 'sc-3', updatedAt: '2026-10-22T00:00:00.000Z' }, 201)
    case 'GET /api/v1/curation/collections/fields':
      return json(FIELDS)
    case 'POST /api/v1/curation/collections/preview':
      // checked against the contract, as the server's validator does before the service sees it
      return SmartCollectionInput.safeParse((body as { collection: unknown }).collection).success
        ? json(PREVIEW)
        : json({ error: { code: 'invalid', message: 'That request isn’t valid.' } }, 400)
    case 'GET /api/v1/curation/collections/people':
      return json([{ id: 1245, name: 'Jan Morgenstern', photo: null, titles: 3 }])
    case 'DELETE /api/v1/curation/collections/sc-2':
      return json(
        {
          error: { code: 'conflict', message: 'The featured section “Friday night” draws on it.' },
        },
        409,
      )
  }
  const one = state.collections.find((c) => path === `/api/v1/curation/collections/${c.id}`)
  if (one && method === 'GET') return json(one)
  if (one && method === 'PUT') return json({ ...body, id: one.id, updatedAt: one.updatedAt })
  return json({ error: { code: 'not-found', message: `Nothing at ${path}.` } }, 404)
}

beforeEach(() => {
  pushed.length = 0
  handoff.draft = null
  state = { collections: [DECADE, PICKS], requests: [] }
})
afterEach(() => cleanup())

const settle = (rounds = 6) =>
  act(async () => {
    for (let i = 0; i < rounds; i++) await new Promise((r) => setTimeout(r, 0))
  })
/** Past the editor's debounce, so the preview and searches are asked for. */
const debounce = () =>
  act(async () => {
    await new Promise((r) => setTimeout(r, 250))
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
  await debounce()
  await settle()
  return { user: userEvent.setup(), page: within(document.body) }
}

const requested = (method: string, path: string) =>
  state.requests.filter((r) => r.method === method && r.path.split('?')[0] === path)

describe('Collections', () => {
  test('each collection says what it is, what it holds and who sees it', async () => {
    const { page } = await open(<Collections />)
    const list = within(page.getByRole('list', { name: 'Collections' }))
    expect(list.getByRole('link', { name: '2010s' })).toBeTruthy()
    expect(list.getByText('Smart')).toBeTruthy()
    expect(list.getByText('Released 2010–2020')).toBeTruthy()
    expect(list.getByText('4 films, 3 in the apps · Everyone')).toBeTruthy()
    expect(list.getByText('Picked')).toBeTruthy()
    expect(list.getByText('1 film, all in the apps · Everyone')).toBeTruthy()
  })

  test('no collections says what they’re for', async () => {
    state.collections = []
    const { user, page } = await open(<Collections />)
    expect(page.getByText('No collections yet')).toBeTruthy()
    await user.click(page.getByRole('button', { name: 'Make one' }))
    expect(pushed).toEqual(['/collections/new'])
  })

  test('a collection a section draws on isn’t deleted', async () => {
    const { user, page } = await open(<Collections />)
    await user.click(page.getByRole('button', { name: 'Delete Staff picks' }))
    await user.click(within(page.getByRole('alertdialog')).getByRole('button', { name: 'Delete' }))
    await settle()
    expect(requested('DELETE', '/api/v1/curation/collections/sc-2')).toHaveLength(1)
    expect(page.getByRole('link', { name: 'Staff picks' })).toBeTruthy()
  })
})

describe('the editor', () => {
  test('saving checks the name first, then saves the rules', async () => {
    const { user, page } = await open(<CollectionEditor id="new" />)
    const form = within(page.getByRole('form', { name: 'Collection' }))
    expect(form.getByText(/No conditions yet/)).toBeTruthy()
    await user.click(form.getByRole('button', { name: 'Save collection' }))
    expect(form.getByText('Give the collection a name. The apps show it.')).toBeTruthy()
    expect(requested('POST', '/api/v1/curation/collections')).toHaveLength(0)

    await user.type(form.getByLabelText('Name'), 'The 2010s')
    await user.click(form.getByRole('button', { name: 'Add a condition' }))
    expect(form.getByRole('combobox', { name: 'Condition 1: field' }).textContent).toBe('Year')
    await user.click(form.getByRole('button', { name: 'Save collection' }))
    await settle()
    const [post] = requested('POST', '/api/v1/curation/collections')
    expect(post?.body).toMatchObject({
      name: 'The 2010s',
      rules: { match: 'all', rules: [{ kind: 'condition', field: 'year', op: 'is', value: 2010 }] },
      sort: 'rating',
      descending: true,
      audience: { kind: 'everyone' },
    })
    expect(pushed).toEqual(['/collections'])
  })

  test('a new collection, with no conditions yet, previews every film', async () => {
    const { page } = await open(<CollectionEditor id="new" />)
    await debounce()
    await settle()
    expect(requested('POST', '/api/v1/curation/collections/preview').at(-1)?.body).toMatchObject({
      collection: { rules: { kind: 'group', rules: [] } },
    })
    const result = within(page.getByRole('region', { name: 'What it holds now' }))
    expect(result.getByText(/films match/)).toBeTruthy()
  })

  test('picked by hand with none picked, it holds nothing, without asking', async () => {
    const { user, page } = await open(<CollectionEditor id="new" />)
    const form = within(page.getByRole('form', { name: 'Collection' }))
    await debounce()
    await settle()
    // it starts from what the rules picked, every film; take them out
    await user.click(form.getByRole('radio', { name: 'Pick them' }))
    const picked = within(form.getByRole('list', { name: 'Picked films' }))
    for (const title of ['Sintel', 'Tears of Steel'])
      await user.click(picked.getByRole('button', { name: new RegExp(`^Remove ${title}`) }))
    await debounce()
    await settle()
    const result = within(page.getByRole('region', { name: 'What it holds now' }))
    expect(result.getByText(/No films match yet/)).toBeTruthy()
    expect(
      requested('POST', '/api/v1/curation/collections/preview').filter(
        (r) => (r.body as { collection: { rules: unknown } }).collection.rules === null,
      ),
    ).toHaveLength(0)
  })

  test('the live result leaves out a condition still being filled in', async () => {
    const { user, page } = await open(<CollectionEditor id="sc-1" />)
    const form = within(page.getByRole('form', { name: 'Collection' }))
    await user.click(form.getByRole('button', { name: 'Add a group' }))
    await debounce()
    await settle()
    const last = requested('POST', '/api/v1/curation/collections/preview').at(-1)
    expect(last?.body).toMatchObject({
      id: 'sc-1',
      collection: { rules: { rules: [{ field: 'year', op: 'between' }, { kind: 'group' }] } },
    })
    expect(form.getByRole('list', { name: 'Group 2' })).toBeTruthy()
    const result = within(page.getByRole('region', { name: 'What it holds now' }))
    expect(result.getByText(/films match/)).toBeTruthy()
    expect(result.getByRole('img', { name: 'Tears of Steel, no file yet' })).toBeTruthy()
  })

  test('a composer is found by name and kept as a TMDB id', async () => {
    const { user, page } = await open(<CollectionEditor id="sc-1" />)
    const form = within(page.getByRole('form', { name: 'Collection' }))
    await user.click(form.getByRole('combobox', { name: 'Condition 1: field' }))
    await user.click(page.getByRole('option', { name: 'Composer' }))
    await user.type(form.getByLabelText('Condition 1: value'), 'Jan')
    await debounce()
    await settle()
    expect(requested('GET', '/api/v1/curation/collections/people').at(-1)?.path).toContain(
      'field=composer',
    )
    await user.click(form.getByRole('button', { name: /Jan Morgenstern/ }))
    expect(form.getByRole('list', { name: 'Condition 1: value: chosen' })).toBeTruthy()
    await user.click(form.getByRole('button', { name: 'Save changes' }))
    await settle()
    const [put] = requested('PUT', '/api/v1/curation/collections/sc-1')
    expect(put?.body).toMatchObject({
      rules: { rules: [{ field: 'composer', op: 'includes', value: ['1245'] }] },
    })
  })

  test('a codec is named in the admin’s words, or as the file says when it isn’t known', async () => {
    const { user, page } = await open(<CollectionEditor id="sc-1" />)
    await user.click(page.getByRole('combobox', { name: 'Condition 1: field' }))
    await user.click(page.getByRole('option', { name: 'Video codec' }))
    expect(page.getByRole('combobox', { name: 'Condition 1: value' }).textContent).toBe('HEVC')
    await user.click(page.getByRole('combobox', { name: 'Condition 1: value' }))
    expect(page.getByRole('option', { name: 'theora' })).toBeTruthy()
  })

  test('watch state shows, but can’t be chosen yet', async () => {
    const { user, page } = await open(<CollectionEditor id="sc-1" />)
    await user.click(page.getByRole('combobox', { name: 'Condition 1: field' }))
    const watched = page.getByRole('option', { name: 'Watched · comes with playback' })
    expect(watched.getAttribute('aria-disabled')).toBe('true')
  })

  test('Movies › Save as smart collection hands over its filters', async () => {
    handoff.draft = {
      rules: {
        kind: 'group',
        id: 'g-x',
        match: 'all',
        rules: [{ kind: 'condition', id: 'c-x', field: 'title', op: 'contains', value: 'Dead' }],
      },
      sort: 'year',
      descending: true,
    }
    const { page } = await open(<CollectionEditor id="new" />)
    const form = within(page.getByRole('form', { name: 'Collection' }))
    expect(form.getByRole('combobox', { name: 'Condition 1: field' }).textContent).toBe('Title')
    expect((form.getByLabelText('Condition 1: value') as HTMLInputElement).value).toBe('Dead')
    expect(form.getByRole('combobox', { name: 'Sort by' }).textContent).toBe('Year')
    expect(handoff.draft).toBeNull()
  })

  test('picking by hand starts from what the rules matched', async () => {
    const { user, page } = await open(<CollectionEditor id="sc-1" />)
    const form = within(page.getByRole('form', { name: 'Collection' }))
    await user.click(form.getByRole('radio', { name: 'Pick them' }))
    const picked = within(form.getByRole('list', { name: 'Picked films' }))
    expect(picked.getByText('Sintel')).toBeTruthy()
    expect(picked.getByText('Tears of Steel')).toBeTruthy()
    expect(form.getByRole('combobox', { name: 'Sort by' }).textContent).toBe('In your order')
  })
})
