// SPDX-License-Identifier: AGPL-3.0-only
// Importing's shared pieces: the probe on generated clips, Radarr's naming tokens against its
// documented examples, transfers and their fallbacks, the allowed roots, what's skipped and
// blocked, the recycle bin, the settings row, Kodi's NFO and the history's pages.
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import {
  existsSync,
  linkSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createFakeClock, silentLogger } from '@highsea/core'
import { migrate, openDatabase, schema } from '@highsea/db'
import {
  blockedMessage,
  buildFileName,
  buildFolderName,
  checkFormat,
  checkPath,
  cleanTitle,
  createMedia,
  createProbe,
  emptyRecycleBin,
  type MediaInfo,
  modesOf,
  movieNfo,
  type NamingFile,
  type NamingMovie,
  nodeFs,
  parseProbe,
  recycle,
  sampleReason,
  skipBeforeProbe,
  streamsOf,
  type TransferFs,
  titleThe,
  transfer,
  transferMessage,
  vetFiles,
} from '../../src/shared/index.ts'
import { type Clips, hasFfmpeg, makeClips } from '../clips.ts'
import { reason } from '../movies/helpers.ts'

let dir: string
let clips: Clips | null = null
beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'highsea-importing-'))
  if (hasFfmpeg) clips = makeClips(join(dir, 'clips'))
})
afterAll(() => rmSync(dir, { recursive: true, force: true }))

const EMPTY: MediaInfo = { duration: null, container: null, video: null, audio: [], subtitles: [] }

describe('the probe', () => {
  test.skipIf(!hasFfmpeg)(
    'reads a 1080p clip: streams, languages, channels, a forced subtitle',
    async () => {
      const info = await createProbe()(clips?.main as string)
      expect(info.duration).toBeCloseTo(3, 0)
      expect(info.container).toBe('matroska,webm')
      expect(info.video).toMatchObject({
        codec: 'h264',
        width: 1920,
        height: 1080,
        bitDepth: 8,
        hdr: 'none',
      })
      expect(info.audio).toEqual([
        expect.objectContaining({
          codec: 'aac',
          channels: 6,
          layout: '5.1',
          language: 'eng',
          default: true,
        }),
        expect.objectContaining({
          codec: 'aac',
          channels: 2,
          language: 'fra',
          title: 'Commentary',
          default: false,
        }),
      ])
      expect(info.subtitles).toEqual([
        expect.objectContaining({ codec: 'subrip', language: 'eng', forced: true }),
      ])
      expect(streamsOf(info).map((s) => s.type)).toEqual(['video', 'audio', 'audio', 'subtitle'])
      expect(streamsOf(info)[1]).toMatchObject({ channels: '5.1', language: 'eng' })
    },
  )

  test.skipIf(!hasFfmpeg)(
    'reads PQ from bt2020 and smpte2084 at 10 bits, as Radarr does',
    async () => {
      const info = await createProbe()(clips?.hdr as string)
      expect(info.video).toMatchObject({
        codec: 'hevc',
        bitDepth: 10,
        colorPrimaries: 'bt2020',
        colorTransfer: 'smpte2084',
        hdr: 'pq',
      })
      expect(streamsOf(info)[0]).toMatchObject({ type: 'video', hdr: 'hdr10' })
    },
  )

  test('reads HDR10, HLG and Dolby Vision from ffprobe’s output', () => {
    const stream = (extra: Record<string, unknown>) =>
      parseProbe({
        streams: [
          {
            index: 0,
            codec_type: 'video',
            codec_name: 'hevc',
            pix_fmt: 'yuv420p10le',
            width: 3840,
            height: 2160,
            ...extra,
          },
        ],
        format: { duration: '7200.5' },
      })
    expect(
      stream({
        color_primaries: 'bt2020',
        color_transfer: 'smpte2084',
        side_data_list: [{ side_data_type: 'Mastering display metadata' }],
      }).video?.hdr,
    ).toBe('hdr10')
    expect(stream({ color_primaries: 'bt2020', color_transfer: 'arib-std-b67' }).video?.hdr).toBe(
      'hlg',
    )
    expect(
      stream({
        side_data_list: [
          {
            side_data_type: 'DOVI configuration record',
            dv_profile: 8,
            dv_bl_signal_compatibility_id: 1,
          },
        ],
      }).video,
    ).toMatchObject({ hdr: 'dv-hdr10', dolbyVision: { profile: 8, compatibility: 1 } })
    expect(stream({ color_primaries: 'bt709', color_transfer: 'smpte2084' }).video?.hdr).toBe(
      'none',
    )
    expect(
      stream({ pix_fmt: 'yuv420p', color_primaries: 'bt2020', color_transfer: 'smpte2084' }).video
        ?.hdr,
    ).toBe('none')
    expect(stream({}).duration).toBe(7200.5)
  })

  test('skips cover art for the film, and reads Matroska’s DURATION tag', () => {
    const info = parseProbe({
      streams: [
        {
          index: 0,
          codec_type: 'video',
          codec_name: 'mjpeg',
          width: 600,
          height: 900,
          disposition: { attached_pic: 1 },
        },
        {
          index: 1,
          codec_type: 'video',
          codec_name: 'h264',
          width: 1920,
          height: 800,
          tags: { DURATION: '01:30:00.500000000' },
        },
      ],
    })
    expect(info.video?.index).toBe(1)
    expect(info.duration).toBe(5400.5)
  })

  test('a missing binary says how to fix it', async () => {
    const probe = createProbe({ binary: join(dir, 'no-such-ffprobe') })
    await expect(probe('/tmp/x.mkv')).rejects.toThrow('ffprobe isn’t installed')
    await expect(probe('relative.mkv')).rejects.toThrow('Only a full path')
  })
})

