// SPDX-License-Identifier: AGPL-3.0-only
// Music over HTTP (HT-101): the admin's routes, the apps' with a song's play by ranges on
// `/stream/music/{token}`, Now playing and its history naming the song, a cover with its ETag,
// playlists, Search, and someone without the music library hearing none of it. Rows are written
// straight in, as the scan would leave them, so no ffprobe is needed.
import { afterEach, describe, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { schema } from '@highsea-tv/db'
import type { Runtime } from '@highsea-tv/runtime'
import { createApi } from '../src/api/app.ts'
import { createHttpServer } from '../src/http.ts'
import { createStream } from '../src/stream/index.ts'
import { BYTES, bootRuntime, cleanup, meta, OWNER, SIZE, tokenFor, withOwner } from './helpers.ts'

const cleanups: (() => void | Promise<void>)[] = []
afterEach(async () => {
  for (const c of cleanups.splice(0)) await c()
  await cleanup()
})

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])

/** Blur's Parklife with two FLAC tracks and its folder's cover, under a Music root folder. */
function parklife(runtime: Runtime, dir: string) {
  const root = join(dir, 'music')
  const album = join(root, 'Blur', 'Parklife (1994)')
  mkdirSync(album, { recursive: true })
  runtime.media.rootFolders.add({ path: root, kind: 'music' })
  writeFileSync(join(album, 'folder.png'), PNG)
  const now = Date.now()
  const { db } = runtime
  db.insert(schema.musicArtists)
    .values({
      id: 'ar_blur',
      name: 'Blur',
      sortName: 'blur',
      nameKey: 'blur',
      path: join(root, 'Blur'),
      rootFolder: root,
      source: 'tags',
      addedAt: now,
      updatedAt: now,
    })
    .run()
  db.insert(schema.musicAlbums)
    .values({
      id: 'al_parklife',
      artistId: 'ar_blur',
      title: 'Parklife',
      sortTitle: 'parklife',
      year: 1994,
      released: '1994-04-25',
      path: album,
      rootFolder: root,
      coverFile: join(album, 'folder.png'),
      source: 'tags',
      addedAt: now,
      updatedAt: now,
    })
    .run()
  for (const [n, title] of [
    [1, 'Girls & Boys'],
    [2, 'Tracy Jacks'],
  ] as const) {
    const path = join(album, `0${n}.flac`)
    writeFileSync(path, BYTES)
    db.insert(schema.musicTracks)
      .values({
        id: `tr_${n}`,
        albumId: 'al_parklife',
        number: n,
        title,
        path,
        size: SIZE,
        mtime: now,
        format: 'FLAC',
        codec: 'flac',
        duration: 240,
        bitrate: 900,
        sampleRate: 44100,
        bitDepth: 16,
        channels: 2,
        addedAt: now,
        updatedAt: now,
      })
      .run()
  }
}

async function serving() {
  const runtime = await bootRuntime()
  const dir = mkdtempSync(join(tmpdir(), 'highsea-music-api-'))
  cleanups.push(() => rmSync(dir, { recursive: true, force: true }))
  const { owner, token } = await withOwner(runtime)
  parklife(runtime, dir)
  const server = createHttpServer({ api: createApi(runtime), stream: createStream(runtime) })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  cleanups.push(
    () =>
      new Promise<void>((r) => {
        server.closeAllConnections()
        server.close(() => r())
      }),
  )
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  const call = (path: string, init: RequestInit & { as?: string } = {}) =>
    fetch(`${url}${path}`, {
      ...init,
      headers: {
        authorization: `Bearer ${init.as ?? token}`,
        'content-type': 'application/json',
        ...(init.headers as Record<string, string>),
      },
    })
  return { runtime, url, owner, token, call }
}

