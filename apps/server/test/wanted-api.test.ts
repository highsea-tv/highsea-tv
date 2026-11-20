// SPDX-License-Identifier: AGPL-3.0-only
// Checkpoint 8a's routes through the SDK: Wanted's lists and searches, the calendar and its iCal
// feed (checked against RFC 5545's grammar for the properties it uses), the calendar key refused
// everywhere but the feed, System › Tasks, import lists against the fakes of Trakt and the generic
// format, and a delete that excludes the movie from lists. Episodes (HT-109): Chernobyl's on their
// air dates, in the calendar beside the films and in the feed, and in Wanted's Missing.
import { afterEach, describe, expect, test } from 'bun:test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { createFakeClock, type Fetch } from '@highsea-tv/core'
import { createFakeIndexer, FAKE_CREDENTIALS, FAKE_ORIGIN } from '@highsea-tv/indexers/fake'
import {
  createFakeLists,
  FAKE_TRAKT_CLIENT_ID,
  FAKE_TRAKT_CLIENT_SECRET,
  GENERIC_LIST,
} from '@highsea-tv/lists/fake'
import { createReplayFetch } from '@highsea-tv/metadata/replay'
import { createApi } from '../src/api/app.ts'
import { escapeText, fold } from '../src/api/ics.ts'
import {
  addMember,
  bootRuntime,
  cleanup,
  clientFor,
  failure,
  ORIGIN,
  withOwner,
} from './helpers.ts'

afterEach(cleanup)

const SINTEL = 45745
const CAT_IN_THE_HAT = 1117898
const BIG_BUCK_BUNNY = 10378
const GENERIC_URL = 'https://lists.example/blender.json'

async function started({ clock }: { clock?: ReturnType<typeof createFakeClock> } = {}) {
  const indexer = createFakeIndexer()
  const replay = createReplayFetch()
  const fetch: Fetch = (input, init) =>
    String(input instanceof Request ? input.url : input).startsWith(FAKE_ORIGIN)
      ? indexer.fetch(input, init)
      : replay(input, init)
  const lists = createFakeLists()
  lists.generic.set(GENERIC_URL, { body: GENERIC_LIST })
  const runtime = await bootRuntime({
    fetch,
    clock,
    lists: {
      fetch: lists.fetch,
      traktClientId: FAKE_TRAKT_CLIENT_ID,
      traktClientSecret: FAKE_TRAKT_CLIENT_SECRET,
    },
  })
  const app = createApi(runtime)
  const { owner, token } = await withOwner(runtime)
  const member = await addMember(runtime, owner.id, 'Mara')
  await runtime.metadata.settings.setKey('test-tmdb-key')
  runtime.metadata.settings.update({ region: 'US' })
  const folder = join(runtime.config.dataDir, 'movies')
  mkdirSync(folder, { recursive: true })
  const api = clientFor(app, { token })
  await api.rootFolders.add({ body: { path: folder } })
  const add = (tmdbId: number) =>
    api.movies.add({
      body: {
        tmdbId,
        rootFolder: folder,
        monitored: true,
        minimumAvailability: 'released',
        versions: [{ label: '1080p', qualityProfileId: 'qp-hd' }],
      },
    })
  return {
    runtime,
    app,
    api,
    token,
    memberApi: clientFor(app, { token: member.token }),
    folder,
    add,
    lists,
  }
}

