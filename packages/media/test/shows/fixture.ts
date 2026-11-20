// SPDX-License-Identifier: AGPL-3.0-only
// The shows' test library (Phase 5 B): a database, the replayed TMDB, a shows root folder of files
// a few bytes long, and a fake probe that reads them, so no ffmpeg is needed and nothing reaches
// the network. TMDB is replayed from the recordings: Chernobyl (87108, TheTVDB 360893) and The
// Office (2996, TheTVDB 78107). Call `cleanup` after each test.
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  createEventBus,
  createFakeClock,
  createSealer,
  generateSecretKey,
  silentLogger,
} from '@highsea-tv/core'
import { migrate, openDatabase, schema } from '@highsea-tv/db'
import { createJobQueue } from '@highsea-tv/jobs'
import { createMetadata } from '@highsea-tv/metadata'
import { createReplayFetch } from '@highsea-tv/metadata/replay'
import { asc, eq } from 'drizzle-orm'
import { createMedia, type MediaInfo, type Probe } from '../../src/shared/index.ts'
import { ProbeError } from '../../src/shared/probe.ts'
import { createShows } from '../../src/shows/index.ts'

export const CHERNOBYL = 87108
export const THE_OFFICE = 2996

let cleanups: (() => void)[] = []
/** Removes every test library made since the last call. */
export function cleanup() {
  for (const c of cleanups) c()
  cleanups = []
}

