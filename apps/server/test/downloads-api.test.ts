// SPDX-License-Identifier: AGPL-3.0-only
// The checkpoint 6a routes through the SDK: grabbing a release from the fake indexer into the
// queue and Downloads, the blocklist, history, manual import's folder browser, the settings areas
// and the VPN's status; 6b's categories. The engine is offline (helpers.ts), so a grab is added and nothing
// downloads; the downloads package's tests cover the swarm. Who may call what: the guard table.
import { afterEach, describe, expect, test } from 'bun:test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Fetch } from '@highsea/core'
import { createFakeIndexer, FAKE_CREDENTIALS, FAKE_ORIGIN } from '@highsea/indexers/fake'
import { createReplayFetch } from '@highsea/metadata/replay'
import { createApi } from '../src/api/app.ts'
import { addMember, bootRuntime, cleanup, clientFor, failure, withOwner } from './helpers.ts'

afterEach(cleanup)

const SINTEL = 45745
const torznab = { baseUrl: `${FAKE_ORIGIN}/torznab`, apiKey: FAKE_CREDENTIALS.torznabKey }

async function started() {
  const fake = createFakeIndexer()
  const replay = createReplayFetch()
  const fetch: Fetch = (input, init) =>
    String(input instanceof Request ? input.url : input).startsWith(FAKE_ORIGIN)
      ? fake.fetch(input, init)
      : replay(input, init)
  const runtime = await bootRuntime({ fetch })
  const app = createApi(runtime)
  const { owner, token } = await withOwner(runtime)
  const admin = await addMember(runtime, owner.id, 'Ruth', 'admin')
  await runtime.metadata.settings.setKey('test-tmdb-key')
  runtime.metadata.settings.update({ region: 'US' })
  const folder = join(runtime.config.dataDir, 'media', 'movies')
  mkdirSync(folder, { recursive: true })
  const ownerApi = clientFor(app, { token })
  const adminApi = clientFor(app, { token: admin.token })
  await adminApi.rootFolders.add({ body: { path: folder } })
  await adminApi.movies.add({
    body: {
      tmdbId: SINTEL,
      rootFolder: folder,
      monitored: true,
      minimumAvailability: 'released',
      versions: [{ label: '1080p', qualityProfileId: 'qp-hd' }],
    },
  })
  const { indexer } = await adminApi.indexers.add({
    body: { definitionId: 'generic-torznab', settings: torznab },
  })
  return { runtime, fake, folder, ownerApi, adminApi, indexer }
}

