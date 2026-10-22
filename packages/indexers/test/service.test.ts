// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, test } from 'bun:test'
import { schema } from '@highsea-tv/db'
import type { Definition } from '@highsea-tv/schemas/indexers'
import { BACKOFF_STEPS_MS, FAILING_AFTER_MS } from '../src/health.ts'
import { HEALTH_TOPIC, INDEXERS_TOPIC } from '../src/index.ts'
import {
  FAKE_CREDENTIALS,
  FAKE_ORIGIN,
  fakeHtml,
  fakeJson,
  fakeNewznab,
  madeUpTorrent,
} from './fake/index.ts'
import { any, catalogDefinition, setup, sintelSearch } from './helpers.ts'

const torznabSettings = { baseUrl: `${FAKE_ORIGIN}/torznab`, apiKey: FAKE_CREDENTIALS.torznabKey }

function withTorznab(options: { timeoutMs?: number; extra?: Definition[] } = {}) {
  return setup({
    definitions: [catalogDefinition('generic-torznab'), ...(options.extra ?? [])],
    timeoutMs: options.timeoutMs,
  })
}

describe('adding and testing', () => {
  test('adds after a passing test, seals the key, and never shows it', async () => {
    const t = withTorznab()
    const { indexer, test: result } = await t.indexers.add('generic-torznab', {
      settings: torznabSettings,
    })
    expect(result.ok).toBe(true)
    expect(result.message).toMatch(/^Connected to Torznab\. The test search found \d+ releases\.$/)
    expect(indexer).toMatchObject({
      definitionId: 'generic-torznab',
      name: 'Torznab',
      enabled: true,
      priority: 25,
      health: 'healthy',
      protocol: 'torrent',
      needsAttention: false,
      settings: { values: { baseUrl: `${FAKE_ORIGIN}/torznab` }, secrets: { apiKey: true } },
    })
    expect(JSON.stringify(t.indexers.list())).not.toContain(FAKE_CREDENTIALS.torznabKey)
    const row = t.db.select().from(schema.indexers).get()
    expect(JSON.stringify(row)).not.toContain(FAKE_CREDENTIALS.torznabKey)
    expect((row?.settings as Record<string, string> | undefined)?.apiKey).toStartWith('v1.')
    expect(t.seen.map((e) => e.topic)).toEqual([INDEXERS_TOPIC, HEALTH_TOPIC])
  })

  test('a failing test adds nothing and says why', async () => {
    const t = withTorznab()
    const err = await t.indexers
      .add('generic-torznab', { settings: { ...torznabSettings, apiKey: 'wrong-key' } })
      .catch((e) => e)
    expect(err.code).toBe('invalid')
    expect(err.message).toBe(
      'The indexer refused the credentials: Incorrect user credentials (100).',
    )
    expect(err.details.test.ok).toBe(false)
    expect(t.indexers.list()).toEqual([])
  })

  test('settings are checked against the definition', async () => {
    const t = withTorznab()
    await expect(t.indexers.add('generic-torznab', { settings: { apiKey: 'x' } })).rejects.toThrow(
      'Address is required.',
    )
    await expect(
      t.indexers.add('generic-torznab', { settings: { ...torznabSettings, baseUrl: 'ftp://x' } }),
    ).rejects.toThrow('Address starts with http:// or https://.')
    await expect(
      t.indexers.add('generic-torznab', { settings: { ...torznabSettings, colour: 'red' } }),
    ).rejects.toThrow('Torznab has no setting called colour.')
    await expect(t.indexers.add('nope')).rejects.toThrow('That indexer isn’t in the catalog.')
    await expect(
      t.indexers.add('generic-torznab', { settings: torznabSettings, priority: 51 }),
    ).rejects.toThrow('Priority is a whole number from 1 to 50.')
  })

  test('the same definition twice gets a second name', async () => {
    const t = withTorznab()
    await t.indexers.add('generic-torznab', { settings: torznabSettings })
    const { indexer } = await t.indexers.add('generic-torznab', { settings: torznabSettings })
    expect(indexer.name).toBe('Torznab 2')
    expect(t.indexers.catalog().find((c) => c.id === 'generic-torznab')?.installed).toBe(2)
  })

  test('tests a definition before adding, and an installed indexer with unsaved settings', async () => {
    const t = withTorznab()
    expect((await t.indexers.test('generic-torznab', torznabSettings)).ok).toBe(true)
    const { indexer } = await t.indexers.add('generic-torznab', { settings: torznabSettings })
    // an empty secret keeps the saved one
    expect(
      (await t.indexers.test(indexer.id, { baseUrl: `${FAKE_ORIGIN}/torznab`, apiKey: '' })).ok,
    ).toBe(true)
    const bad = await t.indexers.test(indexer.id, { apiKey: 'wrong-key' })
    expect(bad.ok).toBe(false)
    // unsaved settings don't touch the saved indexer's health
    expect(t.indexers.get(indexer.id).health).toBe('healthy')
  })

  test('the catalog view and the starter pack', () => {
    const t = setup({
      definitions: [catalogDefinition('generic-torznab'), catalogDefinition('internet-archive')],
    })
    expect(t.indexers.catalog().map((c) => c.id)).toEqual(['internet-archive', 'generic-torznab'])
    const [starter, ...rest] = t.indexers.catalog({ starter: true })
    expect(rest).toEqual([])
    expect(starter).toMatchObject({
      id: 'internet-archive',
      privacy: 'public',
      categories: ['Movies'],
      license: 'CC0-1.0',
      installed: 0,
      local: false,
    })
  })
})

