// SPDX-License-Identifier: AGPL-3.0-only
// @highsea-tv/media/music: the music library (ADR 0036, 0065). The Music root folders' albums read
// where they are, grouped by their tags into artists, albums (with their discs) and tracks, each
// track its file; what can't be read as an album kept aside with why; MusicBrainz and the Cover
// Art Archive where the tags carry an id; and the admin's reads. Serving the routes, playback and
// the admin's screens are the next task's.
//
//   const music = createMusic({ db, clock, logger, events, jobs, metadata }, media)
//   music.jobs.schedule(now)                 once at boot: the 12-hourly scan
//   await music.libraryScan.scan({ folder? }) → MusicScanResult   music.libraryScan.queue(folder?)
//   await music.libraryMetadata.refresh()   → MusicMetadataResult  (the `music.metadata` job)
//   music.admin.artists() / artist(id) / albums() / album(id) / unmatched() / ignore(id) / folders()
import { z } from 'zod'
import { SCAN_EVERY_MS } from '../movies/scan.ts'
import type { Media } from '../shared/index.ts'
import { createMusicAdmin } from './admin.ts'
import type { MusicDeps } from './context.ts'
import { createMusicMetadata, MUSIC_METADATA_JOB } from './metadata.ts'
import { createMusicScan, MUSIC_SCAN_JOB } from './scan.ts'

export function createMusic(deps: MusicDeps, media: Media) {
  const libraryMetadata = createMusicMetadata(deps)
  const queueMetadata = () =>
    deps.jobs.enqueue(MUSIC_METADATA_JOB, {}, { dedupeKey: 'music-metadata' })
  const libraryScan = createMusicScan(deps, { media, afterScan: queueMetadata })
  const admin = createMusicAdmin(deps, { media })

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
    payload: z.object({}),
    attempts: 1,
    // a first look-up of a large library at one request a second takes hours
    timeoutMs: 12 * 60 * 60 * 1000,
    async run() {
      await libraryMetadata.refresh()
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
    /** What's in the Music root folders, imported where it is and kept in step. */
    libraryScan: { scan: libraryScan.scan, queue: queueScan },
    /** MusicBrainz and the Cover Art Archive for what carries an id. */
    libraryMetadata: { refresh: libraryMetadata.refresh, queue: queueMetadata },
    jobs: {
      types: { libraryScan: MUSIC_SCAN_JOB, metadata: MUSIC_METADATA_JOB },
      /** The 12-hourly scan of the Music root folders. The runtime calls this once at boot. */
      schedule: (now: number) => {
        deps.jobs.schedule(MUSIC_SCAN_JOB, SCAN_EVERY_MS, { firstRunAt: now + 15 * 60_000 })
      },
    },
  }
}

export type Music = ReturnType<typeof createMusic>
export { albumCover, artistPhoto, type MusicAdmin } from './admin.ts'
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
export { MUSIC_METADATA_JOB, type MusicMetadataResult } from './metadata.ts'
export { MUSIC_SCAN_JOB, type MusicScanResult } from './scan.ts'
export {
  createTagReader,
  formatOf,
  parseMusicProbe,
  type TagReader,
  type TrackAudio,
  type TrackRead,
  type TrackTags,
} from './tags.ts'