describe('the admin’s music', () => {
  test('artists, an album with its files, the folders, and naming saved', async () => {
    const { call } = await serving()
    const artists = (await (await call('/api/v1/artists')).json()) as { name: string }[]
    expect(artists.map((a) => a.name)).toEqual(['Blur'])
    const album = (await (await call('/api/v1/albums/al_parklife')).json()) as {
      cover: string
      discList: { tracks: { title: string }[] }[]
    }
    expect(album.cover).toBe('/api/v1/images/music/album/al_parklife')
    expect(album.discList[0]?.tracks.map((t) => t.title)).toEqual(['Girls & Boys', 'Tracy Jacks'])
    const [folder] = (await (await call('/api/v1/music/folders')).json()) as {
      albums: number
      tracks: number
    }[]
    expect(folder).toMatchObject({ albums: 1, tracks: 2 })
    expect((await call('/api/v1/albums/al_nope')).status).toBe(404)
    const naming = (await (await call('/api/v1/settings/trackNaming')).json()) as Record<
      string,
      unknown
    >
    const saved = await call('/api/v1/settings/trackNaming', {
      method: 'PUT',
      body: JSON.stringify({ ...naming, standardFormat: '{Album Title}/{track:00}' }),
    })
    expect(saved.status).toBe(200)
    const refused = await call('/api/v1/settings/trackNaming', {
      method: 'PUT',
      body: JSON.stringify({ ...naming, standardFormat: '{Album Title}' }),
    })
    expect(refused.status).toBe(400)
    expect(((await refused.json()) as { error: { details: unknown } }).error.details).toEqual({
      reason: 'standardFormat',
    })
  })
})

