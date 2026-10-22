// SPDX-License-Identifier: AGPL-3.0-only
// Collection rules' file facts (checkpoint 8d): read from a probe, and derived again for files
// recorded before 8d, safely repeated. The import and the scan writing them is in movies/.
import { describe, expect, test } from 'bun:test'
import { migrate, openDatabase, readSetting, schema } from '@highsea-tv/db'
import { asc } from 'drizzle-orm'
import {
  deriveAllFileFacts,
  FILE_FACTS_STATE_KEY,
  fileColumns,
  fileFactsCurrent,
  fileLanguages,
  type MediaInfo,
  probeOf,
} from '../../src/shared/index.ts'

const video = (over: Partial<NonNullable<MediaInfo['video']>> = {}) => ({
  index: 0,
  codec: 'hevc',
  codecTag: null,
  profile: null,
  width: 3840,
  height: 1600,
  bitDepth: 10,
  bitrate: 0,
  colorPrimaries: 'bt2020',
  colorTransfer: 'smpte2084',
  hdr: 'dv-hdr10' as const,
  dolbyVision: null,
  ...over,
})

const audio = (language: string | null, index = 1) => ({
  index,
  codec: 'eac3',
  codecTag: null,
  profile: null,
  channels: 6,
  layout: '5.1(side)',
  language,
  title: null,
  default: index === 1,
  bitrate: 0,
})

const sub = (language: string | null, index = 3) => ({
  index,
  codec: 'subrip',
  language,
  title: null,
  forced: false,
  hi: false,
  default: false,
})

const info = (over: Partial<MediaInfo> = {}): MediaInfo => ({
  duration: 100,
  container: 'matroska,webm',
  video: video(),
  audio: [audio('eng'), audio('ger', 2), audio('und', 4), audio('deu', 5)],
  subtitles: [sub('fre'), sub(null, 6), sub('pt-BR', 7)],
  ...over,
})

describe('a file’s facts', () => {
  test('lines by width or height, the HDR family, ffprobe’s codec', () => {
    expect(fileColumns(info())).toEqual({
      resolution: 2160,
      hdr: 'dolby-vision',
      videoCodec: 'hevc',
    })
    expect(fileColumns(info({ video: video({ hdr: 'none', width: 1280, height: 536 }) }))).toEqual({
      resolution: 720,
      hdr: 'none',
      videoCodec: 'hevc',
    })
    expect(fileColumns(info({ video: video({ hdr: 'pq' }) })).hdr).toBe('hdr10')
    expect(fileColumns(info({ video: video({ hdr: 'hlg' }) })).hdr).toBe('hlg')
    expect(fileColumns(info({ video: null }))).toEqual({
      resolution: null,
      hdr: null,
      videoCodec: null,
    })
    expect(fileColumns(null)).toEqual({ resolution: null, hdr: null, videoCodec: null })
  })

  test('languages as ISO 639-1, each once; untagged and und left out', () => {
    expect(fileLanguages(info())).toEqual([
      { kind: 'audio', language: 'en' },
      { kind: 'audio', language: 'de' },
      { kind: 'subtitle', language: 'fr' },
      { kind: 'subtitle', language: 'pt' },
    ])
  })

  test('the stored probe, in the import’s wrapper or bare', () => {
    const p = info()
    expect(probeOf({ probe: p, revision: {}, formats: [], formatScore: 0 })).toBe(p)
    expect(probeOf(p)).toBe(p)
    expect(probeOf({ probe: null })).toBeNull()
    expect(probeOf({ moviehash: 'abc' })).toBeNull()
    expect(probeOf(null)).toBeNull()
  })
})

describe('media.file-facts', () => {
  test('fills files recorded before 8d, in batches, safely repeated', async () => {
    const { db, raw } = openDatabase(':memory:')
    migrate(raw)
    const now = 1_000
    db.insert(schema.mediaItems)
      .values({
        id: 'itm_1',
        type: 'movie',
        tmdbId: 1,
        title: 'A',
        sortTitle: 'a',
        status: 'available',
        monitored: true,
        minimumAvailability: 'released',
        qualityProfileId: 'qp',
        rootFolder: '/m',
        path: '/m/a',
        addedAt: now,
        updatedAt: now,
      })
      .run()
    const files = [
      { probe: info(), formats: [] },
      info({ video: video({ codec: 'h264', hdr: 'none', width: 1920, height: 1080 }) }),
      null,
    ]
    files.forEach((mediaInfo, i) => {
      db.insert(schema.mediaFiles)
        .values({
          id: `fil_${i}`,
          itemId: 'itm_1',
          path: `/m/a/${i}.mkv`,
          size: 1,
          mediaInfo,
          addedAt: now,
        })
        .run()
    })
    expect(fileFactsCurrent(db)).toBe(false)
    let yields = 0
    const opts = { batch: 2, yieldFn: async () => void yields++ }
    expect(await deriveAllFileFacts(db, now, opts)).toBe(3)
    const rows = () =>
      db
        .select({
          id: schema.mediaFiles.id,
          resolution: schema.mediaFiles.resolution,
          hdr: schema.mediaFiles.hdr,
          videoCodec: schema.mediaFiles.videoCodec,
        })
        .from(schema.mediaFiles)
        .orderBy(asc(schema.mediaFiles.id))
        .all()
    const first = rows()
    expect(first).toEqual([
      { id: 'fil_0', resolution: 2160, hdr: 'dolby-vision', videoCodec: 'hevc' },
      { id: 'fil_1', resolution: 1080, hdr: 'none', videoCodec: 'h264' },
      { id: 'fil_2', resolution: null, hdr: null, videoCodec: null },
    ])
    const languages = () => db.select().from(schema.mediaFileLanguages).all().length
    expect(languages()).toBe(8)
    expect(await deriveAllFileFacts(db, now, opts)).toBe(3)
    expect(rows()).toEqual(first)
    expect(languages()).toBe(8)
    expect(yields).toBe(4)
    expect(fileFactsCurrent(db)).toBe(true)
    expect(readSetting(db, FILE_FACTS_STATE_KEY, { version: 0 })).toEqual({ version: 1 })
  })
})
