// SPDX-License-Identifier: AGPL-3.0-only
// The library import's routes through the SDK (6b): scan a root folder, run the confirmed matches
// as a job, read its progress; staff only. Generated clips stand in for a library on disk; who may
// call what in general is the guard table's (access.test.ts).
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test'
import { copyFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { hasFfmpeg, makeClips } from '@highsea-tv/media/testing'
import { createApi } from '../src/api/app.ts'
import { addMember, bootRuntime, cleanup, clientFor, failure, withOwner } from './helpers.ts'

afterEach(cleanup)

const SINTEL = 45745
let clipDir: string
let main: string
beforeAll(() => {
  clipDir = mkdtempSync(join(tmpdir(), 'highsea-library-api-clips-'))
  if (hasFfmpeg) main = makeClips(clipDir).main
})
afterAll(() => rmSync(clipDir, { recursive: true, force: true }))

async function started() {
  const runtime = await bootRuntime({ importing: { sampleSeconds: 2 } })
  const app = createApi(runtime)
  const { owner, token } = await withOwner(runtime)
  const admin = await addMember(runtime, owner.id, 'Ruth', 'admin')
  const user = await addMember(runtime, owner.id, 'Sam', 'user')
  await runtime.metadata.settings.setKey('test-tmdb-key')
  const root = join(runtime.config.dataDir, 'media', 'movies')
  mkdirSync(join(root, 'Sintel (2010)'), { recursive: true })
  const adminApi = clientFor(app, { token: admin.token })
  await adminApi.rootFolders.add({ body: { path: root } })
  return {
    runtime,
    root,
    ownerApi: clientFor(app, { token }),
    adminApi,
    userApi: clientFor(app, { token: user.token }),
  }
}

describe.skipIf(!hasFfmpeg)('adding a root folder scans it (4.1a’s review)', () => {
  test('the movies already there are added when their match is sure', async () => {
    const runtime = await bootRuntime({ importing: { sampleSeconds: 2 } })
    const app = createApi(runtime)
    const { token } = await withOwner(runtime)
    await runtime.metadata.settings.setKey('test-tmdb-key')
    const root = join(runtime.config.dataDir, 'media', 'films')
    mkdirSync(join(root, 'Sintel (2010)'), { recursive: true })
    copyFileSync(main, join(root, 'Sintel (2010)', 'Sintel.2010.1080p.BluRay.x264-GRP.mkv'))
    const api = clientFor(app, { token })
    await api.rootFolders.add({ body: { path: root } })
    expect(runtime.jobs.list({ type: 'library.scan' }).map((j) => j.payload)).toEqual([
      { folder: root },
    ])
    await runtime.jobs.tick()
    await runtime.jobs.idle()
    expect(runtime.movies.get(SINTEL).path).toBe(join(root, 'Sintel (2010)'))
    expect((await api.rootFolders.list()).find((f) => f.path === root)).toMatchObject({
      movies: 1,
      waiting: 0,
    })
  })
})

describe.skipIf(!hasFfmpeg)('library import over the API', () => {
  test('scan, run and progress, as an admin', async () => {
    const { runtime, root, adminApi } = await started()
    const file = join(root, 'Sintel (2010)', 'Sintel.2010.1080p.BluRay.x264-GRP.mkv')
    copyFileSync(main, file)

    const found = await adminApi.libraryImport.scan({ body: { root } })
    expect(found).toEqual([
      {
        folder: join(root, 'Sintel (2010)'),
        name: 'Sintel (2010)',
        file,
        size: expect.any(Number),
        quality: 'Bluray-1080p',
        match: { tmdbId: SINTEL, title: 'Sintel', year: 2010 },
        inLibrary: false,
        skip: null,
      },
    ])
    expect(await adminApi.libraryImport.status()).toMatchObject({ state: 'idle', total: 0 })

    const begun = await adminApi.libraryImport.run({
      body: { items: [{ folder: join(root, 'Sintel (2010)'), tmdbId: SINTEL }] },
    })
    expect(begun).toMatchObject({ state: 'running', total: 1, done: 0, rename: false })
    expect(begun.startedAt).toEqual(expect.any(String))
    expect(
      await failure(
        adminApi.libraryImport.run({
          body: { items: [{ folder: join(root, 'Sintel (2010)'), tmdbId: SINTEL }] },
        }),
      ),
    ).toEqual({ code: 'conflict', reason: 'running' })

    await runtime.jobs.tick()
    await runtime.jobs.idle()
    expect(await adminApi.libraryImport.status()).toMatchObject({
      state: 'done',
      done: 1,
      imported: 1,
      failures: [],
      finishedAt: expect.any(String),
    })
    const movie = await adminApi.movies.get({ params: { id: SINTEL } })
    expect(movie).toMatchObject({ status: 'available', path: join(root, 'Sintel (2010)') })
    const files = await adminApi.movies.files({ params: { id: SINTEL } })
    expect(files.map((f) => f.path)).toEqual([file])
  })
})

describe('library import’s access', () => {
  test('a user can’t scan, run or read it; a folder outside the roots is refused', async () => {
    const { root, userApi, ownerApi } = await started()
    expect((await failure(userApi.libraryImport.scan({ body: { root } }))).code).toBe('forbidden')
    expect(
      (
        await failure(
          userApi.libraryImport.run({ body: { items: [{ folder: root, tmdbId: SINTEL }] } }),
        )
      ).code,
    ).toBe('forbidden')
    expect((await failure(userApi.libraryImport.status())).code).toBe('forbidden')
    expect(await failure(ownerApi.libraryImport.scan({ body: { root: '/etc' } }))).toEqual({
      code: 'invalid',
      reason: 'outside-roots',
    })
    // an empty folder has nothing to match, so it scans without TMDB
    expect(await ownerApi.libraryImport.scan({ body: { root } })).toMatchObject([
      { name: 'Sintel (2010)', file: null, skip: 'No video file in the folder.' },
    ])
  })
})