describe('naming', () => {
  const movie: NamingMovie = {
    title: "The Movie's Title",
    originalTitle: 'Τίτλος ταινίας',
    year: 2010,
    imdbId: 'tt12345',
    tmdbId: 123456,
    collection: 'The Movie Collection',
  }
  const info: MediaInfo = {
    duration: 7200,
    container: 'matroska,webm',
    video: {
      index: 0,
      codec: 'h264',
      codecTag: null,
      profile: 'High',
      width: 1920,
      height: 1080,
      bitDepth: 10,
      bitrate: 0,
      colorPrimaries: 'bt2020',
      colorTransfer: 'smpte2084',
      hdr: 'dv-hdr10',
      dolbyVision: { profile: 8, compatibility: 1 },
    },
    audio: [
      {
        index: 1,
        codec: 'dts',
        codecTag: null,
        profile: 'DTS',
        channels: 6,
        layout: '5.1(side)',
        language: 'eng',
        title: null,
        default: true,
        bitrate: 0,
      },
    ],
    subtitles: [],
  }
  const file: NamingFile = {
    quality: 'Bluray-1080p',
    revision: { version: 2, real: 0 },
    releaseGroup: 'EVOLVE',
    edition: 'ultimate extended edition',
    customFormats: ['IMAX', 'HYBRID'],
    mediaInfo: info,
    sceneName: 'The.Movie.Title.2010.1080p.BluRay.x264-EVOLVE',
  }

  test('Radarr’s documented token examples', () => {
    const one = (token: string, f: NamingFile = file) => buildFileName(token, movie, f)
    expect(one('{Movie Title}')).toBe("The Movie's Title")
    expect(one('{Movie CleanTitle}')).toBe('The Movies Title')
    expect(one('{Movie TitleThe}')).toBe("Movie's Title, The")
    expect(one('{Movie OriginalTitle}')).toBe('Τίτλος ταινίας')
    expect(one('{Movie Collection}')).toBe('The Movie Collection')
    expect(one('{Release Year}')).toBe('2010')
    expect(one('{ImdbId}')).toBe('tt12345')
    expect(one('{TmdbId}')).toBe('123456')
    expect(one('{Quality Full}')).toBe('Bluray-1080p Proper')
    expect(one('{Quality Title}')).toBe('Bluray-1080p')
    expect(one('{MediaInfo VideoCodec}')).toBe('x264')
    expect(one('{MediaInfo AudioCodec}')).toBe('DTS')
    expect(one('{MediaInfo AudioChannels}')).toBe('5.1')
    expect(one('{MediaInfo VideoDynamicRangeType}')).toBe('DV HDR10')
    expect(one('{Release Group}')).toBe('EVOLVE')
    expect(one('{Edition Tags}')).toBe('Ultimate Extended Edition')
    expect(one('{Custom Formats}')).toBe('IMAX HYBRID')
    expect(one('{imdb-{ImdbId}}')).toBe('{imdb-tt12345}')
    expect(one('{edition-{Edition Tags}}')).toBe('{edition-Ultimate Extended Edition}')
    expect(one('{edition-{Edition Tags}}', { ...file, edition: null })).toBe('')
  })

  test('the TRaSH Guides’ Plex format, as their example shows it', () => {
    // https://trash-guides.info/Radarr/Radarr-recommended-naming-scheme/
    const format =
      '{Movie CleanTitle} {(Release Year)} {imdb-{ImdbId}} {edition-{Edition Tags}} {[Custom Formats]}{[Quality Full]}{[MediaInfo VideoDynamicRangeType]}{[MediaInfo AudioCodec}{ MediaInfo AudioChannels]}{[MediaInfo VideoCodec]}{-Release Group}'
    expect(buildFileName(format, { ...movie, title: 'The Movie Title' }, file)).toBe(
      'The Movie Title (2010) {imdb-tt12345} {edition-Ultimate Extended Edition} [IMAX HYBRID][Bluray-1080p Proper][DV HDR10][DTS 5.1][x264]-EVOLVE',
    )
  })

  test('the defaults: Sintel (2010) Bluray-1080p', () => {
    const sintel = {
      title: 'Sintel',
      originalTitle: 'Sintel',
      year: 2010,
      imdbId: null,
      tmdbId: 45745,
      collection: null,
    }
    expect(buildFolderName('{Movie Title} ({Release Year})', sintel)).toBe('Sintel (2010)')
    expect(
      buildFileName('{Movie Title} ({Release Year}) {Quality Full}', sintel, {
        ...file,
        revision: { version: 1, real: 0 },
      }),
    ).toBe('Sintel (2010) Bluray-1080p')
  })

  test('case, separators, truncation and missing values follow the token', () => {
    expect(buildFileName('{movie title}', movie, file)).toBe("the movie's title")
    expect(buildFileName('{MOVIE TITLE}', movie, file)).toBe("THE MOVIE'S TITLE")
    expect(buildFileName('{Movie.Title}.{Release.Year}', movie, file)).toBe(
      "The.Movie's.Title.2010",
    )
    expect(buildFileName('{Movie Title:10}', movie, file)).toBe('The Mov...')
    expect(
      buildFileName('{Movie Title} - {Release Group}', movie, { ...file, releaseGroup: null }),
    ).toBe("The Movie's Title")
    expect(
      buildFileName('{Movie Title} {MediaInfo VideoCodec}', movie, { ...file, mediaInfo: null }),
    ).toBe("The Movie's Title")
  })

  test('illegal characters: smart colons, slashes, reserved names', () => {
    const m = { ...movie, title: 'Mission: Impossible 12:30 AC/DC <What?> "Quoted" *|' }
    expect(buildFileName('{Movie Title}', m, file)).toBe(
      'Mission - Impossible 12-30 AC+DC What! Quoted',
    )
    expect(buildFileName('{Movie Title}', m, file, { colonReplacement: 'delete' })).toBe(
      'Mission Impossible 1230 AC+DC What! Quoted',
    )
    expect(buildFileName('{Movie Title}', { ...movie, title: 'CON.film' }, file)).toBe('CON_film')
    expect(cleanTitle('Amélie & Friends: Part 2')).toBe('Amelie and Friends Part 2')
    expect(titleThe('A Trip to the Moon (1902)')).toBe('Trip to the Moon, A (1902)')
  })

  test('formats are checked before they’re saved', () => {
    expect(checkFormat('{Movie Title} ({Release Year})', 'folder')).toBeNull()
    expect(checkFormat('{Movie Title} {Quality Full}', 'folder')).toBe(
      '{Quality Full} describes a file, so it can’t name a folder.',
    )
    expect(checkFormat('{Movie Title} {Nonsense}', 'file')).toBe(
      'highsea doesn’t know the token {Nonsense}.',
    )
    expect(checkFormat('{Release Year}', 'file')).toContain('needs the movie’s title')
  })
})