describe('Wanted', () => {
  test('lists missing movies; searching needs an indexer, then queues', async () => {
    const { api, add, runtime, memberApi } = await started()
    await add(SINTEL)
    await add(CAT_IN_THE_HAT)
    const missing = await api.wanted.missing()
    expect(missing.items.map((m) => m.id)).toEqual([SINTEL])
    expect((await api.wanted.cutoff()).items).toEqual([])
    expect(await failure(api.wanted.search({ body: { all: 'missing' } }))).toMatchObject({
      code: 'conflict',
      reason: 'no-indexers',
    })
    await api.indexers.add({
      body: {
        definitionId: 'generic-torznab',
        settings: { baseUrl: `${FAKE_ORIGIN}/torznab`, apiKey: FAKE_CREDENTIALS.torznabKey },
      },
    })
    expect(await api.wanted.search({ body: { all: 'missing' } })).toEqual({
      queued: 1,
      episodes: 0,
    })
    expect(runtime.jobs.list({ type: 'movies.search' })).toHaveLength(1)
    expect(await api.wanted.search({ body: { ids: [SINTEL] } })).toEqual({ queued: 1 })
    expect(await failure(memberApi.wanted.missing())).toMatchObject({ code: 'forbidden' })
  })

  test('leaves out films in a read-only root folder, and refuses a Search on one (HT-113)', async () => {
    const { api, add } = await started()
    await add(SINTEL)
    await api.indexers.add({
      body: {
        definitionId: 'generic-torznab',
        settings: { baseUrl: `${FAKE_ORIGIN}/torznab`, apiKey: FAKE_CREDENTIALS.torznabKey },
      },
    })
    const [folder] = await api.rootFolders.list({ query: { kind: 'movies' } })
    if (!folder) throw new Error('no root folder')
    await api.rootFolders.update({ params: { id: folder.id }, body: { readOnly: true } })
    expect(await api.wanted.missing()).toMatchObject({ items: [], total: 0 })
    expect(await api.wanted.search({ body: { all: 'missing' } })).toEqual({
      queued: 0,
      episodes: 0,
    })
    const readOnly = { code: 'conflict', reason: 'read-only' }
    expect(
      await failure(api.movies.bulk({ body: { action: 'search', ids: [SINTEL] } })),
    ).toMatchObject(readOnly)
    expect(await failure(api.movies.interactiveSearch({ params: { id: SINTEL } }))).toMatchObject(
      readOnly,
    )
    // the calendar keeps its date
    const entries = await api.wanted.calendar({ query: { from: '2010-01-01', to: '2010-12-31' } })
    expect(entries.flatMap((e) => ('movie' in e ? [e.movie.id] : []))).toContain(SINTEL)
    // managed again: wanted at once
    await api.rootFolders.update({ params: { id: folder.id }, body: { readOnly: false } })
    expect((await api.wanted.missing()).items.map((m) => m.id)).toEqual([SINTEL])
  })

  test('the calendar, with its range checked', async () => {
    const { api, add } = await started()
    await add(CAT_IN_THE_HAT)
    const entries = await api.wanted.calendar({ query: { from: '2026-10-01', to: '2026-12-31' } })
    expect(entries.map((e) => [e.date, e.kind, 'movie' in e ? e.movie.id : null])).toEqual([
      ['2026-11-06', 'cinema', CAT_IN_THE_HAT],
    ])
    expect(
      await failure(api.wanted.calendar({ query: { from: '2026-10-01', to: '2028-01-01' } })),
    ).toMatchObject({ code: 'invalid' })
    expect(
      await failure(api.wanted.calendar({ query: { from: '2026-10-02', to: '2026-10-01' } })),
    ).toMatchObject({ code: 'invalid' })
  })
})