describe('grabbing', () => {
  test('a grab joins the queue and Downloads, and history says so', async () => {
    const { adminApi, indexer } = await started()
    const found = await adminApi.movies.interactiveSearch({ params: { id: SINTEL } })
    const best = found.releases.find((r) => r.approved)
    if (!best) throw new Error('expected an approved release')

    const item = await adminApi.movies.grabRelease({
      params: { id: SINTEL, guid: best.guid },
      body: { indexerId: indexer.id },
    })
    expect(item).toMatchObject({ movieId: SINTEL, title: 'Sintel', release: best.title })

    const queue = await adminApi.queue.list()
    expect(queue.map((q) => q.id)).toEqual([item.id])
    const torrents = await adminApi.downloads.list()
    expect(torrents).toHaveLength(1)
    expect(torrents[0]).toMatchObject({ movieId: SINTEL, category: 'movies' })
    const one = await adminApi.downloads.get({ params: { id: torrents[0]?.id ?? '' } })
    expect(one.files.length).toBeGreaterThan(0)

    const history = await adminApi.movies.history({ params: { id: SINTEL }, query: {} })
    expect(history.items[0]).toMatchObject({ type: 'grabbed', movieId: SINTEL })
    expect((await adminApi.history.list()).items).toHaveLength(1)

    // the same release again is refused
    expect(
      await failure(
        adminApi.movies.grabRelease({
          params: { id: SINTEL, guid: best.guid },
          body: { indexerId: indexer.id },
        }),
      ),
    ).toMatchObject({ code: 'conflict' })
  })

  test('a rejected release needs Grab anyway', async () => {
    const { adminApi, indexer } = await started()
    const found = await adminApi.movies.interactiveSearch({ params: { id: SINTEL } })
    const rejected = found.releases.find((r) => !r.approved)
    if (!rejected) throw new Error('expected a rejected release')
    const grab = (force?: boolean) =>
      adminApi.movies.grabRelease({
        params: { id: SINTEL, guid: rejected.guid },
        body: { indexerId: indexer.id, force },
      })
    expect(await failure(grab())).toMatchObject({ code: 'conflict' })
    expect((await grab(true)).release).toBe(rejected.title)
  })

  test('removing with blocklist puts the release on the blocklist, and it comes off', async () => {
    const { adminApi, indexer } = await started()
    const found = await adminApi.movies.interactiveSearch({ params: { id: SINTEL } })
    const best = found.releases.find((r) => r.approved)
    if (!best) throw new Error('expected an approved release')
    const item = await adminApi.movies.grabRelease({
      params: { id: SINTEL, guid: best.guid },
      body: { indexerId: indexer.id },
    })
    await adminApi.queue.remove({
      params: { id: item.id },
      body: { deleteData: true, blocklist: true },
    })
    expect(await adminApi.queue.list()).toEqual([])
    expect(await adminApi.downloads.list()).toEqual([])
    const blocked = await adminApi.blocklist.list()
    expect(blocked).toHaveLength(1)
    expect(blocked[0]).toMatchObject({ movieId: SINTEL, sourceTitle: best.title })

    await adminApi.blocklist.remove({ params: { id: blocked[0]?.id ?? '' } })
    expect(await adminApi.blocklist.list()).toEqual([])
  })
})

describe('Downloads', () => {
  test('adds a magnet by hand, pauses, resumes and deletes it', async () => {
    const { adminApi } = await started()
    const magnet = `magnet:?xt=urn:btih:${'ab'.repeat(20)}&dn=Something`
    const added = await adminApi.downloads.add({ body: { urlOrMagnet: magnet, paused: true } })
    expect(added).toMatchObject({ category: 'manual', movieId: null, state: 'paused' })
    expect(await failure(adminApi.downloads.add({ body: { urlOrMagnet: magnet } }))).toMatchObject({
      code: 'conflict',
    })
    expect(
      await failure(adminApi.downloads.add({ body: { urlOrMagnet: 'not a link' } })),
    ).toMatchObject({ code: 'invalid' })

    expect((await adminApi.downloads.resume({ params: { id: added.id } })).state).not.toBe('paused')
    expect((await adminApi.downloads.pause({ params: { id: added.id } })).state).toBe('paused')
    await adminApi.downloads.delete({ params: { id: added.id }, body: { deleteData: true } })
    expect(await adminApi.downloads.list()).toEqual([])
  })

  test('sets the speed limits', async () => {
    const { adminApi } = await started()
    expect(await adminApi.downloads.limits()).toEqual({ downloadRate: 0, uploadRate: 0 })
    const saved = await adminApi.downloads.setLimits({ body: { downloadRate: 5_000_000 } })
    expect(saved).toEqual({ downloadRate: 5_000_000, uploadRate: 0 })
    expect(Array.isArray(await adminApi.system.speeds())).toBe(true)
  })
})