describe('transfers', () => {
  const source = () => {
    const d = mkdtempSync(join(dir, 't-'))
    const src = join(d, 'downloads', 'film.mkv')
    mkdirSync(join(d, 'downloads'))
    writeFileSync(src, 'film')
    return { d, src, dest: join(d, 'library', 'Film (2010)', 'Film (2010).mkv') }
  }

  test('hardlinks on one filesystem, and a repeat does nothing', async () => {
    const { src, dest } = source()
    const r = await transfer(src, dest, 'hardlink')
    expect(r).toEqual({ method: 'hardlink', fallback: null, already: false })
    expect(statSync(dest).ino).toBe(statSync(src).ino)
    expect(await transfer(src, dest, 'hardlink')).toMatchObject({ already: true })
    expect(transferMessage(r)).toBe('Hardlinked: seeding takes no extra space.')
  })

  test('copies with COPYFILE_FICLONE when link fails with EXDEV', async () => {
    const { src, dest } = source()
    const calls: string[] = []
    const fs: TransferFs = {
      ...nodeFs,
      link: async () => {
        calls.push('link')
        throw Object.assign(new Error('cross-device link'), { code: 'EXDEV' })
      },
      copyFile: async (s, d, mode) => {
        calls.push(`copyFile:${mode}`)
        await nodeFs.copyFile(s, d, mode)
      },
    }
    const r = await transfer(src, dest, 'hardlink', fs)
    expect(r).toEqual({ method: 'copy', fallback: 'cross-device', already: false })
    expect(calls).toEqual([
      'link',
      `copyFile:${(await import('node:fs')).constants.COPYFILE_FICLONE}`,
    ])
    expect(statSync(dest).ino).not.toBe(statSync(src).ino)
    expect(readFileSync(dest, 'utf8')).toBe('film')
    expect(transferMessage(r)).toBe('Copied: the downloads folder is on another disk.')
    expect(await transfer(src, dest, 'hardlink', fs)).toMatchObject({
      method: 'copy',
      already: true,
    })
  })

  test('a move across disks copies, then removes the source', async () => {
    const { src, dest } = source()
    const fs: TransferFs = {
      ...nodeFs,
      rename: async (s, d) => {
        if (s === src) throw Object.assign(new Error('cross-device'), { code: 'EXDEV' })
        await nodeFs.rename(s, d)
      },
    }
    expect(await transfer(src, dest, 'move', fs)).toEqual({
      method: 'move',
      fallback: 'cross-device',
      already: false,
    })
    expect(existsSync(src)).toBe(false)
    expect(readFileSync(dest, 'utf8')).toBe('film')
  })

  test('something else at the destination is refused, not overwritten', async () => {
    const { src, dest } = source()
    mkdirSync(join(dest, '..'), { recursive: true })
    writeFileSync(dest, 'another film entirely')
    await expect(transfer(src, dest, 'hardlink')).rejects.toThrow('already exists')
  })
})

