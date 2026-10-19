// SPDX-License-Identifier: AGPL-3.0-only
// Checkpoint 2 flows, walked as a user would: add a movie from Discover and watch it reach the
// library; bulk edit the library; interactive search with its reasons; fix a blocked import from
// Activity; manage torrents; add indexers from the catalog; fill the subtitle wanted list. Each
// step that changes the screen is checked with axe, and its classes join the stylesheet check.
import './dom.ts'
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { act, cleanup, render, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { memoryLocation } from 'wouter/memory-location'
import { createClient, createMock, type Mock } from '../src/mock/client.ts'
import { defaultState, type Role } from '../src/proto/state.ts'
import { ScreenApp } from '../src/screen/screen.tsx'
import { classes, collect, unknownClasses, violations } from './check.ts'

beforeEach(() => localStorage.clear())
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

/** Runs the simulation in 10-second steps until `done` holds. */
async function run(mock: Mock, done: () => boolean, limit = 6 * 3600) {
  for (let s = 0; s < limit && !done(); s += 10) mock.clock.advance(10)
  await settle()
  expect(done()).toBe(true)
}

describe('A4 discover → add', () => {
  test('search, add with Search now, and the movie downloads into the library', async () => {
    const { mock, user } = await open('/admin/discover')
    await clean()
    await user.type(page().getByLabelText('Search for a movie'), 'nanook')
    await settle()
    expect(page().getByRole('heading', { name: 'Results for “nanook”' })).toBeTruthy()
    await user.click(page().getByRole('button', { name: 'Add Nanook of the North' }))
    await settle()
    const dialog = page().getByRole('dialog', { name: /Add Nanook of the North/ })
    await clean(dialog)
    await user.click(within(dialog).getByRole('button', { name: 'Add and search' }))
    await settle()

    const srv = mock.servers.populated
    const item = () => srv.state.items.find((m) => m.title === 'Nanook of the North')
    expect(item()?.status).toBe('downloading')
    expect(page().getByRole('link', { name: 'Nanook of the North: in the library' })).toBeTruthy()
    await run(mock, () => item()?.status === 'available')
    expect(srv.state.history.some((h) => h.itemId === item()?.id && h.type === 'imported')).toBe(
      true,
    )
  })

  test('a poster opens the details, and Add goes on to the add dialog', async () => {
    const { user } = await open('/admin/discover')
    await user.type(page().getByLabelText('Search for a movie'), 'nanook')
    await settle()
    await user.click(page().getByRole('button', { name: /^Nanook of the North/ }))
    await settle()
    const detail = page().getByRole('dialog', { name: 'Nanook of the North (1922)' })
    expect(within(detail).getByText(/Documentary/)).toBeTruthy()
    await clean(detail)
    await user.click(within(detail).getByRole('button', { name: 'Add movie' }))
    await settle()
    expect(page().queryByRole('dialog', { name: 'Nanook of the North (1922)' })).toBeNull()
    expect(page().getByRole('dialog', { name: /Add Nanook of the North/ })).toBeTruthy()
  })

  test('a library movie’s details link to its page', async () => {
    const { user } = await open('/admin/discover')
    await user.type(page().getByLabelText('Search for a movie'), 'sintel')
    await settle()
    await user.click(page().getByRole('button', { name: /^Sintel/ }))
    await settle()
    const detail = page().getByRole('dialog', { name: /^Sintel/ })
    expect(
      within(detail).getByRole('link', { name: 'Open in the library' }).getAttribute('href'),
    ).toBe('#/admin/movies/sintel')
  })

  test('members can look but not add', async () => {
    await open('/admin/discover', 'member')
    const add = page().getAllByRole('button', { name: /^Add / })[0] as HTMLButtonElement
    expect(add.disabled).toBe(true)
    expect(page().getByText(/Only owners and admins can add movies/)).toBeTruthy()
  })
})

describe('A5 library', () => {
  test('table view, filter, then bulk stop monitoring', async () => {
    const { mock, user } = await open('/admin/movies')
    await user.click(page().getByRole('radio', { name: 'Table' }))
    await clean()
    expect(page().getAllByRole('row')[1]?.querySelector('img')).not.toBeNull()
    await user.click(page().getByRole('tab', { name: /^Wanted/ }))
    const rows = page().getAllByRole('checkbox', { name: /^Select (?!every)/ })
    expect(rows.length).toBe(3)
    await user.click(page().getByRole('checkbox', { name: 'Select every movie shown' }))
    const bar = page().getByRole('toolbar', { name: 'Bulk edit' })
    expect(within(bar).getByText('3 movies selected')).toBeTruthy()
    await clean()
    await user.click(within(bar).getByRole('button', { name: 'Edit' }))
    await user.click(page().getByRole('menuitem', { name: 'Stop monitoring' }))
    await settle()
    const movies = await client(mock).movies.list()
    const wanted = movies.filter((m) => m.status === 'missing' || m.status === 'cutoff-unmet')
    expect(wanted.every((m) => !m.monitored)).toBe(true)
    expect(page().queryByRole('toolbar', { name: 'Bulk edit' })).toBeNull()
  })
})

describe('A6 movie detail', () => {
  test('interactive search shows the reasons, and a grab lands in the queue', async () => {
    const { mock, user } = await open('/admin/movies/royal-wedding')
    await clean()
    await user.click(page().getByRole('tab', { name: 'Search' }))
    await settle()
    const rejected = page().getAllByRole('button', { name: /^Rejected/ })[0] as HTMLElement
    await user.click(rejected)
    expect(rejected.getAttribute('aria-expanded')).toBe('true')
    expect(page().getByText(/is not allowed in/)).toBeTruthy()
    await clean()
    const grab = page().getAllByRole('button', { name: /^Grab (?!anyway)/ })[0] as HTMLElement
    await user.click(grab)
    await settle()
    expect(page().getAllByText('Grabbed').length).toBeGreaterThan(0)
    const queue = await client(mock).queue.list()
    expect(queue.some((q) => q.itemId === 'royal-wedding')).toBe(true)
  })

  test('subtitles: nudge the offset, re-sync, pick one from a search', async () => {
    const { mock, user } = await open('/admin/movies/tears-of-steel')
    await user.click(page().getByRole('tab', { name: 'Subtitles' }))
    await settle()
    await clean()
    const before = (await client(mock).subtitles.forItem('tears-of-steel'))[0]
    await user.click(page().getByRole('button', { name: 'Show English subtitles 50 ms later' }))
    await settle()
    const after = (await client(mock).subtitles.forItem('tears-of-steel'))[0]
    expect(after?.sync.offsetMs).toBe((before?.sync.offsetMs ?? 0) + 50)

    await user.click(page().getByRole('button', { name: 'Re-sync English' }))
    await settle()
    expect((await client(mock).subtitles.forItem('tears-of-steel'))[0]?.sync.status).toBe('synced')

    await user.click(page().getByRole('button', { name: 'Search providers' }))
    await settle()
    await clean()
    await user.click(
      page().getAllByRole('button', { name: /^Download .* from / })[0] as HTMLElement,
    )
    await settle()
    expect((await client(mock).subtitles.forItem('tears-of-steel')).length).toBe(2)
  })

  test('a movie that isn’t there says so', async () => {
    await open('/admin/movies/nowhere')
    expect(page().getByText('That movie isn’t in the library.')).toBeTruthy()
    await clean()
  })
})

describe('A7 activity', () => {
  test('a blocked import: find another release, and the old one is blocklisted', async () => {
    const { mock, user } = await open('/admin/activity')
    await user.click(page().getByRole('tab', { name: /^Needs attention/ }))
    expect(page().getByText(/contains an executable file/)).toBeTruthy()
    await clean()
    await user.click(page().getByRole('button', { name: 'Find another' }))
    await settle()
    const srv = mock.servers.populated
    expect(srv.state.torrents.some((t) => t.id === 't-nosferatu')).toBe(false)
    expect(srv.state.torrents.some((t) => t.itemId === 'nosferatu')).toBe(true)

    await user.click(page().getByRole('tab', { name: /^Blocklist/ }))
    await settle()
    expect(page().getByRole('link', { name: 'Nosferatu' })).toBeTruthy()
    await clean()
  })
})

describe('A8 downloads', () => {
  test('open a torrent, skip a file, add a magnet', async () => {
    const { mock, user } = await open('/admin/downloads')
    expect(page().getByText('Bound to wg0')).toBeTruthy()
    await clean()
    await user.click(page().getByRole('button', { name: /^Sintel\.2010/ }))
    const sheet = page().getByRole('dialog', { name: /^Sintel\.2010/ })
    await user.click(within(sheet).getByRole('tab', { name: /^Files/ }))
    await clean(sheet)
    await user.keyboard('{Escape}')

    await user.click(page().getByRole('button', { name: 'Add torrent' }))
    const dialog = page().getByRole('dialog', { name: 'Add a torrent' })
    await user.click(within(dialog).getByRole('button', { name: 'Add' }))
    expect(within(dialog).getByText('That isn’t a magnet link or a .torrent URL.')).toBeTruthy()
    await user.type(
      within(dialog).getByLabelText('Magnet link or .torrent URL'),
      'magnet:?xt=urn:btih:abc&dn=Big.Buck.Bunny',
    )
    await user.click(within(dialog).getByRole('button', { name: 'Add' }))
    await settle()
    const list = await client(mock).downloads.list()
    expect(list[0]?.name).toBe('Big.Buck.Bunny')
  })
})

describe('A9 indexers', () => {
  test('clear a backoff; add a public one in a click; a private one is tested first', async () => {
    const { mock, user } = await open('/admin/indexers')
    await clean()
    await user.click(page().getByRole('button', { name: 'Retry now' }))
    await settle()
    const keel = (await client(mock).indexers.list()).find((i) => i.id === 'ix-keel')
    expect(keel?.health).toBe('healthy')

    await user.click(page().getByRole('tab', { name: 'Catalog' }))
    await settle()
    await clean()
    await user.click(page().getByRole('button', { name: 'Add Beacon' }))
    await settle()
    expect((await client(mock).indexers.list()).some((i) => i.definitionId === 'beacon')).toBe(true)

    await user.click(page().getByRole('button', { name: 'Set up Bosun' }))
    const dialog = page().getByRole('dialog', { name: 'Set up Bosun' })
    await clean(dialog)
    await user.click(within(dialog).getByRole('button', { name: 'Test and save' }))
    expect(within(dialog).getByText('Enter your username.')).toBeTruthy()
    await user.type(within(dialog).getByLabelText('Username'), 'ines')
    await user.type(within(dialog).getByLabelText('API key'), 'wrong')
    await user.click(within(dialog).getByRole('button', { name: 'Test and save' }))
    await settle()
    expect(within(dialog).getByRole('alert').textContent).toContain('rejected the API key')
    await user.clear(within(dialog).getByLabelText('API key'))
    await user.type(within(dialog).getByLabelText('API key'), 'k-29f1')
    await user.click(within(dialog).getByRole('button', { name: 'Test and save' }))
    await settle()
    expect((await client(mock).indexers.list()).some((i) => i.definitionId === 'bosun')).toBe(true)
  })

  test('members are turned away', async () => {
    await open('/admin/indexers', 'member')
    expect(page().getByText('Only owners and admins can open Indexers')).toBeTruthy()
  })
})

describe('A10 subtitles', () => {
  test('search all empties the wanted list; a profile reorders', async () => {
    const { mock, user } = await open('/admin/subtitles')
    await settle()
    await clean()
    await user.click(page().getByRole('button', { name: 'Search all' }))
    await settle()
    expect(await client(mock).subtitles.wanted()).toEqual([])
    expect(page().getByText('Every movie has its subtitles')).toBeTruthy()

    await user.click(page().getByRole('tab', { name: 'Languages' }))
    await user.click(page().getByRole('button', { name: 'Edit English and Spanish' }))
    await clean()
    await user.click(page().getByRole('button', { name: 'Move Spanish up' }))
    await user.click(page().getByRole('button', { name: 'Save profile' }))
    await settle()
    const profile = (await client(mock).subtitles.languageProfiles()).find(
      (p) => p.id === 'lp-en-es',
    )
    expect(profile?.languages.map((l) => l.code)).toEqual(['es', 'en'])

    await user.click(page().getByRole('tab', { name: 'Scoring and sync' }))
    await settle()
    await clean()
    await user.click(page().getByRole('switch', { name: /Sync to the audio/ }))
    await user.click(page().getByRole('button', { name: 'Save' }))
    await settle()
    expect((await client(mock).subtitles.settings()).autoSync).toBe(false)
  })
})

describe('stylesheet', () => {
  test('every class the flows render is a real utility', async () => {
    expect(classes.size).toBeGreaterThan(50)
    expect(await unknownClasses()).toEqual([])
  })
})
