// SPDX-License-Identifier: AGPL-3.0-only
// Import lists against the TMDB recordings and the fakes of Trakt and the generic format: reading
// each source, matching IMDb ids, adding what's new, exclusions, and Trakt's device flow.
import { describe, expect, test } from 'bun:test'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { ImportListInput, ImportListSettings } from '@highsea/api-contract'
import {
  AppError,
  createEventBus,
  createFakeClock,
  createSealer,
  generateSecretKey,
  silentLogger,
} from '@highsea/core'
import { migrate, openDatabase, schema } from '@highsea/db'
import { createJobQueue } from '@highsea/jobs'
import { createMetadata } from '@highsea/metadata'
import { createReplayFetch } from '@highsea/metadata/replay'
import { readGeneric } from '../src/generic/index.ts'
import { createLists, LIST_SYNC_JOB, type ListLibrary } from '../src/service/index.ts'
import { readTmdb, tmdbListId } from '../src/tmdb/index.ts'
import { createTrakt, TRAKT_ACCOUNT_SETTING, traktListRef } from '../src/trakt/index.ts'
import {
  createFakeLists,
  FAKE_TRAKT_CLIENT_ID,
  FAKE_TRAKT_CLIENT_SECRET,
  FAKE_TRAKT_USER_CODE,
  GENERIC_LIST,
} from './fake/index.ts'

const GENERIC_URL = 'https://lists.example/blender.json'

async function setup({ traktApp = true }: { traktApp?: boolean } = {}) {
  const { db, raw } = openDatabase(':memory:')
  migrate(raw)
  const clock = createFakeClock()
  const events = createEventBus({ now: clock.now })
  const topics: string[] = []
  events.subscribe((e) => topics.push(e.topic))
  const jobs = createJobQueue({ db, clock, events })
  const replay = createReplayFetch()
  const fake = createFakeLists({ next: replay })
  fake.generic.set(GENERIC_URL, { body: GENERIC_LIST })
  const sealer = createSealer(generateSecretKey())
  const metadata = createMetadata({
    db,
    jobs,
    clock,
    logger: silentLogger,
    events,
    sealer,
    fetch: replay,
    imagesDir: mkdtempSync(join(tmpdir(), 'highsea-lists-')),
    sleep: async (ms) => clock.advance(ms),
  })
  await metadata.settings.setKey('test-key-for-replay-0001')
  const trakt = createTrakt({
    db,
    clock,
    sealer,
    fetch: fake.fetch,
    clientId: traktApp ? FAKE_TRAKT_CLIENT_ID : undefined,
    clientSecret: traktApp ? FAKE_TRAKT_CLIENT_SECRET : undefined,
    userAgent: 'highsea/test',
  })
  const library = new Set<number>()
  const adds: { tmdbId: number; searchNow: boolean }[] = []
  const fakeLibrary: ListLibrary = {
    has: (ids) => new Set(ids.filter((id) => library.has(id))),
    async add(input) {
      if (input.tmdbId === 999999999) throw new AppError('not-found', 'No such movie.')
      library.add(input.tmdbId)
      adds.push({ tmdbId: input.tmdbId, searchNow: input.searchNow })
    },
    check(input) {
      if (input.rootFolder !== '/data/movies')
        throw new AppError('invalid', 'No such folder.', { field: 'rootFolder' })
    },
    canSearch: () => true,
  }
  const lists = createLists({
    db,
    clock,
    events,
    jobs,
    logger: silentLogger,
    fetch: fake.fetch,
    metadata,
    trakt,
    library: fakeLibrary,
  })
  return { db, clock, jobs, metadata, trakt, lists, fake, library, adds, topics }
}

const input = (
  settings: ImportListSettings,
  over: Partial<ImportListInput> = {},
): ImportListInput => ({
  name: 'A list',
  enabled: true,
  settings,
  rootFolder: '/data/movies',
  qualityProfileId: 'qp-any',
  languageProfileId: null,
  monitored: true,
  minimumAvailability: 'released',
  searchOnAdd: true,
  ...over,
})

