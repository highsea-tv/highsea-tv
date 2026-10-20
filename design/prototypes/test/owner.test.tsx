// SPDX-License-Identifier: AGPL-3.0-only
// Checkpoint 4 flows: curation (A11), appearance (A12), users and devices (A13), the reference
// admin pages (A14–A17) and the clients' search, settings and profile (C6–C8). Each step that
// changes the screen is checked with axe, and its classes join the stylesheet check.
import './dom.ts'
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { act, cleanup, render, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { memoryLocation } from 'wouter/memory-location'
import { createClient, createMock, type Mock } from '../src/mock/client.ts'
import { applyPreview } from '../src/mock/server.ts'
import { defaultState, type Role } from '../src/proto/state.ts'
import { ScreenApp } from '../src/screen/screen.tsx'
import { classes, collect, unknownClasses, violations } from './check.ts'

beforeEach(() => {
  localStorage.clear()
  history.replaceState(null, '')
})
afterEach(() => cleanup())

const page = () => within(document.body)

const settle = () =>
  act(async () => {
    for (let i = 0; i < 4; i++) await new Promise((r) => setTimeout(r, 0))
  })

async function open(path: string, role: Role = 'owner') {
  const mock = createMock()
  const location = memoryLocation({ path, record: true })
  const state = { ...defaultState, data: 'populated' as const, role, time: 'pause' as const }
  await act(async () => {
    render(<ScreenApp mock={mock} state={state} hook={location.hook} latency={0} />)
  })
  await settle()
  return { mock, location, user: userEvent.setup() }
}

const client = (mock: Mock, role: Role = 'owner') =>
  createClient(mock, { data: 'populated', role, latency: 0 })

async function clean(modal?: Element) {
  collect()
  expect(await violations(modal)).toEqual([])
}

describe('A11 curation', () => {
  test('announcements show their reach; a new one goes live for its audience only', async () => {
    const { mock, location, user } = await open('/admin/curation')
    const list = within(page().getByRole('list', { name: 'Announcements' }))
    expect(list.getByText('Seen by')).toBeTruthy()
    expect(list.getByText('2 of 5')).toBeTruthy()
    await clean()

    await user.click(page().getByRole('button', { name: 'New announcement' }))
    await settle()
    expect(location.history?.at(-1)).toBe('/admin/curation/announcements/new')
    expect(page().getByTitle(/TV home, previewed as Ines/)).toBeTruthy()
    await clean()

    // nothing is saved while the form is invalid, and it says why
    await user.click(page().getByRole('button', { name: 'Publish' }))
    expect(page().getByText(/Give it a title/)).toBeTruthy()

    await user.type(page().getByLabelText('Title'), 'Pizza night')
    await user.type(page().getByLabelText('Message'), 'In the **kitchen** at 7.')
    await user.click(page().getByRole('radio', { name: 'Roles' }))
    // owners and admins by default; Ruth is a user, so the preview says she won't see it
    await user.click(page().getByRole('combobox', { name: 'Preview as' }))
    await user.click(page().getByRole('option', { name: 'Ruth (user)' }))
    expect(page().getByText(/Ruth isn’t in the audience on a TV/)).toBeTruthy()
    await user.click(page().getByRole('button', { name: 'Publish' }))
    await settle()
    expect(location.history?.at(-1)).toBe('/admin/curation')

    const owner = await client(mock).announcements.active('web')
    const ruth = await client(mock, 'user').announcements.active('web')
    expect(owner.some((a) => a.title === 'Pizza night')).toBe(true)
    expect(ruth.some((a) => a.title === 'Pizza night')).toBe(false)
    await clean()
  })

  test('a scheduled announcement waits; ending one takes it off every screen', async () => {
    const { mock } = await open('/admin/curation')
    const c = client(mock)
    const now = mock.clock.now()
    const [base] = await c.curation.announcements()
    if (!base) throw new Error('seed has announcements')
    const later = await c.curation.saveAnnouncement({
      ...base,
      id: 'an-later',
      title: 'Later',
      schedule: { start: new Date(now + 3_600_000).toISOString(), end: null },
    })
    expect(later.status).toBe('scheduled')
    expect((await c.announcements.active('web')).some((a) => a.id === 'an-later')).toBe(false)
    mock.clock.advance(3601)
    expect((await c.announcements.active('web')).some((a) => a.id === 'an-later')).toBe(true)
    await c.curation.endAnnouncement('an-later')
    expect((await c.announcements.active('web')).some((a) => a.id === 'an-later')).toBe(false)
    expect((await c.curation.announcements()).find((a) => a.id === 'an-later')?.status).toBe(
      'ended',
    )
  })

  test('featured sections: reorder, and a rule section resolves as the library is', async () => {
    const { mock, user } = await open('/admin/curation/featured')
    const sections = () =>
      within(page().getByRole('list', { name: 'Featured sections' }))
        .getAllByRole('link')
        .map((a) => a.textContent)
        .filter((t) => t !== 'Edit')
    expect(sections()).toEqual([
      'Featured on Harbor',
      'Staff picks',
      'The silent era',
      'Recently added',
    ])
    await clean()
    // the drag handle's keyboard model: Space picks it up, Up moves it, Space drops it
    act(() => page().getByRole('button', { name: 'Move Recently added' }).focus())
    await user.keyboard(' {ArrowUp} ')
    await settle()
    expect(sections()).toEqual([
      'Featured on Harbor',
      'Staff picks',
      'Recently added',
      'The silent era',
    ])
    const home = await client(mock).home.sections('web')
    expect(home.map((s) => s.title)).toEqual([
      'Featured on Harbor',
      'Continue watching',
      'Staff picks',
      'Recently added',
      'The silent era',
    ])

    // a collection rule picks only that collection's parts
    const c = client(mock)
    const picked = await c.curation.resolve({
      ...(await c.curation.section('fs-recent')),
      source: { kind: 'rule', rule: 'collection', value: 'caminandes' },
    })
    expect(picked.map((m) => m.title).every((t) => t.startsWith('Caminandes'))).toBe(true)
    expect(picked.length).toBeGreaterThan(0)
  })

  test('the section composer: pick titles, and the preview gets the draft in place', async () => {
    const { user } = await open('/admin/curation/featured/new')
    await user.type(page().getByLabelText('Title'), 'Llamas')
    await user.type(page().getByLabelText('Add titles'), 'caminandes')
    await settle()
    const matches = within(page().getByRole('list', { name: 'Matching titles' }))
    await user.click(matches.getAllByRole('button')[0] as HTMLElement)
    expect(
      within(page().getByRole('list', { name: 'Picked titles' })).getAllByRole('listitem'),
    ).toHaveLength(1)
    await clean()
    await user.click(page().getByRole('radio', { name: 'Use a rule' }))
    // the composer asks the server once the draft settles
    await act(() => new Promise((r) => setTimeout(r, 200)))
    await settle()
    expect(page().getByText(/Right now this picks \d+ titles/)).toBeTruthy()
    await clean()
  })

  test('a preview server shows the draft as if it were saved', async () => {
    const mock = createMock()
    const c = client(mock)
    const snapshot = await c.curation.snapshot()
    const hero = snapshot.featured.find((f) => f.layout === 'hero')
    if (!hero) throw new Error('seed has a hero')
    applyPreview(mock.servers.populated, {
      announcements: [],
      featured: [{ ...hero, title: 'Drafted hero' }],
    })
    const home = await c.home.sections('tvos')
    expect(home[0]?.title).toBe('Drafted hero')
    expect(await c.announcements.active('tvos')).toEqual([])
  })

  test('a user gets the refusal page, not curation', async () => {
    await open('/admin/curation', 'user')
    expect(page().getByText('This is where the server’s owner and admins run it')).toBeTruthy()
    expect(page().getByRole('button', { name: 'Sign out' })).toBeTruthy()
    expect(page().queryByRole('navigation')).toBeNull()
    await clean()
  })
})

describe('A12 appearance', () => {
  test('renaming the server reaches every app; a new theme joins the defaults', async () => {
    const { mock, user } = await open('/admin/settings/appearance')
    await clean()
    const name = page().getByLabelText('Name')
    await user.clear(name)
    await user.type(name, 'Lighthouse')
    expect(page().getByRole('region', { name: 'Unsaved changes' })).toBeTruthy()
    await user.click(page().getByRole('button', { name: 'Save' }))
    await settle()
    expect((await client(mock, 'user').system.server()).name).toBe('Lighthouse')
    expect(page().queryByRole('region', { name: 'Unsaved changes' })).toBeNull()

    await user.click(page().getByRole('button', { name: 'New theme' }))
    const editor = within(page().getByRole('region', { name: 'New theme' }))
    await user.type(editor.getByLabelText('Name'), 'Driftwood')
    expect(editor.getByText('Passes')).toBeTruthy()
    await clean()
    await user.click(editor.getByRole('button', { name: 'Add theme' }))
    await settle()
    expect(page().getByRole('radio', { name: /Driftwood/ })).toBeTruthy()
    expect(mock.servers.populated.state.appearance.themes.map((t) => t.name)).toContain('Driftwood')
  })
})

describe('A13 users and devices', () => {
  test('invite by link, change what someone can do, sign a device out, make a key that shows once', async () => {
    const { mock, user } = await open('/admin/settings/users')
    await clean()
    await user.click(page().getByRole('button', { name: 'Invite someone' }))
    const invite = page().getByRole('dialog', { name: 'Invite someone' })
    await clean(invite)
    await user.type(within(invite).getByLabelText('Name'), 'Mara')
    await user.click(within(invite).getByRole('button', { name: 'Create invite link' }))
    await settle()
    const sent = page().getByRole('dialog', { name: 'Mara is invited' })
    expect(within(sent).getByText(/harbor\.example\.net\/invite\//)).toBeTruthy()
    await user.click(within(sent).getByRole('button', { name: 'Done' }))
    await settle()
    const row = page().getByRole('row', { name: /Mara/ })
    expect(within(row).getByText('Invited')).toBeTruthy()

    await user.click(page().getByRole('button', { name: 'Edit Sam' }))
    const sheet = () => page().getByRole('dialog', { name: 'Sam' })
    await clean(sheet())
    // what a user can do, and their libraries, are set per person; an admin holds every power
    await user.click(within(sheet()).getByRole('combobox', { name: 'Role' }))
    await user.click(page().getByRole('option', { name: 'Admin' }))
    expect(within(sheet()).queryByText('What they can do')).toBeNull()
    expect(within(sheet()).queryByRole('radiogroup', { name: 'Libraries' })).toBeNull()
    await user.click(within(sheet()).getByRole('combobox', { name: 'Role' }))
    await user.click(page().getByRole('option', { name: 'User' }))
    await user.click(within(sheet()).getByRole('checkbox', { name: 'Download for offline' }))
    await user.click(within(sheet()).getByRole('button', { name: 'Save' }))
    await settle()
    const sam = mock.servers.populated.state.users.find((u) => u.username === 'sam')
    expect(sam?.role).toBe('user')
    expect(sam?.permissions).toEqual(['request', 'download'])

    await user.click(page().getByRole('tab', { name: 'Devices' }))
    expect(page().getByText('This browser')).toBeTruthy()
    await clean()
    await user.click(page().getByRole('button', { name: 'Sign out Kids’ room TV' }))
    await user.click(
      within(page().getByRole('alertdialog')).getByRole('button', { name: 'Sign out' }),
    )
    await settle()
    expect(mock.servers.populated.state.devices.some((d) => d.name === 'Kids’ room TV')).toBe(false)

    await user.click(page().getByRole('tab', { name: 'API keys' }))
    await user.click(page().getByRole('button', { name: 'New API key' }))
    const dialog = page().getByRole('dialog', { name: 'New API key' })
    await user.type(within(dialog).getByLabelText('Name'), 'Jellyseerr')
    await user.click(within(dialog).getByRole('button', { name: 'Make key' }))
    await settle()
    const shown = page().getByRole('dialog', { name: 'Copy your key now' })
    expect(within(shown).getByText(/^hs_[A-Za-z0-9]{40}$/)).toBeTruthy()
    await clean(shown)
    await user.click(within(shown).getByRole('button', { name: 'I’ve copied it' }))
    await settle()
    // listed by its prefix only
    expect(page().getByText('Jellyseerr')).toBeTruthy()
    expect(page().queryByText(/^hs_[A-Za-z0-9]{40}$/)).toBeNull()
  })

  test('the owner can’t be demoted or removed; this browser can’t sign itself out', async () => {
    const mock = createMock()
    const c = client(mock)
    expect(c.users.update('u-ines', { role: 'user' })).rejects.toThrow(/owner stays the owner/)
    expect(c.users.remove('u-ines')).rejects.toThrow(/can’t be removed/)
    expect(c.devices.revoke('d-admin')).rejects.toThrow(/Sign out instead/)
    expect(client(mock, 'user').users.list()).rejects.toThrow(/access/)
  })

  test('admins see people and devices read-only, and only their own API keys', async () => {
    const { user } = await open('/admin/settings/users', 'admin')
    expect(page().getByRole('row', { name: /Ruth/ })).toBeTruthy()
    expect(
      page().getByText('Only the server’s owner invites, changes and removes people.'),
    ).toBeTruthy()
    expect(page().queryByRole('button', { name: 'Invite someone' })).toBeNull()
    expect(page().queryByRole('button', { name: /^Edit / })).toBeNull()
    expect(page().queryByRole('button', { name: /^More for / })).toBeNull()
    await clean()
    await user.click(page().getByRole('tab', { name: 'Devices' }))
    expect(page().queryByRole('button', { name: /^Sign out / })).toBeNull()
    await user.click(page().getByRole('tab', { name: 'API keys' }))
    await settle()
    expect(page().getByText('Nightly backup script')).toBeTruthy()
    expect(page().queryByText('Home Assistant')).toBeNull()
    await clean()
  })

  test('security and backups are left out for admins', async () => {
    await open('/admin/settings', 'admin')
    expect(page().getByRole('link', { name: /Users and devices/ })).toBeTruthy()
    expect(page().queryByRole('link', { name: /Security/ })).toBeNull()
    expect(page().queryByRole('link', { name: /Backups/ })).toBeNull()
    await clean()
    for (const area of ['security', 'backups']) {
      cleanup()
      await open(`/admin/settings/${area}`, 'admin')
      expect(page().getByText('There’s no setting here')).toBeTruthy()
    }
    cleanup()
    await open('/admin/system/backups', 'admin')
    expect(page().queryByRole('tab', { name: 'Backups' })).toBeNull()
    expect(page().getByRole('tab', { name: 'Status', selected: true })).toBeTruthy()
    await clean()
  })

  test('settings: the index lists every area, and a user gets the refusal page', async () => {
    await open('/admin/settings')
    expect(page().getByRole('link', { name: /Users and devices/ })).toBeTruthy()
    await clean()
    cleanup()
    await open('/admin/settings/users', 'user')
    expect(page().getByText('This is where the server’s owner and admins run it')).toBeTruthy()
  })
})

describe('A14, A16, A17 reference pages', () => {
  test('wanted: the missing list searches, and the calendar moves by month', async () => {
    const { mock, user } = await open('/admin/wanted')
    const rows = () => page().getAllByRole('button', { name: /^Search for / })
    expect(rows().length).toBe(2)
    await clean()
    await user.click(page().getByRole('button', { name: 'Search all 2' }))
    await settle()
    expect(
      mock.servers.populated.state.items.find((m) => m.title === 'Royal Wedding')?.status,
    ).toBe('downloading')
    await user.click(page().getByRole('tab', { name: 'Calendar' }))
    await settle()
    const month = page().getByRole('heading', { level: 2 }).textContent
    await user.click(page().getByRole('button', { name: 'Next month' }))
    expect(page().getByRole('heading', { level: 2 }).textContent).not.toBe(month)
    await clean()
  })

  test('system: run a task now; restore asks first', async () => {
    const { mock, user } = await open('/admin/system/tasks')
    await user.click(page().getByRole('button', { name: 'Run RSS sync now' }))
    await settle()
    mock.clock.advance(1)
    await settle()
    expect(mock.servers.populated.state.jobs.find((j) => j.id === 'j-rss')?.state).toBe('running')
    await clean()
    cleanup()
    await open('/admin/system/backups')
    const u = userEvent.setup()
    await u.click(page().getAllByRole('button', { name: 'Restore' })[0] as HTMLElement)
    const confirm = page().getByRole('alertdialog')
    expect(within(confirm).getByText(/anything since is lost/)).toBeTruthy()
    await clean(confirm)
  })

  test('manual import: matched files import; the unmatched one waits for a movie', async () => {
    const { mock, user } = await open('/admin/activity/import')
    await settle()
    expect(page().getByRole('button', { name: 'Import 2 files' })).toBeTruthy()
    expect(page().getByText('Didn’t match a movie. Choose one.')).toBeTruthy()
    await clean()
    await user.click(page().getByRole('button', { name: 'Import 2 files' }))
    await settle()
    const status = (t: string) =>
      mock.servers.populated.state.items.find((m) => m.title === t)?.status
    expect(status('Royal Wedding')).toBe('available')
    expect(status('The Last Man on Earth')).toBe('available')
  })
})

describe('C6–C8 clients', () => {
  test('search groups results by kind, the best-matching kind first', async () => {
    const mock = createMock()
    const kinds = async (q: string) =>
      (await client(mock).library.search(q)).sections.map((s) => s.kind)
    const lang = await client(mock).library.search('lang')
    // a person's name starts with it; Metropolis is only theirs
    expect(lang.sections[0]?.kind).toBe('people')
    const people = lang.sections.find((s) => s.kind === 'people')
    expect(people?.items.some((p) => 'name' in p && p.name === 'Fritz Lang')).toBe(true)
    const movies = lang.sections.find((s) => s.kind === 'movies')
    expect(movies?.items.some((m) => 'title' in m && m.title === 'Metropolis')).toBe(true)
    expect(await kinds('caminandes')).toEqual(['movies', 'collections'])
    expect(await kinds('zzzz')).toEqual([])
    const { collection, items } = await client(mock).library.collection('caminandes')
    expect(collection.count).toBe(items.length)
    expect(items.map((m) => m.year)).toEqual([...items.map((m) => m.year)].sort())
  })

  test('web search: a collection opens, and Search keeps the query', async () => {
    const { user, location } = await open('/web/search')
    await user.click(page().getByRole('button', { name: 'Got it' }))
    await settle()
    await user.type(page().getByRole('searchbox'), 'caminandes')
    await act(() => new Promise((r) => setTimeout(r, 200)))
    await settle()
    const collections = within(page().getByRole('region', { name: 'Collections' }))
    expect(collections.getByRole('link', { name: /Caminandes Collection/ })).toBeTruthy()
    await clean()
    act(() => location.navigate('/web/collections/caminandes'))
    await settle()
    expect(page().getByRole('heading', { level: 1, name: 'Caminandes Collection' })).toBeTruthy()
    await clean()
    // Back to Search: the same history entry, so the query and its results are still there
    act(() => location.navigate('/web/search'))
    await settle()
    expect((page().getByRole('searchbox') as HTMLInputElement).value).toBe('caminandes')
    expect(page().getByRole('region', { name: 'Collections' })).toBeTruthy()
  })

  test('TV search: typing never takes focus off the keys', async () => {
    const { user } = await open('/tv/search')
    // a suggestion's button goes away with its results, so focus goes into them once
    await user.click(page().getByRole('button', { name: 'Animation' }))
    await act(() => new Promise((r) => setTimeout(r, 250)))
    await settle()
    const key = page().getByRole('button', { name: 's' })
    act(() => key.focus())
    await user.keyboard('{Enter}')
    await act(() => new Promise((r) => setTimeout(r, 250)))
    await settle()
    expect(document.activeElement).toBe(key)
    await clean()
  })

  test('TV collection: its titles as a row', async () => {
    await open('/tv/collections/caminandes')
    expect(page().getByRole('heading', { level: 1, name: 'Caminandes Collection' })).toBeTruthy()
    expect(within(page().getByRole('region', { name: 'Movies' })).getAllByRole('link').length).toBe(
      3,
    )
  })

  test('web search: suggestions, then results', async () => {
    const { user } = await open('/web/search')
    await user.click(page().getByRole('button', { name: 'Got it' }))
    await settle()
    await user.click(page().getByRole('button', { name: 'Horror' }))
    await act(() => new Promise((r) => setTimeout(r, 200)))
    await settle()
    expect(
      within(page().getByRole('region', { name: 'Movies' })).getAllByRole('link').length,
    ).toBeGreaterThan(0)
    await clean()
  })

  test('home layout: hiding a row on one device hides it on every device', async () => {
    const { mock, user } = await open('/mobile/you/home')
    await user.click(page().getByRole('button', { name: 'Got it' }))
    await settle()
    await user.click(page().getByRole('switch', { name: 'Show Recently added' }))
    await settle()
    const sections = await client(mock).home.sections('tvos')
    expect(sections.some((s) => s.title === 'Recently added')).toBe(false)
    expect(sections[0]?.layout).toBe('hero')
    // the drag handle's keyboard model: Space picks it up, Up moves it, Space drops it
    act(() => page().getByRole('button', { name: 'Move The silent era' }).focus())
    await user.keyboard(' {ArrowUp} ')
    await settle()
    const titles = (await client(mock).home.sections('web')).map((s) => s.title)
    expect(titles.indexOf('The silent era')).toBeLessThan(titles.indexOf('Staff picks'))
    await clean()
  })

  test('a device theme applies to that device only', async () => {
    const { user } = await open('/web/settings/appearance')
    await user.click(page().getByRole('button', { name: 'Got it' }))
    await settle()
    await user.click(page().getByRole('radio', { name: /OLED black/ }))
    await settle()
    expect(document.documentElement.dataset.theme).toBe('oled')
    expect(JSON.parse(localStorage.getItem('highsea-proto:prefs:web') ?? '{}').theme).toBe('oled')
    expect(localStorage.getItem('highsea-proto:prefs:tv')).toBeNull()
    await clean()
  })
})

describe('stylesheet', () => {
  test('every class rendered in these flows is a real utility', async () => {
    expect(classes.size).toBeGreaterThan(0)
    expect(await unknownClasses()).toEqual([])
  })
})
