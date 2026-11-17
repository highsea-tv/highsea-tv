// SPDX-License-Identifier: AGPL-3.0-only
// The movies area's routes through the transport (one-client-platform-d.md › D2): the library and a
// movie's page, release search and grabs, TMDB's metadata, smart collections, Wanted and the
// calendar's feed, and the import lists, each in its response schema, with the server's refusals.
import { describe, expect, test } from 'bun:test'
import { routes } from '@highsea-tv/api-contract'
import { createMockFetch, memoryStorage } from '@highsea-tv/mock/transport'
import { type ApiError, createClient } from '@highsea-tv/sdk'

const LAN = 'http://192.168.1.20:3000'
const device = { name: 'Ines’s Mac', client: 'desktop' as const, appVersion: '0.3.0' }
/** Tears of Steel: in the library, with a file (films.ts's SEED). */
const FILM = 10111

const setup = () => {
  const fetch = createMockFetch({ latency: 0, storage: memoryStorage() })
  const anon = createClient({ baseUrl: LAN, fetch })
  const as = async (username: string) => {
    let r = await anon.auth.signIn({ body: { username, password: 'x', device } })
    if (r.status === 'two-factor')
      r = await anon.auth.twoFactor({ body: { challenge: r.challenge, code: '123456' } })
    if (r.status !== 'signed-in' || !r.token) throw new Error('not signed in')
    return createClient({ baseUrl: LAN, fetch, token: r.token })
  }
  return { as }
}

const caught = async (p: Promise<unknown>) => {
  try {
    await p
  } catch (e) {
    return e as ApiError
  }
  throw new Error('it answered')
}

type Schema = { parse(value: unknown): unknown }
const parse = (route: { responses: Record<number, unknown> }, value: unknown, status = 200) =>
  (route.responses as Record<number, { content: { 'application/json': { schema: Schema } } }>)[
    status
  ]?.content['application/json'].schema.parse(value)