describe('update, retry, remove', () => {
  test('priority, name and enabled', async () => {
    const t = withTorznab()
    const { indexer } = await t.indexers.add('generic-torznab', { settings: torznabSettings })
    const updated = t.indexers.update(indexer.id, {
      priority: 5,
      name: 'Home Prowlarr',
      enabled: false,
    })
    expect(updated).toMatchObject({
      priority: 5,
      name: 'Home Prowlarr',
      enabled: false,
      health: 'disabled',
    })
    expect(t.indexers.hasEnabled()).toBe(false)
    expect(t.indexers.issues().map((i) => i.id)).toEqual(['indexers-none'])
    expect(() => t.indexers.update(indexer.id, { priority: 0 })).toThrow('1 to 50')
  })

  test('new settings start health over', async () => {
    const t = withTorznab()
    const { indexer } = await t.indexers.add('generic-torznab', { settings: torznabSettings })
    t.fake.misbehave({ kind: 'status', status: 503 })
    await t.indexers.search(sintelSearch())
    expect(t.indexers.get(indexer.id).health).toBe('backoff')
    t.indexers.update(indexer.id, { settings: { baseUrl: `${FAKE_ORIGIN}/torznab` } })
    const after = t.indexers.get(indexer.id)
    expect(after.health).toBe('healthy')
    expect(after.settings.secrets.apiKey).toBe(true)
  })

  test('remove', async () => {
    const t = withTorznab()
    const { indexer } = await t.indexers.add('generic-torznab', { settings: torznabSettings })
    t.indexers.remove(indexer.id)
    expect(t.indexers.list()).toEqual([])
    expect(() => t.indexers.get(indexer.id)).toThrow('That indexer isn’t installed.')
  })
})

