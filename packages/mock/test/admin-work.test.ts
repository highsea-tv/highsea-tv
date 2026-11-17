// SPDX-License-Identifier: AGPL-3.0-only
// The admin's work routes through the mock transport (one-client-platform-d.md › D2): Activity's
// queue, history and blocklist, Downloads, the folder picker, manual and library import, indexers
// and the catalog's definitions, in the contract's shapes, with the server's refusals.
import { describe, expect, test } from 'bun:test'
import { routes } from '@highsea-tv/api-contract'
import { createMockFetch, memoryStorage } from '@highsea-tv/mock/transport'
import { type ApiError, createClient } from '@highsea-tv/sdk'

const LAN = 'http://192.168.1.20:3000'
const device = { name: 'Theo’s Mac', client: 'web' as const, appVersion: '0.4.0' }

/** Signed in as staff (Theo, an admin) unless someone else is named, the toolbar's role following. */
const setup = async (as = 'theo') => {
  const role = as === 'theo' ? 'admin' : 'user'
  const fetch = createMockFetch({ latency: 0, storage: memoryStorage(), state: { role } })
  const anon = createClient({ baseUrl: LAN, fetch })
  const r = await anon.auth.signIn({ body: { username: as, password: 'x', device } })
  if (r.status !== 'signed-in' || !r.token) throw new Error('not signed in')
  return createClient({ baseUrl: LAN, fetch, token: r.token })
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
const shaped = (route: { responses: Record<number, unknown> }, value: unknown) => {
  const ok = (route.responses[200] ?? route.responses[201]) as {
    content: { 'application/json': { schema: Schema } }
  }
  return ok.content['application/json'].schema.parse(value)
}

describe('the queue', () => {
  test('lists grabs with their movies, pauses and resumes one', async () => {
    const c = await setup()
    const queue = await c.queue.list()
    shaped(routes.queue.list, queue)
    expect(queue.length).toBeGreaterThan(0)
    const row = queue.find((q) => q.movieId !== null && q.state === 'downloading')
    if (!row) throw new Error('nothing downloading')
    const paused = await c.queue.pause({ params: { id: row.id } })
    expect(paused.state).toBe('paused')
    const resumed = await c.queue.resume({ params: { id: row.id } })
    expect(resumed.state).toBe('downloading')
  })

  test('removes one onto the blocklist', async () => {
    const c = await setup()
    const row = (await c.queue.list()).find((q) => q.movieId !== null)
    if (!row) throw new Error('no queue')
    const before = (await c.blocklist.list()).length
    await c.queue.remove({ params: { id: row.id }, body: { blocklist: true } })
    expect((await c.queue.list()).some((q) => q.id === row.id)).toBe(false)
    const after = await c.blocklist.list()
    expect(after.length).toBe(before + 1)
    expect(after[0]?.sourceTitle).toBe(row.release)
  })

  test('refuses a forced import that isn’t blocked, and a gone download', async () => {
    const c = await setup()
    const row = (await c.queue.list()).find((q) => q.state !== 'import-blocked')
    if (!row) throw new Error('no queue')
    expect((await caught(c.queue.forceImport({ params: { id: row.id } }))).status).toBe(409)
    const gone = await caught(c.queue.pause({ params: { id: 'q-nope' } }))
    expect(gone.status).toBe(404)
    expect(gone.message).toBe('That download isn’t in the queue any more.')
  })

  test('is staff’s', async () => {
    const c = await setup('ruth')
    expect((await caught(c.queue.list())).status).toBe(403)
  })
})

describe('history and the blocklist', () => {
  test('pages history, and refuses a bad cursor', async () => {
    const c = await setup()
    const page = await c.history.list({ query: {} })
    shaped(routes.history.list, page)
    expect(page.items.length).toBeGreaterThan(0)
    expect((await caught(c.history.list({ query: { cursor: 'x' } }))).status).toBe(400)
  })

  test('takes a release off the blocklist', async () => {
    const c = await setup()
    const list = await c.blocklist.list()
    shaped(routes.blocklist.list, list)
    const first = list[0]
    if (!first) throw new Error('empty blocklist')
    await c.blocklist.remove({ params: { id: first.id } })
    expect((await c.blocklist.list()).some((b) => b.id === first.id)).toBe(false)
    expect((await caught(c.blocklist.remove({ params: { id: first.id } }))).status).toBe(404)
  })
})

describe('downloads', () => {
  test('lists torrents, adds one by magnet, and refuses it twice', async () => {
    const c = await setup()
    shaped(routes.downloads.list, await c.downloads.list())
    const magnet = 'magnet:?xt=urn:btih:abc&dn=Home.Movies.2019'
    const added = await c.downloads.add({ body: { urlOrMagnet: magnet, paused: true } })
    shaped(routes.downloads.add, added)
    expect(added).toMatchObject({ name: 'Home.Movies.2019', category: 'manual', manual: true })
    expect(added.state).toBe('paused')
    expect((await caught(c.downloads.add({ body: { urlOrMagnet: magnet } }))).status).toBe(409)
    expect(
      (await caught(c.downloads.add({ body: { urlOrMagnet: 'ftp://x', category: 'manual' } })))
        .status,
    ).toBe(400)
    expect(
      (await caught(c.downloads.add({ body: { urlOrMagnet: magnet, category: 'movies' } }))).status,
    ).toBe(400)
  })

  test('pauses, sets a file’s priority, deletes; limits and categories', async () => {
    const c = await setup()
    const t = (await c.downloads.list())[0]
    if (!t) throw new Error('no torrents')
    expect((await c.downloads.pause({ params: { id: t.id } })).state).toBe('paused')
    const path = t.files[0]?.path ?? ''
    const skipped = await c.downloads.setFilePriority({
      params: { id: t.id },
      body: { path, priority: 'skip' },
    })
    expect(skipped.files[0]?.priority).toBe('skip')
    expect(
      (
        await caught(
          c.downloads.setFilePriority({
            params: { id: t.id },
            body: { path: 'nope', priority: 'high' },
          }),
        )
      ).status,
    ).toBe(404)
    await c.downloads.delete({ params: { id: t.id }, body: {} })
    expect((await caught(c.downloads.get({ params: { id: t.id } }))).status).toBe(404)

    expect(await c.downloads.setLimits({ body: { downloadRate: 5_000_000 } })).toEqual({
      downloadRate: 5_000_000,
      uploadRate: 0,
    })
    expect((await c.downloads.limits()).downloadRate).toBe(5_000_000)
    const cats = await c.downloads.categories()
    expect(cats.slice(0, 2).map((x) => x.name)).toEqual(['movies', 'manual'])
    await c.downloads.pauseAll()
    expect((await c.downloads.list()).some((x) => x.state === 'downloading')).toBe(false)
  })
})

describe('importing', () => {
  test('the folder picker stays inside the allowed folders', async () => {
    const c = await setup()
    const here = await c.fs.list({ query: {} })
    shaped(routes.fs.list, here)
    expect(here.path).toBe('/data/downloads')
    expect(here.parent).toBe('/data')
    expect((await c.fs.list({ query: { path: '/data' } })).parent).toBeNull()
    expect((await caught(c.fs.list({ query: { path: '/config' } }))).status).toBe(403)
    expect((await caught(c.fs.list({ query: { path: '/data/nope' } }))).status).toBe(404)
  })

  test('manual import scans and imports into a movie', async () => {
    const c = await setup()
    const found = await c.manualImport.scan({ body: { path: '/data/downloads/complete' } })
    shaped(routes.manualImport.scan, found)
    const file = found.find((f) => f.movieId !== null && !f.skip)
    if (!file?.movieId) throw new Error('nothing matched')
    expect(file.becomes).toBeTruthy()
    const done = await c.manualImport.run({
      body: { files: [{ path: file.path, movieId: file.movieId }], mode: 'hardlink' },
    })
    expect(done.results[0]?.ok).toBe(true)
    const nope = await c.manualImport.run({
      body: { files: [{ path: file.path, movieId: 999_999_999 }], mode: 'move' },
    })
    expect(nope.results[0]).toMatchObject({ ok: false })
  })

  test('library import scans a root folder and runs as a job', async () => {
    const c = await setup()
    expect((await caught(c.libraryImport.scan({ body: { root: '/data' } }))).status).toBe(400)
    const found = await c.libraryImport.scan({ body: { root: '/data/media/movies' } })
    shaped(routes.libraryImport.scan, found)
    const fresh = found.filter((f) => !f.inLibrary && f.match)
    expect(fresh.length).toBeGreaterThan(0)
    expect((await c.libraryImport.status()).state).toBe('idle')
    const items = fresh.map((f) => ({ folder: f.folder, tmdbId: f.match?.tmdbId ?? 0 }))
    const started = await c.libraryImport.run({ body: { items } })
    expect(started.state).toBe('running')
    expect((await caught(c.libraryImport.run({ body: { items } }))).status).toBe(409)
    await new Promise((r) => setTimeout(r, 1700))
    const done = await c.libraryImport.status()
    expect(done).toMatchObject({ state: 'done', imported: fresh.length })
    // the films it added are the library's now
    const again = await c.libraryImport.scan({ body: { root: '/data/media/movies' } })
    for (const f of fresh)
      expect(again.find((x) => x.match?.tmdbId === f.match?.tmdbId)?.inLibrary).toBe(true)
  })
})

describe('indexers', () => {
  test('lists, updates, retries and removes one', async () => {
    const c = await setup()
    const list = await c.indexers.list()
    shaped(routes.indexers.list, list)
    const keel = list.find((i) => i.health === 'backoff')
    if (!keel) throw new Error('no indexer in backoff')
    expect(keel.backoffUntil).toBeTruthy()
    const retried = await c.indexers.retry({ params: { id: keel.id } })
    expect(retried).toMatchObject({ health: 'healthy', backoffUntil: null })
    const renamed = await c.indexers.update({
      params: { id: keel.id },
      body: { name: 'Keel (backup)', seeding: { ratio: 1.5, minutes: null, minMinutes: 60 } },
    })
    expect(renamed.name).toBe('Keel (backup)')
    expect(renamed.seeding.ratio).toBe(1.5)
    await c.indexers.remove({ params: { id: keel.id } })
    expect((await caught(c.indexers.retry({ params: { id: keel.id } }))).status).toBe(404)
  })

  test('adds from the catalog after a test, and refuses a failed test', async () => {
    const c = await setup()
    const defs = await c.catalog.indexers({ query: {} })
    shaped(routes.catalog.indexers, defs)
    const starters = await c.catalog.indexers({ query: { starter: 'true' } })
    expect(starters.every((d) => d.starter && d.privacy === 'public')).toBe(true)
    const def = defs.find((d) => d.installed === 0)
    if (!def) throw new Error('every definition is installed')
    const wrong = await caught(
      c.indexers.add({ body: { definitionId: def.id, settings: { apiKey: 'wrong' } } }),
    )
    expect(wrong.status).toBe(400)
    const added = await c.indexers.add({
      body: { definitionId: def.id, settings: { apiKey: 'k' }, priority: 10 },
    })
    shaped(routes.indexers.add, added)
    expect(added.test.ok).toBe(true)
    expect(added.indexer.priority).toBe(10)
    expect((await c.indexers.test({ body: { id: added.indexer.id } })).ok).toBe(true)
    expect((await caught(c.indexers.test({ body: { id: 'nope' } }))).status).toBe(404)
    expect((await c.catalog.install()).version).toBeTruthy()
  })
})
