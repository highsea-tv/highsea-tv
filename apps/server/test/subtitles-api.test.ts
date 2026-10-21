// SPDX-License-Identifier: AGPL-3.0-only
// Subtitles' routes through the SDK (checkpoint 7a): A10's tabs and A6's Search, Use and Delete,
// against the providers' fakes. Staff use them; a provider's account is the owner's, and saving
// one is in the audit log without its credentials. The behaviour behind them is tested in
// packages/subtitles.
import { afterEach, describe, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { accessOf, routes } from '@highsea/api-contract'
import { schema } from '@highsea/db'
import type { Runtime } from '@highsea/runtime'
import { createFakeSubtitles, FAKE_ACCOUNTS, FAKE_OPENSUBTITLES_KEY } from '@highsea/subtitles/fake'
import { createApi } from '../src/api/app.ts'
import { addMember, bootRuntime, cleanup, clientFor, failure, withOwner } from './helpers.ts'

const dirs: string[] = []
afterEach(async () => {
  await cleanup()
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
})

const SINTEL = 45745

async function started() {
  const fake = createFakeSubtitles()
  const runtime = await bootRuntime({
    subtitles: { fetch: fake.fetch, openSubtitlesKey: FAKE_OPENSUBTITLES_KEY },
  })
  const app = createApi(runtime)
  const { owner, token } = await withOwner(runtime)
  const admin = await addMember(runtime, owner.id, 'Ruth', 'admin')
  const user = await addMember(runtime, owner.id, 'Sam', 'user')
  return {
    runtime,
    fake,
    ownerApi: clientFor(app, { token }),
    adminApi: clientFor(app, { token: admin.token }),
    userApi: clientFor(app, { token: user.token }),
  }
}

/** Sintel, available with one file and the seeded English profile, as an import would leave it. */
function sintel(runtime: Runtime) {
  const dir = mkdtempSync(join(tmpdir(), 'highsea-subs-api-'))
  dirs.push(dir)
  const folder = join(dir, 'Sintel (2010)')
  mkdirSync(folder)
  const path = join(folder, 'Sintel (2010) Bluray-1080p.mkv')
  writeFileSync(path, Buffer.alloc(200_000, 1))
  const now = Date.now()
  const { db } = runtime
  db.insert(schema.movieMetadata)
    .values({
      tmdbId: SINTEL,
      title: 'Sintel',
      originalTitle: 'Sintel',
      year: 2010,
      language: 'en',
      data: { imdbId: 'tt1727587' },
      fetchedAt: now,
    })
    .run()
  db.insert(schema.mediaItems)
    .values({
      id: 'itm1',
      type: 'movie',
      tmdbId: SINTEL,
      title: 'Sintel',
      sortTitle: 'sintel',
      year: 2010,
      status: 'available',
      monitored: true,
      minimumAvailability: 'released',
      qualityProfileId: 'qp-hd',
      languageProfileId: runtime.subtitles.profiles.list()[0]?.id,
      rootFolder: dir,
      path: folder,
      addedAt: now,
      updatedAt: now,
    })
    .run()
  db.insert(schema.mediaFiles)
    .values({
      id: 'fil1',
      itemId: 'itm1',
      path,
      size: 200_000,
      sceneName: 'Sintel.2010.1080p.BluRay.x264-GRP',
      mediaInfo: {
        probe: {
          duration: 60,
          container: 'matroska,webm',
          video: { index: 0, codec: 'h264', codecTag: null },
          audio: [],
          subtitles: [],
        },
      },
      addedAt: now,
    } as typeof schema.mediaFiles.$inferInsert)
    .run()
  runtime.subtitles.refreshWanted('itm1')
  return { folder }
}

describe('subtitles over the API', () => {
  test('staff use every route; a provider’s account is the owner’s', () => {
    const owners = ['saveProvider', 'testProvider']
    for (const [name, r] of Object.entries(routes.subtitles))
      expect([name, accessOf(r)]).toEqual([name, owners.includes(name) ? 'owner' : 'staff'])
  })

  test('a user is refused, an admin reads and toggles, the owner saves accounts', async () => {
    const { ownerApi, adminApi, userApi } = await started()
    expect((await failure(userApi.subtitles.providers())).code).toBe('forbidden')
    expect((await failure(userApi.subtitles.wanted({ query: {} }))).code).toBe('forbidden')

    const listed = await adminApi.subtitles.providers()
    expect(listed.map((p) => [p.id, p.enabled, p.account])).toEqual([
      ['opensubtitles', false, null],
      ['subdl', false, null],
      ['subsource', false, null],
    ])
    expect(listed[0]?.attribution).toBe('Subtitles provided by OpenSubtitles.com')

    const body = { apiKey: FAKE_ACCOUNTS.subdl.apiKey }
    expect(
      (await failure(adminApi.subtitles.saveProvider({ params: { id: 'subdl' }, body }))).code,
    ).toBe('forbidden')
    expect(
      (await failure(adminApi.subtitles.testProvider({ params: { id: 'subdl' }, body }))).code,
    ).toBe('forbidden')

    expect(await ownerApi.subtitles.testProvider({ params: { id: 'subdl' }, body })).toMatchObject({
      ok: true,
    })
    const wrong = await ownerApi.subtitles.testProvider({
      params: { id: 'subdl' },
      body: { apiKey: 'wrong' },
    })
    expect(wrong.ok).toBe(false)

    const saved = await ownerApi.subtitles.saveProvider({ params: { id: 'subdl' }, body })
    expect(saved.account).not.toContain(FAKE_ACCOUNTS.subdl.apiKey)
    expect(saved.fields).toEqual([{ key: 'apiKey', secret: true, set: true, value: null }])
    expect(
      await adminApi.subtitles.toggleProvider({ params: { id: 'subdl' }, body: { enabled: true } }),
    ).toMatchObject({ id: 'subdl', enabled: true })

    const log = await ownerApi.audit.list({ query: {} })
    const entry = log.items.find((e) => e.action === 'subtitles.provider.save')
    expect(entry).toMatchObject({ targetId: 'subdl' })
    expect(JSON.stringify(log)).not.toContain(FAKE_ACCOUNTS.subdl.apiKey)
  })

  test('language profiles: create, save, and not delete one in use', async () => {
    const { runtime, adminApi } = await started()
    sintel(runtime)
    expect((await adminApi.subtitles.languages()).find((l) => l.code === 'pt-BR')).toBeDefined()
    const [seeded] = await adminApi.subtitles.languageProfiles()
    if (!seeded) throw new Error('expected the seeded profile')

    const created = await adminApi.subtitles.createLanguageProfile({
      body: {
        name: 'English and Portuguese',
        languages: [
          { code: 'en', forced: 'no', hi: 'no' },
          { code: 'pt-BR', forced: 'no', hi: 'no' },
        ],
        cutoff: null,
        minScore: 80,
      },
    })
    const saved = await adminApi.subtitles.saveLanguageProfile({
      params: { id: created.id },
      body: { ...created, minScore: 90 },
    })
    expect(saved.minScore).toBe(90)
    await adminApi.subtitles.deleteLanguageProfile({ params: { id: created.id } })
    expect((await adminApi.subtitles.languageProfiles()).map((p) => p.id)).toEqual([seeded.id])

    const inUse = await failure(
      adminApi.subtitles.deleteLanguageProfile({ params: { id: seeded.id } }),
    )
    expect(inUse.code).toBe('conflict')
  })

  test('settings read and save', async () => {
    const { adminApi } = await started()
    const before = await adminApi.subtitles.settings()
    expect(before.minScore).toBeGreaterThan(0)
    const after = await adminApi.subtitles.saveSettings({ body: { minScore: 70 } })
    expect(after).toEqual({ ...before, minScore: 70 })
    expect((await failure(adminApi.subtitles.saveSettings({ body: { minScore: 101 } }))).code).toBe(
      'invalid',
    )
  })

  test('A6: wanted, Search, Use and Delete, and the client sees the track', async () => {
    const { runtime, ownerApi, adminApi } = await started()
    sintel(runtime)
    await ownerApi.subtitles.saveProvider({
      params: { id: 'subdl' },
      body: { apiKey: FAKE_ACCOUNTS.subdl.apiKey },
    })
    await adminApi.subtitles.toggleProvider({ params: { id: 'subdl' }, body: { enabled: true } })

    const wanted = await adminApi.subtitles.wanted({ query: {} })
    expect(wanted).toMatchObject({ total: 1, next: null })
    expect(wanted.items[0]).toMatchObject({
      movie: { id: SINTEL, title: 'Sintel' },
      missingLanguages: ['en'],
    })
    expect(await adminApi.subtitles.forItem({ params: { id: SINTEL } })).toEqual([])

    const results = await adminApi.subtitles.search({
      params: { id: SINTEL },
      body: { language: 'en' },
    })
    const [best] = results
    if (!best) throw new Error('expected a result')
    expect(best).toMatchObject({ language: 'en', provider: 'Subdl' })

    const track = await adminApi.subtitles.download({
      params: { id: SINTEL },
      body: { resultId: best.id },
    })
    expect(track).toMatchObject({ itemId: SINTEL, language: 'en', chosen: true, kind: 'external' })
    expect((await adminApi.subtitles.forItem({ params: { id: SINTEL } })).map((t) => t.id)).toEqual(
      [track.id],
    )
    // the seeded profile's `also` wants a forced English track as well, so Sintel stays wanted
    expect(runtime.db.select().from(schema.subtitleWanted).all()).toEqual([
      expect.objectContaining({ language: 'en', forced: true }),
    ])
    expect(runtime.subtitles.clientTracks('fil1')).toEqual([
      expect.objectContaining({ id: track.id, language: 'en', kind: 'external' }),
    ])

    await adminApi.subtitles.delete({ params: { id: track.id } })
    expect(await adminApi.subtitles.forItem({ params: { id: SINTEL } })).toEqual([])
    expect((await failure(adminApi.subtitles.delete({ params: { id: track.id } }))).code).toBe(
      'not-found',
    )
  })

  test('searching with no provider on says so', async () => {
    const { runtime, adminApi } = await started()
    sintel(runtime)
    expect(
      await failure(
        adminApi.subtitles.search({ params: { id: SINTEL }, body: { language: 'en' } }),
      ),
    ).toMatchObject({ code: 'conflict', reason: 'no-providers' })
  })

  test('the stats card and Search all', async () => {
    const { runtime, adminApi } = await started()
    sintel(runtime)
    expect(await adminApi.subtitles.stats()).toEqual({
      syncedToday: 0,
      waiting: 0,
      avgOffsetMs: 0,
      avgConfidence: 0,
    })
    expect(await adminApi.subtitles.searchAllMissing()).toEqual({ queued: 1 })
  })
})