describe('episodes (HT-109)', () => {
  test('on their air dates in the calendar and the feed, and in Missing once aired', async () => {
    // a week after Chernobyl's third episode aired (2019-05-20)
    const clock = createFakeClock(Date.UTC(2019, 4, 27, 12))
    const { api, app, runtime, add } = await started({ clock })
    await add(CAT_IN_THE_HAT)
    const root = join(runtime.config.dataDir, 'shows')
    mkdirSync(root, { recursive: true })
    runtime.media.rootFolders.add({ path: root, kind: 'shows' })
    await api.series.add({
      body: {
        tmdbId: 87108,
        qualityProfileId: 'qp-hd',
        rootFolder: root,
        monitor: 'all',
        seasonFolders: true,
        search: false,
      },
    })
    const may = await api.wanted.calendar({ query: { from: '2019-05-01', to: '2019-06-30' } })
    const episodes = may.flatMap((e) => (e.kind === 'episode' ? [e] : []))
    expect(episodes.map((e) => [e.date, e.episode.episode.number])).toEqual([
      ['2019-05-06', 1],
      ['2019-05-13', 2],
      ['2019-05-20', 3],
      ['2019-05-27', 4],
      ['2019-06-03', 5],
    ])
    expect(episodes[0]?.episode).toMatchObject({
      show: { id: '87108', title: 'Chernobyl', year: 2019 },
      episode: { season: 1, number: 1, status: 'missing', quality: null },
    })
    // aired by today and monitored: Missing has them, newest first; the fifth hasn't aired
    const missing = await api.wanted.missingEpisodes({ query: {} })
    expect(missing.items.map((i) => i.episode.number)).toEqual([4, 3, 2, 1])
    expect(episodes.at(-1)?.episode.episode.status).toBe('unaired')
    // a page at a time
    const two = await api.wanted.missingEpisodes({ query: { limit: 2 } })
    expect(two).toMatchObject({ total: 4, next: '2' })
    const rest = await api.wanted.missingEpisodes({ query: { limit: 2, cursor: two.next ?? '' } })
    expect(rest.items.map((i) => i.episode.number)).toEqual([2, 1])

    // the feed: each episode its own event, by the show and its numbers
    const made = await api.wanted.makeFeedKey()
    const url = new URL(made.url ?? '')
    const body = await (await app.request(`${ORIGIN}${url.pathname}${url.search}`)).text()
    const lines = body
      .replace(/\r\n[ \t]/g, '')
      .slice(0, -2)
      .split('\r\n')
    const server = runtime.server().id
    expect(lines).toContain(`UID:show-87108-s1e1@${server}`)
    expect(lines).toContain('DTSTART;VALUE=DATE:20190506')
    expect(lines).toContain('SUMMARY:Chernobyl · S01E01')
    expect(lines.filter((l) => l.startsWith('UID:show-87108-'))).toHaveLength(5)
    expect(lines.some((l) => l.startsWith('X-WR-CALNAME:') && l.includes('movies and shows'))).toBe(
      true,
    )
    for (const line of body.slice(0, -2).split('\r\n'))
      expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75)
  })
})

describe('the calendar feed', () => {
  test('answers RFC 5545 with the key in its address, and nowhere else', async () => {
    const { api, app, add, runtime } = await started()
    await add(CAT_IN_THE_HAT)
    expect(await api.wanted.feedKey()).toEqual({ url: null, createdAt: null })
    const made = await api.wanted.makeFeedKey()
    expect(made.url).toMatch(/^http:\/\/localhost\/feed\/v1\/calendar\.ics\?key=/)
    // shown again later, the same address
    expect((await api.wanted.feedKey()).url).toBe(made.url)
    const url = new URL(made.url ?? '')
    const key = url.searchParams.get('key') ?? ''

    // the feed is served under the date the runtime's clock gives, so its window covers the date
    const res = await app.request(`${ORIGIN}${url.pathname}${url.search}`)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('text/calendar; charset=utf-8')
    const body = await res.text()
    const now = runtime.clock.now()
    const inWindow = Date.parse('2026-11-06') > now - 30 * 86_400_000
    // every line ends CRLF and is at most 75 octets (§ 3.1)
    expect(body.endsWith('\r\n')).toBe(true)
    const lines = body.slice(0, -2).split('\r\n')
    for (const line of lines) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75)
    // unfolded, each content line is `name *(;param) : value` (§ 3.1's contentline)
    const unfolded = body
      .replace(/\r\n[ \t]/g, '')
      .slice(0, -2)
      .split('\r\n')
    for (const line of unfolded) expect(line).toMatch(/^[A-Z][A-Z0-9-]*(;[A-Z-]+=[^:;]+)*:.*$/)
    expect(unfolded[0]).toBe('BEGIN:VCALENDAR')
    expect(unfolded).toContain('VERSION:2.0')
    expect(unfolded.some((l) => l.startsWith('PRODID:'))).toBe(true)
    expect(unfolded.at(-1)).toBe('END:VCALENDAR')
    if (inWindow) {
      const server = runtime.server()
      expect(unfolded).toContain(`UID:${CAT_IN_THE_HAT}-cinema@${server.id}`)
      expect(unfolded).toContain('DTSTART;VALUE=DATE:20261106')
      expect(unfolded).toContain('SUMMARY:The Cat in the Hat in cinemas')
      expect(unfolded.filter((l) => l === 'BEGIN:VEVENT').length).toBe(
        unfolded.filter((l) => l === 'END:VEVENT').length,
      )
      expect(unfolded.find((l) => l.startsWith('DTSTAMP:'))).toMatch(/^DTSTAMP:\d{8}T\d{6}Z$/)
    }

    // the key opens the feed and nothing else
    const asBearer = await app.request(`${ORIGIN}/api/v1/movies`, {
      headers: { authorization: `Bearer ${key}` },
    })
    expect(asBearer.status).toBe(401)
    expect((await app.request(`${ORIGIN}/feed/v1/calendar.ics?key=nope`)).status).toBe(401)
    // an API key isn't a calendar key
    expect(
      await failure(api.apiKeys.create({ body: { name: 'Calendar', scope: 'calendar' } })),
    ).toMatchObject({ code: 'invalid' })

    // turned off, the address stops working
    await api.wanted.revokeFeedKey()
    expect((await app.request(`${ORIGIN}${url.pathname}${url.search}`)).status).toBe(401)
  })

  test('escapes text and folds long lines', () => {
    expect(escapeText('a;b,c\\d\ne')).toBe('a\\;b\\,c\\\\d\\ne')
    const long = `DESCRIPTION:${'é'.repeat(80)}`
    const folded = fold(long)
    for (const part of folded.split('\r\n'))
      expect(new TextEncoder().encode(part).length).toBeLessThanOrEqual(75)
    expect(folded.replace(/\r\n /g, '')).toBe(long)
  })
})