export const mediaInfo = (seconds: number): MediaInfo => ({
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

/**
 * Reads what the test wrote in the file: `episode` is an hour, `sample` half a minute, anything
 * else isn't a video ffprobe can read.
 */
export const fakeProbe: Probe = async (path) => {
  const { readFileSync } = await import('node:fs')
  const body = readFileSync(path, 'utf8')
  if (body.startsWith('episode')) return mediaInfo(3600)
  if (body.startsWith('sample')) return mediaInfo(30)
  throw new ProbeError('ffprobe couldn’t read the file.')
}

export async function setup() {
  const { db, raw } = openDatabase(':memory:')
  migrate(raw)
  const clock = createFakeClock()
  const events = createEventBus({ now: clock.now })
  const jobs = createJobQueue({ db, clock, events })
  const fetch = createReplayFetch()
  const dir = mkdtempSync(join(tmpdir(), 'highsea-shows-import-'))
  const imagesDir = join(dir, 'images')
  const root = join(dir, 'shows')
  // where the download client saves a show's grabs (Phase 5 C1's import reads from it)
  const downloads = join(dir, 'downloads', 'shows')
  mkdirSync(imagesDir)
  mkdirSync(root)
  mkdirSync(downloads, { recursive: true })
  const metadata = createMetadata({
    db,
    jobs,
    clock,
    logger: silentLogger,
    events,
    sealer: createSealer(generateSecretKey()),
    fetch,
    imagesDir,
    sleep: async (ms) => clock.advance(ms),
  })
  await metadata.settings.setKey('test-key-for-replay-0001')
  const media = createMedia({ db, clock, logger: silentLogger })
  media.seed()
  media.rootFolders.add({ path: root, kind: 'shows' })
  const shows = createShows(
    {
      db,
      clock,
      events,
      jobs,
      logger: silentLogger,
      metadata,
      files: { probe: fakeProbe, downloadDirs: () => [downloads] },
    },
    media,
  )
  cleanups.push(() => {
    shows.close()
    chmodSync(root, 0o755)
    rmSync(dir, { recursive: true, force: true })
  })
  /** Writes a file under the root folder, its folders made. */
  const put = (path: string, body = 'episode') => {
    const full = join(root, path)
    mkdirSync(join(full, '..'), { recursive: true })
    writeFileSync(full, body)
    return full
  }
  const showRow = (tmdbId: number) =>
    db
      .select()
      .from(schema.mediaItems)
      .where(eq(schema.mediaItems.tmdbId, tmdbId))
      .all()
      .find((r) => r.type === 'show')
  /** Each episode as `S01E02`, with the path of its file or null, and its status. */
  const episodes = (tmdbId: number) => {
    const show = showRow(tmdbId)
    if (!show) return {}
    const rows = db
      .select({
        season: schema.mediaItems.seasonNumber,
        episode: schema.mediaItems.episodeNumber,
        status: schema.mediaItems.status,
        path: schema.mediaFiles.path,
      })
      .from(schema.mediaItems)
      .innerJoin(schema.versions, eq(schema.versions.itemId, schema.mediaItems.id))
      .leftJoin(schema.mediaFiles, eq(schema.mediaFiles.id, schema.versions.fileId))
      .where(eq(schema.mediaItems.showId, show.id))
      .orderBy(asc(schema.mediaItems.seasonNumber), asc(schema.mediaItems.episodeNumber))
      .all()
    return Object.fromEntries(
      rows.map((r) => [
        `S${String(r.season).padStart(2, '0')}E${String(r.episode).padStart(2, '0')}`,
        { file: r.path ? r.path.slice(root.length + 1) : null, status: r.status },
      ]),
    )
  }
  const files = () =>
    db
      .select()
      .from(schema.mediaFiles)
      .orderBy(asc(schema.mediaFiles.path))
      .all()
      .map((f) => f.path.slice(root.length + 1))
  const unmatched = () =>
    shows.unmatched().map((u) => ({
      path: u.path.slice(root.length + 1),
      kind: u.kind,
      reason: u.reason,
    }))
  /** Everything the import and the scan write, to compare two runs. */
  const snapshot = () => ({
    items: db.select().from(schema.mediaItems).orderBy(asc(schema.mediaItems.id)).all(),
    versions: db.select().from(schema.versions).orderBy(asc(schema.versions.id)).all(),
    files: db.select().from(schema.mediaFiles).orderBy(asc(schema.mediaFiles.id)).all(),
    unmatched: db
      .select()
      .from(schema.unmatchedFiles)
      .orderBy(asc(schema.unmatchedFiles.path))
      .all(),
    history: db.select().from(schema.history).orderBy(asc(schema.history.id)).all(),
  })
  /** An account with its own profile (same id, as accounts are made, ADR 0068): a watcher. */
  const person = (id: string) => {
    const now = clock.now()
    db.insert(schema.users)
      .values({
        id,
        username: id,
        displayName: id,
        role: 'user',
        webauthnId: `w-${id}`,
        createdAt: now,
        updatedAt: now,
      })
      .run()
    db.insert(schema.profiles)
      .values({
        id,
        userId: id,
        name: id,
        tone: 'accent',
        main: true,
        createdAt: now,
        updatedAt: now,
      })
      .run()
    return { userId: id, profileId: id }
  }
  const runJobs = async () => {
    await jobs.tick()
    await jobs.idle()
  }
  return {
    db,
    clock,
    events,
    jobs,
    metadata,
    media,
    shows,
    root,
    downloads,
    put,
    showRow,
    episodes,
    files,
    unmatched,
    snapshot,
    runJobs,
    person,
    fetch,
  }
}

/** Chernobyl in season folders with a `tvshow.nfo` as Sonarr's Kodi metadata writes it. */
export function chernobyl(t: Awaited<ReturnType<typeof setup>>, folder = 'Chernobyl (2019)') {
  t.put(
    `${folder}/tvshow.nfo`,
    `<?xml version="1.0" encoding="utf-8" standalone="yes"?>
<tvshow>
  <title>Chernobyl</title>
  <id>360893</id>
  <uniqueid type="tvdb" default="true">360893</uniqueid>
</tvshow>`,
  )
  t.put(`${folder}/Season 01/Chernobyl.S01E01.1:23:45.1080p.WEB-DL.DD5.1.H.264-NTb.mkv`)
  // one file, two episodes
  t.put(`${folder}/Season 01/Chernobyl.S01E02E03.1080p.WEB-DL.DD5.1.H.264-NTb.mkv`)
  // the name gives none: the folder's season isn't enough
  t.put(`${folder}/Season 01/Chernobyl Recap.mkv`)
  // TMDB lists five episodes and one season
  t.put(`${folder}/Season 01/Chernobyl.S01E09.1080p.WEB-DL-NTb.mkv`)
  t.put(`${folder}/Season 02/Chernobyl.S02E01.1080p.WEB-DL-NTb.mkv`)
  // a sample and an extra are skipped, not kept
  t.put(`${folder}/Season 01/Chernobyl.S01E04.sample.mkv`, 'sample')
  t.put(`${folder}/Featurettes/Making Chernobyl.mkv`)
  // ffprobe can't read it
  t.put(`${folder}/Season 01/Chernobyl.S01E05.1080p.WEB-DL-NTb.mkv`, 'not a video')
}
