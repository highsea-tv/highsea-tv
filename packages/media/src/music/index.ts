// SPDX-License-Identifier: AGPL-3.0-only
// @highsea-tv/media/music: the music library (ADR 0036, 0065). The Music root folders' albums read
// where they are, grouped by their tags into artists, albums (with their discs) and tracks, each
// track its file; what can't be read as an album kept aside with why; MusicBrainz, the Cover Art
// Archive and fanart.tv where the tags carry an id; the admin's reads and changes; the apps' reads,
// queue and playlists; covers and pictures; and playing a song (`createMusicPlayback`, made by the
// runtime, which has the device profiles).
//
//   const music = createMusic({ db, clock, logger, events, jobs, metadata, imagesDir }, media)
//   music.jobs.schedule(now)                 once at boot: the 12-hourly scan
//   await music.libraryScan.scan({ folder? }) → MusicScanResult   music.libraryScan.queue(folder?)
//   await music.libraryMetadata.refresh()   → MusicMetadataResult  (the `music.metadata` job)
//   music.admin.artists() / artist(id) / albums() / album(id) / unmatched() / ignore(id) / folders()
//   music.manage.match(id, m) / refreshArtist(id) / refreshAlbum(id) / naming() / saveNaming(n)
//   music.client.library() / songs() / album(id) / artist(id) / queue(…) / tracks(ids) / search(q)
//   music.playlists.list(who) / get / create / rename / add / remove / reorder / delete
//   await music.images.get('album' | 'artist', id) → MusicImage
import { z } from 'zod'
import { SCAN_EVERY_MS } from '../movies/scan.ts'
import type { Media } from '../shared/index.ts'
import { createMusicAdmin } from './admin.ts'
import { createMusicClient } from './client.ts'
import type { MusicDeps } from './context.ts'
import { createMusicImages } from './images.ts'
import { createMusicLoudness, MUSIC_LOUDNESS_CONCURRENCY, MUSIC_LOUDNESS_JOB } from './loudness.ts'
import { createMusicManage } from './manage.ts'
import { createMusicMetadata, MUSIC_METADATA_JOB } from './metadata.ts'
import { createMusicPlaylists } from './playlists.ts'
import { createMusicScan, MUSIC_SCAN_JOB } from './scan.ts'

