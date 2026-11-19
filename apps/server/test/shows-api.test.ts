// SPDX-License-Identifier: AGPL-3.0-only
// Shows over HTTP (Phase 5 B, HT-83): the admin adds a show (`/series`, by its TMDB id as a
// string) and sees its episodes; the apps list it, open it, play an episode through the films' play
// decision and stream token, keep each profile's place, mark a season, and find it on Home and in
// Search; someone without the shows library sees none of it; and a shows root folder's scan and
// Library import are served. TMDB answers from the recordings (Chernobyl, 87108); the episodes'
// files are rows over a few bytes, as the films' API tests make them, so nothing probes them.
import { afterEach, describe, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { schema } from '@highsea-tv/db'
import type { Runtime } from '@highsea-tv/runtime'
import { createApi } from '../src/api/app.ts'
import {
  BYTES,
  bootRuntime,
  cleanup,
  clientFor,
  failure,
  meta,
  OWNER,
  SIZE,
  tokenFor,
  withOwner,
} from './helpers.ts'

const CHERNOBYL = 87108
const E1 = 1725580
const E2 = 1747124

const dirs: string[] = []
afterEach(async () => {
  await cleanup()
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
})

/** A file for an episode, as the import would record it, with an H.264 and AAC probe. */
function episodeFile(runtime: Runtime, folder: string, tmdbId: number, name: string) {
  const { db } = runtime
  const ep = db
    .select()
    .from(schema.mediaItems)
    .all()
    .find((r) => r.type === 'episode' && r.tmdbId === tmdbId)
  if (!ep) throw new Error(`no episode ${tmdbId}`)
  const version = db
    .select()
    .from(schema.versions)
    .all()
    .find((v) => v.itemId === ep.id)
  const path = join(folder, name)
  mkdirSync(folder, { recursive: true })
  writeFileSync(path, BYTES)
  const id = `fil_${tmdbId}`
  db.insert(schema.mediaFiles)
    .values({
      id,
      itemId: ep.id,
      versionId: version?.id ?? null,
      path,
      size: SIZE,
      quality: 'WEBDL-1080p',
      mediaInfo: {
        probe: {
          duration: 3600,
          container: 'mov,mp4,m4a,3gp,3g2,mj2',
          video: {
            index: 0,
            codec: 'h264',
            codecTag: 'avc1',
            profile: 'High',
            width: 1920,
            height: 1080,
            bitDepth: 8,
            bitrate: 4_000_000,
            colorPrimaries: 'bt709',
            colorTransfer: 'bt709',
            hdr: 'sdr',
            dolbyVision: null,
          },
          audio: [
            {
              index: 1,
              codec: 'aac',
              codecTag: 'mp4a',
              profile: 'LC',
              channels: 2,
              layout: 'stereo',
              language: 'eng',
              title: null,
              default: true,
              bitrate: 128_000,
            },
          ],
          subtitles: [],
        },
      },
      addedAt: Date.now(),
    } as typeof schema.mediaFiles.$inferInsert)
    .run()
  // the episode's own rows, as the import leaves them (an upsert on each row's key)
  if (!version) throw new Error(`no version for ${tmdbId}`)
  db.insert(schema.versions)
    .values({ ...version, fileId: id })
    .onConflictDoUpdate({ target: schema.versions.id, set: { fileId: id } })
    .run()
  db.insert(schema.mediaItems)
    .values({ ...ep, status: 'available' })
    .onConflictDoUpdate({ target: schema.mediaItems.id, set: { status: 'available' } })
    .run()
}

async function served() {
  const runtime = await bootRuntime()
  const { owner, token } = await withOwner(runtime)
  await runtime.metadata.settings.setKey('test-key-for-replay-0001')
  const dir = mkdtempSync(join(tmpdir(), 'highsea-shows-api-'))
  dirs.push(dir)
  const root = join(dir, 'shows')
  mkdirSync(root)
  runtime.media.rootFolders.add({ path: root, kind: 'shows' })
  const app = createApi(runtime)
  const api = clientFor(app, { token })
  const profile = runtime.media.profiles.list()[0]?.id as string
  const added = await api.series.add({
    body: {
      tmdbId: CHERNOBYL,
      qualityProfileId: profile,
      rootFolder: root,
      monitor: 'all',
      seasonFolders: true,
      search: false,
    },
  })
  const folder = join(root, 'Chernobyl (2019)', 'Season 01')
  episodeFile(runtime, folder, E1, 'Chernobyl.S01E01.mp4')
  episodeFile(runtime, folder, E2, 'Chernobyl.S01E02.mp4')
  return { runtime, app, api, owner, added, root, profile }
}

const episode = (id: number) => ({ type: 'episode' as const, id })

describe('the admin’s shows', () => {
  test('added by TMDB id; read, edited and monitored by its id as a string', async () => {
    const { api, added, root, profile } = await served()
    expect(added).toMatchObject({ id: '87108', tmdbId: CHERNOBYL, rootFolder: root })
    expect((await api.series.list()).map((s) => s.id)).toEqual(['87108'])
    const show = await api.series.get({ params: { id: '87108' } })
    expect(show.episodes).toMatchObject({ have: 2, total: 5 })
    const saved = await api.series.update({
      params: { id: '87108' },
      body: { seasonFolders: false, qualityProfileId: profile },
    })
    expect(saved.seasonFolders).toBe(false)
    expect(
      await failure(api.series.update({ params: { id: '87108' }, body: { rootFolder: '/else' } })),
    ).toEqual({ code: 'invalid', reason: 'root-folder-move' })
    await api.series.monitorSeason({
      params: { id: '87108', season: 1 },
      body: { monitored: false },
    })
    expect((await api.series.get({ params: { id: '87108' } })).seasonList[0]?.monitored).toBe(false)
    expect(await api.series.rootFolders()).toEqual([root])
    expect(await api.series.unmatched({ query: {} })).toEqual([])
    expect(await failure(api.series.get({ params: { id: '1' } }))).toMatchObject({
      code: 'not-found',
    })
    // removing keeps the files; deleting them is refused
    expect(
      await failure(api.series.remove({ params: { id: '87108' }, query: { deleteFiles: 'true' } })),
    ).toEqual({ code: 'conflict', reason: 'delete-files' })
  })

  test('a show in a root folder highsea only reads is never searched for (Phase 5 C1)', async () => {
    const { runtime, api } = await served()
    const id = '87108'
    expect((await api.series.get({ params: { id } })).readOnly).toBe(false)
    const root = runtime.media.rootFolders.list('shows')[0]
    if (!root) throw new Error('no root folder')
    runtime.media.rootFolders.setReadOnly(root.id, true)
    // the admin hides its monitoring switches and Search by this
    expect((await api.series.get({ params: { id } })).readOnly).toBe(true)
    const refused = { code: 'conflict' as const, reason: 'read-only' }
    expect(await failure(api.series.search({ params: { id }, body: {} }))).toEqual(refused)
    expect(
      await failure(api.series.interactiveSearch({ params: { id }, body: { season: 1 } })),
    ).toEqual(refused)
  })

  test('Shows’ settings: naming, sizes and the profiles’ use', async () => {
    const { api, profile } = await served()
    const naming = await api.series.naming()
    expect(naming.seasonFolderFormat).toBe('Season {season:00}')
    expect((await api.series.saveNaming({ body: { ...naming, rename: false } })).rename).toBe(false)
    const sizes = await api.series.qualitySizes()
    expect(await api.series.saveQualitySizes({ body: sizes })).toEqual(sizes)
    const usage = await api.series.profileUsage()
    expect(usage.find((u) => u.profileId === profile)).toMatchObject({ shows: 1 })
  })
})

describe('the apps’ shows', () => {
  test('listed and opened; an episode played as a film is, with its place kept per profile', async () => {
    const { api } = await served()
    const [show] = await api.shows.list()
    expect(show).toMatchObject({ id: CHERNOBYL, episodes: 2, next: { kind: 'start' } })
    const detail = await api.shows.show({ params: { id: CHERNOBYL } })
    expect(detail.seasons[0]?.episodes.map((e) => e.id)).toEqual([E1, E2])

    const item = await api.library.item({ params: episode(E1) })
    expect(item.item).toMatchObject({ type: 'episode', playable: true, show: { id: CHERNOBYL } })
    const session = await api.playback.play({ params: episode(E1), body: {} })
    expect(session.decision.method).toBe('direct-play')
    expect(session.url).toMatch(/^\/stream\/files\/[\w-]+\.fil_1725580\.[\w-]+$/)

    await api.playback.itemProgress({ params: episode(E1), body: { position: 600 } })
    // Home: the episode on Continue watching, and the show on Recently added shows
    const home = await api.home.sections({ query: { client: 'web' } })
    expect(home.find((r) => r.id === 'continue')).toMatchObject({ items: [{ id: E1 }] })
    expect(home.find((r) => r.id === 'recent-shows')).toMatchObject({
      layout: 'shows',
      title: 'Recently added shows',
      items: [{ id: CHERNOBYL }],
    })
    expect((await api.shows.show({ params: { id: CHERNOBYL } })).show.next).toMatchObject({
      kind: 'resume',
      episode: { id: E1, position: 600 },
    })
    expect((await api.playback.next({ params: episode(E1) })).item).toMatchObject({ id: E2 })

    await api.shows.watched({ params: { id: CHERNOBYL }, body: { season: 1, watched: true } })
    const marked = await api.shows.show({ params: { id: CHERNOBYL } })
    expect(marked.show).toMatchObject({ watched: true, unwatched: 0 })
  })

  test('Search finds the show and its episodes', async () => {
    const { api } = await served()
    const { sections } = await api.library.search({ query: { query: 'chernobyl' } })
    expect(sections[0]).toMatchObject({ kind: 'shows', items: [{ id: CHERNOBYL }] })
    const please = await api.library.search({ query: { query: 'please remain' } })
    expect(please.sections).toMatchObject([{ kind: 'episodes', items: [{ id: E2 }] }])
  })

  test('someone without the shows library sees none of it; someone given it does', async () => {
    const { runtime, app, owner } = await served()
    const invite = runtime.auth.users.invite(
      { displayName: 'Sam', email: null, role: 'user', libraries: ['movies'] },
      { id: owner.id, name: OWNER.username },
      meta,
    )
    const accepted = await runtime.auth.links.accept(
      invite.link.split('/').pop() as string,
      { password: 'a long enough password' },
      meta,
    )
    const sam = clientFor(app, { token: tokenFor(runtime, accepted.session.user.id) })
    expect(await sam.shows.list()).toEqual([])
    expect(await failure(sam.shows.show({ params: { id: CHERNOBYL } }))).toMatchObject({
      code: 'not-found',
    })
    expect(await failure(sam.library.item({ params: episode(E1) }))).toMatchObject({
      code: 'not-found',
    })
    expect(await failure(sam.playback.play({ params: episode(E1), body: {} }))).toMatchObject({
      code: 'not-found',
    })
    expect((await sam.library.search({ query: { query: 'chernobyl' } })).sections).toEqual([])

    // given Movies and Shows by name, the show is theirs to watch
    const both = runtime.auth.users.invite(
      { displayName: 'Ana', email: null, role: 'user', libraries: ['movies', 'shows'] },
      { id: owner.id, name: OWNER.username },
      meta,
    )
    const ana = await runtime.auth.links.accept(
      both.link.split('/').pop() as string,
      { password: 'another long password' },
      meta,
    )
    const anaApi = clientFor(app, { token: tokenFor(runtime, ana.session.user.id) })
    expect((await anaApi.shows.list()).map((s) => s.id)).toEqual([CHERNOBYL])
    expect((await anaApi.playback.play({ params: episode(E1), body: {} })).decision.method).toBe(
      'direct-play',
    )
  })
})

describe('a shows root folder', () => {
  test('is scanned, and its Library import previewed, without a file renamed', async () => {
    const { api, root, runtime } = await served()
    const [folder] = runtime.media.rootFolders.list('shows')
    await api.rootFolders.scan({ params: { id: folder?.id as string } })
    const candidates = await api.libraryImport.scan({ body: { root } })
    expect(candidates).toMatchObject([
      { name: 'Chernobyl (2019)', file: null, parts: [], inLibrary: true },
    ])
    expect(
      await failure(
        api.libraryImport.run({
          body: {
            items: [{ folder: join(root, 'Chernobyl (2019)'), tmdbId: CHERNOBYL }],
            rename: true,
          },
        }),
      ),
    ).toEqual({ code: 'invalid', reason: 'rename-shows' })
  })
})

describe('the admin’s unmatched and refresh', () => {
  test('listed, dismissed and refused once gone; a show refreshed, one not here a 404', async () => {
    const { api, root, runtime } = await served()
    const path = join(root, 'Chernobyl (2019)', 'Season 01', 'Chernobyl Recap.mkv')
    const show = runtime.db
      .select()
      .from(schema.mediaItems)
      .all()
      .find((r) => r.type === 'show' && r.tmdbId === CHERNOBYL)
    runtime.db
      .insert(schema.unmatchedFiles)
      .values({
        path,
        kind: 'episode-file',
        rootFolder: root,
        itemId: show?.id ?? null,
        reason: 'no-episode-number',
        message: 'Its name gives no season and episode.',
        size: 10,
        foundAt: Date.now(),
      })
      .run()
    expect(await api.series.unmatched({ query: {} })).toMatchObject([
      { path, kind: 'episode-file', show: String(CHERNOBYL), reason: 'no-episode-number' },
    ])
    // the file isn't on disk: matching it says so
    expect(
      await failure(
        api.series.matchUnmatched({ body: { path, episodes: [{ season: 1, episode: 3 }] } }),
      ),
    ).toEqual({ code: 'not-found', reason: 'no-file' })
    await api.series.dismissUnmatched({ body: { path } })
    expect(await api.series.unmatched({ query: {} })).toEqual([])
    expect(
      await failure(api.series.dismissUnmatched({ body: { path: join(root, 'nothing.mkv') } })),
    ).toMatchObject({ code: 'not-found' })

    await api.series.refresh({ params: { id: String(CHERNOBYL) } })
    expect(await failure(api.series.refresh({ params: { id: '1' } }))).toMatchObject({
      code: 'not-found',
    })
  })
})
