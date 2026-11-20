// SPDX-License-Identifier: AGPL-3.0-only
// Playing a song (HT-101; ADR 0051's and 0052's sections of 2026-11-19). A play is a session in
// memory, as a film's is (a restart ends every stream anyway): who, on which device, which track,
// how, and where they are. Its address, `/stream/music/{token}`, carries a random token that's the
// only credential, works while the play lives, and ends with it.
//
// How it's sent follows the films' decisions (ADR 0051, 0052) for audio alone:
//
// - Direct play, the file as it is by byte ranges (RFC 9110 § 14), when the device's profile lists
//   the track's codec (ffprobe's `codec_name`) with enough channels, and the file's container is one
//   a browser's or AVPlayer's audio element loads: FLAC, MP3, MP4/M4A (AAC, ALAC), Ogg (Opus,
//   Vorbis) and WAV, as MDN's media container and audio codec guides list them
//   (https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Formats/Containers,
//   https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Formats/Audio_codecs). The built-in
//   profiles already say who plays what: Safari and Apple's apps ALAC and not Vorbis, Chromium and
//   Firefox Opus and Vorbis and not ALAC.
// - Otherwise AAC in MP4, which every profile plays: ffmpeg's native AAC encoder at 256 kb/s for
//   stereo (ffmpeg's AAC guide puts its transparency around 128 kb/s a channel pair and above,
//   https://trac.ffmpeg.org/wiki/Encode/AAC), downmixed to two channels when the device takes no
//   more, with `-movflags +faststart` so the file can be played and sought by ranges as it is
//   (https://ffmpeg.org/ffmpeg-formats.html#Options-11). The whole track is made once, before it's
//   sent (a song takes a second or two), and kept a day for the next play; the folder is emptied at
//   start.
//
// A play is recorded when it ends (`music_plays`): stopped, a skip, or a player that stopped
// reporting for five minutes. It counts for Most played when it was heard past half its length or
// four minutes, Last.fm's rule for a scrobble (https://www.last.fm/api/scrobbling, "When is a
// scrobble a scrobble?"); one with nothing heard leaves no row.
import { execFile } from 'node:child_process'
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { promises as fsp } from 'node:fs'
import { extname, isAbsolute, join } from 'node:path'
import type { MusicPlay, StreamSession, WatchRecord } from '@highsea-tv/api-contract'
import { SESSIONS_TOPICS } from '@highsea-tv/api-contract'
import { AppError, newId } from '@highsea-tv/core'
import { schema } from '@highsea-tv/db'
import { and, desc, eq, gte, lt } from 'drizzle-orm'
import { albumCover } from './admin.ts'
import type { MusicDeps } from './context.ts'

const { musicAlbums, musicArtists, musicPlays, musicTracks } = schema

const MINUTE = 60_000
/** How long an address works after the last report; a report renews it. */
export const MUSIC_TOKEN_MS = 6 * 60 * MINUTE
/** A play with no report for this long has been left, and ends. */
export const MUSIC_IDLE_MS = 5 * MINUTE
/** A made AAC file unused for this long is removed. */
export const MUSIC_TRANSCODE_KEEP_MS = 24 * 60 * MINUTE
/** A stopped play shows on Now playing this long, saying who stopped it. */
const STOPPED_LINGER_MS = 10_000
/** The history's 30 days, as films' (now-playing.ts). */
const KEEP_MS = 30 * 24 * 60 * MINUTE

/** Containers an audio element loads, by extension, with their media types (MDN). */
export const DIRECT_CONTAINERS: Record<string, string> = {
  '.flac': 'audio/flac',
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.m4b': 'audio/mp4',
  '.mp4': 'audio/mp4',
  '.aac': 'audio/aac',
  '.ogg': 'audio/ogg',
  '.oga': 'audio/ogg',
  '.opus': 'audio/ogg',
  '.wav': 'audio/wav',
}

/** What a device's profile says it plays, as playback's `profileFor` gives it. */
export type AudioProfile = { audio: { codec: string; maxChannels: number }[] }

export type MusicDecision = {
  method: 'direct-play' | 'transcode'
  contentType: string
  /** Why it isn't played as it is, a sentence each; empty for a direct play. */
  reasons: string[]
  /** Channels to make, for a transcode. */
  channels: number
}