describe('health', () => {
  test('backs off on the schedule, then fails after 6 hours, then recovers at once', async () => {
    const t = withTorznab()
    const { indexer } = await t.indexers.add('generic-torznab', { settings: torznabSettings })
    t.fake.misbehave({ kind: 'status', status: 502 })
    const delays: number[] = []
    for (let i = 0; i < 7; i++) {
      await t.indexers.search(sintelSearch())
      const v = t.indexers.get(indexer.id)
      if (v.backoffUntil) delays.push(Date.parse(v.backoffUntil) - t.clock.now())
      t.clock.advance((delays.at(-1) ?? 0) + 1)
    }
    // the jitter is ±10%; the tests' random() is 0.5, which is none
    expect(delays).toEqual([...BACKOFF_STEPS_MS, BACKOFF_STEPS_MS.at(-1) as number])
    const failing = t.indexers.get(indexer.id)
    expect(t.clock.now() - Date.parse(failing.failingSince as string)).toBeGreaterThanOrEqual(
      FAILING_AFTER_MS,
    )
    expect(failing.health).toBe('failing')
    expect(failing.lastError).toBe('The indexer answered with an error (HTTP 502).')
    expect(t.indexers.issues()).toEqual([
      expect.objectContaining({
        id: `indexer-${indexer.id}`,
        level: 'error',
        message: 'Torznab has been failing: The indexer answered with an error (HTTP 502).',
      }),
    ])
    expect(t.logs.entries().some((e) => e.message === 'an indexer failed')).toBe(true)

    t.fake.misbehave(null)
    await t.indexers.search(sintelSearch())
    expect(t.indexers.get(indexer.id)).toMatchObject({
      health: 'healthy',
      lastError: null,
      failingSince: null,
    })
  })

  test('a search skips an indexer that is backing off; Retry now clears it', async () => {
    const t = withTorznab()
    const { indexer } = await t.indexers.add('generic-torznab', { settings: torznabSettings })
    t.fake.misbehave({ kind: 'status', status: 500 })
    await t.indexers.search(sintelSearch())
    t.fake.requests.length = 0
    const skipped = await t.indexers.search(sintelSearch())
    expect(skipped.searched).toBe(0)
    expect(t.fake.requests).toEqual([])
    expect(t.indexers.searchable()).toBe(0)
    t.fake.misbehave(null)
    // Retry now: the next search tries it, so it reads as healthy until then
    expect(t.indexers.retry(indexer.id).health).toBe('healthy')
    expect(t.indexers.get(indexer.id).backoffUntil).toBeNull()
    const found = await t.indexers.search(sintelSearch())
    expect(found.searched).toBe(1)
    expect(t.indexers.get(indexer.id).health).toBe('healthy')
  })

  test('429 waits as long as Retry-After says', async () => {
    const t = withTorznab()
    const { indexer } = await t.indexers.add('generic-torznab', { settings: torznabSettings })
    t.fake.misbehave({ kind: 'status', status: 429, retryAfter: '90' })
    await t.indexers.search(sintelSearch())
    const v = t.indexers.get(indexer.id)
    expect(Date.parse(v.backoffUntil as string) - t.clock.now()).toBe(90_000)
  })

  test('refused credentials fail at once and stay out of searches', async () => {
    const t = withTorznab()
    const { indexer } = await t.indexers.add('generic-torznab', { settings: torznabSettings })
    t.fake.misbehave({ kind: 'status', status: 401 })
    const result = await t.indexers.search(sintelSearch())
    expect(result.failed).toEqual([
      {
        indexerId: indexer.id,
        indexer: 'Torznab',
        message: 'The indexer refused the credentials (HTTP 401). Check the API key or password.',
      },
    ])
    const v = t.indexers.get(indexer.id)
    expect(v.health).toBe('failing')
    expect(v.backoffUntil).toBeNull()
    t.clock.advance(7 * 60 * 60 * 1000)
    expect((await t.indexers.search(sintelSearch())).searched).toBe(0)
    expect(t.seen.filter((e) => e.topic === HEALTH_TOPIC).length).toBeGreaterThanOrEqual(2)
  })

  test('a slow indexer times out', async () => {
    const t = withTorznab({ timeoutMs: 50 })
    const { indexer } = await t.indexers.add('generic-torznab', { settings: torznabSettings })
    t.fake.misbehave({ kind: 'slow', ms: 300 })
    const result = await t.indexers.search(sintelSearch())
    expect(result.failed[0]?.message).toContain('didn’t answer within')
    expect(t.indexers.get(indexer.id).health).toBe('backoff')
  })
})

