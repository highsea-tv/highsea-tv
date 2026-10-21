// SPDX-License-Identifier: AGPL-3.0-only
// The checkpoint 4 routes through the SDK, as the admin and the apps call them, on TMDB's
// recordings (ADR 0029): each route's happy path, and who may not.
import { afterEach, describe, expect, test } from 'bun:test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import type { Runtime } from '@highsea/runtime'
import { createApi } from '../src/api/app.ts'
import { IMAGE_CACHE_CONTROL } from '../src/api/metadata.ts'
import {
  addMember,
  bootRuntime,
  cleanup,
  clientFor,
  failure,
  ORIGIN,
  OWNER,
  withOwner,
} from './helpers.ts'

afterEach(cleanup)

/** Sintel, Big Buck Bunny, the third Caminandes (in a collection), Metropolis; Fritz Lang. */
const SINTEL = 45745
const BUNNY = 10378
const LLAMIGOS = 406956
const CAMINANDES = 339473
const METROPOLIS = 19
const LANG = 68

/** A key (any works on the recordings) and the recordings' region. */
async function withTmdb(runtime: Runtime) {
  await runtime.metadata.settings.setKey('test-tmdb-key')
  runtime.metadata.settings.update({ region: 'US' })
}

async function started(options: { tmdb?: boolean } = {}) {
  const runtime = await bootRuntime()
  const app = createApi(runtime)
  const { owner, token } = await withOwner(runtime)
  const member = await addMember(runtime, owner.id, 'Mara')
  const admin = await addMember(runtime, owner.id, 'Ruth', 'admin')
  if (options.tmdb !== false) await withTmdb(runtime)
  const folder = join(runtime.config.dataDir, 'movies')
  mkdirSync(folder, { recursive: true })
  return {
    runtime,
    app,
    owner,
    folder,
    token,
    ownerApi: clientFor(app, { token }),
    memberApi: clientFor(app, { token: member.token }),
    adminApi: clientFor(app, { token: admin.token }),
    anon: clientFor(app),
  }
}

const version = (label = '1080p', qualityProfileId = 'qp-hd') => ({ label, qualityProfileId })

async function library() {
  const env = await started()
  await env.ownerApi.rootFolders.add({ body: { path: env.folder } })
  const add = (tmdbId: number, versions = [version()]) =>
    env.ownerApi.movies.add({
      body: {
        tmdbId,
        rootFolder: env.folder,
        monitored: true,
        minimumAvailability: 'released',
        versions,
      },
    })
  return { ...env, add }
}