/** How a track goes to a device: as it is, or as AAC. */
export function decideMusic(
  track: { path: string; codec: string; format: string; channels: number },
  profile: AudioProfile,
): MusicDecision {
  const container = DIRECT_CONTAINERS[extname(track.path).toLowerCase()]
  const support = profile.audio.find((a) => a.codec === track.codec)
  const reasons: string[] = []
  if (!container) reasons.push(`This device doesn’t open ${track.format} files.`)
  if (!support) reasons.push(`This device doesn’t play ${track.format} audio.`)
  else if (track.channels > support.maxChannels)
    reasons.push(`This device plays at most ${support.maxChannels} channels of ${track.format}.`)
  const aac = profile.audio.find((a) => a.codec === 'aac')
  return reasons.length === 0 && container
    ? { method: 'direct-play', contentType: container, reasons, channels: track.channels }
    : {
        method: 'transcode',
        contentType: 'audio/mp4',
        reasons,
        channels: Math.max(1, Math.min(track.channels, aac?.maxChannels ?? 2, 2)),
      }
}

/** Makes `input` into AAC in MP4 at `output`; rejects when ffmpeg fails. */
export type MusicTranscoder = (input: string, output: string, channels: number) => Promise<void>

export const ffmpegMusicTranscoder =
  (ffmpeg: string, timeoutMs = 10 * MINUTE): MusicTranscoder =>
  (input, output, channels) =>
    new Promise((resolve, reject) => {
      if (!isAbsolute(input) || !isAbsolute(output)) {
        reject(new Error('Only full paths are read and written.'))
        return
      }
      execFile(
        ffmpeg,
        // biome-ignore format: ffmpeg's options read best in their pairs
        ['-v', 'error', '-nostdin', '-y', '-i', input, '-map', '0:a:0', '-vn',
          '-c:a', 'aac', '-b:a', channels > 2 ? '384k' : '256k', '-ac', String(channels),
          '-movflags', '+faststart', '-f', 'mp4', output],
        { timeout: timeoutMs, windowsHide: true },
        (error) => (error ? reject(error) : resolve()),
      )
    })

type Who = { userId: string; profileId: string; deviceId: string | null }

type Play = {
  id: string
  token: string
  userId: string
  profileId: string
  profileName: string | null
  deviceId: string | null
  deviceName: string
  client: StreamSession['client']
  address: string
  away: boolean
  trackId: string
  albumId: string
  artistId: string
  title: string
  artistName: string
  albumTitle: string
  year: number | null
  version: string
  sent: string
  kbps: number
  duration: number
  decision: MusicDecision
  /** The file the address reads: the track's own, or the AAC made from it. */
  file: string
  ready: Promise<void>
  position: number
  furthest: number
  paused: boolean
  startedAt: number
  heardAt: number
}

const formatBytes = (n: number) =>
  n >= 1024 ** 3
    ? `${(n / 1024 ** 3).toFixed(1)} GB`
    : n >= 1024 ** 2
      ? `${(n / 1024 ** 2).toFixed(1)} MB`
      : `${Math.max(1, Math.round(n / 1024))} KB`

/** "FLAC · 24-bit · 96 kHz · 112.4 MB", as the history's version column reads. */
export function musicVersion(t: {
  format: string
  bitDepth: number | null
  sampleRate: number
  bitrate: number
  size: number
}) {
  return [
    t.format,
    t.bitDepth ? `${t.bitDepth}-bit` : t.bitrate ? `${t.bitrate} kbps` : null,
    t.sampleRate ? `${Number((t.sampleRate / 1000).toFixed(1))} kHz` : null,
    formatBytes(t.size),
  ]
    .filter(Boolean)
    .join(' · ')
}

