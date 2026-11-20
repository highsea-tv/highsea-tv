// SPDX-License-Identifier: AGPL-3.0-only
// A track's tags and audio, read with ffprobe (Phase 5 D, ADR 0065): the same binary and
// arguments as a film's probe (shared/ffprobe.ts), so no new tag reader is needed, as the plan
// found (ffprobe read every tag the owner's sample had). FFmpeg turns each format's own tag names
// into its generic keys before ffprobe prints them, so one reader serves FLAC, MP3 and M4A:
//
// - FLAC and Ogg's Vorbis comments: `ALBUMARTIST` becomes `album_artist`, `TRACKNUMBER` `track`,
//   `DISCNUMBER` `disc` (FFmpeg's `ff_vorbiscomment_metadata_conv`), the rest as written, such as
//   `MUSICBRAINZ_ALBUMID`.
// - MP3's ID3v2: `TPE2` becomes `album_artist`, `TRCK` `track`, `TPOS` `disc`, `TDRC`/`TYER`
//   `date` (`ff_id3v2_34_metadata_conv`, `ff_id3v2_4_metadata_conv`), and a `TXXX` frame its
//   description, such as `MusicBrainz Album Id`.
// - M4A's atoms: `aART` becomes `album_artist`, `trkn` `track`, `disk` `disc`, and a `----` atom
//   its name, such as `MusicBrainz Album Id` (libavformat/mov.c).
//
// The MusicBrainz names are Picard's, per format (https://picard-docs.musicbrainz.org/en/appendices/tag_mapping.html):
// `MUSICBRAINZ_ALBUMID` and `MusicBrainz Album Id` are the release, `…RELEASEGROUPID` the release
// group, `…ALBUMARTISTID` the album artist, `…TRACKID` (`MusicBrainz Track Id`) the recording.
// Keys are compared folded (case, spaces, `_` and `-` dropped), so each spelling is one name. The
// sample's tags were checked against ffprobe 9.0's output for files tagged each way.
import { execFile } from 'node:child_process'
import { isAbsolute } from 'node:path'
import { ffprobeBinary, PROBE_ARGS } from '../shared/ffprobe.ts'
import { ProbeError } from '../shared/probe.ts'

export type TrackTags = {
  title: string | null
  artist: string | null
  albumArtist: string | null
  album: string | null
  /** From `3/12` or `03`: 3. */
  track: number | null
  disc: number | null
  discTotal: number | null
  /** The tags' date as written (`1994-04-25`, `1994`), the original release date first. */
  date: string | null
  year: number | null
  genres: string[]
  label: string | null
  /** MusicBrainz's release type (`album`, `ep`, `soundtrack`…), lowercased, every value. */
  releaseTypes: string[]
  compilation: boolean
  musicBrainz: {
    releaseId: string | null
    releaseGroupId: string | null
    albumArtistId: string | null
    artistId: string | null
    recordingId: string | null
  }
}

export type TrackAudio = {
  /** ffprobe's `codec_name`: `flac`, `mp3`, `aac`, `alac`. */
  codec: string
  /** As people say it: FLAC, MP3, AAC, ALAC. */
  format: string
  /** Seconds. */
  duration: number
  /** Kilobits a second, the stream's or else the file's average. */
  bitrate: number
  sampleRate: number
  /** Lossless only; null for a lossy codec, which has none. */
  bitDepth: number | null
  channels: number
  /** The file carries a picture (`attached_pic`): its cover. */
  embeddedCover: boolean
}

/**
 * The loudness a file's tags already say (HT-117): ReplayGain's `REPLAYGAIN_{TRACK,ALBUM}_{GAIN,PEAK}`
 * (FLAC's and Ogg's comments, MP3's `TXXX`, M4A's `----` atoms, each as ffprobe names it), or Opus's
 * `R128_{TRACK,ALBUM}_GAIN`. ReplayGain 2.0 gives a gain to its reference of -18 LUFS and a peak as
 * a linear sample value (https://wiki.hydrogenaud.io/index.php?title=ReplayGain_2.0_specification,
 * "Reference level" and "Metadata format"); RFC 7845 § 5.2.1 gives R128's gain as a Q7.8 number of
 * dB to -23 LUFS, with no peak (taken as full scale, so it's never raised).
 */
export type TagLoudness = {
  /** LUFS and dBFS, worked out from the gains and peaks. */
  track: { lufs: number; peak: number } | null
  album: { lufs: number; peak: number } | null
}

export type TrackRead = { tags: TrackTags; audio: TrackAudio; loudness?: TagLoudness }