describe('allowed roots', () => {
  test('paths outside the roots are refused, through .. and through symlinks', () => {
    const root = join(dir, 'roots', 'media')
    const outside = join(dir, 'roots', 'elsewhere')
    mkdirSync(root, { recursive: true })
    mkdirSync(outside, { recursive: true })
    symlinkSync(outside, join(root, 'escape'))
    expect(checkPath(join(root, 'Film (2010)', 'film.mkv'), [root])).toBe(
      join(root, 'Film (2010)', 'film.mkv'),
    )
    for (const bad of [
      join(root, '..', 'elsewhere', 'x.mkv'),
      join(root, 'escape', 'x.mkv'),
      'relative/x.mkv',
      outside,
      `${root}-sibling/x.mkv`,
    ])
      expect(() => checkPath(bad, [root])).toThrow('isn’t inside a root folder')
  })
})

describe('what’s skipped and blocked', () => {
  test('blocked extensions, with the state’s exact copy', () => {
    expect(vetFiles(['Film/film.mkv', 'Film/Nosferatu.exe'])).toBe(
      'The release contains an executable file (Nosferatu.exe). It wasn’t downloaded, and it has been blocklisted.',
    )
    expect(blockedMessage('x.scr')).toContain('(x.scr)')
    for (const ext of [
      '.bat',
      '.cmd',
      '.exe',
      '.sh',
      '.arj',
      '.lnk',
      '.lzh',
      '.ps1',
      '.scr',
      '.vbs',
      '.zipx',
    ])
      expect(vetFiles([`a/b${ext.toUpperCase()}`])).not.toBeNull()
    expect(vetFiles(['a/film.mkv', 'a/film.nfo', 'a/film.srt'])).toBeNull()
  })

  test('samples by runtime, macOS resource files and extras', () => {
    expect(sampleReason('/d/film.mkv', 18_000_000, 59, 600)).toBe('A sample (18.0 MB). Skipped.')
    expect(sampleReason('/d/film.mkv', 18_000_000, 5400, 600)).toBeNull()
    expect(sampleReason('/d/film.m2ts', 18_000_000, 10, 600)).toBeNull()
    expect(skipBeforeProbe('/d/Film/._film.mkv', '/d/Film')).toContain('macOS resource file')
    expect(skipBeforeProbe('/d/Film/Featurettes/making-of.mkv', '/d/Film')).toBe(
      'An extra, in Featurettes. Skipped.',
    )
    expect(skipBeforeProbe('/d/Film/film-trailer.mkv', '/d/Film')).toBe(
      'An extra, by its name. Skipped.',
    )
    expect(skipBeforeProbe('/d/Film/film.mkv', '/d/Film')).toBeNull()
    expect(skipBeforeProbe('/d/The Big Short.mkv', '/d')).toBeNull()
    expect(skipBeforeProbe('/d/film.sample.mkv', '/d')).toBe('An extra, by its name. Skipped.')
    expect(skipBeforeProbe('/d/film-featurette.mkv', '/d')).toBe('An extra, by its name. Skipped.')
  })
})

