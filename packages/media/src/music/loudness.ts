// SPDX-License-Identifier: AGPL-3.0-only
// Each track's loudness, for the players' levelling and the scrubber's waveform (HT-117; ADR 0065
// › Gapless and loudness). The `music.loudness` job goes through one album at a time, a few albums
// at once, and for each track whose file it hasn't read (or that changed since):
//
// - **The tags first.** A file tagged with ReplayGain or R128 gains (tags.ts' `TagLoudness`) is
//   trusted as it is, as players that honour ReplayGain do; nothing is measured.
// - **Else measured** with ffmpeg's `ebur128` filter (https://ffmpeg.org/ffmpeg-filters.html#ebur128),
//   which implements EBU R128 (ITU-R BS.1770): its summary gives the integrated loudness
//   (`I: … LUFS`) and, with `peak=true`, the true peak (`Peak: … dBFS`); `framelog=info` logs the
//   momentary loudness (`M:`, the last 400 ms) every 100 ms, which becomes the envelope the
//   scrubber draws (`QueuedSong.loudness`). ffmpeg only reads the file (`-f null -` writes
//   nothing), at the lowest priority (`nice` 19, as trickplay's and markers' ffmpeg run).
//
// A track's row is written as soon as it's read, so a job stopped part way (a restart, a timeout)
// carries on from the next track. The album's level comes once every track has one: the tags'
// album gain when every track carries it, else the tracks' integrated loudness averaged as energy
// over their lengths. That's close to, not the same as, measuring the album as one programme
// (BS.1770's gating runs over the whole), and is within a fraction of a dB for an album's even
// tracks; album mode needs one gain the album shares more than the last tenth of a dB.
import { spawn } from 'node:child_process'
import { setPriority } from 'node:os'
import { isAbsolute } from 'node:path'
import { endWithProcess } from '@highsea-tv/core/children'
import { schema } from '@highsea-tv/db'
import { and, eq, inArray } from 'drizzle-orm'
import type { MusicDeps } from './context.ts'
import { createTagReader, type TagLoudness } from './tags.ts'

const { musicAlbums, musicLoudness, musicTracks } = schema

export const MUSIC_LOUDNESS_JOB = 'music.loudness'
/** Albums measured at once: a few, so a NAS's other work goes on. */
export const MUSIC_LOUDNESS_CONCURRENCY = 2
/** Steps in a track's envelope: the mock's, enough for the widest scrubber's bars. */
export const LOUDNESS_STEPS = 160

/** A level: integrated loudness in LUFS and the peak in dBFS. */
export type Level = { lufs: number; peak: number }

export type Measured = Level & {
  /** The momentary loudness every 100 ms, in LUFS. */
  momentary: number[]
}

/** Measures a file's loudness; rejects when ffmpeg can't read it. Aborting kills ffmpeg. */
export type LoudnessMeter = (path: string, signal?: AbortSignal) => Promise<Measured>

/** The lowest priority a process can have (`nice` 19; https://nodejs.org/api/os.html#ossetprioritypid-priority). */
const LOW = 19

const FRAME = /\bM:\s*(-?\d+(?:\.\d+)?|-inf|nan)/
const INTEGRATED = /^\s*I:\s*(-?\d+(?:\.\d+)?)\s*LUFS/
const PEAK = /^\s*Peak:\s*(-?\d+(?:\.\d+)?|-inf)\s*dBFS/

/** ebur128's log as a measurement; pure, for tests. Throws when it has no summary. */
export function parseEbur128(lines: readonly string[]): Measured {
  const momentary: number[] = []
  let summary = false
  let lufs: number | null = null
  let peak: number | null = null
  for (const line of lines) {
    if (line.includes('Summary:')) summary = true
    if (!summary) {
      const m = FRAME.exec(line)
      if (m && line.includes('t:'))
        momentary.push(m[1] === '-inf' || m[1] === 'nan' ? -120 : Number(m[1]))
      continue
    }
    const i = INTEGRATED.exec(line)
    if (i && lufs === null) lufs = Number(i[1])
    const p = PEAK.exec(line)
    if (p && peak === null) peak = p[1] === '-inf' ? -120 : Number(p[1])
  }
  if (lufs === null) throw new Error('ffmpeg’s ebur128 gave no integrated loudness.')
  return { lufs, peak: peak ?? 0, momentary }
}

export const ebur128Args = (input: string) =>
  // biome-ignore format: ffmpeg's options read best in their pairs
  ['-hide_banner', '-nostats', '-nostdin', '-i', input, '-map', '0:a:0', '-vn', '-sn', '-dn',
    '-af', 'ebur128=peak=true:framelog=info', '-f', 'null', '-']

