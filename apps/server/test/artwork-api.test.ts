// SPDX-License-Identifier: AGPL-3.0-only
// Chosen artwork's routes (HT-66) through the SDK, on TMDB's recordings: the picker's view, choosing,
// uploading and Reset; staff only; each change in the audit log; and the new address everywhere a
// title's art goes, the admin's and the apps'.
import { afterEach, describe, expect, test } from 'bun:test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { ARTWORK_UPLOAD_MAX } from '@highsea-tv/api-contract'
import { createApi } from '../src/api/app.ts'
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
const BLENDER = 531241

/** A JPEG's SOI, an APP0 and a baseline SOF0 with the size: enough for the checks. */
function jpeg(width: number, height: number) {
  const b = new Uint8Array(64)
  b.set([0xff, 0xd8, 0xff, 0xe0, 0, 4, 0, 0, 0xff, 0xc0, 0, 11, 8])
  const v = new DataView(b.buffer)
  v.setUint16(13, height)
  v.setUint16(15, width)
  return Buffer.from(b).toString('base64')
}

async function started() {
  const runtime = await bootRuntime()
  const app = createApi(runtime)
  const { owner, token } = await withOwner(runtime)
  const member = await addMember(runtime, owner.id, 'Mara')
  const admin = await addMember(runtime, owner.id, 'Ruth', 'admin')
  await runtime.metadata.settings.setKey('test-tmdb-key')
  runtime.metadata.settings.update({ region: 'US' })
  const folder = join(runtime.config.dataDir, 'movies')
  mkdirSync(folder, { recursive: true })
  const ownerApi = clientFor(app, { token })
  await ownerApi.rootFolders.add({ body: { path: folder } })
  await ownerApi.movies.add({
    body: {
      tmdbId: SINTEL,
      rootFolder: folder,
      monitored: true,
      minimumAvailability: 'released',
      versions: [{ label: '1080p', qualityProfileId: 'qp-hd' }],
    },
  })
  return {
    app,
    token,
    ownerApi,
    memberApi: clientFor(app, { token: member.token }),
    adminApi: clientFor(app, { token: admin.token }),
  }
}

const movie = { owner: 'movie' as const, id: SINTEL }

