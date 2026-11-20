// SPDX-License-Identifier: AGPL-3.0-only
// The admin's music changes (HT-101): Unmatched's Match by hand, which the scan then reads as the
// album named, nothing on disk changing; Refresh; and track naming, kept with its checks.
import { afterEach, describe, expect, test } from 'bun:test'
import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { cleanup, parklife, setup } from './fixture.ts'

afterEach(cleanup)

describe('Match', () => {
  test('a set-aside folder becomes the album named, and stays it on later scans', async () => {
    const t = await setup()
    t.put('Loose/Singles/01.flac', { title: 'Song A', artist: 'Someone' })
    t.put('Loose/Singles/02.flac', { title: 'Song B', artist: 'Someone' })
    await t.music.libraryScan.scan()
    const [u] = t.music.admin.unmatched()
    expect(u?.reason).toBe('no-album')
    const files = readdirSync(join(t.root, 'Loose/Singles')).sort()
    const { albumId } = await t.music.manage.match(u?.id as string, {
      artist: 'Someone',
      album: 'Singles Club',
      year: 2003,
    })
    expect(albumId).not.toBeNull()
    expect(t.music.admin.unmatched()).toHaveLength(0)
    const album = t.music.admin.album(albumId as string)
    expect(album).toMatchObject({ title: 'Singles Club', year: 2003 })
    expect(album.artist.name).toBe('Someone')
    expect(album.discList.flatMap((d) => d.tracks.map((x) => x.title))).toEqual([
      'Song A',
      'Song B',
    ])
    // the files are where they were, as they were
    expect(readdirSync(join(t.root, 'Loose/Singles')).sort()).toEqual(files)
    const again = await t.music.libraryScan.scan({ folder: join(t.root, 'Loose/Singles') })
    expect(again).toMatchObject({ unmatched: 0 })
    expect(t.music.admin.albums().map((a) => a.title)).toEqual(['Singles Club'])
  })

  test('a folder that isn’t waiting is a 404', async () => {
    const t = await setup()
    await expect(
      t.music.manage.match('mu_nope', { artist: 'A', album: 'B', year: null }),
    ).rejects.toMatchObject({ code: 'not-found' })
  })
})

describe('Refresh', () => {
  test('an album reads its tags again; one not here is a 404', async () => {
    const t = await setup()
    const file = t.put('Blur/Parklife (1994)/01.flac', parklife(1, 'Girls & Boys'))
    await t.music.libraryScan.scan()
    const [album] = t.music.admin.albums()
    const { writeFileSync } = await import('node:fs')
    writeFileSync(file, JSON.stringify(parklife(1, 'Girls and Boys')))
    await t.music.manage.refreshAlbum(album?.id as string)
    expect(t.rows().tracks.map((x) => x.title)).toEqual(['Girls and Boys'])
    await expect(t.music.manage.refreshAlbum('al_nope')).rejects.toMatchObject({
      code: 'not-found',
    })
    await expect(t.music.manage.refreshArtist('ar_nope')).rejects.toMatchObject({
      code: 'not-found',
    })
  })

  test('the look-up after it is a job naming the album or the artist, for their pages’ marks', async () => {
    const t = await setup()
    t.put('Blur/Parklife (1994)/01.flac', parklife(1, 'Girls & Boys'))
    await t.music.libraryScan.scan()
    const [album] = t.music.admin.albums()
    const albumId = album?.id as string
    const artistId = album?.artist.id as string
    await t.music.manage.refreshAlbum(albumId)
    await t.music.manage.refreshArtist(artistId)
    const albumWork = t.jobs.workOf({ kind: 'album', id: albumId }).active
    expect(albumWork.map((j) => j.type)).toEqual(['music.metadata'])
    expect(t.jobs.workOf({ kind: 'artist', id: artistId }).active).toHaveLength(1)
    // asked again while one waits, it isn't queued twice
    await t.music.manage.refreshAlbum(albumId)
    expect(t.jobs.workOf({ kind: 'album', id: albumId }).active).toHaveLength(1)
  })
})

describe('track naming', () => {
  test('Lidarr’s defaults, renaming off, until saved; then what was saved', async () => {
    const { music } = await setup()
    const first = music.manage.naming()
    expect(first.rename).toBe(false)
    expect(first.standardFormat).toContain('{track:00}')
    const saved = music.manage.saveNaming({
      ...first,
      standardFormat: '{Album Title}/{track:00} {Track Title}',
    })
    expect(saved.standardFormat).toBe('{Album Title}/{track:00} {Track Title}')
    expect(music.manage.naming()).toEqual(saved)
  })

  test('a file format without the track’s number, or an empty one, is refused by field', async () => {
    const t = await setup()
    const base = t.music.manage.naming()
    expect(() =>
      t.music.manage.saveNaming({ ...base, standardFormat: '{Album Title}/{Track Title}' }),
    ).toThrow(expect.objectContaining({ code: 'invalid' }))
    let refused: unknown = null
    try {
      t.music.manage.saveNaming({ ...base, multiDiscFormat: ' ' })
    } catch (e) {
      refused = e
    }
    expect(refused).toMatchObject({ code: 'invalid', details: { reason: 'multiDiscFormat' } })
    expect(t.music.manage.naming()).toEqual(base)
  })
})