describe('the apps’ music', () => {
  test('a song plays by ranges, shows on Now playing with its album, and lands in the history', async () => {
    const { call, url } = await serving()
    const library = (await (await call('/api/v1/music')).json()) as { albums: unknown[] }
    expect(library.albums).toHaveLength(1)
    const queue = await call('/api/v1/music/queue', {
      method: 'POST',
      body: JSON.stringify({ source: { album: 'al_parklife' } }),
    })
    expect(((await queue.json()) as unknown[]).length).toBe(2)
    const res = await call('/api/v1/music/tracks/tr_1/play', { method: 'POST', body: '{}' })
    expect(res.status).toBe(200)
    const play = (await res.json()) as {
      id: string
      url: string
      method: string
      contentType: string
    }
    expect(play).toMatchObject({ method: 'direct-play', contentType: 'audio/flac' })
    // the token is the credential: no header needed
    const range = await fetch(`${url}${play.url}`, { headers: { range: 'bytes=100-199' } })
    expect(range.status).toBe(206)
    expect(range.headers.get('content-type')).toBe('audio/flac')
    expect(range.headers.get('content-range')).toBe(`bytes 100-199/${SIZE}`)
    expect(Buffer.from(await range.arrayBuffer())).toEqual(BYTES.subarray(100, 200))
    const now = (await (await call('/api/v1/sessions')).json()) as {
      sessions: { id: string; item: { song?: { album: { id: string } } } }[]
    }
    expect(now.sessions.map((s) => s.item.song?.album.id)).toEqual(['al_parklife'])
    expect(
      (
        await call(`/api/v1/music/plays/${play.id}/progress`, {
          method: 'POST',
          body: JSON.stringify({ position: 130, paused: false }),
        })
      ).status,
    ).toBe(204)
    expect((await call(`/api/v1/music/plays/${play.id}`, { method: 'DELETE' })).status).toBe(204)
    expect((await fetch(`${url}${play.url}`)).status).toBe(404)
    const history = (await (await call('/api/v1/sessions/history')).json()) as {
      item: { title: string }
      finished: boolean
    }[]
    expect(history.map((h) => [h.item.title, h.finished])).toEqual([['Girls & Boys', true]])
    // Home's Recently played has the album the queue played
    const home = (await (await call('/api/v1/home?client=web')).json()) as {
      id: string
      layout: string
    }[]
    expect(home.find((r) => r.id === 'recent-music')?.layout).toBe('music')
  })

  test('Now playing’s Stop ends a song, and the player hears who stopped it', async () => {
    const { call } = await serving()
    const play = (await (
      await call('/api/v1/music/tracks/tr_2/play', { method: 'POST', body: '{}' })
    ).json()) as { id: string }
    const stopped = await call(`/api/v1/sessions/${play.id}/stop`, {
      method: 'POST',
      body: JSON.stringify({ message: 'Bedtime' }),
    })
    expect(stopped.status).toBe(200)
    const report = await call(`/api/v1/music/plays/${play.id}/progress`, {
      method: 'POST',
      body: JSON.stringify({ position: 10, paused: false }),
    })
    expect(report.status).toBe(404)
    expect(((await report.json()) as { error: { details: unknown } }).error.details).toEqual({
      reason: 'stopped',
      by: OWNER.displayName,
      message: 'Bedtime',
    })
  })

  test('a cover with its ETag, then 304; Search finds the album and its songs', async () => {
    const { call } = await serving()
    const cover = await call('/api/v1/images/music/album/al_parklife')
    expect(cover.status).toBe(200)
    expect(cover.headers.get('content-type')).toBe('image/png')
    expect(cover.headers.get('cache-control')).toBe('private, max-age=86400')
    const etag = cover.headers.get('etag') as string
    expect(Buffer.from(await cover.arrayBuffer())).toEqual(PNG)
    const again = await call('/api/v1/images/music/album/al_parklife', {
      headers: { 'if-none-match': etag },
    })
    expect(again.status).toBe(304)
    expect((await call('/api/v1/images/music/artist/ar_blur')).status).toBe(404)
    expect((await call('/api/v1/images/music/album/al_parklife', { as: 'nope' })).status).toBe(401)
    const found = (await (await call('/api/v1/search?query=parklife')).json()) as {
      sections: { kind: string }[]
    }
    expect(found.sections.map((s) => s.kind)).toContain('albums')
  })

  test('a playlist is the profile’s own', async () => {
    const { call } = await serving()
    const made = await call('/api/v1/music/playlists', {
      method: 'POST',
      body: JSON.stringify({ name: 'Mornings', songs: ['tr_1', 'tr_2'] }),
    })
    const { id } = (await made.json()) as { id: string }
    const detail = (await (await call(`/api/v1/music/playlists/${id}`)).json()) as {
      songs: { title: string }[]
    }
    expect(detail.songs.map((s) => s.title)).toEqual(['Girls & Boys', 'Tracy Jacks'])
    expect((await call(`/api/v1/music/playlists/${id}`, { method: 'DELETE' })).status).toBe(204)
    expect((await call(`/api/v1/music/playlists/${id}`)).status).toBe(404)
  })

  test('someone without the music library hears none of it', async () => {
    const { runtime, owner, call } = await serving()
    const invite = runtime.auth.users.invite(
      { displayName: 'Kid', email: null, role: 'user', libraries: ['movies'] },
      { id: owner.id, name: OWNER.username },
      meta,
    )
    const accepted = await runtime.auth.links.accept(
      invite.link.split('/').pop() as string,
      { password: 'a long enough password' },
      meta,
    )
    const kid = tokenFor(runtime, accepted.session.user.id)
    const library = (await (await call('/api/v1/music', { as: kid })).json()) as {
      albums: unknown[]
    }
    expect(library.albums).toEqual([])
    expect((await call('/api/v1/music/albums/al_parklife', { as: kid })).status).toBe(404)
    expect(
      (await call('/api/v1/music/tracks/tr_1/play', { as: kid, method: 'POST', body: '{}' }))
        .status,
    ).toBe(404)
    expect((await call('/api/v1/images/music/album/al_parklife', { as: kid })).status).toBe(404)
    // and the admin's music is staff's
    expect((await call('/api/v1/artists', { as: kid })).status).toBe(403)
  })
})