/** ReplayGain 2.0's reference loudness, which its gains are to. */
export const REPLAYGAIN_REFERENCE_LUFS = -18
/** EBU R128's target, which Opus's R128 gains are to (RFC 7845 § 5.2.1). */
const R128_REFERENCE_LUFS = -23

/** `-6.48 dB` → -6.48. */
const decibels = (v: string | null) => {
  const m = /^\s*([+-]?\d+(?:\.\d+)?)\s*(?:db)?\s*$/i.exec(v ?? '')
  return m ? Number(m[1]) : null
}

/** The tags' loudness, or nulls; pure, for tests. */
export function tagLoudness(tag: (...names: string[]) => string | null): TagLoudness {
  const level = (kind: 'track' | 'album') => {
    const gain = decibels(tag(`replaygain${kind}gain`))
    const peakLinear = num(tag(`replaygain${kind}peak`))
    const peak = peakLinear && peakLinear > 0 ? 20 * Math.log10(peakLinear) : 0
    if (gain !== null && Math.abs(gain) < 60)
      return { lufs: REPLAYGAIN_REFERENCE_LUFS - gain, peak }
    const q78 = num(tag(`r128${kind}gain`))
    if (q78 !== null && Number.isInteger(q78) && Math.abs(q78) <= 32767)
      return { lufs: R128_REFERENCE_LUFS - q78 / 256, peak: 0 }
    return null
  }
  return { track: level('track'), album: level('album') }
}

/** Reads a track; throws `ProbeError` when it can't be read as audio. */
export type TagReader = (path: string) => Promise<TrackRead>

type RawStream = {
  codec_type?: string
  codec_name?: string
  sample_rate?: string
  channels?: number
  bits_per_raw_sample?: string
  bits_per_sample?: number
  bit_rate?: string
  duration?: string
  disposition?: Record<string, number>
  tags?: Record<string, string>
}
type RawProbe = {
  streams?: RawStream[]
  format?: { duration?: string; bit_rate?: string; tags?: Record<string, string> }
}

const fold = (key: string) => key.toLowerCase().replace(/[\s_-]/g, '')

const num = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number.parseFloat(v) : Number.NaN
  return Number.isFinite(n) ? n : null
}

/** `3/12` → [3, 12]; `03` → [3, null]; anything else nulls. */
function position(value: string | null): [number | null, number | null] {
  const m = /^\s*(\d+)\s*(?:\/\s*(\d+))?/.exec(value ?? '')
  if (!m) return [null, null]
  const n = Number(m[1])
  return [n > 0 ? n : null, m[2] ? Number(m[2]) || null : null]
}

const MBID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i
/** The first MusicBrainz id in a tag that may hold several (`id; id`). */
const mbid = (value: string | null) => MBID.exec(value ?? '')?.[0].toLowerCase() ?? null

/** Several values in one tag: ID3v2.4's NUL, or the `;` taggers write. */
const many = (value: string | null) =>
  (value ?? '')
    // biome-ignore lint/suspicious/noControlCharactersInRegex: ID3v2.4 separates values with NUL
    .split(/[;\u0000]/)
    .map((s) => s.trim())
    .filter(Boolean)

const LOSSLESS = new Set(['flac', 'alac', 'wavpack', 'ape', 'tta', 'mlp', 'truehd'])
const FORMATS: Record<string, string> = {
  flac: 'FLAC',
  mp3: 'MP3',
  aac: 'AAC',
  alac: 'ALAC',
  vorbis: 'Vorbis',
  opus: 'Opus',
  wmav1: 'WMA',
  wmav2: 'WMA',
  wmapro: 'WMA',
  wmalossless: 'WMA Lossless',
  ape: 'APE',
  wavpack: 'WavPack',
  ac3: 'AC3',
  eac3: 'E-AC3',
}

export const formatOf = (codec: string) =>
  FORMATS[codec] ?? (codec.startsWith('pcm_') ? 'PCM' : codec.toUpperCase())

const lossless = (codec: string) =>
  LOSSLESS.has(codec) || codec.startsWith('pcm_') || codec === 'wmalossless'

