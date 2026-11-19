// SPDX-License-Identifier: AGPL-3.0-only
// Music's import and scan (Phase 5 D, ADR 0065): album folders read where they are and grouped by
// their tags, discs in `CD1`/`CD2` folders, covers, NFOs and lyrics beside the tracks, what can't
// be read as an album set aside with its reason, a repeat scan that changes nothing, and
// MusicBrainz asked only where the tags carry an id (replayed). Tags come from a fake reader
// (fixture.ts); tags.test.ts reads real files with ffprobe.
import { afterEach, describe, expect, test } from 'bun:test'
import { chmodSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { BLUR, cleanup, PARKLIFE, PARKLIFE_RELEASE, setup } from './fixture.ts'

afterEach(cleanup)

const parklife = (n: number, title: string, extra: object = {}) => ({
  title,
  artist: 'Blur',
  albumArtist: 'Blur',
  album: 'Parklife',
  track: n,
  date: '1994-04-25',
  year: 1994,
  genres: ['Britpop'],
  ...extra,
})

describe('importing what’s there', () => {
  test('an artist, an album and its tracks from the tags, the files left where they are', async () => {
    const t = await setup()
    t.put('Blur/Parklife (1994)/01 - Girls & Boys.flac', parklife(1, 'Girls & Boys'))
    t.put('Blur/Parklife (1994)/02 - Tracy Jacks.flac', parklife(2, 'Tracy Jacks'))
    t.put('Blur/Parklife (1994)/folder.jpg', 'jpg')
    t.put('Blur/Parklife (1994)/album.nfo', '<album></album>')
    t.put('Blur/Parklife (1994)/01 - Girls & Boys.lrc', '[00:01.00]Streets like a jungle')
    t.put('Blur/artist.jpg', 'jpg')
    t.put('Blur/Videos/Parklife.mp4', 'video')
    const r = await t.music.libraryScan.scan()
    expect(r).toMatchObject({ added: 1, tracks: 2, unmatched: 0, removed: 0 })
    const { artists, albums, tracks } = t.rows()
    expect(artists).toHaveLength(1)
    expect(artists[0]).toMatchObject({
      name: 'Blur',
      sortName: 'blur',
      path: join(t.root, 'Blur'),
      photoFile: join(t.root, 'Blur/artist.jpg'),
      videos: 1,
      source: 'tags',
    })
    expect(albums[0]).toMatchObject({
      title: 'Parklife',
      year: 1994,
      released: '1994-04-25',
      genres: ['Britpop'],
      coverFile: join(t.root, 'Blur/Parklife (1994)/folder.jpg'),
      nfo: true,
      source: 'tags',
    })
    expect(tracks.map((x) => [x.disc, x.number, x.title, x.format, x.bitDepth])).toEqual([
      [1, 1, 'Girls & Boys', 'FLAC', 16],
      [1, 2, 'Tracy Jacks', 'FLAC', 16],
    ])
    expect(tracks[0]?.lyricsFile).toMatch(/Girls & Boys\.lrc$/)
    expect(tracks[1]?.lyricsFile).toBeNull()
    // said, for the apps and the admin to follow
    expect(t.seen.some((e) => e.topic === 'music.updated')).toBe(true)
  })

  test('discs from CD1 and CD2 folders, and from the tags', async () => {
    const t = await setup()
    const wall = (n: number, disc: number | null, title: string) => ({
      title,
      artist: 'Pink Floyd',
      albumArtist: 'Pink Floyd',
      album: 'The Wall',
      track: n,
      disc,
      year: 1979,
    })
    t.put('Pink Floyd/The Wall (1979)/CD1/01 In the Flesh.flac', wall(1, null, 'In the Flesh?'))
    t.put('Pink Floyd/The Wall (1979)/CD1/02 The Thin Ice.flac', wall(2, null, 'The Thin Ice'))
    t.put('Pink Floyd/The Wall (1979)/CD2/01 Hey You.flac', wall(1, null, 'Hey You'))
    t.put(
      'Pink Floyd/The Wall (1979)/CD 2/02 Is There Anybody Out There.flac',
      wall(2, 2, 'Is There Anybody Out There?'),
    )
    t.put('Pink Floyd/The Wall (1979)/folder.jpg', 'jpg')
    await t.music.libraryScan.scan()
    const { albums, tracks } = t.rows()
    expect(albums).toHaveLength(1)
    expect(albums[0]?.path).toBe(join(t.root, 'Pink Floyd/The Wall (1979)'))
    expect(tracks.map((x) => [x.disc, x.number, x.discFolder])).toEqual([
      [1, 1, 'CD1'],
      [1, 2, 'CD1'],
      [2, 1, 'CD2'],
      [2, 2, 'CD 2'],
    ])
    const detail = t.music.admin.album(albums[0]?.id as string)
    expect(detail).toMatchObject({ discs: 2, tracks: 4, formats: ['FLAC'] })
    expect(detail.discList.map((d) => [d.number, d.folder, d.tracks.length])).toEqual([
      [1, 'CD1', 2],
      [2, 'CD2', 2],
    ])
  })

  test('tags without MusicBrainz ids, and names like Blur_Parklife_01_Girls & Boys', async () => {
    const t = await setup()
    // no track or title tags: the file's name gives both
    t.put('Blur/Parklife/Blur_Parklife_01_Girls & Boys.mp3', {
      artist: 'Blur',
      album: 'Parklife',
      format: 'mp3',
    })
    t.put('Blur/Parklife/Blur_Parklife_02_Tracy Jacks.mp3', {
      artist: 'Blur',
      album: 'Parklife',
      format: 'mp3',
    })
    await t.music.libraryScan.scan()
    const { albums, tracks, artists } = t.rows()
    expect(artists[0]?.musicBrainzId).toBeNull()
    expect(albums[0]).toMatchObject({ title: 'Parklife', releaseId: null, source: 'tags' })
    expect(tracks.map((x) => [x.number, x.title, x.format, x.bitDepth])).toEqual([
      [1, 'Girls & Boys', 'MP3', null],
      [2, 'Tracy Jacks', 'MP3', null],
    ])
    // nothing with an id: MusicBrainz isn't asked
    await t.drain()
    expect(t.fetch.requests).toHaveLength(0)
  })

  test('an album artist, else the one track artist, else Various Artists; guests kept per track', async () => {
    const t = await setup()
    t.put('Comp/Now 30/01.flac', {
      title: 'A',
      artist: 'One',
      album: 'Now 30',
      track: 1,
      compilation: true,
    })
    t.put('Comp/Now 30/02.flac', {
      title: 'B',
      artist: 'Two',
      album: 'Now 30',
      track: 2,
      compilation: true,
    })
    t.put('Gorillaz/Demon Days/01.flac', {
      title: 'Feel Good Inc.',
      artist: 'Gorillaz feat. De La Soul',
      albumArtist: 'Gorillaz',
      album: 'Demon Days',
      track: 1,
    })
    t.put('Gorillaz/Demon Days/02.flac', {
      title: 'DARE',
      artist: 'Gorillaz',
      album: 'Demon Days',
      track: 2,
    })
    await t.music.libraryScan.scan()
    const { artists, albums, tracks } = t.rows()
    expect(artists.map((a) => a.name).sort()).toEqual(['Gorillaz', 'Various Artists'])
    expect(albums.find((a) => a.title === 'Now 30')?.kind).toBe('compilation')
    expect(tracks.find((x) => x.title === 'Feel Good Inc.')?.artist).toBe(
      'Gorillaz feat. De La Soul',
    )
    expect(tracks.find((x) => x.title === 'DARE')?.artist).toBeNull()
    expect(tracks.find((x) => x.title === 'A')?.artist).toBe('One')
  })

  test('“The Beatles” and “Beatles, The” are one artist; a MusicBrainz id keeps namesakes apart', async () => {
    const t = await setup()
    const one = 'b10bbbfc-cf9e-42e0-be17-e2c3e1d2600d'
    const other = '11111111-1111-4111-8111-111111111111'
    t.put('The Beatles/Abbey Road/01.flac', {
      album: 'Abbey Road',
      albumArtist: 'The Beatles',
      musicBrainz: { albumArtistId: one },
    })
    t.put('Beatles, The/Help/01.flac', { album: 'Help!', albumArtist: 'Beatles, The' })
    t.put('Nirvana/Bleach/01.flac', {
      album: 'Bleach',
      albumArtist: 'Nirvana',
      musicBrainz: { albumArtistId: '5b11f4ce-a62d-471e-81fc-a69a8278c7da' },
    })
    t.put('Nirvana (UK)/Local Anaesthetic/01.flac', {
      album: 'Local Anaesthetic',
      albumArtist: 'Nirvana',
      musicBrainz: { albumArtistId: other },
    })
    await t.music.libraryScan.scan()
    const names = t.rows().artists.map((a) => [a.name, a.musicBrainzId])
    // one artist, under the name first seen, with the id one album carried
    const beatles = names.filter(([n]) => (n as string).includes('Beatles'))
    expect(beatles).toHaveLength(1)
    expect(beatles[0]?.[1]).toBe(one)
    expect(names.filter(([n]) => n === 'Nirvana')).toHaveLength(2)
  })
})

describe('what can’t be read as an album', () => {
  test('each reason, the files left in place, and a guess from the folder’s names', async () => {
    const t = await setup()
    t.put('Mixed/Bag (2001)/01.flac', { title: 'a', album: 'One' })
    t.put('Mixed/Bag (2001)/02.flac', { title: 'b', album: 'Two' })
    t.put('Loose/Singles/01.flac', { title: 'a', artist: 'Someone' })
    t.put('Bare/Rips/track01.flac', {})
    t.put('Broken/Files/01.flac', 'broken')
    const r = await t.music.libraryScan.scan()
    expect(r).toMatchObject({ added: 0, unmatched: 4 })
    expect(t.rows().unmatched.map((u) => [u.path.slice(t.root.length + 1), u.reason])).toEqual([
      ['Bare/Rips', 'no-tags'],
      ['Broken/Files', 'unreadable'],
      ['Loose/Singles', 'no-album'],
      ['Mixed/Bag (2001)', 'many-albums'],
    ])
    const bag = t.music.admin.unmatched().find((u) => u.reason === 'many-albums')
    expect(bag).toMatchObject({ files: 2, guess: { artist: 'Mixed', album: 'Bag', year: 2001 } })
    expect(t.rows().albums).toHaveLength(0)
    expect(t.music.admin.folders()[0]).toMatchObject({ albums: 0, unmatched: 4 })
  })

  test('a file that can’t be read leaves the rest of the album in, and is tried again', async () => {
    const t = await setup()
    t.put('Blur/Parklife/01.flac', parklife(1, 'Girls & Boys'))
    const bad = t.put('Blur/Parklife/02.flac', 'broken')
    const r = await t.music.libraryScan.scan()
    expect(r).toMatchObject({ added: 1, tracks: 1, unreadableFiles: 1 })
    writeFileSync(bad, JSON.stringify(parklife(2, 'Tracy Jacks')))
    await t.music.libraryScan.scan()
    expect(t.rows().tracks.map((x) => x.title)).toEqual(['Girls & Boys', 'Tracy Jacks'])
  })

  test('Ignore: later scans pass the folder by', async () => {
    const t = await setup()
    t.put('Loose/Singles/01.flac', { title: 'a', artist: 'Someone' })
    await t.music.libraryScan.scan()
    const [u] = t.music.admin.unmatched()
    t.music.admin.ignore(u?.id as string)
    expect(t.music.admin.unmatched()).toHaveLength(0)
    const before = t.reads.length
    await t.music.libraryScan.scan()
    expect(t.reads.length).toBe(before)
    expect(() => t.music.admin.ignore(u?.id as string)).toThrow('isn’t waiting')
  })

  test('a folder fixed on disk becomes an album and leaves Unmatched', async () => {
    const t = await setup()
    t.put('Loose/Singles/01.flac', { title: 'a', artist: 'Someone' })
    await t.music.libraryScan.scan()
    expect(t.rows().unmatched).toHaveLength(1)
    t.put('Loose/Singles/01.flac', { title: 'a', artist: 'Someone', album: 'Singles' })
    await t.music.libraryScan.scan()
    expect(t.rows().unmatched).toHaveLength(0)
    expect(t.rows().albums.map((a) => a.title)).toEqual(['Singles'])
  })
})

describe('the scan, again and again', () => {
  test('a repeat scan reads nothing and changes nothing', async () => {
    const t = await setup()
    t.put('Blur/Parklife/01.flac', parklife(1, 'Girls & Boys'))
    t.put('Blur/Parklife/02.flac', parklife(2, 'Tracy Jacks'))
    t.put('Loose/Singles/01.flac', { title: 'a', artist: 'Someone' })
    await t.music.libraryScan.scan()
    const first = t.rows()
    const reads = t.reads.length
    const events = t.seen.length
    const again = await t.music.libraryScan.scan()
    expect(again).toMatchObject({ added: 0, changed: 0, removed: 0, unchanged: 1, unmatched: 1 })
    expect(t.reads.length).toBe(reads)
    expect(t.rows()).toEqual(first)
    expect(t.seen.length).toBe(events)
  })

  test('a changed file is read again; a new one added; a folder gone takes its album and artist', async () => {
    const t = await setup()
    t.put('Blur/Parklife/01.flac', parklife(1, 'Girls & Boys'))
    t.put('Oasis/Definitely Maybe/01.flac', {
      album: 'Definitely Maybe',
      albumArtist: 'Oasis',
      title: 'Rock n Roll Star',
    })
    await t.music.libraryScan.scan()
    const id = t.rows().tracks.find((x) => x.title === 'Girls & Boys')?.id
    t.clock.advance(1000)
    t.put(
      'Blur/Parklife/01.flac',
      parklife(1, 'Girls & Boys (remastered)', { genres: ['Britpop', 'Rock'] }),
    )
    t.put('Blur/Parklife/02.flac', parklife(2, 'Tracy Jacks'))
    rmSync(join(t.root, 'Oasis'), { recursive: true })
    const r = await t.music.libraryScan.scan()
    expect(r).toMatchObject({ changed: 1, removed: 1 })
    const { artists, tracks } = t.rows()
    expect(artists.map((a) => a.name)).toEqual(['Blur'])
    // the same track keeps its id
    expect(tracks.map((x) => [x.id === id, x.title])).toEqual([
      [true, 'Girls & Boys (remastered)'],
      [false, 'Tracy Jacks'],
    ])
  })

  test('one folder’s scan touches only that folder; a disc folder stands for its album', async () => {
    const t = await setup()
    t.put('Blur/Parklife/CD1/01.flac', parklife(1, 'Girls & Boys'))
    t.put('Oasis/Definitely Maybe/01.flac', { album: 'Definitely Maybe', albumArtist: 'Oasis' })
    await t.music.libraryScan.scan()
    t.put('Blur/Parklife/CD1/02.flac', parklife(2, 'Tracy Jacks'))
    rmSync(join(t.root, 'Oasis'), { recursive: true })
    await t.music.libraryScan.scan({ folder: join(t.root, 'Blur/Parklife/CD1') })
    // Oasis is still there until its own folder (or the whole root) is scanned
    expect(t.rows().albums.map((a) => a.title)).toEqual(['Parklife', 'Definitely Maybe'])
    expect(t.rows().tracks.filter((x) => x.discFolder === 'CD1')).toHaveLength(2)
  })

  test('an unreadable root folder is left alone, never read as everything deleted', async () => {
    const t = await setup()
    t.put('Blur/Parklife/01.flac', parklife(1, 'Girls & Boys'))
    await t.music.libraryScan.scan()
    chmodSync(t.root, 0o000)
    const r = await t.music.libraryScan.scan()
    chmodSync(t.root, 0o755)
    expect(r.unreadable).toEqual([t.root])
    expect(t.rows().albums).toHaveLength(1)
  })

  test('the scan job is queued once per folder and scheduled every 12 hours', async () => {
    const t = await setup()
    t.put('Blur/Parklife/01.flac', parklife(1, 'Girls & Boys'))
    t.music.libraryScan.queue()
    t.music.libraryScan.queue()
    expect(t.jobs.list({ status: ['queued'] }).filter((j) => j.type === 'music.scan')).toHaveLength(
      1,
    )
    await t.drain()
    expect(t.rows().albums).toHaveLength(1)
    // scheduled: the first runs 15 minutes after boot, then every 12 hours
    t.music.jobs.schedule(t.clock.now())
    t.clock.advance(15 * 60_000)
    await t.jobs.tick()
    expect(t.jobs.list().filter((j) => j.type === 'music.scan')).toHaveLength(2)
  })
})

describe('MusicBrainz, where the tags carry an id', () => {
  test('the release’s label and date, the group’s kind and genres, and the Cover Art Archive’s cover', async () => {
    const t = await setup()
    const ids = { musicBrainz: { releaseId: PARKLIFE_RELEASE, albumArtistId: BLUR } }
    t.put(
      'Blur/Parklife (1994)/01.flac',
      parklife(1, 'Girls & Boys', { ...ids, year: 2012, date: '2012' }),
    )
    t.put('Blur/Parklife (1994)/02.flac', parklife(2, 'Tracy Jacks', ids))
    await t.music.libraryScan.scan()
    // the scan queued the look-up; it runs at MusicBrainz's pace
    await t.drain()
    const [album] = t.rows().albums
    expect(album).toMatchObject({
      title: 'Parklife',
      source: 'musicbrainz',
      releaseGroupId: PARKLIFE,
      released: '1994-04-25',
      year: 1994,
      kind: 'album',
      label: 'Parlophone',
      genres: expect.arrayContaining(['Britpop']),
    })
    expect(album?.coverUrl).toMatch(/^https:\/\/coverartarchive\.org\//)
    expect(t.rows().artists[0]).toMatchObject({ source: 'musicbrainz', musicBrainzId: BLUR })
    expect(t.music.admin.albums()[0]).toMatchObject({
      musicBrainzId: PARKLIFE,
      source: 'musicbrainz',
    })

    // again: the cache answers, nothing is asked and nothing changes
    const asked = t.fetch.requests.length
    const before = t.rows()
    expect(await t.music.libraryMetadata.refresh()).toMatchObject({ albums: 0, artists: 0 })
    expect(t.fetch.requests.length).toBe(asked)
    // a later scan with unchanged files keeps MusicBrainz's details
    await t.music.libraryScan.scan()
    expect(t.rows()).toEqual(before)
  })

  test('a cover in the folder means the Cover Art Archive isn’t asked', async () => {
    const t = await setup()
    t.put(
      'Blur/Parklife/01.flac',
      parklife(1, 'Girls & Boys', { musicBrainz: { releaseGroupId: PARKLIFE } }),
    )
    t.put('Blur/Parklife/cover.jpg', 'jpg')
    await t.music.libraryScan.scan()
    await t.drain()
    expect(t.rows().albums[0]).toMatchObject({ source: 'musicbrainz', coverUrl: null })
    expect(t.fetch.requests.some((r) => r.includes('coverartarchive'))).toBe(false)
  })

  test('album.nfo’s ids serve when the tags have none', async () => {
    const t = await setup()
    t.put('Blur/Parklife/01.flac', parklife(1, 'Girls & Boys'))
    t.put(
      'Blur/Parklife/album.nfo',
      `<?xml version="1.0"?><album><title>Parklife</title><musicbrainzalbumid>${PARKLIFE_RELEASE}</musicbrainzalbumid><musicbrainzreleasegroupid>${PARKLIFE}</musicbrainzreleasegroupid></album>`,
    )
    t.put('Blur/artist.nfo', `<artist><musicbrainzartistid>${BLUR}</musicbrainzartistid></artist>`)
    await t.music.libraryScan.scan()
    expect(t.rows().albums[0]).toMatchObject({
      releaseId: PARKLIFE_RELEASE,
      releaseGroupId: PARKLIFE,
    })
    expect(t.rows().artists[0]?.musicBrainzId).toBe(BLUR)
  })
})
