// SPDX-License-Identifier: AGPL-3.0-only
// Checkpoint 4 flows: curation (A11), appearance (A12), users and devices (A13), the reference
// admin pages (A14–A17) and the clients' search, settings and profile (C6–C8). Each step that
// changes the screen is checked with axe. They draw only the library's native renderer since D3
// (one-client-platform-d.md), so they have no Tailwind classes for the stylesheet check.
import './dom.ts'
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { createClient, createMock, type Mock } from '@highsea-tv/mock/client'
import { applyPreview } from '@highsea-tv/mock/server'
import { act, cleanup, render, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { memoryLocation } from 'wouter/memory-location'
import { defaultState, type Role } from '../src/proto/state.ts'
import { violations } from './check.ts'

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

// A12 Appearance is the admin's own screen since D3 (one-client-platform-d.md), its rename and new
// theme flow tested in packages/admin/test/appearance-screen.test.tsx

// the invite, edit, devices and keys flow and admins' read-only view are the admin's own screen
// since D3 (one-client-platform-d.md), tested in packages/admin/test/users-screen.test.tsx
describe('A13 users and devices', () => {
  test('the owner can’t be demoted or removed; this browser can’t sign itself out', async () => {
    const mock = createMock()
    const c = client(mock)
    expect(c.users.update('u-ines', { role: 'user' })).rejects.toThrow(/owner stays the owner/)
    expect(c.users.remove('u-ines')).rejects.toThrow(/can’t be removed/)
    expect(c.devices.revoke('d-admin')).rejects.toThrow(/Sign out instead/)
    expect(client(mock, 'user').users.list()).rejects.toThrow(/access/)
  })

  test('security and backups are left out for admins', async () => {
    await open('/admin/settings', 'admin')
    // the index is the admin's own screen since D3, drawn once the mock has signed the page in
    expect(await page().findByRole('link', { name: /Users and devices/ })).toBeTruthy()
    expect(page().queryByRole('link', { name: /Security/ })).toBeNull()
    expect(page().queryByRole('link', { name: /Backups/ })).toBeNull()
    await clean()
    // Security is the admin's own screen since D3: its address is not found for an admin, as the
    // server's page says
    cleanup()
    await open('/admin/settings/security', 'admin')
    expect(
      (await page().findAllByRole('heading', { name: 'There’s nothing here yet' })).length,
    ).toBeGreaterThan(0)
    cleanup()
    // Backups and System's tabs are the admin's own screens since D3, as Security is
    await open('/admin/settings/backups', 'admin')
    expect(
      (await page().findAllByRole('heading', { name: 'There’s nothing here yet' })).length,
    ).toBeGreaterThan(0)
    cleanup()
    await open('/admin/system/backups', 'admin')
    expect(await page().findByRole('tab', { name: 'Status', selected: true })).toBeTruthy()
    expect(page().queryByRole('tab', { name: 'Backups' })).toBeNull()
    await clean()
  })

  test('settings: the index lists every area, and a user is sent to the web client', async () => {
    await open('/admin/settings')
    expect(await page().findByRole('link', { name: /Users and devices/ })).toBeTruthy()
    await clean()
    cleanup()
    const { location } = await open('/admin/settings/users', 'user')
    expect(location.history.at(-1)).toBe('/web')
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
