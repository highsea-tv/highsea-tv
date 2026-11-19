// SPDX-License-Identifier: AGPL-3.0-only
// The admin's music routes through the mock transport (HT-68, Phase 5's part D): drafted in the
// contract (`musicLibrary`), answered from the mock's music in the contract's shapes, and refused
// as the server would refuse them.
import { describe, expect, test } from 'bun:test'
import { isDraft, routes } from '@highsea-tv/api-contract'
import { createMockFetch, memoryStorage } from '@highsea-tv/mock/transport'
import { type ApiError, createClient } from '@highsea-tv/sdk'

const LAN = 'http://192.168.1.20:3000'
const device = { name: 'Theo’s Mac', client: 'web' as const, appVersion: '0.4.0' }

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
  const ok = route.responses[200] as { content: { 'application/json': { schema: Schema } } }
  return ok.content['application/json'].schema.parse(value)
}

describe('the admin’s music', () => {
  // drafted with HT-68, served by the real server since HT-101
  test('no route is a draft now', () => {
    for (const r of Object.values(routes.musicLibrary)) expect(isDraft(r)).toBe(false)
  })

  test('lists artists and albums, and opens each with its albums, discs and files', async () => {
    const c = await setup()
    const artists = await c.musicLibrary.artists()
    shaped(routes.musicLibrary.artists, artists)
    const albums = await c.musicLibrary.albums()
    shaped(routes.musicLibrary.albums, albums)
    expect(artists.length).toBeGreaterThan(0)
    expect(albums.length).toBeGreaterThan(artists.length)
    // details come from tags alone for some, from MusicBrainz for the rest
    expect(artists.some((a) => a.source === 'tags' && a.musicBrainzId === null)).toBe(true)
    expect(artists.some((a) => a.source === 'musicbrainz' && a.musicBrainzId)).toBe(true)

    const vega = await c.musicLibrary.artist({ params: { id: 'marisol-vega' } })
    shaped(routes.musicLibrary.artist, vega)
    expect(vega.albumList.length).toBe(vega.albums)
    expect(vega.albumList.every((a) => a.artist.id === vega.id)).toBe(true)

    const nocturnes = await c.musicLibrary.album({
      params: { id: 'nocturne-michi-chopin-nocturnes' },
    })
    shaped(routes.musicLibrary.album, nocturnes)
    expect(nocturnes.discList.length).toBe(2)
    expect(nocturnes.discs).toBe(2)
    const tracks = nocturnes.discList.flatMap((d) => d.tracks)
    expect(tracks.length).toBe(nocturnes.tracks)
    // a lossless file has its depth and rate
    expect(tracks[0]?.file.format).toBe('FLAC')
    expect(tracks[0]?.file.bitDepth).toBe(24)

    for (const missing of [
      c.musicLibrary.artist({ params: { id: 'nowhere' } }),
      c.musicLibrary.album({ params: { id: 'nowhere' } }),
      c.musicLibrary.refreshArtist({ params: { id: 'nowhere' } }),
      c.musicLibrary.refreshAlbum({ params: { id: 'nowhere' } }),
    ])
      expect((await caught(missing)).status).toBe(404)
  })

  test('the music folder counts what it holds', async () => {
    const c = await setup()
    const [folders, artists, albums, unmatched] = await Promise.all([
      c.musicLibrary.folders(),
      c.musicLibrary.artists(),
      c.musicLibrary.albums(),
      c.musicLibrary.unmatched(),
    ])
    shaped(routes.musicLibrary.folders, folders)
    const first = folders[0]
    if (!first) throw new Error('no Music folder')
    expect(first.artists).toBe(artists.length)
    expect(first.albums).toBe(albums.length)
    expect(first.unmatched).toBe(unmatched.length)
  })

  test('matching a folder makes its album; ignoring one sets it aside', async () => {
    const c = await setup()
    const before = await c.musicLibrary.unmatched()
    shaped(routes.musicLibrary.unmatched, before)
    expect(before.map((u) => u.reason).sort()).toEqual([
      'many-albums',
      'no-album',
      'no-tags',
      'unreadable',
    ])
    const [one, two] = before
    if (!one || !two) throw new Error('nothing set aside')
    const albums = (await c.musicLibrary.albums()).length

    await c.musicLibrary.match({
      params: { id: one.id },
      body: { artist: 'Ferrous Loom', album: 'Live at Halle 6', year: 2021 },
    })
    const after = await c.musicLibrary.albums()
    expect(after.length).toBe(albums + 1)
    expect(after.some((a) => a.title === 'Live at Halle 6' && a.source === 'tags')).toBe(true)

    await c.musicLibrary.ignore({ params: { id: two.id } })
    const left = await c.musicLibrary.unmatched()
    expect(left.map((u) => u.id)).not.toContain(one.id)
    expect(left.map((u) => u.id)).not.toContain(two.id)
    expect(left.length).toBe(before.length - 2)

    expect((await caught(c.musicLibrary.ignore({ params: { id: two.id } }))).status).toBe(404)
  })

  test('track naming saves, and refuses a format without the track number', async () => {
    const c = await setup()
    const naming = await c.musicLibrary.naming()
    shaped(routes.musicLibrary.naming, naming)
    // music is read where it is until the owner turns renaming on
    expect(naming.rename).toBe(false)
    const saved = await c.musicLibrary.saveNaming({ body: { ...naming, rename: true } })
    expect(saved.rename).toBe(true)
    expect((await c.musicLibrary.naming()).rename).toBe(true)
    const bad = await caught(
      c.musicLibrary.saveNaming({ body: { ...naming, standardFormat: '{Track Title}' } }),
    )
    expect(bad.code).toBe('invalid')
    const blank = await caught(
      c.musicLibrary.saveNaming({ body: { ...naming, artistFolderFormat: ' ' } }),
    )
    expect(blank.code).toBe('invalid')
  })

  test('a song playing names its artist and album; the disk counts music', async () => {
    const c = await setup()
    const np = await c.sessions.list()
    const song = np.sessions.find((s) => s.item.song)
    if (!song?.item.song) throw new Error('no song playing')
    const album = await c.musicLibrary.album({ params: { id: song.item.song.album.id } })
    expect(album.artist.id).toBe(song.item.song.artist.id)
    const status = await c.system.status()
    expect(status.disks[0]?.usedBy.music).toBeGreaterThan(0)
  })

  test('only staff reach it', async () => {
    const c = await setup('ruth')
    expect((await caught(c.musicLibrary.artists())).status).toBe(403)
  })
})
