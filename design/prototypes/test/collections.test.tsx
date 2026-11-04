// SPDX-License-Identifier: AGPL-3.0-only
// Smart collections (docs/product/collections.md): the mock's evaluator over the seed's films, then
// the admin's list and editor and the apps' Library › Collections and collection pages.
import './dom.ts'
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { createClient, createMock, type Mock } from '@highsea-tv/mock/client'
import { evaluate } from '@highsea-tv/mock/collections'
import type {
  RuleCondition,
  RuleField,
  RuleOp,
  RuleValue,
  SmartCollection,
} from '@highsea-tv/mock/types'
import { act, cleanup, render, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { memoryLocation } from 'wouter/memory-location'
import { defaultState, type Role } from '../src/proto/state.ts'
import { ScreenApp } from '../src/screen/screen.tsx'
import { collect, violations } from './check.ts'

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

const client = (mock: Mock, role: Role = 'owner') =>
  createClient(mock, { data: 'populated', role, latency: 0 })

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

/** The seed's must-acknowledge announcement covers the apps until it's acknowledged. */
async function _acknowledge(user: ReturnType<typeof userEvent.setup>) {
  const got = page().queryByRole('button', { name: 'Got it' })
  if (got) await user.click(got)
  await settle()
}

async function clean() {
  collect()
  expect(await violations()).toEqual([])
}

const when = (field: RuleField, op: RuleOp, value: RuleValue): RuleCondition => ({
  kind: 'condition',
  id: `c-${field}-${op}`,
  field,
  op,
  value,
})

/** A collection of these conditions, all matched, sorted by title. */
const draft = (rules: RuleCondition[], patch: Partial<SmartCollection> = {}): SmartCollection => ({
  id: 'sc-draft',
  name: 'Draft',
  summary: '',
  artwork: null,
  rules: { kind: 'group', id: 'g', match: 'all', rules },
  include: [],
  exclude: [],
  shows: [],
  sort: 'title',
  descending: false,
  limit: null,
  audience: { kind: 'everyone' },
  updatedAt: new Date(0).toISOString(),
  ...patch,
})

/** The titles a draft holds now, in its order. */
async function titles(mock: Mock, c: SmartCollection) {
  return (await client(mock).collections.preview(c)).items.map((m) => m.title)
}

async function saved(mock: Mock, id: string) {
  const c = (await client(mock).collections.list()).find((x) => x.id === id)
  if (!c) throw new Error(`no collection ${id}`)
  return c
}

describe('the evaluator', () => {
  test('the owner’s example: 2010–2020, rated 4.5 or more, in English', async () => {
    const mock = createMock()
    const c = await saved(mock, 'sc-2010s')
    const p = await client(mock).collections.preview(c)
    expect(p.items.map((m) => m.title).sort()).toEqual(
      ['Coffee Run', 'Cosmos Laundromat', 'Hero', 'Spring'].sort(),
    )
    // Cosmos Laundromat is still downloading, so the apps show three
    expect(p.matched).toBe(4)
    expect(p.playable).toBe(3)
    expect(p.items.find((m) => m.title === 'Cosmos Laundromat')?.playable).toBe(false)
    expect(p.words).toBe('Released 2010–2020, rated 4.5 or more, in English')
    // Llamigos has no dialogue, so it isn't English
    expect(p.items.some((m) => m.title.includes('Llamigos'))).toBe(false)
  })

  test('match any, with a group of all, and the exceptions', async () => {
    const mock = createMock()
    const dead = await saved(mock, 'sc-dead')
    const held = await titles(mock, dead)
    // the rules: zombies, or vampires before 1970; Nosferatu is one, but it's left out by hand
    expect(held).toContain('Night of the Living Dead')
    expect(held).not.toContain('Nosferatu')
    // and Carnival of Souls, which matches nothing, is added by hand
    expect(held).toContain('Carnival of Souls')

    const noExceptions = await titles(mock, { ...dead, include: [], exclude: [] })
    expect(noExceptions).toContain('Nosferatu')
    expect(noExceptions).not.toContain('Carnival of Souls')

    // with Match all, nothing is both a zombie film and an early vampire one
    const all = { ...dead, rules: dead.rules && { ...dead.rules, match: 'all' as const } }
    expect(await titles(mock, { ...all, include: [] })).toEqual([])

    // a film in both lists is left out: Never include wins
    const [nosferatu] = dead.exclude
    if (!nosferatu) throw new Error('the seed leaves Nosferatu out')
    expect(await titles(mock, { ...dead, include: [nosferatu] })).not.toContain('Nosferatu')
  })

  test('a picked collection keeps its order; an empty rule set holds every film', async () => {
    const mock = createMock()
    const staff = await saved(mock, 'sc-staff')
    expect(staff.rules).toBeNull()
    expect(await titles(mock, staff)).toEqual([
      'Metropolis',
      'Sintel',
      'His Girl Friday',
      'The General',
      'Charade',
      'Spring',
    ])
    const movies = mock.servers.populated.state.items.filter((m) => m.type === 'movie')
    expect((await client(mock).collections.preview(draft([]))).matched).toBe(movies.length)
  })

  test('relative dates follow the clock', () => {
    const mock = createMock()
    const state = mock.servers.populated.state
    const recent = draft([when('year', 'inLast', 15)])
    const now = mock.clock.now()
    const today = evaluate(state, recent, now, []).map((f) => f.title)
    expect(today).toContain('Spring')
    const later = evaluate(state, recent, now + 30 * 365.25 * 86_400_000, []).map((f) => f.title)
    expect(later).toEqual([])
  })

  test('a collection can’t be one of its own rules, directly or through another', async () => {
    const mock = createMock()
    const api = client(mock)
    const self = draft([when('collection', 'is', 'sc-draft')])
    await expect(api.collections.save(self)).rejects.toThrow(/one of its own rules/)

    // A draws on B and B on A: each is worked out without looping, and A holds nothing through B
    const state = mock.servers.populated.state
    const a = draft([when('collection', 'is', 'sc-b')], { id: 'sc-a' })
    const b = draft([when('collection', 'is', 'sc-a')], { id: 'sc-b' })
    expect(evaluate(state, a, mock.clock.now(), [a, b])).toEqual([])

    // through a real one, it holds what that one holds
    const silent = await saved(mock, 'sc-silent')
    const through = await titles(mock, draft([when('collection', 'is', 'sc-silent')]))
    expect(through.sort()).toEqual((await titles(mock, { ...silent, sort: 'title' })).sort())
  })

  test('the composer rule: Jan Morgenstern scored the Blender films', async () => {
    const mock = createMock()
    const jan = await saved(mock, 'sc-morgenstern')
    expect(jan.words).toBe('Scored by Jan Morgenstern')
    const held = await titles(mock, jan)
    expect(held).toHaveLength(6)
    expect(held).toContain('Sintel')
    expect(held.filter((t) => t.startsWith('Caminandes'))).toHaveLength(3)
    // a composer isn't an actor: the role matters
    expect(await titles(mock, draft([when('actor', 'includes', ['jan-morgenstern'])]))).toEqual([])
  })

  test('every role is its own field, and Anyone in the cast and crew matches any', async () => {
    const mock = createMock()
    const by = (field: RuleField, who: string, op: RuleOp = 'includes') =>
      titles(mock, draft([when(field, op, [who])]))
    expect(await by('director', 'buster-keaton')).toContain('The General')
    expect(await by('cinematographer', 'eduard-tisse')).toEqual(['Battleship Potemkin'])
    expect(await by('editor', 'george-a-romero')).toEqual(['Night of the Living Dead'])
    expect(await by('composer', 'gottfried-huppertz')).toEqual(['Metropolis'])
    expect(await by('writer', 'carl-mayer')).not.toEqual([])
    expect(await by('producer', 'hal-roach')).not.toEqual([])
    expect(await by('actor', 'alfred-abel')).toContain('Metropolis')

    // Chaplin scored and produced his films; any role finds them all
    const anyone = await by('person', 'charlie-chaplin')
    const roles = [
      ...(await by('composer', 'charlie-chaplin')),
      ...(await by('producer', 'charlie-chaplin')),
      ...(await by('actor', 'charlie-chaplin')),
      ...(await by('director', 'charlie-chaplin')),
    ]
    expect(anyone.sort()).toEqual([...new Set(roles)].sort())

    // doesn't include: every film but those
    const movies = mock.servers.populated.state.items.filter((m) => m.type === 'movie')
    expect(await by('composer', 'jan-morgenstern', 'excludes')).toHaveLength(movies.length - 6)
  })

  test('the apps see what they can play, for the people in the audience', async () => {
    const mock = createMock()
    const api = client(mock)
    const { collection, items } = await api.library.collection('sc-2010s', 'web')
    expect(collection.smart?.words).toBe('Released 2010–2020, rated 4.5 or more, in English')
    expect(items.map((m) => m.title)).not.toContain('Cosmos Laundromat')
    expect(collection.count).toBe(3)

    const ids = (xs: { id: string }[]) => xs.map((x) => x.id)
    // nothing in Dolby Vision, so it's hidden; Zombie night is for owners and admins
    expect(ids(await api.library.collections('web'))).not.toContain('sc-dolby')
    expect(ids(await api.library.collections('web'))).toContain('sc-dead')
    expect(ids(await client(mock, 'user').library.collections('web'))).not.toContain('sc-dead')
    // smart ones come first, then TMDB's
    const all = await api.library.collections('web')
    expect(all[0]?.smart).toBeTruthy()
    expect(all.at(-1)?.smart).toBeUndefined()
  })

  test('deleting one a featured section draws on is refused', async () => {
    const mock = createMock()
    await expect(client(mock).collections.remove('sc-silent')).rejects.toThrow(/draws on it/)
    await client(mock).collections.remove('sc-dolby')
    expect((await client(mock).collections.list()).some((c) => c.id === 'sc-dolby')).toBe(false)
  })
})

describe('A19 collections', () => {
  test('the list: each with its kind, what it holds and who sees it', async () => {
    await open('/admin/collections')
    const list = within(page().getByRole('list', { name: 'Collections' }))
    expect(list.getAllByRole('listitem')).toHaveLength(6)
    expect(list.getByRole('link', { name: '2010s, 4.5 stars and up, in English' })).toBeTruthy()
    expect(list.getByText('Released 2010–2020, rated 4.5 or more, in English')).toBeTruthy()
    expect(list.getByText(/4 movies, 3 in the apps/)).toBeTruthy()
    expect(list.getByText('Picked')).toBeTruthy()
    expect(list.getByText(/Nothing matches yet/)).toBeTruthy()
    await clean()
  })

  test('the editor counts as the rules change, and saves', async () => {
    const { mock, location, user } = await open('/admin/collections/sc-2010s')
    const result = () => within(page().getByRole('region', { name: 'What it holds now' }))
    await waitFor(() => expect(result().getByText(/films match/).textContent).toContain('4'))

    // rated 5: nothing in the seed's 2010s is that good
    const rating = page().getByLabelText('Condition 2: value')
    await user.clear(rating)
    await user.type(rating, '5')
    await waitFor(() => expect(result().getByText(/No films match yet/)).toBeTruthy(), {
      timeout: 3000,
    })

    // rated 4: Sintel joins them
    await user.clear(rating)
    await user.type(rating, '4')
    await waitFor(() => expect(result().getByText(/films match/).textContent).toContain('5'), {
      timeout: 3000,
    })
    const matched = 5

    const name = page().getByLabelText('Name')
    await user.clear(name)
    await user.type(name, 'The 2010s, rated 4 and up')
    await user.click(page().getByRole('button', { name: 'Save changes' }))
    await settle()
    expect(location.history?.at(-1)).toBe('/admin/collections')
    const c = await saved(mock, 'sc-2010s')
    expect(c.name).toBe('The 2010s, rated 4 and up')
    expect(c.matched).toBe(matched)
    await clean()
  })

  test('a new collection starts from the Movies library', async () => {
    const { location, user } = await open('/admin/movies')
    await user.click(page().getByRole('button', { name: 'Save as smart collection' }))
    await settle()
    expect(location.history?.at(-1)).toBe('/admin/collections/new')
    expect(page().getByRole('form', { name: 'Collection' })).toBeTruthy()
    expect(page().getByText(/No conditions yet, so every film is in it/)).toBeTruthy()
    await user.click(page().getByRole('button', { name: 'Add a condition' }))
    expect(
      within(page().getByRole('list', { name: 'Rules' })).getAllByRole('listitem'),
    ).toHaveLength(1)
    await clean()
  })

  test('a collection that isn’t there says so', async () => {
    await open('/admin/collections/nowhere')
    expect(page().getByText(/no collection with that id/)).toBeTruthy()
  })
})

describe('shows in collections and featured sections (prototype-gaps.md › stage 6)', () => {
  test('a collection’s shows are picked by hand, counted as the apps count them', async () => {
    const mock = createMock()
    const api = client(mock)
    const staff = await saved(mock, 'sc-staff')
    expect(staff.shows).toEqual(['saltmarsh'])
    expect(staff.showsHere).toBe(1)
    expect(staff.showsPlayable).toBe(1)
    // rules match films only: the composer's show comes in as a pick beside them
    const jan = await api.collections.preview(await saved(mock, 'sc-morgenstern'))
    expect(jan.shows.map((x) => x.title)).toEqual(['The Lantern Keepers'])
    expect(jan.items.some((m) => m.title === 'The Lantern Keepers')).toBe(false)

    // shows alone are enough for a picked collection, and the apps list them
    await api.collections.save({
      ...draft([], { id: 'sc-shows', name: 'Shows only', rules: null, sort: 'manual' }),
      shows: ['orbital', 'saltmarsh'],
    })
    const { collection, items, shows } = await api.library.collection('sc-shows', 'web')
    expect(items).toEqual([])
    expect(shows.map((x) => x.title)).toEqual(['Orbital', 'Saltmarsh'])
    expect(collection.shows).toBe(2)
    await expect(
      api.collections.save(draft([], { id: 'sc-none', name: 'None', rules: null })),
    ).rejects.toThrow(/film or show/)
  })

  test('the admin’s list and editor show the shows', async () => {
    const { mock, user } = await open('/admin/collections/sc-staff')
    const result = () => within(page().getByRole('region', { name: 'What it holds now' }))
    await waitFor(() =>
      expect(result().getByRole('list', { name: 'Shows in it' }).children).toHaveLength(1),
    )
    await user.type(page().getByRole('textbox', { name: 'Picked shows' }), 'orbit')
    await settle()
    const matches = within(page().getByRole('list', { name: 'Picked shows: matches' }))
    await user.click(matches.getByRole('button', { name: /Orbital/ }))
    expect(
      within(page().getByRole('list', { name: 'Picked shows' })).getAllByRole('listitem'),
    ).toHaveLength(2)
    await waitFor(
      () => expect(result().getByRole('list', { name: 'Shows in it' }).children).toHaveLength(2),
      { timeout: 3000 },
    )
    await clean()
    await user.click(page().getByRole('button', { name: 'Save changes' }))
    await settle()
    expect((await saved(mock, 'sc-staff')).shows).toEqual(['saltmarsh', 'orbital'])
    expect(page().getByText(/6 movies and 2 shows, all in the apps/)).toBeTruthy()
  })

  test('a hand-picked featured section holds shows beside films, with their taglines', async () => {
    const mock = createMock()
    const c = client(mock)
    const sintel = (await c.movies.list()).find((m) => m.title === 'Sintel')?.id ?? ''
    const section = {
      ...(await c.curation.section('fs-recent')),
      title: 'Films and shows',
      source: { kind: 'manual' as const, itemIds: ['saltmarsh', sintel] },
      overrides: [{ itemId: 'saltmarsh', artwork: null, tagline: 'Salt, wind and secrets.' }],
    }
    const picked = await c.curation.resolve(section)
    expect(picked.map((m) => m.title)).toEqual(['Saltmarsh', 'Sintel'])
    const show = picked[0]
    expect(show?.series?.play).toMatch(/^saltmarsh-s\d+e\d+$/)
    expect(show?.tagline).toBe('Salt, wind and secrets.')
    expect(picked[1]?.series).toBeUndefined()

    // the show's card on the apps' Home is apps/client's (one-client-platform-b.md › B1)
  })
})