describe('System › Tasks', () => {
  test('lists the schedules and runs one now', async () => {
    const { api, runtime } = await started()
    const tasks = await api.system.tasks()
    const rss = tasks.find((t) => t.id === 'indexers.rss')
    expect(rss).toMatchObject({ interval: 900, state: 'idle', lastRun: null })
    expect(tasks.map((t) => t.id)).toEqual(
      expect.arrayContaining(['movies.wanted', 'lists.sync', 'indexers.rss']),
    )
    await api.system.runTask({ params: { id: 'lists.sync' } })
    expect(runtime.jobs.list({ type: 'lists.sync' }).length).toBeGreaterThan(0)
    expect(await failure(api.system.runTask({ params: { id: 'no.such.task' } }))).toMatchObject({
      code: 'not-found',
    })
  })
})

describe('import lists', () => {
  test('a generic list adds what’s new; a deleted movie can be kept off lists', async () => {
    const { api, runtime, folder, add } = await started()
    await add(BIG_BUCK_BUNNY)
    expect(
      await api.importLists.test({ body: { settings: { kind: 'generic', url: GENERIC_URL } } }),
    ).toMatchObject({ ok: true, found: 3 })
    const list = await api.importLists.add({
      body: {
        name: 'Blender',
        enabled: true,
        settings: { kind: 'generic', url: GENERIC_URL },
        rootFolder: folder,
        qualityProfileId: 'qp-hd',
        languageProfileId: null,
        monitored: true,
        minimumAvailability: 'released',
        searchOnAdd: false,
      },
    })
    await runtime.lists.sync(list.id)
    const [saved] = await api.importLists.list()
    expect(saved?.lastResult).toEqual({
      found: 3,
      added: 1,
      skipped: 1,
      unresolved: ['Not on TMDB'],
      error: null,
    })
    expect((await api.movies.get({ params: { id: SINTEL } })).monitored).toBe(true)

    await api.movies.delete({ params: { id: SINTEL }, query: { exclude: 'true' } })
    expect((await api.importLists.exclusions()).map((e) => e.tmdbId)).toEqual([SINTEL])
    await runtime.lists.sync(list.id)
    expect(await failure(api.movies.get({ params: { id: SINTEL } }))).toMatchObject({
      code: 'not-found',
    })
    await api.importLists.removeExclusion({ params: { tmdbId: SINTEL } })
    await api.importLists.remove({ params: { id: list.id } })
    expect(await api.importLists.list()).toEqual([])
  })

  test('Trakt connects with the device flow', async () => {
    const { api, lists } = await started()
    expect(await api.importLists.trakt()).toEqual({ available: true, account: null })
    const code = await api.importLists.traktConnect()
    expect(code.verificationUrl).toBe('https://trakt.tv/activate')
    expect(await api.importLists.traktPoll()).toEqual({ state: 'pending' })
    lists.trakt.device = 'approved'
    expect(await api.importLists.traktPoll()).toEqual({ state: 'connected' })
    expect(await api.importLists.trakt()).toEqual({ available: true, account: 'highsea-owner' })
    await api.importLists.traktDisconnect()
    expect((await api.importLists.trakt()).account).toBeNull()
  })
})