export function createMusic(deps: MusicDeps, media: Media) {
  const libraryMetadata = createMusicMetadata(deps)
  const queueMetadata = () =>
    deps.jobs.enqueue(MUSIC_METADATA_JOB, {}, { dedupeKey: 'music-metadata' })
  const loudness = createMusicLoudness(deps)
  // after a scan: MusicBrainz for what's new, and the loudness of every track not yet read
  const libraryScan = createMusicScan(deps, {
    media,
    afterScan: () => {
      queueMetadata()
      loudness.queuePending()
    },
  })
  const admin = createMusicAdmin(deps, { media })
  const manage = createMusicManage(deps, {
    scan: libraryScan.scan,
    // an artist's or an album's Refresh looks up as a job naming it, so Music's pages mark it
    // while it runs (HT-106's work marks, HT-108); one waits per item
    queueRefresh: (only, subject) =>
      deps.jobs.enqueue(
        MUSIC_METADATA_JOB,
        { force: true, only },
        { subject, dedupeKey: `music-metadata:${subject.kind}:${subject.id}` },
      ),
  })
  const client = createMusicClient(deps, loudness)
  const playlists = createMusicPlaylists(deps, client)
  const images = createMusicImages(deps, {
    dir: deps.imagesDir ?? '',
    extract: deps.imagesDir ? deps.extractCover : undefined,
  })

  deps.jobs.define({
    type: MUSIC_SCAN_JOB,
    payload: z.object({ folder: z.string().optional() }),
    attempts: 2,
    // every album's folder, reading what's new with ffprobe: generous, and still ends
    timeoutMs: 12 * 60 * 60 * 1000,
    async run({ folder }) {
      await libraryScan.scan({ folder })
    },
  })
  deps.jobs.define({
    type: MUSIC_METADATA_JOB,
    // the whole library after a scan; one artist's or album's, looked up again, after its Refresh
    payload: z.object({
      force: z.boolean().optional(),
      only: z.object({ albums: z.array(z.string()), artists: z.array(z.string()) }).optional(),
    }),
    attempts: 1,
    // a first look-up of a large library at one request a second takes hours
    timeoutMs: 12 * 60 * 60 * 1000,
    async run({ force, only }) {
      await libraryMetadata.refresh({ force, only })
    },
  })

  deps.jobs.define({
    type: MUSIC_LOUDNESS_JOB,
    // one album's tracks, read from their tags or measured with ffmpeg at the lowest priority
    payload: z.object({ albumId: z.string() }),
    concurrency: MUSIC_LOUDNESS_CONCURRENCY,
    attempts: 2,
    // a long album of long tracks on a NAS's CPU; each track is kept as it's done
    timeoutMs: 2 * 60 * 60 * 1000,
    subject: ({ albumId }) => ({ kind: 'album', id: albumId }),
    async run({ albumId }, job) {
      if (!loudness.albumExists(albumId)) return
      await loudness.measureAlbum(albumId, { signal: job.signal, progress: job.progress })
    },
  })

  /** Asks for a scan of a folder, or of every Music root folder; one waits per folder. */
  const queueScan = (folder?: string) =>
    deps.jobs.enqueue(MUSIC_SCAN_JOB, folder ? { folder } : {}, {
      dedupeKey: `music-scan:${folder ?? '*'}`,
    })

  return {
    /** The admin's artists, albums, Unmatched and folders, in the contract's shapes. */
    admin,
    /** The admin's changes: Unmatched's Match, Refresh, and track naming. */
    manage,
    /** The apps' music: the library, Songs, an album, an artist, the queue, search, Home. */
    client,
    /** Each profile's own playlists. */
    playlists,
    /** Albums' covers and artists' pictures. */
    images,
    /** What's in the Music root folders, imported where it is and kept in step. */
    libraryScan: { scan: libraryScan.scan, queue: queueScan },
    /** MusicBrainz and the Cover Art Archive for what carries an id. */
    libraryMetadata: { refresh: libraryMetadata.refresh, queue: queueMetadata },
    /** Each track's loudness and its album's, for levelling, and the scrubber's envelope. */
    loudness,
    jobs: {
      types: {
        libraryScan: MUSIC_SCAN_JOB,
        metadata: MUSIC_METADATA_JOB,
        loudness: MUSIC_LOUDNESS_JOB,
      },
      /** The 12-hourly scan of the Music root folders. The runtime calls this once at boot. */
      schedule: (now: number) => {
        deps.jobs.schedule(MUSIC_SCAN_JOB, SCAN_EVERY_MS, { firstRunAt: now + 15 * 60_000 })
      },
    },
  }
}

export type Music = ReturnType<typeof createMusic>
export { albumCover, artistPhoto, type MusicAdmin } from './admin.ts'
export type { MusicClient } from './client.ts'
export type { MusicDeps } from './context.ts'
export {
  AUDIO_EXTENSIONS,
  discOfFolder,
  guessFromFolder,
  readMusicNfo,
  scanMusicFolder,
  VIDEO_EXTENSIONS,
} from './folders.ts'
export { artistKey, groupAlbum, numberFromName, titleFromName, VARIOUS_ARTISTS } from './group.ts'
export {
  type CoverExtractor,
  ffmpegCoverExtractor,
  type MusicImage,
  sniffImage,
} from './images.ts'
export {
  albumLevel,
  envelopeOf,
  ffmpegLoudnessMeter,
  type Level,
  type LoudnessMeter,
  MUSIC_LOUDNESS_JOB,
  type MusicLoudness,
  parseEbur128,
} from './loudness.ts'
export { defaultTrackNaming, TRACK_NAMING_KEY } from './manage.ts'
export { MUSIC_METADATA_JOB, type MusicMetadataResult } from './metadata.ts'
export {
  type AudioProfile,
  createMusicPlayback,
  DIRECT_CONTAINERS,
  decideMusic,
  ffmpegMusicTranscoder,
  MUSIC_IDLE_MS,
  type MusicPlayback,
  type MusicTranscoder,
  musicVersion,
} from './playback.ts'
export type { PlaylistOwner } from './playlists.ts'
export { MUSIC_SCAN_JOB, type MusicScanResult } from './scan.ts'
export {
  createTagReader,
  formatOf,
  parseMusicProbe,
  type TagLoudness,
  type TagReader,
  type TrackAudio,
  type TrackRead,
  type TrackTags,
  tagLoudness,
} from './tags.ts'
