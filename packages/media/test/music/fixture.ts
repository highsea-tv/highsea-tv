// SPDX-License-Identifier: AGPL-3.0-only
// Music's test library (Phase 5 D): a database, the replayed MusicBrainz and Cover Art Archive
// (packages/metadata/test/fixtures/musicbrainz), a Music root folder, and a fake tag reader that
// reads the tags a test wrote into each file as JSON, so no ffmpeg is needed and nothing reaches
// the network. `real: true` reads the files with ffprobe instead. Call `cleanup` after each test.
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  createEventBus,
  createFakeClock,
  createSealer,
  generateSecretKey,
  type ServerEvent,
  silentLogger,
} from '@highsea-tv/core'
import { migrate, openDatabase, schema } from '@highsea-tv/db'
import { createJobQueue } from '@highsea-tv/jobs'
import { createMetadata } from '@highsea-tv/metadata'
import { createReplayFetch } from '@highsea-tv/metadata/replay'
import { asc } from 'drizzle-orm'
import { createMusic } from '../../src/music/index.ts'
import type { LoudnessMeter } from '../../src/music/loudness.ts'
import type { TagLoudness, TagReader, TrackRead, TrackTags } from '../../src/music/tags.ts'
import { createMedia } from '../../src/shared/index.ts'
import { ProbeError } from '../../src/shared/probe.ts'

export const BLUR = 'ba853904-ae25-4ebb-89d6-c44cfbd71bd2'
export const PARKLIFE_RELEASE = '23a46e92-b629-4869-94f6-ff984ea317c5'
export const PARKLIFE = '67461c8e-d864-3910-9bf4-39e44357aac9'

let cleanups: (() => void)[] = []
export function cleanup() {
  for (const c of cleanups) c()
  cleanups = []
}

export type FakeTags = Partial<Omit<TrackTags, 'musicBrainz'>> & {
  musicBrainz?: Partial<TrackTags['musicBrainz']>
  /** The file has a picture in it. */
  cover?: boolean
  format?: 'flac' | 'mp3'
  /** The ReplayGain or R128 levels the file's tags say (tags.ts' `TagLoudness`). */
  loudness?: TagLoudness
  /** The track's length in seconds; 180 when not given. */
  duration?: number
}

const blank: TrackTags = {
  title: null,
  artist: null,
  albumArtist: null,
  album: null,
  track: null,
  disc: null,
  discTotal: null,
  date: null,
  year: null,
  genres: [],
  label: null,
  releaseTypes: [],
  compilation: false,
  musicBrainz: {
    releaseId: null,
    releaseGroupId: null,
    albumArtistId: null,
    artistId: null,
    recordingId: null,
  },
}

/** Reads the JSON a test wrote; `broken` isn't audio ffprobe can read. */
export const fakeReader: TagReader = async (path) => {
  const { readFileSync } = await import('node:fs')
  const body = readFileSync(path, 'utf8')
  if (body === 'broken') throw new ProbeError('ffprobe couldn’t read the file.')
  const t = JSON.parse(body || '{}') as FakeTags
  const flac = (t.format ?? 'flac') === 'flac'
  return {
    tags: { ...blank, ...t, musicBrainz: { ...blank.musicBrainz, ...t.musicBrainz } },
    audio: {
      codec: flac ? 'flac' : 'mp3',
      format: flac ? 'FLAC' : 'MP3',
      duration: t.duration ?? 180,
      bitrate: flac ? 900 : 320,
      sampleRate: 44100,
      bitDepth: flac ? 16 : null,
      channels: 2,
      embeddedCover: !!t.cover,
    },
    loudness: t.loudness ?? { track: null, album: null },
  } satisfies TrackRead
}

/** A PNG's signature and a little more: enough for `sniffImage`. */
export const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])