describe('movies', () => {
  test('the library pages, filters and counts by status', async () => {
    const c = await (await setup()).as('ines')
    const all = await c.movies.list({ query: { limit: 5 } })
    parse(routes.movies.list, all)
    expect(all.items).toHaveLength(5)
    expect(all.next).not.toBeNull()
    expect(all.counts.all).toBe(all.total)
    const next = await c.movies.list({ query: { limit: 5, cursor: all.next as string } })
    expect(next.items[0]?.id).not.toBe(all.items[0]?.id)
    const wanted = await c.movies.list({ query: { status: 'wanted' } })
    expect(wanted.items.every((m) => m.status === 'wanted')).toBe(true)
    expect(wanted.counts.all).toBe(all.total)
    const bad = await caught(c.movies.list({ query: { cursor: 'nope' } }))
    expect(bad.status).toBe(400)
  })

  test('a movie changes, takes versions and keeps at least one', async () => {
    const c = await (await setup()).as('ines')
    const m = await c.movies.get({ params: { id: FILM } })
    parse(routes.movies.get, m)
    const off = await c.movies.update({ params: { id: FILM }, body: { monitored: !m.monitored } })
    expect(off.monitored).toBe(!m.monitored)
    expect((await c.movies.get({ params: { id: FILM } })).monitored).toBe(!m.monitored)

    const two = await c.movies.addVersion({
      params: { id: FILM },
      body: { label: 'Extra cut', qualityProfileId: m.qualityProfileId },
    })
    expect(two.versions.at(-1)?.label).toBe('Extra cut')
    const renamed = await c.movies.updateVersion({
      params: { id: FILM, versionId: two.versions.at(-1)?.id as string },
      body: { label: 'Director’s cut' },
    })
    expect(renamed.versions.at(-1)?.label).toBe('Director’s cut')
    for (const v of renamed.versions.slice(1))
      await c.movies.removeVersion({ params: { id: FILM, versionId: v.id } })
    const last = await caught(
      c.movies.removeVersion({ params: { id: FILM, versionId: m.versions[0]?.id as string } }),
    )
    expect(last.status).toBe(409)
    expect(last.message).toBe('A movie keeps at least one version.')

    const gone = await caught(c.movies.get({ params: { id: 999_999_999 } }))
    expect(gone.status).toBe(404)
    expect(gone.message).toBe('That movie isn’t in the library.')
  })

  test('adding from Discover, then the bulk bar and removing', async () => {
    const c = await (await setup()).as('ines')
    const page = await c.movies.discover({ query: {} })
    parse(routes.movies.discover, page)
    const pages = await Promise.all(
      Array.from({ length: page.totalPages }, (_, i) =>
        c.movies.discover({ query: { page: i + 1 } }),
      ),
    )
    const unadded = pages.flatMap((p) => p.items).filter((x) => !x.inLibrary)
    const fresh = unadded[0]
    if (!fresh) throw new Error('nothing to add')
    const folder = (await c.rootFolders.list()).at(0)?.path as string
    const profile = (await c.movies.get({ params: { id: FILM } })).qualityProfileId
    const added = await c.movies.add({
      body: {
        tmdbId: fresh.id,
        rootFolder: folder,
        monitored: true,
        minimumAvailability: 'released',
        versions: [{ label: '1080p', qualityProfileId: profile }],
      },
    })
    parse(routes.movies.add, added, 201)
    expect(added.id).toBe(fresh.id)
    const bad = await caught(
      c.movies.add({
        body: {
          tmdbId: unadded[1]?.id ?? fresh.id,
          rootFolder: '/nowhere',
          monitored: true,
          minimumAvailability: 'released',
          versions: [{ label: '1080p', qualityProfileId: profile }],
        },
      }),
    )
    expect(bad.status).toBe(400)

    const r = await c.movies.bulk({
      body: { action: 'unmonitor', ids: [fresh.id, 999_999_999] },
    })
    expect(r).toEqual({ ids: [fresh.id], missing: [999_999_999] })
    expect((await c.movies.get({ params: { id: fresh.id } })).monitored).toBe(false)
    await c.movies.delete({ params: { id: fresh.id }, query: {} })
    expect((await caught(c.movies.get({ params: { id: fresh.id } }))).status).toBe(404)
  })

  test('a search’s releases are grabbed into the queue, and expire with it', async () => {
    const c = await (await setup()).as('ines')
    const wanted = (await c.movies.list({ query: { status: 'wanted' } })).items[0]
    if (!wanted) throw new Error('nothing wanted')
    expect(await c.movies.releases({ params: { id: wanted.id } })).toEqual([])
    const s = await c.movies.interactiveSearch({ params: { id: wanted.id } })
    parse(routes.movies.interactiveSearch, s)
    const best = s.releases.find((x) => x.approved) ?? s.releases[0]
    if (!best) throw new Error('no releases')
    expect(await c.movies.releases({ params: { id: wanted.id } })).toHaveLength(s.releases.length)
    const q = await c.movies.grabRelease({
      params: { id: wanted.id, guid: best.guid },
      body: { indexerId: best.indexerId, force: true },
    })
    parse(routes.movies.grabRelease, q)
    expect(q.movieId).toBe(wanted.id)
    const unknown = await caught(
      c.movies.grabRelease({
        params: { id: wanted.id, guid: 'rel-none' },
        body: { indexerId: best.indexerId },
      }),
    )
    expect(unknown.status).toBe(404)
  })

  test('a movie’s files and history', async () => {
    const c = await (await setup()).as('ines')
    const files = await c.movies.files({ params: { id: FILM } })
    parse(routes.movies.files, files)
    expect(files.length).toBeGreaterThan(0)
    const h = await c.movies.history({ params: { id: FILM }, query: {} })
    parse(routes.movies.history, h)
  })

  test('upcoming and recently added are the dashboard’s', async () => {
    const c = await (await setup()).as('ines')
    parse(routes.movies.recent, await c.movies.recent({ query: {} }))
    parse(routes.movies.upcoming, await c.movies.upcoming({ query: { days: 60 } }))
  })

  test('a user can’t read the library', async () => {
    const c = await (await setup()).as('ruth')
    expect((await caught(c.movies.list({ query: {} }))).status).toBe(403)
  })
})

describe('metadata', () => {
  test('a movie, its recommendations and its collection', async () => {
    const c = await (await setup()).as('ines')
    const m = await c.metadata.movie({ params: { id: FILM } })
    parse(routes.metadata.movie, m)
    expect(m.cast.length).toBeGreaterThan(0)
    parse(
      routes.metadata.recommendations,
      await c.metadata.recommendations({ params: { id: FILM } }),
    )
    const withCollection = (
      await Promise.all(
        (
          await c.movies.list({ query: { limit: 200 } })
        ).items.map((x) => c.metadata.movie({ params: { id: x.id } })),
      )
    ).find((x) => x.collection)
    if (withCollection?.collection) {
      const coll = await c.metadata.collection({ params: { id: withCollection.collection.id } })
      parse(routes.metadata.collection, coll)
      expect(coll.parts.some((p) => p.id === withCollection.id)).toBe(true)
    }
    const none = await caught(c.metadata.movie({ params: { id: 999_999_999 } }))
    expect(none.message).toBe('TMDB has no movie with that id.')
  })
})

