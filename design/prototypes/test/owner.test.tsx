// SPDX-License-Identifier: AGPL-3.0-only
// Checkpoint 4 flows: curation (A11), appearance (A12), users and devices (A13), the reference
// admin pages (A14–A17) and the clients' search, settings and profile (C6–C8). Each step that
// changes the screen is checked with axe, and its classes join the stylesheet check.
import './dom.ts'
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { createClient, createMock, type Mock } from '@highsea-tv/mock/client'
import { applyPreview } from '@highsea-tv/mock/server'
import { act, cleanup, render, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { memoryLocation } from 'wouter/memory-location'
import { defaultState, type Role } from '../src/proto/state.ts'
import { classes, collect, unknownClasses, violations } from './check.ts'

// the app after dom.ts has set React Native up for the admin's shared screens: a static import
// is linked before dom.ts runs
const { ScreenApp } = await import('../src/screen/screen.tsx')

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

  test('a user is sent to the web client, not curation', async () => {
    const { location } = await open('/admin/curation', 'user')
    expect(location.history.at(-1)).toBe('/web')
    expect(page().queryByRole('heading', { name: 'Curation' })).toBeNull()
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

  test('settings: the index lists every area, and a user is sent to the web client', async () => {
    await open('/admin/settings')
    expect(page().getByRole('link', { name: /Users and devices/ })).toBeTruthy()
    await clean()
    cleanup()
    const { location } = await open('/admin/settings/users', 'user')
    expect(location.history.at(-1)).toBe('/web')
  })
})

describe('A14, A16, A17 reference pages', () => {
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
    // the films' scores are albums here, so their album matches too
    expect(await kinds('caminandes')).toEqual(['movies', 'collections', 'albums'])
    expect(await kinds('zzzz')).toEqual([])
    const { collection, items } = await client(mock).library.collection('caminandes')
    expect(collection.count).toBe(items.length)
    expect(items.map((m) => m.year)).toEqual([...items.map((m) => m.year)].sort())
  })
})

describe('stylesheet', () => {
  test('every class rendered in these flows is a real utility', async () => {
    expect(classes.size).toBeGreaterThan(0)
    expect(await unknownClasses()).toEqual([])
  })
})