describe('categories (6b)', () => {
  test('staff list them; the owner adds and removes; a torrent saves to its folder', async () => {
    const { adminApi, ownerApi, runtime } = await started()
    const downloads = runtime.folders().downloads
    expect((await adminApi.downloads.categories()).map((c) => c.name)).toEqual(['movies', 'manual'])

    expect(
      await failure(adminApi.downloads.saveCategory({ body: { name: 'books' } })),
    ).toMatchObject({ code: 'forbidden' })
    const saved = await ownerApi.downloads.saveCategory({ body: { name: 'books' } })
    expect(saved).toEqual({
      name: 'books',
      folder: join(downloads, 'books'),
      fixed: false,
      torrents: 0,
    })
    expect(
      await failure(ownerApi.downloads.saveCategory({ body: { name: 'movies' } })),
    ).toMatchObject({ code: 'invalid' })
    expect(
      await failure(
        ownerApi.downloads.saveCategory({ body: { name: 'odd', folder: '/etc/highsea' } }),
      ),
    ).toMatchObject({ code: 'invalid' })

    const magnet = `magnet:?xt=urn:btih:${'cd'.repeat(20)}&dn=Notes`
    const added = await adminApi.downloads.add({
      body: { urlOrMagnet: magnet, paused: true, category: 'books' },
    })
    expect(added).toMatchObject({
      category: 'books',
      manual: true,
      savePath: join(downloads, 'books'),
    })
    expect(
      await failure(ownerApi.downloads.removeCategory({ params: { name: 'books' } })),
    ).toMatchObject({ code: 'conflict' })
    expect(
      await failure(adminApi.downloads.removeCategory({ params: { name: 'books' } })),
    ).toMatchObject({ code: 'forbidden' })

    await adminApi.downloads.delete({ params: { id: added.id }, body: { deleteData: false } })
    await ownerApi.downloads.removeCategory({ params: { name: 'books' } })
    expect((await adminApi.downloads.categories()).map((c) => c.name)).toEqual(['movies', 'manual'])
  })
})

describe('manual import', () => {
  test('browses inside the data root only, and scans a folder', async () => {
    const { adminApi, runtime } = await started()
    const downloads = runtime.folders().downloads
    const dir = join(downloads, 'Sintel.2010.1080p.BluRay.x264-GRP')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'notes.txt'), 'not a video')

    const listing = await adminApi.fs.list({ query: { path: downloads } })
    expect(listing.entries.map((e) => e.name)).toContain('Sintel.2010.1080p.BluRay.x264-GRP')
    expect(await failure(adminApi.fs.list({ query: { path: '/etc' } }))).toMatchObject({
      code: 'forbidden',
    })

    const found = await adminApi.manualImport.scan({ body: { path: dir } })
    expect(Array.isArray(found)).toBe(true)
  })
})

describe('settings', () => {
  test('media management saves, and refuses a bad format', async () => {
    const { adminApi } = await started()
    const current = await adminApi.settings.mediaManagement()
    expect(current.rename).toBe(true)
    const saved = await adminApi.settings.saveMediaManagement({ body: { ...current, nfo: true } })
    expect(saved.nfo).toBe(true)
    expect(
      await failure(
        adminApi.settings.saveMediaManagement({ body: { ...current, fileFormat: '{Nonsense}' } }),
      ),
    ).toMatchObject({ code: 'invalid' })
  })

  test('the download client and the VPN are the owner’s', async () => {
    const { adminApi, ownerApi } = await started()
    expect(await failure(adminApi.settings.downloadClient())).toMatchObject({ code: 'forbidden' })
    expect(await failure(adminApi.vpn.settings())).toMatchObject({ code: 'forbidden' })

    const client = await ownerApi.settings.downloadClient()
    expect(client.port).toBe(6881)
    expect(client.utp).toBe(true)
    const saved = await ownerApi.settings.saveDownloadClient({
      body: { ...client, maxActive: 5, utp: false },
    })
    expect(saved.maxActive).toBe(5)
    expect(saved.utp).toBe(false)

    const status = await adminApi.vpn.status()
    expect(status).toMatchObject({ mode: 'off', state: 'off' })
    expect((await ownerApi.vpn.providers()).length).toBeGreaterThan(0)
    const vpn = await ownerApi.vpn.settings()
    expect(vpn.mode).toBe('off')
  })
})

describe('indexer seeding rules', () => {
  test('an indexer keeps its own seeding rule', async () => {
    const { adminApi, indexer } = await started()
    expect(indexer.seeding).toEqual({ ratio: null, minutes: null, minMinutes: null })
    const saved = await adminApi.indexers.update({
      params: { id: indexer.id },
      body: { seeding: { ratio: 1.5, minutes: null, minMinutes: 4320 } },
    })
    expect(saved.seeding).toEqual({ ratio: 1.5, minutes: null, minMinutes: 4320 })
  })
})