describe('secrets', () => {
  test('never appear in errors, logs, events or API views', async () => {
    const passkey = FAKE_CREDENTIALS.rssPasskey
    const t = setup({ definitions: [catalogDefinition('generic-rss')] })
    const { indexer } = await t.indexers.add('generic-rss', {
      settings: { url: `${FAKE_ORIGIN}/rss/feed/${passkey}` },
    })
    t.fake.misbehave({ kind: 'slow', ms: 10 })
    // a fetch failure whose message carries the address
    t.fake.misbehave({ kind: 'status', status: 404 })
    await t.indexers.search(sintelSearch())
    const everything = JSON.stringify({
      list: t.indexers.list(),
      catalog: t.indexers.catalog(),
      logs: t.logs.entries(),
      events: t.seen,
      issues: t.indexers.issues(),
      status: t.db.select().from(schema.indexerStatus).all(),
      indexers: t.db.select().from(schema.indexers).all(),
    })
    expect(everything).not.toContain(passkey)
    expect(t.indexers.get(indexer.id).settings).toEqual({ values: {}, secrets: { url: true } })
  })

  test('a form sign-in’s session is sealed and reused', async () => {
    const t = setup({ definitions: [fakeHtml(FAKE_ORIGIN)] })
    const { indexer } = await t.indexers.add('fake-html', {
      settings: { username: FAKE_CREDENTIALS.username, password: FAKE_CREDENTIALS.password },
    })
    // the add's test signed in; its session isn't kept, as the indexer didn't exist yet
    expect(t.fake.logins).toBe(1)
    await t.indexers.search(sintelSearch())
    expect(t.fake.logins).toBe(2)
    const status = t.db.select().from(schema.indexerStatus).get()
    expect(status?.session).toStartWith('v1.')
    expect(status?.session).not.toContain('sid-1')
    await t.indexers.search(sintelSearch())
    expect(t.fake.logins).toBe(2)
    expect(t.indexers.get(indexer.id).health).toBe('healthy')
  })
})

describe('rate limits and stats', () => {
  test('requests wait for the definition’s limit, across searches and tests', async () => {
    const t = setup({ definitions: [fakeJson(FAKE_ORIGIN)] })
    const { indexer } = await t.indexers.add('fake-json', {
      settings: { passkey: FAKE_CREDENTIALS.jsonPasskey },
    })
    // two requests in any 10 seconds; the add's test went before the indexer had its own queue
    await t.indexers.search(sintelSearch())
    await t.indexers.test(indexer.id)
    expect(t.sleeps).toEqual([])
    await t.indexers.search(sintelSearch())
    expect(t.sleeps).toEqual([10_000])
  })

  test('24-hour stats from hourly rows', async () => {
    const t = withTorznab()
    const { indexer } = await t.indexers.add('generic-torznab', { settings: torznabSettings })
    await t.indexers.search(sintelSearch())
    t.fake.misbehave({ kind: 'status', status: 500 })
    t.clock.advance(60 * 60 * 1000)
    await t.indexers.search(sintelSearch())
    const stats = t.indexers.get(indexer.id).stats
    // the add's test ran before the indexer existed, so it isn't counted
    expect(stats.queries24h).toBe(2)
    expect(stats.successRate).toBe(0.5)
    expect(stats.grabs24h).toBe(0)
    expect(t.db.select().from(schema.indexerStats).all()).toHaveLength(2)
    t.clock.advance(25 * 60 * 60 * 1000)
    expect(t.indexers.get(indexer.id).stats).toEqual({
      queries24h: 0,
      grabs24h: 0,
      avgResponseMs: null,
      successRate: null,
    })
  })
})