export const ffmpegLoudnessMeter =
  (ffmpeg: string, timeoutMs = 10 * 60_000): LoudnessMeter =>
  (path, signal) =>
    new Promise((resolve, reject) => {
      if (!isAbsolute(path)) {
        reject(new Error('Only a full path is read.'))
        return
      }
      const lines: string[] = []
      let rest = ''
      const child = endWithProcess(
        spawn(ffmpeg, ebur128Args(path), {
          stdio: ['ignore', 'ignore', 'pipe'],
          windowsHide: true,
          signal,
          timeout: timeoutMs,
        }),
      )
      if (child.pid)
        try {
          setPriority(child.pid, LOW)
        } catch {
          // a platform without priorities still measures
        }
      child.stderr?.setEncoding('utf8')
      child.stderr?.on('data', (chunk: string) => {
        const all = (rest + chunk).split('\n')
        rest = all.pop() ?? ''
        // only the frames' M and the summary are kept: a long track logs a line every 100 ms
        for (const l of all) if (l.includes('M:') || !l.includes('t:')) lines.push(l)
      })
      child.on('error', reject)
      child.on('close', (code: number | null) => {
        if (rest) lines.push(rest)
        if (code !== 0) {
          reject(new Error(`ffmpeg stopped with code ${code}: ${lines.slice(-3).join(' / ')}`))
          return
        }
        try {
          resolve(parseEbur128(lines))
        } catch (e) {
          reject(e)
        }
      })
    })

/** LUFS on the scrubber's 0-to-1: -50 LUFS and under is the floor, -5 LUFS and over the top. */
const shade = (lufs: number) => Math.max(0, Math.min(1, (lufs + 50) / 45))

/** The momentary loudness in `steps` even steps, each the energy mean of its frames; pure. */
export function envelopeOf(momentary: readonly number[], steps = LOUDNESS_STEPS): number[] {
  if (momentary.length === 0) return []
  return Array.from({ length: steps }, (_, i) => {
    const from = Math.floor((i * momentary.length) / steps)
    const to = Math.max(from + 1, Math.floor(((i + 1) * momentary.length) / steps))
    let energy = 0
    for (let k = from; k < to; k++) energy += 10 ** ((momentary[k] ?? -120) / 10)
    const lufs = 10 * Math.log10(energy / (to - from) || 1e-12)
    return Math.round(shade(lufs) * 100) / 100
  })
}

/** An album's level from its tracks': loudness averaged as energy over their lengths, the highest peak. */
export function albumLevel(tracks: readonly (Level & { duration: number })[]): Level | null {
  if (tracks.length === 0) return null
  let energy = 0
  let seconds = 0
  for (const t of tracks) {
    const d = Math.max(t.duration, 1)
    energy += d * 10 ** (t.lufs / 10)
    seconds += d
  }
  return {
    lufs: Math.round(10 * Math.log10(energy / seconds) * 100) / 100,
    peak: Math.max(...tracks.map((t) => t.peak)),
  }
}

const fileKey = (t: { size: number; mtime: number }) => `${t.size}:${t.mtime}`