describe('the recycle bin and permissions', () => {
  test('a file goes into the bin under its movie’s folder; emptying is by age and safe to repeat', async () => {
    const lib = join(dir, 'bin-test', 'movies', 'Film (2010)')
    const bin = join(dir, 'bin-test', 'bin')
    mkdirSync(lib, { recursive: true })
    const now = Date.parse('2026-10-20T12:00:00Z')
    writeFileSync(join(lib, 'Film (2010).mkv'), 'old')
    const first = await recycle(join(lib, 'Film (2010).mkv'), bin, now)
    expect(first).toBe(join(bin, 'Film (2010)', 'Film (2010).mkv'))
    writeFileSync(join(lib, 'Film (2010).mkv'), 'older')
    expect(await recycle(join(lib, 'Film (2010).mkv'), bin, now)).toBe(
      join(bin, 'Film (2010)', 'Film (2010) (1).mkv'),
    )
    expect(await recycle(join(lib, 'Film (2010).mkv'), bin, now)).toBeNull()

    const old = new Date(now - 10 * 86_400_000)
    utimesSync(first as string, old, old)
    expect(await emptyRecycleBin(bin, 7, now)).toBe(1)
    expect(await emptyRecycleBin(bin, 7, now)).toBe(0)
    expect(existsSync(join(bin, 'Film (2010)', 'Film (2010) (1).mkv'))).toBe(true)
    expect(await emptyRecycleBin(bin, 0, now + 365 * 86_400_000)).toBe(0)
    expect(await emptyRecycleBin(bin, 7, now + 30 * 86_400_000)).toBe(1)
    expect(existsSync(join(bin, 'Film (2010)'))).toBe(false)
  })

  test('without a bin, the file is deleted; a hardlinked file keeps its time', async () => {
    const d = join(dir, 'bin-none')
    mkdirSync(d)
    writeFileSync(join(d, 'a.mkv'), 'a')
    expect(await recycle(join(d, 'a.mkv'), '', Date.now())).toBeNull()
    expect(existsSync(join(d, 'a.mkv'))).toBe(false)

    writeFileSync(join(d, 'seeding.mkv'), 's')
    linkSync(join(d, 'seeding.mkv'), join(d, 'library.mkv'))
    const before = statSync(join(d, 'seeding.mkv')).mtimeMs
    await recycle(join(d, 'library.mkv'), join(d, 'bin'), Date.now() + 86_400_000)
    expect(statSync(join(d, 'seeding.mkv')).mtimeMs).toBe(before)
  })

  test('chmod for folders, and for files without execute bits', () => {
    expect(modesOf('755')).toEqual({ folder: 0o755, file: 0o644 })
    expect(modesOf('775')).toEqual({ folder: 0o775, file: 0o664 })
  })
})

