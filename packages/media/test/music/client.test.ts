// SPDX-License-Identifier: AGPL-3.0-only
// The apps' music (HT-101): the library, an album and an artist, the queue and Home's Recently
// played, Search, and each profile's own playlists.
import { afterEach, describe, expect, test } from 'bun:test'
import { cleanup, parklife, person, setup } from './fixture.ts'

afterEach(cleanup)

async function library() {
  const t = await setup()
  t.put('Blur/Parklife (1994)/01.flac', parklife(1, 'Girls & Boys'))
  t.put('Blur/Parklife (1994)/02.flac', parklife(2, 'Tracy Jacks'))
  t.put('Blur/Parklife (1994)/folder.jpg', 'jpg')
  t.put('Blur/The Great Escape (1995)/01.flac', {
    ...parklife(1, 'Stereotypes'),
    album: 'The Great Escape',
    date: '1995-09-11',
    year: 1995,
  })
  // no year anywhere: real rips have these
  t.put('Pulp/Undated/01.flac', {
    title: 'Common People',
    artist: 'Pulp',
    album: 'Undated',
    track: 1,
  })
  await t.music.libraryScan.scan()
  const albums = t.music.admin.albums()
  const id = (title: string) => albums.find((a) => a.title === title)?.id as string
  return { t, id }
}

describe('the apps’ music', () => {
  test('the library and an album, a year left null where nothing gives one', async () => {
    const { t, id } = await library()
    const { artists, albums } = t.music.client.library()
    expect(artists.map((a) => a.name).sort()).toEqual(['Blur', 'Pulp'])
    expect(albums.find((a) => a.title === 'Undated')?.year).toBeNull()
    const parklifeAlbum = t.music.client.album(id('Parklife'))
    expect(parklifeAlbum.album).toMatchObject({ title: 'Parklife', year: 1994 })
    expect(parklifeAlbum.album.cover).toBe(`/api/v1/images/music/album/${id('Parklife')}`)
    expect(parklifeAlbum.songs.map((s) => s.title)).toEqual(['Girls & Boys', 'Tracy Jacks'])
    expect(parklifeAlbum.released).toBe('1994-04-25')
    expect(parklifeAlbum.more.map((a) => a.title)).toEqual(['The Great Escape'])
    const undated = t.music.client.album(id('Undated'))
    expect(undated.released).toBeNull()
    expect(() => t.music.client.album('al_nope')).toThrow(
      expect.objectContaining({ code: 'not-found' }),
    )
  })

  test('the queue plays an album in order and puts it on Recently played', async () => {
    const { t, id } = await library()
    const who = person(t)
    expect(t.music.client.recent(who.profileId)).toEqual([])
    const queue = t.music.client.queue(who, { album: id('Parklife') }, false)
    expect(queue.map((s) => s.title)).toEqual(['Girls & Boys', 'Tracy Jacks'])
    expect(queue[0]?.loudness).toEqual([])
    const artist = t.music.client.queue(who, { artist: queue[0]?.album.artist.id as string }, false)
    // an artist's albums newest first
    expect(artist.map((s) => s.title)).toEqual(['Stereotypes', 'Girls & Boys', 'Tracy Jacks'])
    const recent = t.music.client.recent(who.profileId)
    expect(recent.map((r) => r.kind)).toEqual(['artist', 'album'])
    // songs by id aren't recorded as played
    t.music.client.tracks([queue[1]?.id as string, 'tr_nope'])
    expect(t.music.client.recent(who.profileId)).toHaveLength(2)
  })

  test('Search finds artists, albums and songs', async () => {
    const { t } = await library()
    const found = t.music.client.search('parklife')
    expect(found.albums.map((a) => a.title)).toEqual(['Parklife'])
    expect(t.music.client.search('common').songs.map((s) => s.title)).toEqual(['Common People'])
    expect(t.music.client.search('pulp').artists.map((a) => a.name)).toEqual(['Pulp'])
    expect(t.music.client.search('  ')).toEqual({ artists: [], albums: [], songs: [] })
  })
})

describe('playlists', () => {
  test('made, added to, reordered, renamed and deleted, each profile’s own', async () => {
    const { t, id } = await library()
    const me = person(t, 'u1')
    const other = person(t, 'u2')
    const songs = t.music.client.album(id('Parklife')).songs.map((s) => s.id)
    const made = t.music.playlists.create(me, 'Mornings', [songs[0] as string])
    expect(made).toMatchObject({ name: 'Mornings', songs: 1 })
    t.music.playlists.add(me, made.id, [songs[1] as string, songs[0] as string])
    let detail = t.music.playlists.get(me, made.id)
    expect(detail.songs.map((s) => s.title)).toEqual([
      'Girls & Boys',
      'Tracy Jacks',
      'Girls & Boys',
    ])
    const entries = detail.songs.map((s) => s.entry)
    t.music.playlists.reorder(me, made.id, [entries[2], entries[1]] as string[])
    detail = t.music.playlists.get(me, made.id)
    expect(detail.songs.map((s) => s.entry)).toEqual([entries[2], entries[1]] as string[])
    t.music.playlists.remove(me, made.id, entries[1] as string)
    t.music.playlists.rename(me, made.id, 'Evenings')
    expect(t.music.playlists.list(me).map((p) => [p.name, p.songs])).toEqual([['Evenings', 1]])
    // someone else's is a 404, and not listed
    expect(t.music.playlists.list(other)).toEqual([])
    expect(() => t.music.playlists.get(other, made.id)).toThrow(
      expect.objectContaining({ code: 'not-found' }),
    )
    // the queue plays it, in its order
    expect(t.music.client.queue(me, { playlist: made.id }, false).map((s) => s.title)).toEqual([
      'Girls & Boys',
    ])
    expect(t.seen.some((e) => e.topic === 'playlists.updated' && e.to?.includes('u1'))).toBe(true)
    t.music.playlists.delete(me, made.id)
    expect(t.music.playlists.list(me)).toEqual([])
  })
})