describe('metadata settings and the setup key step', () => {
  test('the owner sets, reads and removes the key; it’s never returned', async () => {
    const { ownerApi, memberApi } = await started({ tmdb: false })
    expect((await ownerApi.settings.metadata()).key).toEqual({ set: false, last4: null })
    const saved = await ownerApi.settings.saveMetadata({
      body: { key: 'abcd-efgh-1234', language: 'en-US', region: 'US' },
    })
    expect(saved).toEqual({ key: { set: true, last4: '1234' }, language: 'en-US', region: 'US' })
    expect(JSON.stringify(await ownerApi.settings.metadata())).not.toContain('abcd')
    expect(await failure(ownerApi.settings.saveMetadata({ body: { key: 'invalid-key' } }))).toEqual(
      { code: 'invalid', reason: 'tmdb-key-rejected' },
    )
    expect((await ownerApi.settings.removeMetadataKey()).key.set).toBe(false)
    expect((await failure(memberApi.settings.metadata())).code).toBe('forbidden')
    expect((await failure(memberApi.settings.saveMetadata({ body: { region: 'GB' } }))).code).toBe(
      'forbidden',
    )
  })

  test('setup checks a key, stores it with the locale, and makes the movies folder a root folder', async () => {
    const runtime = await bootRuntime()
    const app = createApi(runtime)
    const anon = clientFor(app)
    await anon.setup.checkMetadataKey({ body: { key: 'a-good-key' } })
    expect(await failure(anon.setup.checkMetadataKey({ body: { key: 'invalid-key' } }))).toEqual({
      code: 'invalid',
      reason: 'tmdb-key-rejected',
    })
    // nothing stored by the check
    expect(runtime.metadata.settings.get().key.set).toBe(false)
    const defaults = await anon.setup.defaults()
    const res = await app.request(`${ORIGIN}/api/v1/setup`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: ORIGIN },
      body: JSON.stringify({
        serverName: 'Harbor',
        owner: OWNER,
        folders: defaults.folders,
        remoteAccess: { kind: 'local-only' },
        cloudLink: false,
        metadata: { key: 'a-good-key', language: 'pt-BR', region: 'BR' },
      }),
    })
    expect(res.status).toBe(200)
    expect(runtime.metadata.settings.get()).toEqual({
      key: { set: true, last4: '-key' },
      language: 'pt-BR',
      region: 'BR',
    })
    expect(runtime.media.rootFolders.list().map((f) => f.path)).toEqual([defaults.folders.movies])
    expect((await failure(anon.setup.checkMetadataKey({ body: { key: 'a-good-key' } }))).code).toBe(
      'not-found',
    )
  })

  test('public info has the movies source and TMDB’s notice', async () => {
    const { anon } = await started({ tmdb: false })
    const info = await anon.system.publicInfo()
    expect(info.sources).toContain('movies')
    expect(info.attributions[0]?.notice).toBe(
      'This product uses TMDB and the TMDB APIs but is not endorsed, certified, or otherwise approved by TMDB.',
    )
  })
})

describe('discover and media pages', () => {
  test('without a key, Discover says so; with one, it lists and searches', async () => {
    const { ownerApi, runtime } = await started({ tmdb: false })
    expect(await failure(ownerApi.movies.discover({ query: {} }))).toEqual({
      code: 'unavailable',
      reason: 'no-tmdb-key',
    })
    await withTmdb(runtime)
    const trending = await ownerApi.movies.discover({ query: {} })
    expect(trending.items.length).toBeGreaterThan(0)
    expect(trending.page).toBe(1)
    for (const m of trending.items) {
      expect(m.rating).toBeGreaterThanOrEqual(0)
      expect(m.rating).toBeLessThanOrEqual(5)
    }
    const popular = await ownerApi.movies.discover({ query: { list: 'popular' } })
    expect(popular.items.length).toBeGreaterThan(0)
    const found = await ownerApi.movies.discover({ query: { query: 'sintel' } })
    expect(found.items.map((m) => m.id)).toContain(SINTEL)
  })

  test('Discover needs Manage the library; media pages need a sign-in', async () => {
    const { memberApi, anon } = await started()
    expect((await failure(memberApi.movies.discover({ query: {} }))).code).toBe('forbidden')
    expect((await failure(anon.metadata.movie({ params: { id: SINTEL } }))).code).toBe(
      'unauthorized',
    )
    expect((await memberApi.metadata.movie({ params: { id: SINTEL } })).title).toBe('Sintel')
  })

  test('a movie the server has never seen opens, with stars, credits and its collection', async () => {
    const { ownerApi } = await started()
    const m = await ownerApi.metadata.movie({ params: { id: LLAMIGOS } })
    expect(m.id).toBe(LLAMIGOS)
    expect(m.inLibrary).toBe(false)
    expect(m.rating).toBeLessThanOrEqual(5)
    expect(m.collection?.id).toBe(CAMINANDES)
    expect(m.gone).toBe(false)
    expect(new Date(m.fetchedAt).toISOString()).toBe(m.fetchedAt)
    const ids = [...m.cast, ...m.crew].map((c) => c.id)
    expect(new Set(ids).size).toBe(ids.length)
    const meta = await ownerApi.metadata.movie({ params: { id: METROPOLIS } })
    expect(meta.cast.length).toBeGreaterThan(0)
    // Llamigos' recommendations are empty: TMDB's "similar" list stands in (decision 6)
    expect(
      (await ownerApi.metadata.recommendations({ params: { id: LLAMIGOS } })).length,
    ).toBeGreaterThan(0)
    const collection = await ownerApi.metadata.collection({ params: { id: CAMINANDES } })
    expect(collection.parts.map((p) => p.id)).toContain(LLAMIGOS)
    const person = await ownerApi.metadata.person({ params: { id: LANG } })
    expect(person.name).toBe('Fritz Lang')
    expect(person.credits.map((c) => c.id)).toContain(METROPOLIS)
    const keys = person.credits.map((c) => c.creditId)
    expect(new Set(keys).size).toBe(keys.length)
    expect((await failure(ownerApi.metadata.movie({ params: { id: 999999999 } }))).code).toBe(
      'not-found',
    )
  })

  test('art is served from the image cache, with long cache headers and an ETag', async () => {
    const { app, ownerApi, token } = await started()
    const m = await ownerApi.metadata.movie({ params: { id: SINTEL } })
    const poster = m.art.poster as string
    expect(poster).toMatch(/^\/api\/v1\/images\/movie\/45745\/poster\/w342\/\w+\.jpg$/)
    const auth = { authorization: `Bearer ${token}` }
    const res = await app.request(`${ORIGIN}${poster}`, { headers: auth })
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('image/jpeg')
    expect(res.headers.get('cache-control')).toBe(IMAGE_CACHE_CONTROL)
    const etag = res.headers.get('etag') as string
    expect((await res.arrayBuffer()).byteLength).toBeGreaterThan(0)
    const again = await app.request(`${ORIGIN}${poster}`, {
      headers: { ...auth, 'if-none-match': etag },
    })
    expect(again.status).toBe(304)
    const bad = await app.request(`${ORIGIN}${poster.replace('w342', 'w9999')}`, { headers: auth })
    expect(bad.status).toBe(404)
    const anon = await app.request(`${ORIGIN}${poster}`)
    expect(anon.status).toBe(401)
  })

  test('a request the recordings don’t have answers tmdb-unreachable, not a crash', async () => {
    const { ownerApi } = await started()
    expect(
      await failure(ownerApi.movies.discover({ query: { query: 'nothing recorded' } })),
    ).toEqual({ code: 'unavailable', reason: 'tmdb-unreachable' })
  })
})

