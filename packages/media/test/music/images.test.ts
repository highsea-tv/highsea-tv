// SPDX-License-Identifier: AGPL-3.0-only
// Covers and artists' pictures (HT-101): the folder's file first, then the picture in a track,
// then the Cover Art Archive's (fanart.tv's for an artist), fetched once and kept. No network: the
// sources here are stand-ins.
import { afterEach, describe, expect, test } from 'bun:test'
import { existsSync, readFileSync } from 'node:fs'
import { schema } from '@highsea-tv/db'
import { eq } from 'drizzle-orm'
import { cleanup, PNG, parklife, setup } from './fixture.ts'

afterEach(cleanup)

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46])

describe('covers', () => {
  test('the folder’s cover, served where it is', async () => {
    const t = await setup()
    t.put('Blur/Parklife (1994)/01.flac', parklife(1, 'Girls & Boys'))
    const cover = t.put('Blur/Parklife (1994)/cover.png', '')
    const { writeFileSync } = await import('node:fs')
    writeFileSync(cover, PNG)
    await t.music.libraryScan.scan()
    const [album] = t.music.admin.albums()
    const image = await t.music.images.get('album', album?.id as string)
    expect(image).toMatchObject({ path: cover, contentType: 'image/png' })
    expect(image.etag).toMatch(/^".+"$/)
  })

  test('the picture in a track, copied out once', async () => {
    const t = await setup()
    t.put('Blur/Parklife (1994)/01.flac', parklife(1, 'Girls & Boys', { cover: true }))
    await t.music.libraryScan.scan()
    const [album] = t.music.admin.albums()
    const image = await t.music.images.get('album', album?.id as string)
    expect(image.contentType).toBe('image/png')
    expect(new Uint8Array(readFileSync(image.path))).toEqual(PNG)
    expect(await t.music.images.get('album', album?.id as string)).toEqual(image)
  })

  test('the Cover Art Archive’s, fetched once and kept; none at all is a 404', async () => {
    const t = await setup()
    t.put('Blur/Parklife (1994)/01.flac', parklife(1, 'Girls & Boys'))
    t.put('Pulp/Different Class/01.flac', {
      title: 'Disco 2000',
      artist: 'Pulp',
      album: 'Different Class',
    })
    await t.music.libraryScan.scan()
    const albums = t.music.admin.albums()
    const parklifeId = albums.find((a) => a.title === 'Parklife')?.id as string
    t.db
      .update(schema.musicAlbums)
      .set({ coverUrl: 'https://coverartarchive.org/release/x/front-500' })
      .where(eq(schema.musicAlbums.id, parklifeId))
      .run()
    const asked: string[] = []
    t.metadata.music.coverImage = async (url: string) => {
      asked.push(url)
      return new Response(JPEG, { headers: { 'content-type': 'image/jpeg' } })
    }
    const image = await t.music.images.get('album', parklifeId)
    expect(image.contentType).toBe('image/jpeg')
    expect(existsSync(image.path)).toBe(true)
    await t.music.images.get('album', parklifeId)
    expect(asked).toHaveLength(1)
    const pulp = albums.find((a) => a.title === 'Different Class')?.id as string
    await expect(t.music.images.get('album', pulp)).rejects.toMatchObject({ code: 'not-found' })
    await expect(t.music.images.get('album', 'al_nope')).rejects.toMatchObject({
      code: 'not-found',
    })
  })

  test('an artist’s picture from fanart.tv, and the admin shows it', async () => {
    const t = await setup()
    t.put('Blur/Parklife (1994)/01.flac', parklife(1, 'Girls & Boys'))
    await t.music.libraryScan.scan()
    const [artist] = t.music.admin.artists()
    expect(artist?.photo).toBeNull()
    t.db
      .update(schema.musicArtists)
      .set({ photoUrl: 'https://assets.fanart.tv/fanart/music/blur.jpg' })
      .where(eq(schema.musicArtists.id, artist?.id as string))
      .run()
    t.metadata.music.artistImage = async () => new Response(PNG)
    expect(t.music.admin.artists()[0]?.photo).toBe(`/api/v1/images/music/artist/${artist?.id}`)
    const image = await t.music.images.get('artist', artist?.id as string)
    expect(image.contentType).toBe('image/png')
  })

  test('something that isn’t a picture isn’t served', async () => {
    const t = await setup()
    t.put('Blur/Parklife (1994)/01.flac', parklife(1, 'Girls & Boys'))
    await t.music.libraryScan.scan()
    const [album] = t.music.admin.albums()
    t.db
      .update(schema.musicAlbums)
      .set({ coverUrl: 'https://coverartarchive.org/release/x/front-500' })
      .where(eq(schema.musicAlbums.id, album?.id as string))
      .run()
    t.metadata.music.coverImage = async () => new Response('<html>not a cover</html>')
    await expect(t.music.images.get('album', album?.id as string)).rejects.toMatchObject({
      code: 'not-found',
    })
  })
})