describe('reading lists', () => {
  test('a TMDB list by address, skipping its TV show', async () => {
    const { metadata } = await setup()
    expect(tmdbListId('https://www.themoviedb.org/list/8512345-blender-open-films')).toBe('8512345')
    expect(tmdbListId('8512345')).toBe('8512345')
    expect(tmdbListId('https://example.com/list/1')).toBeNull()
    const entries = await readTmdb(metadata, {
      source: 'list',
      list: 'https://www.themoviedb.org/list/8512345-blender-open-films',
    })
    expect(entries.map((e) => e.tmdbId)).toEqual([
      45745, 10378, 133701, 9761, 358332, 253777, 253774, 406956,
    ])
  })

  test('a TMDB chart', async () => {
    const { metadata } = await setup()
    const entries = await readTmdb(metadata, { source: 'top-rated' })
    expect(entries.length).toBe(7)
    expect(entries.map((e) => e.tmdbId)).toContain(19)
  })

  test('the generic format: ids read, shows and empty entries skipped', async () => {
    const { fake } = await setup()
    const entries = await readGeneric(fake.fetch, GENERIC_URL)
    expect(entries).toEqual([
      { tmdbId: null, imdbId: 'tt1727587', title: 'Sintel', year: null },
      { tmdbId: 10378, imdbId: 'tt1254207', title: 'Big Buck Bunny', year: null },
      { tmdbId: null, imdbId: 'tt0000000', title: 'Not on TMDB', year: null },
    ])
    fake.generic.set(GENERIC_URL, { body: { not: 'a list' } })
    await expect(readGeneric(fake.fetch, GENERIC_URL)).rejects.toThrow('list of movies')
    await expect(readGeneric(fake.fetch, 'ftp://x')).rejects.toThrow('http://')
  })

  test('Trakt charts and public lists carry highsea’s application', async () => {
    const { trakt, fake } = await setup()
    expect(traktListRef('https://trakt.tv/users/sean/lists/blender?sort=rank')).toEqual({
      user: 'sean',
      list: 'blender',
    })
    expect(traktListRef('sean/blender')).toEqual({ user: 'sean', list: 'blender' })
    expect((await trakt.read({ source: 'trending' })).map((e) => e.tmdbId)).toEqual([45745, 10378])
    expect((await trakt.read({ source: 'popular' })).map((e) => e.title)).toEqual([
      'Metropolis',
      'Nosferatu',
      'Sintel',
    ])
    const list = await trakt.read({
      source: 'list',
      list: 'https://trakt.tv/users/sean/lists/blender',
    })
    expect(list.length).toBe(5)
    await expect(trakt.read({ source: 'list', list: 'sean/missing' })).rejects.toThrow(
      'no such list',
    )
    await expect(trakt.read({ source: 'watchlist' })).rejects.toThrow('Connect your Trakt account')
    expect(fake.trakt.requests).toContain('GET /movies/trending')
  })

  test('without highsea’s Trakt application, Trakt is unavailable', async () => {
    const { trakt, lists } = await setup({ traktApp: false })
    expect(trakt.status()).toEqual({ available: false, account: null })
    await expect(trakt.connect()).rejects.toThrow('Trakt application')
    expect(() => lists.add(input({ kind: 'trakt', source: 'popular' }))).toThrow(
      'Trakt application',
    )
  })
})

describe('Trakt’s device flow', () => {
  test('connects, reads the watchlist and private lists, refreshes, and disconnects', async () => {
    const { trakt, fake, clock, db } = await setup()
    const code = await trakt.connect()
    expect(code.userCode).toBe(FAKE_TRAKT_USER_CODE)
    expect(code.verificationUrl).toBe('https://trakt.tv/activate')
    expect(await trakt.poll()).toBe('pending')
    fake.trakt.device = 'approved'
    expect(await trakt.poll()).toBe('connected')
    expect(trakt.status()).toEqual({ available: true, account: 'highsea-owner' })
    // the tokens are sealed in the settings row
    const row = db
      .select()
      .from(schema.settings)
      .all()
      .find((r) => r.key === TRAKT_ACCOUNT_SETTING)
    expect(JSON.stringify(row?.value)).not.toContain('fake-access')
    expect((await trakt.read({ source: 'watchlist' })).map((e) => e.tmdbId)).toEqual([653, 19])
    expect(
      (await trakt.read({ source: 'list', list: 'highsea-owner/secret' })).map((e) => e.tmdbId),
    ).toEqual([19])
    // a day before it runs out, the token is refreshed
    clock.advance(6.5 * 24 * 60 * 60 * 1000)
    await trakt.read({ source: 'watchlist' })
    expect(fake.trakt.requests).toContain('POST /oauth/token')
    await trakt.disconnect()
    expect(fake.trakt.revoked.length).toBe(1)
    expect(trakt.status().account).toBeNull()
  })

  test('a denied or expired code', async () => {
    const { trakt, fake, clock } = await setup()
    await expect(trakt.poll()).rejects.toThrow('no Trakt code')
    await trakt.connect()
    fake.trakt.device = 'denied'
    expect(await trakt.poll()).toBe('denied')
    await trakt.connect()
    clock.advance(601_000)
    expect(await trakt.poll()).toBe('expired')
  })
})