describe('the library', () => {
  test('adds by TMDB id once, lists, filters and opens', async () => {
    const { add, ownerApi, adminApi, memberApi } = await library()
    const sintel = await add(SINTEL, [version('4K HDR', 'qp-uhd'), version('1080p')])
    expect(sintel.id).toBe(SINTEL)
    expect(sintel.versions.map((v) => v.label)).toEqual(['4K HDR', '1080p'])
    expect(sintel.qualityProfileId).toBe('qp-uhd')
    // adding again is the same movie, unchanged
    expect((await add(SINTEL)).versions).toHaveLength(2)
    await add(BUNNY)
    const page = await adminApi.movies.list({ query: { sort: 'title' } })
    expect(page.total).toBe(2)
    expect(page.items.map((m) => m.id)).toEqual([BUNNY, SINTEL])
    expect(page.counts.all).toBe(2)
    const filtered = await ownerApi.movies.list({ query: { qualityProfileId: 'qp-uhd' } })
    expect(filtered.items.map((m) => m.id)).toEqual([SINTEL])
    expect((await adminApi.movies.get({ params: { id: SINTEL } })).title).toBe('Sintel')
    // the admin's library is staff's; users read the client API (ADR 0032)
    expect((await failure(memberApi.movies.list({ query: {} }))).code).toBe('forbidden')
    expect((await failure(memberApi.movies.get({ params: { id: SINTEL } }))).code).toBe('forbidden')
    expect((await failure(ownerApi.movies.get({ params: { id: METROPOLIS } }))).code).toBe(
      'not-found',
    )
    // the page and Discover mark it
    expect((await ownerApi.metadata.movie({ params: { id: SINTEL } })).inLibrary).toBe(true)
    const found = await ownerApi.movies.discover({ query: { query: 'sintel' } })
    expect(found.items.find((m) => m.id === SINTEL)?.inLibrary).toBe(true)
    expect((await memberApi.movies.recent({ query: {} }))[0]?.id).toBe(BUNNY)
    expect(Array.isArray(await ownerApi.movies.upcoming({ query: { days: 30 } }))).toBe(true)
  })

  test('only staff add, edit and remove', async () => {
    const { memberApi, folder } = await library()
    const body = {
      tmdbId: SINTEL,
      rootFolder: folder,
      monitored: true,
      minimumAvailability: 'released' as const,
      versions: [version()],
    }
    expect((await failure(memberApi.movies.add({ body }))).code).toBe('forbidden')
    expect(
      (await failure(memberApi.movies.bulk({ body: { action: 'monitor', ids: [SINTEL] } }))).code,
    ).toBe('forbidden')
    expect(
      (await failure(memberApi.movies.delete({ params: { id: SINTEL }, query: {} }))).code,
    ).toBe('forbidden')
  })

  test('edits, versions, bulk, refresh and delete', async () => {
    const { add, ownerApi, runtime } = await library()
    await add(SINTEL)
    await add(BUNNY)
    const edited = await ownerApi.movies.update({
      params: { id: SINTEL },
      body: { monitored: false, minimumAvailability: 'announced' },
    })
    expect(edited.monitored).toBe(false)
    expect(edited.minimumAvailability).toBe('announced')

    const two = await ownerApi.movies.addVersion({
      params: { id: SINTEL },
      body: version('4K', 'qp-uhd'),
    })
    expect(two.versions).toHaveLength(2)
    const second = two.versions[1]?.id as string
    const renamed = await ownerApi.movies.updateVersion({
      params: { id: SINTEL, versionId: second },
      body: { label: '4K HDR' },
    })
    expect(renamed.versions[1]?.label).toBe('4K HDR')
    const one = await ownerApi.movies.removeVersion({ params: { id: SINTEL, versionId: second } })
    expect(one.versions).toHaveLength(1)
    expect(
      await failure(
        ownerApi.movies.removeVersion({
          params: { id: SINTEL, versionId: one.versions[0]?.id as string },
        }),
      ),
    ).toMatchObject({ code: 'conflict', reason: 'last-version' })

    const bulk = await ownerApi.movies.bulk({
      body: {
        action: 'setQualityProfile',
        ids: [SINTEL, BUNNY, METROPOLIS],
        qualityProfileId: 'qp-any',
      },
    })
    expect(bulk.ids.sort()).toEqual([BUNNY, SINTEL].sort())
    expect(bulk.missing).toEqual([METROPOLIS])
    expect((await ownerApi.movies.get({ params: { id: BUNNY } })).qualityProfileId).toBe('qp-any')
    expect(
      await failure(ownerApi.movies.bulk({ body: { action: 'search', ids: [SINTEL] } })),
    ).toMatchObject({ code: 'conflict', reason: 'no-indexers' })

    await ownerApi.movies.refresh({ params: { id: SINTEL } })
    expect(
      runtime.jobs.list({ status: ['queued'] }).some((j) => j.type === 'metadata.refresh'),
    ).toBe(true)

    await ownerApi.movies.delete({ params: { id: BUNNY }, query: {} })
    expect((await failure(ownerApi.movies.get({ params: { id: BUNNY } }))).code).toBe('not-found')
    // its page keeps working from the cache, without the library layer
    expect((await ownerApi.metadata.movie({ params: { id: BUNNY } })).inLibrary).toBe(false)
    expect((await ownerApi.audit.list({ query: {} })).items.map((e) => e.action)).toContain(
      'movie.deleted',
    )
  })

  test('root folders: staff adds and removes; one in use stays', async () => {
    const { ownerApi, memberApi, folder, add } = await library()
    expect((await ownerApi.rootFolders.list()).map((f) => f.path)).toEqual([folder])
    const [listed] = await ownerApi.rootFolders.list()
    expect(listed?.accessible).toBe(true)
    expect((await failure(memberApi.rootFolders.list())).code).toBe('forbidden')
    expect(
      (await failure(ownerApi.rootFolders.add({ body: { path: 'relative/path' } }))).reason,
    ).toBe('not-absolute')
    await add(SINTEL)
    expect(
      await failure(ownerApi.rootFolders.remove({ params: { id: listed?.id as string } })),
    ).toMatchObject({ code: 'conflict', reason: 'in-use' })
  })
})