/** ffprobe's JSON as a track's tags and audio. Pure, for tests and recorded output. */
export function parseMusicProbe(json: unknown): TrackRead {
  const raw = (json ?? {}) as RawProbe
  const streams = Array.isArray(raw.streams) ? raw.streams : []
  const audio = streams.find((s) => s.codec_type === 'audio')
  if (!audio?.codec_name) throw new ProbeError('There’s no audio in the file.')
  // ffprobe names a damaged or empty file by its extension (`raw FLAC`) with no rate or channels
  if (!(num(audio.sample_rate) ?? 0) || !audio.channels)
    throw new ProbeError('ffprobe couldn’t read the file. It may be damaged or still copying.')
  const tags = new Map<string, string>()
  for (const [k, v] of Object.entries(raw.format?.tags ?? {}))
    if (typeof v === 'string' && v.trim() && !tags.has(fold(k))) tags.set(fold(k), v.trim())
  // Ogg keeps its comments on the stream (FFmpeg's oggdec), where Opus's R128 gains are: read for
  // the loudness alone, so the scan's other tags stay as they were
  const streamTags = new Map<string, string>()
  for (const [k, v] of Object.entries(audio.tags ?? {}))
    if (typeof v === 'string' && v.trim()) streamTags.set(fold(k), v.trim())
  const tag = (...names: string[]) => {
    for (const n of names) {
      const v = tags.get(n)
      if (v) return v
    }
    return null
  }

  const [track] = position(tag('track', 'tracknumber'))
  const [disc, discTotal] = position(tag('disc', 'discnumber', 'disk'))
  const date = tag('originaldate', 'originalyear', 'date', 'year')
  const year = num(/\b(\d{4})\b/.exec(date ?? '')?.[1])
  const codec = audio.codec_name
  const isLossless = lossless(codec)
  const bitDepth = isLossless
    ? num(audio.bits_per_raw_sample) || num(audio.bits_per_sample) || null
    : null
  const bitrate = num(audio.bit_rate) ?? num(raw.format?.bit_rate) ?? 0
  return {
    tags: {
      title: tag('title'),
      artist: tag('artist'),
      albumArtist: tag('albumartist'),
      album: tag('album'),
      track,
      disc,
      discTotal,
      date,
      year: year && year > 0 ? year : null,
      genres: many(tag('genre')),
      label: tag('label', 'publisher', 'organization'),
      releaseTypes: many(tag('releasetype', 'musicbrainzalbumtype'))
        .flatMap((t) => t.split(/[,/]/))
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean),
      compilation: ['1', 'true', 'yes'].includes(
        (tag('compilation', 'tcmp', 'cpil') ?? '').toLowerCase(),
      ),
      musicBrainz: {
        releaseId: mbid(tag('musicbrainzalbumid')),
        releaseGroupId: mbid(tag('musicbrainzreleasegroupid')),
        albumArtistId: mbid(tag('musicbrainzalbumartistid')),
        artistId: mbid(tag('musicbrainzartistid')),
        recordingId: mbid(tag('musicbrainztrackid')),
      },
    },
    audio: {
      codec,
      format: formatOf(codec),
      duration: num(audio.duration) ?? num(raw.format?.duration) ?? 0,
      bitrate: Math.round(bitrate / 1000),
      sampleRate: num(audio.sample_rate) ?? 0,
      bitDepth,
      channels: audio.channels ?? 2,
      embeddedCover: streams.some((s) => s.codec_type === 'video' && s.disposition?.attached_pic),
    },
    loudness: tagLoudness((n) => tag(n) ?? streamTags.get(n) ?? null),
  }
}

/** A tag reader that runs ffprobe, as films' probe does (shared/ffprobe.ts). */
export function createTagReader(options: { binary?: string; timeoutMs?: number } = {}): TagReader {
  const binary = options.binary ?? ffprobeBinary()
  const timeout = options.timeoutMs ?? 60_000
  return (path) =>
    new Promise((resolve, reject) => {
      if (!isAbsolute(path)) {
        reject(new ProbeError('Only a full path can be probed.'))
        return
      }
      execFile(
        binary,
        [...PROBE_ARGS, path],
        { timeout, maxBuffer: 16 * 1024 * 1024, windowsHide: true },
        (error, stdout) => {
          if (error) {
            const e = error as NodeJS.ErrnoException & { killed?: boolean }
            reject(
              new ProbeError(
                e.code === 'ENOENT'
                  ? 'ffprobe isn’t installed. Install FFmpeg, or set HIGHSEA_FFPROBE to ffprobe’s path.'
                  : e.killed
                    ? 'ffprobe took too long to read the file.'
                    : 'ffprobe couldn’t read the file. It may be damaged or still copying.',
              ),
            )
            return
          }
          try {
            resolve(parseMusicProbe(JSON.parse(stdout)))
          } catch (e) {
            reject(
              e instanceof ProbeError ? e : new ProbeError('ffprobe’s answer couldn’t be read.'),
            )
          }
        },
      )
    })
}