describe('the mediaManagement row', () => {
  test('defaults, a save, and refusals', async () => {
    const { db, raw } = openDatabase(':memory:')
    migrate(raw)
    const media = createMedia({ db, clock: createFakeClock(), logger: silentLogger })
    expect(media.mediaManagement.get()).toMatchObject({
      rename: true,
      folderFormat: '{Movie Title} ({Release Year})',
      fileFormat: '{Movie Title} ({Release Year}) {Quality Full}',
      hardlinks: true,
      nfo: false,
      unmonitorDeleted: true,
      permissions: false,
      recycleBin: '',
      recycleBinDays: 7,
    })
    expect(media.mediaManagement.save({ nfo: true, recycleBin: '/data/recycle' })).toMatchObject({
      nfo: true,
      recycleBin: '/data/recycle',
      rename: true,
    })
    expect(media.mediaManagement.get().nfo).toBe(true)
    expect(
      await reason(() => media.mediaManagement.save({ fileFormat: '{Movie Title} {Bogus}' })),
    ).toBe('invalid:fileFormat')
    expect(await reason(() => media.mediaManagement.save({ chmod: '999' }))).toBe('invalid:chmod')
    expect(await reason(() => media.mediaManagement.save({ recycleBin: 'relative/bin' }))).toBe(
      'invalid:recycleBin',
    )
  })
})