describe('quality', () => {
  test('profiles, formats, sizes and language profiles, read-only', async () => {
    const { ownerApi, adminApi, memberApi } = await started({ tmdb: false })
    const profiles = await adminApi.quality.profiles()
    expect(profiles.map((p) => p.id)).toEqual(['qp-uhd', 'qp-hd', 'qp-any'])
    expect((await adminApi.quality.profile({ params: { id: 'qp-hd' } })).name).toBe('HD 1080p')
    expect((await failure(adminApi.quality.profile({ params: { id: 'nope' } }))).code).toBe(
      'not-found',
    )
    expect((await failure(memberApi.quality.profiles())).code).toBe('forbidden')
    expect((await ownerApi.quality.customFormats()).length).toBeGreaterThan(0)
    expect((await failure(memberApi.quality.customFormats())).code).toBe('forbidden')
    const sizes = await ownerApi.settings.qualitySizes()
    expect(sizes[0]?.quality).toBe('Unknown')
    expect((await adminApi.subtitles.languageProfiles()).length).toBeGreaterThan(0)
  })

  test('the parser reads a name, its quality and the formats it matches', async () => {
    const { ownerApi, memberApi } = await started({ tmdb: false })
    const parsed = await ownerApi.quality.parse({
      query: { title: 'Sintel.2010.2160p.UHD.BluRay.x265.HDR.DV-GROUP' },
    })
    expect(parsed.release.title).toBe('Sintel')
    expect(parsed.release.year).toBe(2010)
    expect(parsed.quality).toBe('Bluray-2160p')
    expect(parsed.formats.length).toBeGreaterThan(0)
    expect(parsed.scores.map((s) => s.profileId)).toContain('qp-uhd')
    expect((await failure(memberApi.quality.parse({ query: { title: 'x' } }))).code).toBe(
      'forbidden',
    )
  })
})

