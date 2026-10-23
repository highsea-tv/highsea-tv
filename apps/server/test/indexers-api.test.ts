// SPDX-License-Identifier: AGPL-3.0-only
// The checkpoint 5 routes through the SDK: the seed catalog, indexers against the fake indexer
// (packages/indexers/test/fake), and release search for a library movie on TMDB's recordings.
// Each route's happy path, and who may not; the guard table covers every caller.
import { afterEach, describe, expect, test } from 'bun:test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import type { Fetch } from '@highsea-tv/core'
import { createFakeIndexer, FAKE_CREDENTIALS, FAKE_ORIGIN } from '@highsea-tv/indexers/fake'
import { createReplayFetch } from '@highsea-tv/metadata/replay'
import { createApi } from '../src/api/app.ts'
import { addMember, bootRuntime, cleanup, clientFor, failure, withOwner } from './helpers.ts'

afterEach(cleanup)

const SINTEL = 45745
const torznab = { baseUrl: `${FAKE_ORIGIN}/torznab`, apiKey: FAKE_CREDENTIALS.torznabKey }

async function started() {
  const fake = createFakeIndexer()
  const replay = createReplayFetch()
  // the fake indexer's origin goes to the fake, TMDB to its recordings
  const fetch: Fetch = (input, init) =>
    String(input instanceof Request ? input.url : input).startsWith(FAKE_ORIGIN)
      ? fake.fetch(input, init)
      : replay(input, init)
  const runtime = await bootRuntime({ fetch })
  const app = createApi(runtime)
  const { owner, token } = await withOwner(runtime)
  const admin = await addMember(runtime, owner.id, 'Ruth', 'admin')
  const member = await addMember(runtime, owner.id, 'Mara')
  await runtime.metadata.settings.setKey('test-tmdb-key')
  runtime.metadata.settings.update({ region: 'US' })
  const folder = join(runtime.config.dataDir, 'movies')
  mkdirSync(folder, { recursive: true })
  return {
    runtime,
    fake,
    folder,
    ownerApi: clientFor(app, { token }),
    adminApi: clientFor(app, { token: admin.token }),
    memberApi: clientFor(app, { token: member.token }),
  }
}

describe('the catalog', () => {
  test('boots with the signed seed and lists its definitions', async () => {
    const { ownerApi, adminApi, runtime } = await started()
    const status = await adminApi.catalog.status()
    expect(status.version).not.toBeNull()
    expect(status.channel).toBe('stable')
    expect(status.changes.length).toBeGreaterThan(0)
    expect((await ownerApi.system.server()).catalogVersion).toBe(status.version)

    const all = await adminApi.catalog.indexers()
    expect(all.map((d) => d.id)).toEqual(
      expect.arrayContaining(['generic-torznab', 'generic-rss', 'internet-archive']),
    )
    const starter = await adminApi.catalog.indexers({ query: { starter: 'true' } })
    expect(starter.every((d) => d.starter && d.privacy === 'public')).toBe(true)
    expect(runtime.issues().map((i) => i.id)).toContain('indexers-none')
  })

  test('a check with no main URL keeps the seed', async () => {
    const { adminApi } = await started()
    const before = await adminApi.catalog.status()
    const after = await adminApi.catalog.check()
    expect(after.version).toBe(before.version)
    expect(after.lastCheck?.ok).toBe(true)
  })

  test('only the owner reads and changes the catalog’s settings', async () => {
    const { ownerApi, adminApi } = await started()
    expect(await failure(adminApi.catalog.settings())).toMatchObject({ code: 'forbidden' })
    const saved = await ownerApi.catalog.updateSettings({ body: { autoUpdate: false } })
    expect(saved).toEqual({ channel: 'stable', autoUpdate: false, extras: [] })
    expect((await ownerApi.catalog.status()).autoUpdate).toBe(false)
    expect(
      await failure(
        ownerApi.catalog.updateSettings({
          body: { extras: [{ url: 'ftp://x', keyId: 'k', publicKey: 'AA==' }] },
        }),
      ),
    ).toMatchObject({ code: 'invalid' })
  })
})