describe('smart collections', () => {
  test('the list, a preview, adding, saving and removing', async () => {
    const c = await (await setup()).as('ines')
    const list = await c.collections.list()
    parse(routes.collections.list, list)
    expect(list.length).toBeGreaterThan(0)
    const first = list[0] as (typeof list)[number]
    parse(routes.collections.get, await c.collections.get({ params: { id: first.id } }))
    parse(routes.collections.fields, await c.collections.fields({ query: {} }))

    const input = {
      name: 'Short films',
      summary: '',
      artwork: null,
      rules: {
        kind: 'group' as const,
        id: 'root',
        match: 'all' as const,
        rules: [
          {
            kind: 'condition' as const,
            id: 'r1',
            field: 'runtime' as const,
            op: 'atMost' as const,
            value: 20,
          },
        ],
      },
      include: [],
      exclude: [],
      sort: 'title' as const,
      descending: false,
      limit: null,
      audience: { kind: 'everyone' as const },
    }
    const p = await c.collections.preview({ body: { collection: input } })
    parse(routes.collections.preview, p)
    const added = await c.collections.add({ body: input })
    parse(routes.collections.add, added, 201)
    const saved = await c.collections.save({
      params: { id: added.id },
      body: { ...input, name: 'Very short films' },
    })
    expect(saved.name).toBe('Very short films')
    await c.collections.remove({ params: { id: added.id } })
    const gone = await caught(c.collections.get({ params: { id: added.id } }))
    expect(gone.status).toBe(404)
    expect(gone.message).toBe('There’s no collection with that id.')
  })

  test('people are found by name, and a role rule keeps their numbers', async () => {
    const c = await (await setup()).as('ines')
    const people = await c.collections.people({ query: { q: 'keaton', field: 'actor' } })
    parse(routes.collections.people, people)
    const buster = people[0]
    if (!buster) throw new Error('no one found')
    const p = await c.collections.preview({
      body: {
        collection: {
          name: 'Keaton',
          summary: '',
          artwork: null,
          rules: {
            kind: 'group',
            id: 'root',
            match: 'all',
            rules: [
              {
                kind: 'condition',
                id: 'r1',
                field: 'actor',
                op: 'includes',
                value: [String(buster.id)],
              },
            ],
          },
          include: [],
          exclude: [],
          sort: 'year',
          descending: false,
          limit: null,
          audience: { kind: 'everyone' },
        },
      },
    })
    expect(p.matched).toBe(buster.titles)
  })
})

describe('wanted', () => {
  test('missing, cutoff unmet, a search and the calendar', async () => {
    const c = await (await setup()).as('ines')
    const missing = await c.wanted.missing({ query: {} })
    parse(routes.wanted.missing, missing)
    expect(missing.items.every((m) => m.monitored && m.status === 'wanted')).toBe(true)
    parse(routes.wanted.cutoff, await c.wanted.cutoff({ query: {} }))
    const s = await c.wanted.search({ body: { all: 'missing' } })
    expect(s.queued).toBe(missing.total)

    const today = new Date()
    const day = (d: Date) => d.toISOString().slice(0, 10)
    const from = day(new Date(today.getTime() - 200 * 86_400_000))
    const to = day(new Date(today.getTime() + 200 * 86_400_000))
    const cal = await c.wanted.calendar({ query: { from, to } })
    parse(routes.wanted.calendar, cal)
    expect(cal.length).toBeGreaterThan(0)
    const backwards = await caught(c.wanted.calendar({ query: { from: to, to: from } }))
    expect(backwards.status).toBe(400)
  })

  test('the feed’s key is made, replaced and turned off', async () => {
    const c = await (await setup()).as('ines')
    expect(await c.wanted.feedKey()).toEqual({ url: null, createdAt: null })
    const made = await c.wanted.makeFeedKey()
    parse(routes.wanted.makeFeedKey, made)
    expect(made.url).toContain('/feed/v1/calendar.ics?key=')
    expect((await c.wanted.makeFeedKey()).url).not.toBe(made.url)
    await c.wanted.revokeFeedKey()
    expect((await c.wanted.feedKey()).url).toBeNull()
  })
})

describe('import lists', () => {
  test('the lists, in the contract’s shape', async () => {
    const c = await (await setup()).as('ines')
    const lists = await c.importLists.list()
    parse(routes.importLists.list, lists)
    expect(lists.every((l) => ['tmdb', 'trakt', 'generic'].includes(l.kind))).toBe(true)
  })
})