describe('the service', () => {
  test('adding a list checks it, adds what’s new, and names what it couldn’t match', async () => {
    const { lists, jobs, adds, library } = await setup()
    library.add(10378)
    const list = lists.add(input({ kind: 'generic', url: GENERIC_URL }, { name: 'Blender' }))
    expect(jobs.list({}).some((j) => j.type === LIST_SYNC_JOB)).toBe(true)
    const result = await lists.sync(list.id)
    expect(result).toEqual({
      found: 3,
      added: 1,
      skipped: 1,
      unresolved: ['Not on TMDB'],
      error: null,
    })
    expect(adds).toEqual([{ tmdbId: 45745, searchNow: true }])
    const saved = lists.get(list.id)
    expect(saved.items).toBe(2)
    expect(saved.lastResult?.added).toBe(1)
    expect(lists.onAList(45745)).toBe(true)
    // a second check adds nothing
    expect((await lists.sync(list.id)).added).toBe(0)
    expect(adds.length).toBe(1)
  })

  test('an exclusion keeps a movie from coming back', async () => {
    const { lists, adds } = await setup()
    lists.exclude([{ tmdbId: 45745, title: 'Sintel', year: 2010 }])
    lists.exclude([{ tmdbId: 45745, title: 'Sintel', year: 2010 }])
    expect(lists.exclusions().map((e) => e.tmdbId)).toEqual([45745])
    const list = lists.add(input({ kind: 'trakt', source: 'trending' }))
    const result = await lists.sync(list.id)
    expect(result.skipped).toBe(1)
    expect(adds.map((a) => a.tmdbId)).toEqual([10378])
    lists.removeExclusion(45745)
    expect(() => lists.removeExclusion(45745)).toThrow('isn’t excluded')
  })

  test('a list that can’t be read keeps what it held, and says why', async () => {
    const { lists, fake } = await setup()
    const list = lists.add(input({ kind: 'trakt', source: 'popular' }))
    await lists.sync(list.id)
    expect(lists.get(list.id).items).toBe(3)
    fake.trakt.failWith = 503
    const result = await lists.sync(list.id)
    expect(result.error).toBe('Trakt answered 503.')
    expect(lists.get(list.id).items).toBe(3)
  })

  test('test reads without saving; bad settings are refused', async () => {
    const { lists, adds } = await setup()
    expect(await lists.test({ kind: 'tmdb', source: 'list', list: '8512345' })).toEqual({
      ok: true,
      message: 'highsea can read this list: 8 movies.',
      found: 8,
    })
    expect(adds.length).toBe(0)
    expect((await lists.test({ kind: 'generic', url: 'https://nothing.example/x.json' })).ok).toBe(
      false,
    )
    expect(() => lists.add(input({ kind: 'tmdb', source: 'list' }))).toThrow('address')
    expect(() =>
      lists.add(input({ kind: 'tmdb', source: 'popular' }, { rootFolder: '/elsewhere' })),
    ).toThrow('No such folder')
    expect(() => lists.add(input({ kind: 'trakt', source: 'watchlist' }))).toThrow(
      'Connect your Trakt account',
    )
  })

  test('the scheduled job checks every list that’s on', async () => {
    const { lists, jobs, adds, clock } = await setup()
    lists.add(input({ kind: 'trakt', source: 'anticipated' }, { name: 'B' }))
    lists.add(input({ kind: 'trakt', source: 'trending' }, { name: 'A', enabled: false }))
    lists.schedule(clock.now())
    clock.advance(31 * 60 * 1000)
    for (let i = 0; i < 3; i++) {
      await jobs.tick()
      await jobs.idle()
    }
    expect(adds.map((a) => a.tmdbId)).toEqual([133701])
  })
})