describe('Kodi’s NFO', () => {
  test('the movie and its stream details', () => {
    const nfo = movieNfo(
      {
        title: 'Sintel & Friends',
        originalTitle: 'Sintel',
        sortTitle: 'sintel',
        rating: 7.1,
        votes: 1200,
        plot: 'A girl <and> a dragon.',
        runtimeMinutes: 15,
        tmdbId: 45745,
        imdbId: 'tt1727587',
        genres: ['Animation', 'Fantasy'],
        collection: null,
        premiered: '2010-09-27',
        directors: ['Colin Levy'],
        actors: [{ name: 'Halina Reijn', role: 'Sintel' }],
      },
      {
        ...EMPTY,
        duration: 888,
        video: {
          index: 0,
          codec: 'h264',
          codecTag: null,
          profile: null,
          width: 1920,
          height: 818,
          bitDepth: 8,
          bitrate: 0,
          colorPrimaries: null,
          colorTransfer: null,
          hdr: 'none',
          dolbyVision: null,
        },
        audio: [
          {
            index: 1,
            codec: 'aac',
            codecTag: null,
            profile: null,
            channels: 2,
            layout: 'stereo',
            language: 'eng',
            title: null,
            default: true,
            bitrate: 0,
          },
        ],
      },
    )
    expect(
      nfo.startsWith('<?xml version="1.0" encoding="UTF-8" standalone="yes" ?>\n<movie>'),
    ).toBe(true)
    expect(nfo).toContain('<title>Sintel &amp; Friends</title>')
    expect(nfo).toContain('<uniqueid type="tmdb" default="true">45745</uniqueid>')
    expect(nfo).toContain('<uniqueid type="imdb">tt1727587</uniqueid>')
    expect(nfo).toContain('<plot>A girl &lt;and&gt; a dragon.</plot>')
    expect(nfo).toContain(
      '<ratings><rating name="themoviedb" max="10" default="true"><value>7.1</value><votes>1200</votes></rating></ratings>',
    )
    expect(nfo).toContain(
      '<actor><name>Halina Reijn</name><role>Sintel</role><order>0</order></actor>',
    )
    expect(nfo).toContain(
      '<fileinfo><streamdetails><video><codec>h264</codec><aspect>2.35</aspect><width>1920</width><height>818</height><durationinseconds>888</durationinseconds></video><audio><codec>aac</codec><language>eng</language><channels>2</channels></audio></streamdetails></fileinfo>',
    )
    expect(nfo.trimEnd().endsWith('</movie>')).toBe(true)
    expect(nfo).not.toContain('<set>')
  })
})

describe('history', () => {
  test('pages newest first on (date, id), per item and for everything', async () => {
    const { db, raw } = openDatabase(':memory:')
    migrate(raw)
    const clock = createFakeClock()
    const media = createMedia({ db, clock, logger: silentLogger })
    media.seed()
    const now = clock.now()
    for (const [id, tmdbId] of [
      ['itm-a', 1],
      ['itm-b', 2],
    ] as const)
      db.insert(schema.mediaItems)
        .values({
          id,
          type: 'movie',
          tmdbId,
          parentId: null,
          title: id,
          sortTitle: id,
          year: 2000,
          rating: 0,
          releaseDate: null,
          status: 'wanted',
          monitored: true,
          minimumAvailability: 'released',
          qualityProfileId: 'qp-hd',
          languageProfileId: null,
          rootFolder: '/m',
          path: `/m/${id}`,
          addedAt: now,
          updatedAt: now,
        })
        .run()
    for (let i = 0; i < 5; i++) {
      media.history.write({
        itemId: i % 2 ? 'itm-b' : 'itm-a',
        type: 'imported',
        sourceTitle: `release ${i}`,
      })
      clock.advance(1000)
    }
    const first = media.history.list(undefined, 2)
    expect(first.items.map((h) => h.sourceTitle)).toEqual(['release 4', 'release 3'])
    expect(first.items[1]?.itemId).toBe(2)
    const second = media.history.list(first.next as string, 2)
    expect(second.items.map((h) => h.sourceTitle)).toEqual(['release 2', 'release 1'])
    const last = media.history.list(second.next as string, 2)
    expect(last.items.map((h) => h.sourceTitle)).toEqual(['release 0'])
    expect(last.next).toBeNull()
    expect(media.history.forItem('itm-a').items.map((h) => h.sourceTitle)).toEqual([
      'release 4',
      'release 2',
      'release 0',
    ])
    expect(await reason(() => media.history.list('not-a-cursor'))).toBe('invalid:bad-cursor')
    const plan = raw.all(
      'EXPLAIN QUERY PLAN SELECT id FROM history WHERE item_id = ? AND (date, id) < (?, ?) ORDER BY date DESC, id DESC LIMIT 51',
      'itm-a',
      now,
      'x',
    ) as { detail: string }[]
    expect(plan.map((p) => p.detail).join(' ')).toContain('history_item')
  })
})