export function createMusicLoudness(ctx: MusicDeps & { measureLoudness?: LoudnessMeter }) {
  const { db, clock } = ctx
  const log = ctx.logger.child('music-loudness')
  const readTags = ctx.readTags ?? createTagReader()
  const meter = ctx.measureLoudness

  /** The album's tracks with their loudness rows, if any. */
  const tracksOf = (albumId: string) =>
    db
      .select({ track: musicTracks, loudness: musicLoudness })
      .from(musicTracks)
      .leftJoin(musicLoudness, eq(musicLoudness.trackId, musicTracks.id))
      .where(eq(musicTracks.albumId, albumId))
      .orderBy(musicTracks.disc, musicTracks.number)
      .all()

  const stale = (r: {
    track: { size: number; mtime: number }
    loudness: { file: string } | null
  }) => !r.loudness || r.loudness.file !== fileKey(r.track)

  /** The albums with a track not yet read, or changed since. */
  function pending(): string[] {
    return db
      .select({
        albumId: musicTracks.albumId,
        size: musicTracks.size,
        mtime: musicTracks.mtime,
        file: musicLoudness.file,
      })
      .from(musicTracks)
      .leftJoin(musicLoudness, eq(musicLoudness.trackId, musicTracks.id))
      .all()
      .filter((r) => r.file !== `${r.size}:${r.mtime}`)
      .map((r) => r.albumId)
      .filter((id, i, all) => all.indexOf(id) === i)
  }

  /** Queues a job for each album with something to read, named for it; one waits per album. */
  function queuePending(): number {
    const albums = pending()
    for (const id of albums)
      ctx.jobs.enqueue(
        MUSIC_LOUDNESS_JOB,
        { albumId: id },
        { subject: { kind: 'album', id }, dedupeKey: `music-loudness:${id}` },
      )
    return albums.length
  }

  /**
   * Reads the album's tracks that need it, a row each as it goes, then the album's level. Stops
   * between tracks when `signal` fires; what's written stays.
   */
  async function measureAlbum(
    albumId: string,
    opts: { signal?: AbortSignal; progress?: (share: number) => void } = {},
  ): Promise<{ read: number; measured: number; failed: number }> {
    const result = { read: 0, measured: 0, failed: 0 }
    const rows = tracksOf(albumId)
    const todo = rows.filter(stale)
    let done = 0
    for (const { track } of todo) {
      if (opts.signal?.aborted) break
      let tags: TagLoudness | undefined
      try {
        tags = (await readTags(track.path)).loudness
      } catch (e) {
        log.debug('couldn’t read a track’s tags', { path: track.path, error: (e as Error).message })
      }
      let row: typeof musicLoudness.$inferInsert | null = null
      const base = { trackId: track.id, file: fileKey(track), measuredAt: clock.now() }
      if (tags?.track) {
        row = {
          ...base,
          source: 'tags',
          trackLufs: tags.track.lufs,
          trackPeak: tags.track.peak,
          albumLufs: tags.album?.lufs ?? null,
          albumPeak: tags.album?.peak ?? null,
          envelope: [],
        }
      } else if (meter) {
        try {
          const m = await meter(track.path, opts.signal)
          row = {
            ...base,
            source: 'measured',
            trackLufs: m.lufs,
            trackPeak: m.peak,
            albumLufs: null,
            albumPeak: null,
            envelope: envelopeOf(m.momentary),
          }
          result.measured++
        } catch (e) {
          if (opts.signal?.aborted) break
          result.failed++
          log.warn('couldn’t measure a track’s loudness', {
            path: track.path,
            error: (e as Error).message,
          })
        }
      }
      if (row) {
        db.insert(musicLoudness)
          .values(row)
          .onConflictDoUpdate({ target: musicLoudness.trackId, set: row })
          .run()
        result.read++
      }
      opts.progress?.(++done / Math.max(1, todo.length))
    }
    settleAlbum(albumId)
    return result
  }

  /** Once every track has a level: the album's, from the tags when they all carry it. */
  function settleAlbum(albumId: string) {
    const rows = tracksOf(albumId)
    if (rows.length === 0 || rows.some(stale)) return
    const levels = rows.map((r) => r.loudness as typeof musicLoudness.$inferSelect)
    const tagged = levels.every((l) => l.source === 'tags' && l.albumLufs !== null)
    if (tagged) return
    const album = albumLevel(
      rows.map((r) => ({
        lufs: (r.loudness as typeof musicLoudness.$inferSelect).trackLufs,
        peak: (r.loudness as typeof musicLoudness.$inferSelect).trackPeak,
        duration: r.track.duration,
      })),
    )
    if (!album) return
    db.update(musicLoudness)
      .set({ albumLufs: album.lufs, albumPeak: album.peak })
      .where(
        inArray(
          musicLoudness.trackId,
          rows.map((r) => r.track.id),
        ),
      )
      .run()
  }

  /** A track's levels for its play, or nulls while it hasn't been read. */
  function levelOf(trackId: string): { track: Level | null; album: Level | null } {
    const r = db.select().from(musicLoudness).where(eq(musicLoudness.trackId, trackId)).get()
    return {
      track: r ? { lufs: r.trackLufs, peak: r.trackPeak } : null,
      album:
        r && r.albumLufs !== null && r.albumPeak !== null
          ? { lufs: r.albumLufs, peak: r.albumPeak }
          : null,
    }
  }

  /** The tracks' envelopes by id, for the queue (`QueuedSong.loudness`); empty where unread. */
  function envelopes(trackIds: readonly string[]): Map<string, number[]> {
    const out = new Map<string, number[]>()
    for (let i = 0; i < trackIds.length; i += 500)
      for (const r of db
        .select({ id: musicLoudness.trackId, envelope: musicLoudness.envelope })
        .from(musicLoudness)
        .where(inArray(musicLoudness.trackId, trackIds.slice(i, i + 500)))
        .all())
        out.set(r.id, r.envelope)
    return out
  }

  /** Whether the album still exists, for a job queued before it went. */
  const albumExists = (id: string) =>
    !!db
      .select({ id: musicAlbums.id })
      .from(musicAlbums)
      .where(and(eq(musicAlbums.id, id)))
      .get()

  return { pending, queuePending, measureAlbum, levelOf, envelopes, albumExists }
}

export type MusicLoudness = ReturnType<typeof createMusicLoudness>