describe('interactive search', () => {
  test('judges, ranks and caches the releases', async () => {
    const t = withTorznab()
    await t.indexers.add('generic-torznab', { settings: torznabSettings })
    const result = await t.indexers.search(sintelSearch())
    expect(result.searched).toBe(1)
    expect(result.failed).toEqual([])
    const rows = result.releases.map((r) => [r.title, r.quality, r.approved])
    expect(rows).toEqual([
      ['Sintel.2010.1080p.BluRay.x264-GRP', 'Bluray-1080p', true],
      // 720p is in HD 1080p and 2160p isn't, so it ranks higher
      ['Sintel.2010.720p.WEB-DL.DDP5.1.H.264-GRP', 'WEBDL-720p', false],
      ['Sintel.2010.2160p.UHD.BluRay.x265-GRP', 'Bluray-2160p', false],
      ['Sintel.2010.DVDRip.XviD-OLD', 'DVD', false],
    ])
    const [best, web] = result.releases
    expect(best?.flags).toEqual(['freeleech'])
    expect(best?.ageHours).toBe(720)
    expect(web?.reasons).toContainEqual({
      kind: 'rejected',
      message: '0 seeders; the minimum is 1',
    })
    expect(JSON.stringify(result)).not.toContain('/dl/')
    // the cache answers without asking again
    t.fake.requests.length = 0
    expect(t.indexers.releases(45745)).toEqual(result.releases)
    expect(t.fake.requests).toEqual([])
    t.clock.advance(31 * 60 * 1000)
    expect(t.indexers.releases(45745)).toEqual([])
  })

  test('ranks across indexers by priority when the rest ties', async () => {
    const t = withTorznab({ extra: [fakeJson(FAKE_ORIGIN)] })
    await t.indexers.add('generic-torznab', { settings: torznabSettings, priority: 30 })
    await t.indexers.add('fake-json', {
      settings: { passkey: FAKE_CREDENTIALS.jsonPasskey },
      priority: 10,
    })
    const result = await t.indexers.search(sintelSearch(any))
    const top = result.releases.filter((r) => r.title === 'Sintel.2010.1080p.BluRay.x264-GRP')
    expect(top.map((r) => r.indexer)).toEqual(['Fake JSON', 'Torznab'])
  })

  test('Usenet indexers are added but not searched', async () => {
    const t = withTorznab({ extra: [fakeNewznab(FAKE_ORIGIN)] })
    const { indexer } = await t.indexers.add('fake-newznab', {
      settings: { apiKey: FAKE_CREDENTIALS.newznabKey },
    })
    expect(indexer.protocol).toBe('usenet')
    expect((await t.indexers.search(sintelSearch())).searched).toBe(0)
  })

  test('results for another movie are left out', async () => {
    const t = setup({ definitions: [catalogDefinition('generic-rss')] })
    await t.indexers.add('generic-rss', {
      settings: { url: `${FAKE_ORIGIN}/rss/feed/${FAKE_CREDENTIALS.rssPasskey}` },
    })
    const result = await t.indexers.search(sintelSearch())
    expect(result.releases.map((r) => r.title)).not.toContain(
      'Big.Buck.Bunny.2008.1080p.BluRay.x264-GRP',
    )
    expect(result.releases).toHaveLength(4)
  })

  test('prune drops expired results', async () => {
    const t = withTorznab()
    t.indexers.defineJobs()
    await t.indexers.add('generic-torznab', { settings: torznabSettings })
    await t.indexers.search(sintelSearch())
    t.clock.advance(31 * 60 * 1000)
    t.jobs.enqueue('indexers.prune', {})
    await t.jobs.tick()
    await t.jobs.idle()
    expect(t.db.select().from(schema.releases).all()).toEqual([])
  })
})

