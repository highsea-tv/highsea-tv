// SPDX-License-Identifier: AGPL-3.0-only
// The importers on an in-memory database: TMDB replayed from the recordings, the movie library, a
// real torrent engine with no binding (nothing leaves the machine), downloads over it, and both
// importers reaching the fakes on loopback. The data folder is a temporary directory.
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  AppError,
  createEventBus,
  createFakeClock,
  createSealer,
  generateSecretKey,
  silentLogger,
} from '@highsea-tv/core'
import { migrate, openDatabase } from '@highsea-tv/db'
import { createDownloads } from '@highsea-tv/downloads'
import { createJobQueue } from '@highsea-tv/jobs'
import { createMovies } from '@highsea-tv/media/movies'
import { checkPath, createMedia, type MediaInfo, type Probe } from '@highsea-tv/media/shared'
import { createShows } from '@highsea-tv/media/shows'
import { createMetadata } from '@highsea-tv/metadata'
import { createReplayFetch } from '@highsea-tv/metadata/replay'
import { testEngine } from '@highsea-tv/torrent/testing'
import { createQbittorrentImporter } from '../src/qbittorrent/index.ts'
import { createRadarrImporter } from '../src/radarr/index.ts'
import { createSonarrImporter } from '../src/sonarr/index.ts'

const mediaInfo = (seconds: number): MediaInfo => ({
  duration: seconds,
  container: 'matroska,webm',
  video: {
    index: 0,
    codec: 'h264',
    codecTag: null,
    profile: null,
    width: 1920,
    height: 1080,
    bitDepth: 8,
    bitrate: 0,
    colorPrimaries: null,
    colorTransfer: null,
    hdr: 'none',
    dolbyVision: null,
  },
  audio: [],
  subtitles: [],
})

/** Episode files are a few bytes: `episode` reads as an hour of video, anything else fails. */
const fakeProbe: Probe = async (path) => {
  const { readFileSync } = await import('node:fs')
  if (readFileSync(path, 'utf8').startsWith('episode')) return mediaInfo(3600)
  throw new Error('ffprobe couldn’t read the file.')
}

export async function setup() {
  const database = openDatabase(':memory:')
  migrate(database.raw)
  const { db } = database
  const clock = createFakeClock(Date.now())
  const events = createEventBus({ now: clock.now })
  const jobs = createJobQueue({ db, clock, events })
  const sealer = createSealer(generateSecretKey())
  const dir = mkdtempSync(join(tmpdir(), 'highsea-importers-'))
  const data = join(dir, 'data')
  const library = join(data, 'media', 'movies')
  const showsFolder = join(data, 'media', 'shows')
  const downloadsFolder = join(data, 'downloads')
  mkdirSync(library, { recursive: true })
  mkdirSync(showsFolder, { recursive: true })
  mkdirSync(downloadsFolder, { recursive: true })
  mkdirSync(join(dir, 'images'))

  const tmdb = createReplayFetch()
  const metadata = createMetadata({
    db,
    jobs,
    clock,
    logger: silentLogger,
    events,
    sealer,
    fetch: tmdb,
    imagesDir: join(dir, 'images'),
    sleep: async (ms) => clock.advance(ms),
  })
  await metadata.settings.setKey('test-key-for-replay-0001')
  const media = createMedia({ db, clock, logger: silentLogger })
  media.seed()
  media.rootFolders.add(library)
  const movies = createMovies(
    {
      db,
      jobs,
      clock,
      events,
      logger: silentLogger,
      metadata,
      importing: { downloadDirs: () => [downloadsFolder], sampleSeconds: 2 },
    },
    media,
  )
  const shows = createShows(
    { db, clock, events, jobs, logger: silentLogger, metadata, files: { probe: fakeProbe } },
    media,
  )
  const { engine } = testEngine({ db: database })
  await engine.start()
  const checkFolder = (path: string) => checkPath(path, [data, downloadsFolder])
  const downloads = createDownloads({
    db,
    clock,
    logger: silentLogger,
    events,
    jobs,
    engine,
    indexers: {
      grab: async () => {
        throw new AppError('not-found', 'No indexers here.')
      },
      releases: () => [],
      grabEpisodes: async () => {
        throw new AppError('not-found', 'No indexers here.')
      },
      episodeReleases: () => [],
    },
    fetch: async () => new Response(null, { status: 404 }),
    movie: () => null,
    search: async () => [],
    downloadsFolder: () => downloadsFolder,
    history: () => {},
    importer: async () => ({ ok: false, reason: 'not in these tests' }),
    checkFolder,
  })
  downloads.defineJobs()

  // the fakes are on loopback: the real fetch reaches them and nothing else
  const fetch = globalThis.fetch
  const radarr = createRadarrImporter({
    db,
    jobs,
    clock,
    events,
    logger: silentLogger,
    fetch,
    sealer,
    media,
    movies,
    downloads,
    allowedRoots: () => [data],
  })
  const qbittorrent = createQbittorrentImporter({
    db,
    jobs,
    clock,
    events,
    logger: silentLogger,
    fetch,
    sealer,
    downloads,
    engine,
    checkFolder,
    grabs: radarr.grabs,
  })
  const sonarr = createSonarrImporter({
    db,
    jobs,
    clock,
    events,
    logger: silentLogger,
    fetch,
    sealer,
    media,
    shows,
    allowedRoots: () => [data],
  })
  const runJobs = async () => {
    await jobs.tick()
    await jobs.idle()
  }
  return {
    db,
    clock,
    events,
    jobs,
    media,
    movies,
    engine,
    downloads,
    radarr,
    qbittorrent,
    shows,
    sonarr,
    showsFolder,
    dir,
    data,
    library,
    downloadsFolder,
    runJobs,
    cleanup: async () => {
      movies.close()
      shows.close()
      // the jobs still running finish first, as at the runtime's shutdown: one that wrote into the
      // folder after it was removed made it again and left it in the temp folder
      await jobs.drain()
      await engine.close()
      rmSync(dir, { recursive: true, force: true })
    },
  }
}

/** `code:reason` of the AppError a call throws, or `no error`. */
export async function reason(fn: () => unknown): Promise<string> {
  try {
    await fn()
  } catch (e) {
    if (e instanceof AppError) return `${e.code}:${(e.details as { reason?: string })?.reason}`
    throw e
  }
  return 'no error'
}