describe('the client API', () => {
  test('lists the library, opens a title and searches, with no discover section yet', async () => {
    const { add, ownerApi, memberApi } = await library()
    await add(SINTEL)
    const page = await memberApi.library.list({ query: {} })
    expect(page.items.map((i) => i.id)).toEqual([SINTEL])
    expect(page.items[0]).toMatchObject({ type: 'movie', playable: false, progress: null })
    const detail = await memberApi.library.item({ params: { type: 'movie', id: SINTEL } })
    expect(detail.item.title).toBe('Sintel')
    expect(detail.versions).toHaveLength(1)
    expect(
      (await failure(memberApi.library.item({ params: { type: 'movie', id: METROPOLIS } }))).code,
    ).toBe('not-found')
    const mine = await memberApi.library.search({ query: { query: 'sintel' } })
    expect(mine.sections.map((s) => s.kind)).not.toContain('discover')
    expect(mine.sections.find((s) => s.kind === 'movies')?.items.length).toBe(1)
    // the section becomes a request with the request flow; until then nobody gets it (ADR 0032)
    const owners = await ownerApi.library.search({ query: { query: 'sintel' } })
    expect(owners.sections.map((s) => s.kind)).toContain('movies')
    expect(owners.sections.map((s) => s.kind)).not.toContain('discover')
  })

  test('home offers Continue watching, Recently added and the library’s genres', async () => {
    const { add, ownerApi } = await library()
    await add(SINTEL)
    const rows = (await ownerApi.home.layout()).rows
    expect(rows.slice(0, 2).map((r) => r.id)).toEqual(['continue', 'recent'])
    const genres = rows.filter((r) => r.id.startsWith('genre:'))
    expect(genres.length).toBeGreaterThan(0)
    expect(genres.every((r) => r.title)).toBe(true)
  })
})