describe('grabs', () => {
  test('fetches the .torrent through the indexer and counts the grab', async () => {
    const t = withTorznab()
    const { indexer } = await t.indexers.add('generic-torznab', { settings: torznabSettings })
    t.indexers.setSeeding(indexer.id, { ratio: 1.5, minutes: null, minMinutes: 7200 })
    const [best] = (await t.indexers.search(sintelSearch())).releases
    const grabbed = await t.indexers.grab({
      tmdbId: 45745,
      indexerId: indexer.id,
      guid: best?.guid as string,
    })
    expect(grabbed.release.title).toBe('Sintel.2010.1080p.BluRay.x264-GRP')
    expect(grabbed.source).toEqual({ torrent: madeUpTorrent('Sintel.2010.1080p.BluRay.x264-GRP') })
    expect(grabbed.seeding).toEqual({ ratio: 1.5, minutes: null, minMinutes: 7200 })
    expect(t.indexers.get(indexer.id).stats.grabs24h).toBe(1)
    expect(t.indexers.get(indexer.id).seeding.minMinutes).toBe(7200)
  })

  test('a redirect to a magnet is the magnet', async () => {
    const t = withTorznab()
    const { indexer } = await t.indexers.add('generic-torznab', { settings: torznabSettings })
    const magnet = 'magnet:?xt=urn:btih:0123456789abcdef0123456789abcdef01234567&dn=Sintel'
    t.fake.serve(101, magnet)
    await t.indexers.search(sintelSearch())
    const grabbed = await t.indexers.grab({
      tmdbId: 45745,
      indexerId: indexer.id,
      guid: 'fake-101',
    })
    expect(grabbed.source).toEqual({ magnet })
  })

  test('a site with a form sign-in signs in again when its session ran out', async () => {
    const t = setup({ definitions: [fakeHtml(FAKE_ORIGIN)] })
    const { indexer } = await t.indexers.add('fake-html', {
      settings: { username: FAKE_CREDENTIALS.username, password: FAKE_CREDENTIALS.password },
    })
    const [best] = (await t.indexers.search(sintelSearch())).releases
    t.fake.expireSessions()
    const grabbed = await t.indexers.grab({
      tmdbId: 45745,
      indexerId: indexer.id,
      guid: best?.guid as string,
    })
    expect('torrent' in grabbed.source).toBe(true)
    expect(t.fake.logins).toBe(3)
    const cookies = t.fake.requests
      .filter((r) => r.url.pathname === '/html/download.php')
      .map((r) => r.headers.get('cookie'))
    expect(cookies).toEqual(['sid=sid-1; theme=dark', 'sid=sid-2; theme=dark'])
  })

  test('a web page instead of a torrent fails the grab and counts against health', async () => {
    const t = setup({ definitions: [fakeJson(FAKE_ORIGIN)] })
    const { indexer } = await t.indexers.add('fake-json', {
      settings: { passkey: FAKE_CREDENTIALS.jsonPasskey },
    })
    const [best] = (await t.indexers.search(sintelSearch())).releases
    t.fake.serve(101, new TextEncoder().encode('<!doctype html><p>Sign in</p>'))
    await expect(
      t.indexers.grab({ tmdbId: 45745, indexerId: indexer.id, guid: best?.guid as string }),
    ).rejects.toThrow('Fake JSON couldn’t send the release: The indexer sent a web page')
    expect(t.indexers.get(indexer.id).lastError).toContain('web page')
    const passkey = FAKE_CREDENTIALS.jsonPasskey
    expect(JSON.stringify(t.logs.entries())).not.toContain(passkey)
  })

  test('a release that left the cache asks for a new search', async () => {
    const t = withTorznab()
    const { indexer } = await t.indexers.add('generic-torznab', { settings: torznabSettings })
    await t.indexers.search(sintelSearch())
    t.clock.advance(31 * 60 * 1000)
    await expect(
      t.indexers.grab({ tmdbId: 45745, indexerId: indexer.id, guid: 'fake-101' }),
    ).rejects.toThrow('That release is no longer in the search results. Search again.')
  })
})

describe('definition versions', () => {
  test('an installed indexer moves to a new version, keeping its settings', async () => {
    const t = withTorznab()
    t.indexers.start()
    const { indexer } = await t.indexers.add('generic-torznab', { settings: torznabSettings })
    const v1 = catalogDefinition('generic-torznab')
    t.source.put({ ...v1, version: '1.1.0' })
    let v = t.indexers.get(indexer.id)
    expect(v).toMatchObject({ definitionVersion: '1.1.0', needsAttention: false })
    expect(v.settings.secrets.apiKey).toBe(true)
    expect((await t.indexers.search(sintelSearch())).releases.length).toBeGreaterThan(0)

    // a new required setting needs attention, and stays out of searches until it's filled in
    t.source.put({
      ...v1,
      version: '1.2.0',
      settings: [
        ...v1.settings,
        { key: 'region', label: 'Region', type: 'text', required: true, secret: false, help: null },
      ],
    })
    v = t.indexers.get(indexer.id)
    expect(v.needsAttention).toBe(true)
    expect((await t.indexers.search(sintelSearch())).searched).toBe(0)
    expect(t.indexers.issues()[0]?.message).toBe(
      'Torznab needs a setting its new definition asks for. Open it in Indexers.',
    )
    t.indexers.update(indexer.id, { settings: { region: 'eu' } })
    expect(t.indexers.get(indexer.id).needsAttention).toBe(false)

    // a definition that goes away
    t.source.drop('generic-torznab')
    expect(t.indexers.get(indexer.id)).toMatchObject({ needsAttention: true, missing: true })
  })

  test('reconcile on boot is safe to repeat', async () => {
    const t = withTorznab()
    await t.indexers.add('generic-torznab', { settings: torznabSettings })
    expect(t.indexers.reconcile()).toEqual([])
    expect(t.indexers.reconcile()).toEqual([])
  })
})