export function createMusicPlayback(
  ctx: MusicDeps,
  opts: {
    /** Where AAC made from tracks is kept (the data folder's `transcodes-music`). */
    dir: string
    transcode?: MusicTranscoder
    /** The device's profile (playback's `profileFor`); throws for a profile id that isn't one. */
    profileFor: (deviceId: string | null, named?: string) => AudioProfile
    away: (address: string) => boolean
    displayName: (userId: string) => string | null
    profileName: (profileId: string) => string | null
    device: (deviceId: string) => { name: string; client: StreamSession['client'] } | null
    /** Whether the person may still play music (their libraries), and their device is there. */
    allowed: (userId: string, deviceId: string | null) => boolean
  },
) {
  const { db, clock, events } = ctx
  const log = ctx.logger.child('music-playback')
  const plays = new Map<string, Play>()
  const stopped = new Map<string, { view: StreamSession; until: number }>()
  const notices = new Map<string, { userId: string; by: string; message: string | null }>()
  const making = new Map<string, Promise<void>>()

  const announce = () => events.emit({ topic: SESSIONS_TOPICS.updated })

  /** The AAC for a track, made once and kept by its path, size and time. */
  function made(track: { path: string; size: number; mtime: number }, channels: number) {
    const key = createHash('sha256')
      .update(`${track.path}\0${track.size}\0${track.mtime}\0${channels}`)
      .digest('hex')
      .slice(0, 24)
    const file = join(opts.dir, `${key}.m4a`)
    let ready = making.get(file)
    if (!ready) {
      ready = (async () => {
        const st = await fsp.stat(file).catch(() => null)
        if (st?.isFile() && st.size > 0) {
          const now = new Date(clock.now())
          await fsp.utimes(file, now, now).catch(() => undefined)
          return
        }
        if (!opts.transcode)
          throw new AppError(
            'unavailable',
            'ffmpeg isn’t installed, so this song can’t be made playable here.',
            {
              reason: 'no-ffmpeg',
            },
          )
        await fsp.mkdir(opts.dir, { recursive: true })
        const temp = `${file}.${newId('tmp')}.m4a`
        try {
          await opts.transcode(track.path, temp, channels)
          await fsp.rename(temp, file)
        } catch (e) {
          await fsp.rm(temp, { force: true })
          // ffmpeg not there at all: Node's spawn fails with ENOENT
          // (https://nodejs.org/api/child_process.html#event-error), which the player says as
          // "no ffmpeg" rather than a file it couldn't read (HT-108)
          if ((e as NodeJS.ErrnoException).code === 'ENOENT')
            throw new AppError(
              'unavailable',
              'ffmpeg isn’t installed, so this song can’t be made playable here.',
              { reason: 'no-ffmpeg' },
            )
          log.warn('couldn’t make a song playable', {
            path: track.path,
            error: (e as Error).message,
          })
          throw new AppError('unavailable', 'This song couldn’t be made playable here.', {
            reason: 'transcode-failed',
          })
        }
      })().finally(() => making.delete(file))
      // a failure is the stream request's to report; nothing waits on it otherwise
      ready.catch(() => undefined)
      making.set(file, ready)
    }
    return { file, ready }
  }

  function play(
    who: Who,
    trackId: string,
    request: { profile?: string },
    meta: { address: string },
  ): MusicPlay {
    sweep()
    const row = db
      .select({ track: musicTracks, album: musicAlbums, artist: musicArtists })
      .from(musicTracks)
      .innerJoin(musicAlbums, eq(musicAlbums.id, musicTracks.albumId))
      .innerJoin(musicArtists, eq(musicArtists.id, musicAlbums.artistId))
      .where(eq(musicTracks.id, trackId))
      .get()
    if (!row) throw new AppError('not-found', 'That song isn’t here.')
    const { track, album, artist } = row
    const profile = opts.profileFor(who.deviceId, request.profile)
    const decision = decideMusic(track, profile)
    const out =
      decision.method === 'direct-play'
        ? { file: track.path, ready: Promise.resolve() }
        : made(track, decision.channels)
    const device = who.deviceId ? opts.device(who.deviceId) : null
    const now = clock.now()
    const p: Play = {
      id: newId('mp'),
      token: randomBytes(24).toString('base64url'),
      userId: who.userId,
      profileId: who.profileId,
      profileName: opts.profileName(who.profileId),
      deviceId: who.deviceId,
      deviceName: device?.name ?? 'A browser',
      client: device?.client ?? 'web',
      address: meta.address,
      away: opts.away(meta.address),
      trackId: track.id,
      albumId: album.id,
      artistId: artist.id,
      title: track.title,
      artistName: track.artist ?? artist.name,
      albumTitle: album.title,
      year: album.year,
      version: musicVersion(track),
      sent:
        decision.method === 'direct-play'
          ? track.format
          : `AAC ${decision.channels === 1 ? '1.0' : decision.channels === 2 ? '2.0' : `${decision.channels}ch`}`,
      kbps: decision.method === 'direct-play' ? track.bitrate : decision.channels > 2 ? 384 : 256,
      duration: track.duration,
      decision,
      file: out.file,
      ready: out.ready,
      position: 0,
      furthest: 0,
      paused: false,
      startedAt: now,
      heardAt: now,
    }
    plays.set(p.id, p)
    log.info('a song started', {
      play: p.id,
      track: track.id,
      method: decision.method,
      device: p.deviceName,
    })
    announce()
    return {
      id: p.id,
      url: `/stream/music/${p.token}`,
      method: decision.method,
      contentType: decision.contentType,
      reasons: decision.reasons,
      duration: track.duration,
      expiresAt: new Date(now + MUSIC_TOKEN_MS).toISOString(),
    }
  }

  function mine(who: Who, id: string) {
    const p = plays.get(id)
    if (!p || p.userId !== who.userId) {
      const notice = notices.get(id)
      if (notice && notice.userId === who.userId)
        throw new AppError('not-found', 'Someone stopped this.', {
          reason: 'stopped',
          by: notice.by,
          message: notice.message,
        })
      throw new AppError('not-found', 'That play has ended.')
    }
    return p
  }

  function progress(who: Who, id: string, report: { position: number; paused: boolean }) {
    sweep()
    const p = mine(who, id)
    const position = Math.min(report.position, p.duration || report.position)
    const changed = p.paused !== report.paused
    p.position = position
    p.furthest = Math.max(p.furthest, position)
    p.paused = report.paused
    p.heardAt = clock.now()
    if (changed) announce()
  }

  /** Ends a play and keeps it in the history; nothing heard keeps nothing. */
  function end(p: Play) {
    plays.delete(p.id)
    const played = Math.round(p.furthest)
    if (played <= 0) return
    try {
      db.insert(musicPlays)
        .values({
          id: newId('mpl'),
          userId: p.userId,
          profileId: p.profileId,
          profileName: p.profileName,
          trackId: p.trackId,
          albumId: p.albumId,
          artistId: p.artistId,
          title: p.title,
          artistName: p.artistName,
          albumTitle: p.albumTitle,
          year: p.year,
          deviceName: p.deviceName,
          client: p.client,
          version: p.version,
          method: p.decision.method,
          away: p.away,
          played,
          finished: played >= Math.min(p.duration / 2, 240),
          startedAt: p.startedAt,
          endedAt: clock.now(),
        })
        .run()
      ctx.events.emit({ topic: 'music.updated', ids: [p.trackId] })
    } catch (e) {
      // the track or the person went in the meantime: the history has nothing to point at
      log.debug('a song’s play wasn’t kept', { play: p.id, error: (e as Error).message })
    }
  }

  function stop(who: Who, id: string) {
    const p = mine(who, id)
    end(p)
    announce()
  }

  /** Now playing's Stop: the player's next report hears who stopped it and why. */
  function stopFor(id: string, by: { name: string }, message: string) {
    const p = plays.get(id)
    if (!p) return false
    notices.set(id, { userId: p.userId, by: by.name, message: message || null })
    stopped.set(id, {
      view: {
        ...view(p),
        stopped: { by: by.name, message: message || null, at: new Date(clock.now()).toISOString() },
      },
      until: clock.now() + STOPPED_LINGER_MS,
    })
    end(p)
    events.emit({ topic: SESSIONS_TOPICS.stopped, ids: [id], to: [p.userId] })
    announce()
    return true
  }

  /** Ends the plays left without a report, and those whose person or device can't play now. */
  function sweep() {
    const now = clock.now()
    let any = false
    for (const p of [...plays.values()])
      if (now - p.heardAt > MUSIC_IDLE_MS || !opts.allowed(p.userId, p.deviceId)) {
        end(p)
        any = true
      }
    for (const [id, s] of stopped) if (s.until <= now) stopped.delete(id)
    if (any) announce()
  }

  /** The file a `/stream/music/{token}` request reads, once it's ready; null for no such play. */
  async function open(token: string): Promise<{ path: string; contentType: string } | null> {
    sweep()
    const given = Buffer.from(token)
    let found: Play | null = null
    for (const p of plays.values()) {
      const want = Buffer.from(p.token)
      if (want.length === given.length && timingSafeEqual(want, given)) found = p
    }
    if (!found || clock.now() - found.heardAt > MUSIC_TOKEN_MS) return null
    await found.ready
    return { path: found.file, contentType: found.decision.contentType }
  }

  function view(p: Play): StreamSession {
    return {
      id: p.id,
      user: {
        id: p.userId,
        displayName: opts.displayName(p.userId) ?? 'Someone',
        profile: p.profileName,
      },
      deviceName: p.deviceName,
      client: p.client,
      item: {
        tmdbId: null,
        title: p.title,
        year: p.year,
        poster: albumCover(p.albumId),
        song: {
          artist: { id: p.artistId, name: p.artistName },
          album: { id: p.albumId, title: p.albumTitle },
        },
      },
      version: p.version,
      kind: 'stream',
      state: p.paused ? 'paused' : 'playing',
      position: p.position,
      runtime: p.duration || null,
      method: p.decision.method,
      reasons: p.decision.reasons,
      sent: p.sent,
      mbps: Math.round(p.kbps / 100) / 10,
      network: p.away ? 'remote' : 'lan',
      address: p.address,
      hardware: null,
      speed: null,
      startedAt: new Date(p.startedAt).toISOString(),
      stopped: null,
    }
  }

  /** The live plays and the just-stopped ones, for Now playing. */
  function sessions(): StreamSession[] {
    sweep()
    return [...[...plays.values()].map(view), ...[...stopped.values()].map((s) => s.view)]
  }

  /** The last 30 days' plays, newest first, as Now playing's history reads them. */
  function history(userId?: string): WatchRecord[] {
    const since = clock.now() - KEEP_MS
    return db
      .select()
      .from(musicPlays)
      .where(
        userId
          ? and(eq(musicPlays.userId, userId), gte(musicPlays.endedAt, since))
          : gte(musicPlays.endedAt, since),
      )
      .orderBy(desc(musicPlays.endedAt))
      .limit(500)
      .all()
      .map((r) => ({
        id: r.id,
        user: {
          id: r.userId,
          displayName: opts.displayName(r.userId) ?? 'Someone',
          profile: r.profileName,
        },
        deviceName: r.deviceName,
        client: r.client,
        item: {
          tmdbId: null,
          title: r.title,
          year: r.year,
          poster: r.albumId ? albumCover(r.albumId) : null,
          ...(r.albumId && r.artistId
            ? {
                song: {
                  artist: { id: r.artistId, name: r.artistName },
                  album: { id: r.albumId, title: r.albumTitle },
                },
              }
            : {}),
        },
        version: r.version,
        method: r.method,
        network: r.away ? ('remote' as const) : ('lan' as const),
        startedAt: new Date(r.startedAt).toISOString(),
        endedAt: new Date(r.endedAt).toISOString(),
        watched: r.played,
        finished: r.finished,
      }))
  }

  /** Removes plays older than 30 days, as films' history is pruned. */
  function prune(): number {
    return db
      .delete(musicPlays)
      .where(lt(musicPlays.endedAt, clock.now() - KEEP_MS))
      .returning({ id: musicPlays.id })
      .all().length
  }

  /** Empties the made-AAC folder: at start, and of files unused for a day as plays go on. */
  async function clean({ all = false } = {}) {
    const names = await fsp.readdir(opts.dir).catch(() => [] as string[])
    const now = clock.now()
    const inUse = new Set([...plays.values()].map((p) => p.file))
    for (const name of names) {
      const path = join(opts.dir, name)
      if (inUse.has(path)) continue
      const st = await fsp.stat(path).catch(() => null)
      if (!st) continue
      if (all || now - st.mtimeMs > MUSIC_TRANSCODE_KEEP_MS) await fsp.rm(path, { force: true })
    }
  }

  return { play, progress, stop, stopFor, open, sessions, history, prune, sweep, clean }
}

export type MusicPlayback = ReturnType<typeof createMusicPlayback>
