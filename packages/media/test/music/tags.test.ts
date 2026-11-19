// SPDX-License-Identifier: AGPL-3.0-only
// A track's tags and audio read with ffprobe (Phase 5 D, ADR 0065): FLAC's Vorbis comments, MP3's
// ID3v2 with MusicBrainz's TXXX frames and an embedded cover, and M4A's atoms, each made here with
// ffmpeg and tagged as Picard tags them (https://picard-docs.musicbrainz.org/en/appendices/tag_mapping.html).
// Skipped without ffmpeg, and said so. The pure rules (ffprobe's JSON, grouping, names) run always.
import { afterAll, describe, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { discOfFolder, guessFromFolder } from '../../src/music/folders.ts'
import { artistKey, groupAlbum, numberFromName, titleFromName } from '../../src/music/group.ts'
import { createTagReader, parseMusicProbe } from '../../src/music/tags.ts'
import { hasFfmpeg, runTool } from '../clips.ts'
import { BLUR, cleanup, PARKLIFE, PARKLIFE_RELEASE, setup } from './fixture.ts'

const dir = mkdtempSync(join(tmpdir(), 'highsea-music-tags-'))
afterAll(() => {
  rmSync(dir, { recursive: true, force: true })
  cleanup()
})

const RECORDING = 'e3d7e1b0-6c9b-4c4e-9f2a-0c1d2e3f4a5b'
const common = {
  title: 'Girls & Boys',
  artist: 'Blur',
  album: 'Parklife',
  date: '1994-04-25',
  genre: 'Britpop',
}

/** One second of a tone, tagged with `-metadata`, in `path`'s format. */
async function make(path: string, tags: Record<string, string>, extra: string[] = []) {
  const meta = Object.entries(tags).flatMap(([k, v]) => ['-metadata', `${k}=${v}`])
  await runTool('ffmpeg', [
    '-nostdin',
    '-v',
    'error',
    '-f',
    'lavfi',
    '-i',
    'sine=frequency=440:duration=1:sample_rate=44100',
    ...extra,
    ...meta,
    '-y',
    path,
  ])
  return path
}

describe.skipIf(!hasFfmpeg)('real files, read with ffprobe', () => {
  const read = createTagReader()

  test('FLAC: Vorbis comments, MusicBrainz’s ids, disc and track of a total', async () => {
    const path = await make(join(dir, 'a.flac'), {
      ...common,
      ALBUMARTIST: 'Blur',
      TRACKNUMBER: '1/16',
      DISCNUMBER: '1/1',
      MUSICBRAINZ_ALBUMID: PARKLIFE_RELEASE,
      MUSICBRAINZ_RELEASEGROUPID: PARKLIFE,
      MUSICBRAINZ_ALBUMARTISTID: BLUR,
      MUSICBRAINZ_TRACKID: RECORDING,
      RELEASETYPE: 'album',
    })
    const { tags, audio } = await read(path)
    expect(tags).toMatchObject({
      title: 'Girls & Boys',
      artist: 'Blur',
      albumArtist: 'Blur',
      album: 'Parklife',
      track: 1,
      disc: 1,
      discTotal: 1,
      year: 1994,
      genres: ['Britpop'],
      releaseTypes: ['album'],
      musicBrainz: {
        releaseId: PARKLIFE_RELEASE,
        releaseGroupId: PARKLIFE,
        albumArtistId: BLUR,
        recordingId: RECORDING,
      },
    })
    expect(audio).toMatchObject({ codec: 'flac', format: 'FLAC', sampleRate: 44100, bitDepth: 16 })
    expect(audio.duration).toBeCloseTo(1, 1)
    expect(audio.bitrate).toBeGreaterThan(0)
    expect(audio.embeddedCover).toBe(false)
  })

  test('MP3: ID3v2 with TXXX frames and a cover in the file; no bit depth', async () => {
    const cover = join(dir, 'cover.jpg')
    await runTool('ffmpeg', [
      '-nostdin',
      '-v',
      'error',
      '-f',
      'lavfi',
      '-i',
      'color=c=red:s=64x64',
      '-frames:v',
      '1',
      '-y',
      cover,
    ])
    const path = await make(
      join(dir, 'b.mp3'),
      {
        ...common,
        album_artist: 'Blur',
        track: '2/16',
        disc: '1/2',
        'MusicBrainz Album Id': PARKLIFE_RELEASE,
        'MusicBrainz Release Group Id': PARKLIFE,
        'MusicBrainz Album Artist Id': BLUR,
      },
      [
        '-i',
        cover,
        '-map',
        '0:a',
        '-map',
        '1:v',
        '-c:v',
        'mjpeg',
        '-disposition:v',
        'attached_pic',
        '-id3v2_version',
        '3',
        '-b:a',
        '128k',
      ],
    )
    const { tags, audio } = await read(path)
    expect(tags).toMatchObject({
      albumArtist: 'Blur',
      track: 2,
      disc: 1,
      discTotal: 2,
      musicBrainz: { releaseId: PARKLIFE_RELEASE, releaseGroupId: PARKLIFE, albumArtistId: BLUR },
    })
    expect(audio).toMatchObject({
      codec: 'mp3',
      format: 'MP3',
      bitDepth: null,
      embeddedCover: true,
    })
    expect(audio.bitrate).toBeGreaterThanOrEqual(100)
  })

  test('M4A: AAC with its atoms', async () => {
    const path = await make(
      join(dir, 'c.m4a'),
      { ...common, album_artist: 'Blur', track: '3/16', disc: '1/1' },
      ['-c:a', 'aac', '-b:a', '128k'],
    )
    const { tags, audio } = await read(path)
    expect(tags).toMatchObject({ title: 'Girls & Boys', albumArtist: 'Blur', track: 3, year: 1994 })
    expect(audio).toMatchObject({ codec: 'aac', format: 'AAC', bitDepth: null })
  })

  test('a file that isn’t audio is refused plainly', async () => {
    const { writeFileSync } = await import('node:fs')
    const path = join(dir, 'not.flac')
    writeFileSync(path, 'not audio')
    await expect(read(path)).rejects.toThrow('couldn’t read the file')
    await expect(read('relative.flac')).rejects.toThrow('full path')
  })

  test('the whole scan on real files: an album with discs, mixed formats', async () => {
    const t = await setup({ real: true })
    const album = join(t.root, 'Pink Floyd', 'The Wall (1979)')
    mkdirSync(join(album, 'CD1'), { recursive: true })
    mkdirSync(join(album, 'CD2'), { recursive: true })
    const wall = {
      artist: 'Pink Floyd',
      album_artist: 'Pink Floyd',
      album: 'The Wall',
      date: '1979',
    }
    await make(join(album, 'CD1', '01 In the Flesh.flac'), {
      ...wall,
      title: 'In the Flesh?',
      track: '1',
    })
    await make(join(album, 'CD1', '02 The Thin Ice.flac'), {
      ...wall,
      title: 'The Thin Ice',
      track: '2',
    })
    await make(join(album, 'CD2', '01 Hey You.mp3'), { ...wall, title: 'Hey You', track: '1' })
    const r = await t.music.libraryScan.scan()
    expect(r).toMatchObject({ added: 1, tracks: 3, unmatched: 0 })
    const [a] = t.music.admin.albums()
    expect(a).toMatchObject({
      title: 'The Wall',
      year: 1979,
      discs: 2,
      tracks: 3,
      formats: ['FLAC', 'MP3'],
    })
    const again = await t.music.libraryScan.scan()
    expect(again).toMatchObject({ added: 0, changed: 0, unchanged: 1 })
  })
})

describe('ffprobe’s answer', () => {
  const probe = (tags: Record<string, string>, streams: object[] = []) => ({
    streams: [
      {
        codec_type: 'audio',
        codec_name: 'flac',
        sample_rate: '96000',
        channels: 2,
        bits_per_raw_sample: '24',
        duration: '200.5',
      },
      ...streams,
    ],
    format: { duration: '200.5', bit_rate: '2400000', tags },
  })

  test('tag names in any case and spelling; the original date before the release’s', () => {
    const { tags, audio } = parseMusicProbe(
      probe({
        TITLE: 'Song',
        Album_Artist: 'Someone',
        'musicbrainz albumid': PARKLIFE_RELEASE.toUpperCase(),
        ORIGINALDATE: '1994-04-25',
        DATE: '2012-07-30',
        GENRE: 'Britpop;Alternative Rock',
        TRACK: '07',
        RELEASETYPE: 'album/compilation',
        COMPILATION: '1',
        LABEL: 'Food',
      }),
    )
    expect(tags).toMatchObject({
      title: 'Song',
      albumArtist: 'Someone',
      track: 7,
      date: '1994-04-25',
      year: 1994,
      genres: ['Britpop', 'Alternative Rock'],
      releaseTypes: ['album', 'compilation'],
      compilation: true,
      label: 'Food',
      musicBrainz: { releaseId: PARKLIFE_RELEASE },
    })
    // a lossless file's depth, and the file's bitrate when the stream has none
    expect(audio).toMatchObject({ bitDepth: 24, sampleRate: 96000, bitrate: 2400, duration: 200.5 })
  })

  test('a track number of 0 or nonsense is none; a file without audio is refused', () => {
    expect(parseMusicProbe(probe({ track: '0/12' })).tags.track).toBeNull()
    expect(parseMusicProbe(probe({ track: 'A1' })).tags.track).toBeNull()
    expect(() =>
      parseMusicProbe({ streams: [{ codec_type: 'video', codec_name: 'h264' }] }),
    ).toThrow('no audio')
    // what ffprobe says of a file of junk named .flac
    expect(() =>
      parseMusicProbe({
        streams: [{ codec_type: 'audio', codec_name: 'flac', sample_rate: '0', channels: 0 }],
      }),
    ).toThrow('couldn’t read the file')
  })
})

describe('names and grouping', () => {
  test('track numbers and titles from file names', () => {
    expect(numberFromName('/m/01 - Girls & Boys.flac')).toBe(1)
    expect(numberFromName('/m/1-03 Title.flac')).toBe(3)
    expect(numberFromName('/m/Blur_Parklife_01_Girls & Boys.flac')).toBe(1)
    expect(numberFromName('/m/Girls & Boys.flac')).toBeNull()
    expect(titleFromName('/m/01 - Girls & Boys.flac')).toBe('Girls & Boys')
    expect(titleFromName('/m/Blur_Parklife_01_Girls & Boys.flac')).toBe('Girls & Boys')
    expect(titleFromName('/m/Girls & Boys.flac')).toBe('Girls & Boys')
  })

  test('disc folders, folder guesses and artist keys', () => {
    expect(['CD1', 'CD 2', 'Disc 3', 'disk-04', 'cd1 - bonus'].map(discOfFolder)).toEqual([
      1, 2, 3, 4, 1,
    ])
    expect(['CD', 'Cdx', 'Discography', 'CD0'].map(discOfFolder)).toEqual([null, null, null, null])
    expect(guessFromFolder('/m', '/m/Blur/Parklife (1994)')).toEqual({
      artist: 'Blur',
      album: 'Parklife',
      year: 1994,
    })
    expect(guessFromFolder('/m', '/m/Parklife')).toEqual({
      artist: null,
      album: 'Parklife',
      year: null,
    })
    expect(artistKey('The Beatles')).toBe(artistKey('Beatles, The'))
    expect(artistKey('Björk')).toBe(artistKey('bjork'))
    expect(artistKey('The The')).toBe('the')
  })

  test('tracks without an album tag join the one album the others agree on', () => {
    const found = (path: string) => ({
      path,
      discFolder: null,
      discOfFolder: null,
      size: 1,
      mtime: 1,
      lyricsFile: null,
    })
    const read = (album: string | null, title: string) =>
      parseMusicProbe({
        streams: [{ codec_type: 'audio', codec_name: 'mp3', sample_rate: '44100', channels: 2 }],
        format: { tags: { ...(album ? { album } : {}), title, artist: 'Blur' } },
      })
    const nfo = { releaseId: null, releaseGroupId: null, artistId: null }
    const r = groupAlbum(
      [
        { found: found('/m/a/01.mp3'), read: read('Parklife', 'One') },
        { found: found('/m/a/02.mp3'), read: read(null, 'Two') },
        { found: found('/m/a/03.mp3'), read: null },
      ],
      nfo,
    )
    expect(r.ok && r.album.tracks.map((t) => t.title)).toEqual(['One', 'Two'])
    expect(r.ok && r.album.artist).toBe('Blur')
  })
})