export async function setup({
  real = false,
  measureLoudness,
}: {
  real?: boolean
  measureLoudness?: LoudnessMeter
} = {}) {
  const { db, raw } = openDatabase(':memory:')
  migrate(raw)
  const clock = createFakeClock()
  const events = createEventBus({ now: clock.now })
  const seen: ServerEvent[] = []
  events.subscribe((e) => seen.push(e))
  const jobs = createJobQueue({ db, clock, events })
  const fetch = createReplayFetch()
  const dir = mkdtempSync(join(tmpdir(), 'highsea-music-'))
  const imagesDir = join(dir, 'images')
  const root = join(dir, 'music')
  mkdirSync(imagesDir)
  mkdirSync(root)
  const metadata = createMetadata({
    db,
    jobs,
    clock,
    logger: silentLogger,
    events,
    sealer: createSealer(generateSecretKey()),
    fetch,
    imagesDir,
    version: '0.4.7',
    sleep: async (ms) => clock.advance(ms),
  })
  const media = createMedia({ db, clock, logger: silentLogger })
  media.seed()
  media.rootFolders.add({ path: root, kind: 'music' })
  const reads: string[] = []
  const reader: TagReader = async (path) => {
    reads.push(path)
    return fakeReader(path)
  }
  const music = createMusic(
    {
      db,
      clock,
      events,
      jobs,
      logger: silentLogger,
      metadata,
      imagesDir: join(dir, 'music-images'),
      // a file's picture, copied out as ffmpeg would: the fake writes a PNG
      extractCover: async (_track, out) => writeFileSync(out, PNG),
      ...(real ? {} : { readTags: reader }),
      ...(measureLoudness ? { measureLoudness } : {}),
    },
    media,
  )
  cleanups.push(() => {
    chmodSync(root, 0o755)
    rmSync(dir, { recursive: true, force: true })
  })

  /** Writes a track under the root folder with its tags, its folders made. */
  const put = (path: string, tags: FakeTags | 'broken' | string = {}) => {
    const full = join(root, path)
    mkdirSync(join(full, '..'), { recursive: true })
    writeFileSync(full, typeof tags === 'string' ? tags : JSON.stringify(tags))
    return full
  }

  /** Runs every due job, and the jobs they queue, to the end. */
  async function drain() {
    for (let i = 0; i < 20; i++) {
      await jobs.tick()
      await jobs.idle()
      if (!jobs.list({ status: ['queued'] }).some((j) => j.runAt <= clock.now())) return
    }
  }

  const rows = () => ({
    artists: db.select().from(schema.musicArtists).orderBy(asc(schema.musicArtists.sortName)).all(),
    albums: db.select().from(schema.musicAlbums).orderBy(asc(schema.musicAlbums.path)).all(),
    tracks: db
      .select()
      .from(schema.musicTracks)
      .orderBy(asc(schema.musicTracks.disc), asc(schema.musicTracks.number))
      .all(),
    unmatched: db
      .select()
      .from(schema.musicUnmatched)
      .orderBy(asc(schema.musicUnmatched.path))
      .all(),
  })

  return {
    db,
    raw,
    clock,
    events,
    seen,
    jobs,
    fetch,
    root,
    dir,
    media,
    metadata,
    music,
    put,
    drain,
    rows,
    reads,
  }
}

/** Someone with one profile, for plays, playlists and Recently played. */
export function person(t: Awaited<ReturnType<typeof setup>>, id = 'u1') {
  const now = t.clock.now()
  t.db
    .insert(schema.users)
    .values({
      id,
      username: id,
      displayName: `Person ${id}`,
      role: 'owner',
      webauthnId: `w-${id}`,
      createdAt: now,
      updatedAt: now,
    })
    .run()
  t.db
    .insert(schema.profiles)
    .values({
      id: `p-${id}`,
      userId: id,
      name: 'Main',
      tone: 'accent',
      createdAt: now,
      updatedAt: now,
    })
    .run()
  return { userId: id, profileId: `p-${id}`, deviceId: null }
}

/** Parklife's first tracks, tagged as a ripper would. */
export const parklife = (n: number, title: string, extra: object = {}) => ({
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