describe('the automatic logo in lists (HT-65)', () => {
  test('a library title carries it in the library’s list, as in its own view', async () => {
    const { memberApi } = await started()
    const own = (await memberApi.library.item({ params: { type: 'movie', id: SINTEL } })).item
    const listed = (await memberApi.library.list({ query: { type: 'movie' } })).items.find(
      (m) => m.id === own.id,
    )
    expect(own.art.logo).toMatch(/^\/api\/v1\/images\/movie\/45745\/logo\//)
    expect(listed?.art.logo).toBe(own.art.logo)
  })
})

describe('the artwork routes', () => {
  test('the view: each kind’s current image, TMDB’s others, the current one marked', async () => {
    const { adminApi } = await started()
    const view = await adminApi.artwork.get({ params: movie })
    expect(view.tmdb).toEqual({ available: true, reason: null })
    expect(view.kinds.map((k) => k.kind)).toEqual(['poster', 'backdrop', 'logo'])
    const poster = view.kinds[0]
    expect(poster?.chosen).toBeNull()
    expect(poster?.current).toBe(poster?.automatic as string)
    expect(poster?.options.filter((o) => o.current)).toHaveLength(1)
    expect(poster?.options[0]?.url).toMatch(/^\/api\/v1\/images\/movie\/45745\/poster\/w185\//)
    expect(view.kinds[2]?.current).toMatch(/\/logo\/w300\/hsSintelLogoEn\.png$/)
  })

  test('a choice is a new address for the admin and the apps, logged; Reset brings back the old', async () => {
    const { adminApi, memberApi, ownerApi } = await started()
    const before = (await memberApi.library.item({ params: { type: 'movie', id: SINTEL } })).item
      .art.poster
    const view = await adminApi.artwork.choose({
      params: { ...movie, kind: 'poster' },
      body: { file: '/hsM45745Poster2.jpg' },
    })
    const poster = view.kinds[0]
    expect(poster?.chosen).toMatchObject({ source: 'tmdb', by: { name: 'ruth' } })
    expect(poster?.options.find((o) => o.current)?.file).toBe('/hsM45745Poster2.jpg')
    const item = (await memberApi.library.item({ params: { type: 'movie', id: SINTEL } })).item
    expect(item.art.poster).toBe('/api/v1/images/movie/45745/poster/w342/hsM45745Poster2.jpg')
    expect(item.art.poster).not.toBe(before)
    expect((await ownerApi.movies.get({ params: { id: SINTEL } })).art.poster).toBe(item.art.poster)
    expect((await ownerApi.metadata.movie({ params: { id: SINTEL } })).art.poster).toBe(
      item.art.poster,
    )

    await adminApi.artwork.reset({ params: { ...movie, kind: 'poster' } })
    const after = (await memberApi.library.item({ params: { type: 'movie', id: SINTEL } })).item
    expect(after.art.poster).toBe(before)
    const actions = (await ownerApi.audit.list({ query: {} })).items
      .filter((e) => e.action.startsWith('artwork.'))
      .map((e) => [e.action, e.targetType, e.targetId])
    expect(actions).toEqual(
      expect.arrayContaining([
        ['artwork.chosen', 'movie', String(SINTEL)],
        ['artwork.reset', 'movie', String(SINTEL)],
      ]),
    )
  })

  test('an upload is served from highsea, at its new address', async () => {
    const { adminApi, app, token } = await started()
    const view = await adminApi.artwork.upload({
      params: { ...movie, kind: 'poster' },
      body: { data: jpeg(1000, 1500) },
    })
    const poster = view.kinds[0]
    expect(poster?.chosen?.source).toBe('upload')
    expect(poster?.current).toMatch(/^\/api\/v1\/images\/movie\/45745\/poster\/w342\/hs_\w+\.jpg$/)
    const res = await app.request(`${ORIGIN}${poster?.current}`, {
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('image/jpeg')
    expect((await res.arrayBuffer()).byteLength).toBe(64)
  })

  test('uploads are checked: shape, type and size', async () => {
    const { adminApi } = await started()
    const upload = (kind: 'poster' | 'logo', data: string) =>
      failure(adminApi.artwork.upload({ params: { ...movie, kind }, body: { data } }))
    expect(await upload('poster', jpeg(1500, 1000))).toEqual({ code: 'invalid', reason: 'shape' })
    expect(await upload('logo', jpeg(800, 200))).toEqual({ code: 'invalid', reason: 'type' })
    expect(await upload('poster', 'A'.repeat(ARTWORK_UPLOAD_MAX + 4096))).toEqual({
      code: 'invalid',
      reason: 'size',
    })
  })

  test('a collection’s art, and only TMDB’s own images', async () => {
    const { adminApi } = await started()
    const params = { owner: 'collection' as const, id: BLENDER, kind: 'backdrop' as const }
    const view = await adminApi.artwork.choose({
      params,
      body: { file: '/hsC531241Backdrop2.jpg' },
    })
    expect(view.kinds[1]?.current).toMatch(/\/hsC531241Backdrop2\.jpg$/)
    expect(
      (await failure(adminApi.artwork.choose({ params, body: { file: '/hsM45745Poster2.jpg' } })))
        .reason,
    ).toBe('not-an-option')
  })

  test('staff only: a user and a visitor are refused every route', async () => {
    const { memberApi, app } = await started()
    const params = { ...movie, kind: 'poster' as const }
    for (const call of [
      memberApi.artwork.get({ params: movie }),
      memberApi.artwork.choose({ params, body: { file: '/hsM45745Poster2.jpg' } }),
      memberApi.artwork.upload({ params, body: { data: jpeg(1000, 1500) } }),
      memberApi.artwork.reset({ params }),
    ])
      expect((await failure(call)).code).toBe('forbidden')
    const anon = clientFor(app)
    expect((await failure(anon.artwork.get({ params: movie }))).code).toBe('unauthorized')
  })
})