describe('indexers', () => {
  test('adds after a passing test, edits, retries and removes; secrets never come back', async () => {
    const { adminApi } = await started()
    const added = await adminApi.indexers.add({
      body: { definitionId: 'generic-torznab', settings: torznab },
    })
    expect(added.test.ok).toBe(true)
    expect(added.indexer).toMatchObject({ name: 'Torznab', priority: 25, health: 'healthy' })
    expect(added.indexer.settings.secrets).toEqual({ apiKey: true })

    const list = await adminApi.indexers.list()
    expect(list).toHaveLength(1)
    expect(JSON.stringify(list)).not.toContain(FAKE_CREDENTIALS.torznabKey)

    const id = added.indexer.id
    const edited = await adminApi.indexers.update({
      params: { id },
      body: { priority: 10, name: 'Fake Torznab', settings: { apiKey: '' } },
    })
    expect(edited).toMatchObject({ priority: 10, name: 'Fake Torznab' })
    // an empty secret keeps the saved one
    expect((await adminApi.indexers.test({ body: { id } })).ok).toBe(true)
    expect((await adminApi.indexers.retry({ params: { id } })).health).toBe('healthy')
    expect(
      await failure(adminApi.indexers.update({ params: { id }, body: { priority: 51 } })),
    ).toMatchObject({ code: 'invalid' })

    await adminApi.indexers.remove({ params: { id } })
    expect(await adminApi.indexers.list()).toEqual([])
  })

  test('a failing test adds nothing and says why, without the key', async () => {
    const { adminApi } = await started()
    const result = await adminApi.indexers.test({
      body: { id: 'generic-torznab', settings: { ...torznab, apiKey: 'wrong-key-1234' } },
    })
    expect(result.ok).toBe(false)
    expect(result.message).not.toContain('wrong-key-1234')
    expect(
      await failure(
        adminApi.indexers.add({
          body: { definitionId: 'generic-torznab', settings: { ...torznab, apiKey: 'nope-nope' } },
        }),
      ),
    ).toMatchObject({ code: 'invalid' })
    expect(await adminApi.indexers.list()).toEqual([])
  })

  test('users can’t see or change indexers', async () => {
    const { memberApi } = await started()
    expect(await failure(memberApi.indexers.list())).toMatchObject({ code: 'forbidden' })
    expect(await failure(memberApi.catalog.indexers())).toMatchObject({ code: 'forbidden' })
  })
})

describe('release search', () => {
  async function withSintel() {
    const env = await started()
    await env.adminApi.rootFolders.add({ body: { path: env.folder } })
    await env.adminApi.movies.add({
      body: {
        tmdbId: SINTEL,
        rootFolder: env.folder,
        monitored: true,
        minimumAvailability: 'released',
        versions: [{ label: '1080p', qualityProfileId: 'qp-hd' }],
      },
    })
    return env
  }

  test('refuses with no-indexers until one is enabled', async () => {
    const { adminApi } = await withSintel()
    expect(
      await failure(adminApi.movies.interactiveSearch({ params: { id: SINTEL } })),
    ).toMatchObject({ code: 'conflict', reason: 'no-indexers' })
    expect(
      await failure(adminApi.movies.bulk({ body: { action: 'search', ids: [SINTEL] } })),
    ).toMatchObject({ code: 'conflict', reason: 'no-indexers' })
  })

  test('searches, judges and keeps the results; bulk search queues a search', async () => {
    const { adminApi, runtime } = await withSintel()
    await adminApi.indexers.add({ body: { definitionId: 'generic-torznab', settings: torznab } })
    expect(await adminApi.movies.releases({ params: { id: SINTEL } })).toEqual([])

    const found = await adminApi.movies.interactiveSearch({ params: { id: SINTEL } })
    expect(found.searched).toBe(1)
    expect(found.failed).toEqual([])
    const titles = found.releases.map((r) => r.title)
    expect(titles).toContain('Sintel.2010.1080p.BluRay.x264-GRP')
    expect(titles.some((t) => t.startsWith('Big.Buck.Bunny'))).toBe(false)
    expect(found.releases[0]).toMatchObject({ approved: true, indexer: 'Torznab' })
    expect(found.releases.find((r) => r.seeders === 0)?.approved).toBe(false)
    expect(JSON.stringify(found)).not.toContain(FAKE_CREDENTIALS.torznabKey)

    const cached = await adminApi.movies.releases({ params: { id: SINTEL } })
    expect(cached.map((r) => r.guid)).toEqual(found.releases.map((r) => r.guid))

    const queued = await adminApi.movies.bulk({ body: { action: 'search', ids: [SINTEL] } })
    expect(queued.ids).toEqual([SINTEL])
    expect(runtime.jobs.list({ type: 'movies.search' })).toHaveLength(1)
  })
})
