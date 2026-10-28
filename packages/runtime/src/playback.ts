// SPDX-License-Identifier: AGPL-3.0-only
// Playback (checkpoint 4.1a, ADR 0051 and 0052): the runtime joins the movie library, the device's
// profile and `@highsea-tv/stream`'s decision into a play session, and answers `/stream` for it.
//
// - A device's profile is the built-in one it names, with its latest report laid over it
//   (`device_profiles`).
// - At home, streams are never limited; away, the remote ceiling applies (playback-settings.md). Home
//   is a private address (RFC 1918, RFC 4193 and loopback, `PRIVATE_RANGES`), as the client's
//   address is resolved through trusted proxies. Until Settings › Playback (4.3), the ceiling is
//   its default, 8 Mbps at 1080p.
// - A library the person can't see answers 404, as the reads do, and taking it away, or signing
//   the device out, ends their sessions at once (`users.updated`).
import type {
  PlaybackDecision as ApiDecision,
  PlaySession as ApiSession,
  DeviceReport,
  PlayRequest,
} from '@highsea-tv/api-contract'
import { AppError, type Clock, type EventBus, type Logger } from '@highsea-tv/core'
import { type Db, schema } from '@highsea-tv/db'
import type { Movies } from '@highsea-tv/media/movies'
import { trackIndex } from '@highsea-tv/media/shared'
import { PRIVATE_RANGES, parseTrustedProxies } from '@highsea-tv/network'
import {
  type Ceiling,
  decide,
  type PlaybackDecision,
  type SubtitlePick,
} from '@highsea-tv/stream/decision'
import {
  builtIn,
  type DeviceProfile,
  ReportedProfile,
  withReport,
} from '@highsea-tv/stream/profiles'
import { createSessions, type PlaySession } from '@highsea-tv/stream/sessions'
import { and, eq } from 'drizzle-orm'

const { deviceProfiles, subtitleFiles } = schema

/** Settings › Playback's default remote ceiling (playback-settings.md), until 4.3 makes it a setting. */
export const REMOTE_CEILING: Ceiling = { bitrate: 8_000_000, height: 1080 }
/** The profile for a device that names none and never reported one. */
const DEFAULT_PROFILE = 'web-chromium'
const SWEEP_MS = 60_000

/** The MIME types of the containers a browser plays as they are (RFC 6381; MDN's container guide). */
const TYPES: Record<string, string> = {
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  webm: 'video/webm',
  mkv: 'video/x-matroska',
  mpegts: 'video/mp2t',
  ogg: 'video/ogg',
  avi: 'video/x-msvideo',
}

export type Viewer = {
  userId: string
  deviceId: string | null
  libraries: 'all' | string[]
}

const seesMovies = (libraries: 'all' | string[]) =>
  libraries === 'all' || libraries.includes('movies')

const notHere = () => new AppError('not-found', 'That movie isn’t in the library.')
const noSession = () => new AppError('not-found', 'That play session has ended.')

export function createPlayback(deps: {
  db: Db
  clock: Clock
  events: EventBus
  logger: Logger
  movies: Movies
  /** The person's libraries now, or null when they're gone. */
  librariesOf(userId: string): 'all' | string[] | null
  /** Whether the device is still signed in. */
  deviceExists(deviceId: string): boolean
}) {
  const { db, clock, events, movies } = deps
  const log = deps.logger.child('playback')
  const home = parseTrustedProxies(PRIVATE_RANGES.join(',')).trusted
  const sessions = createSessions({
    now: () => clock.now(),
    onEnd: (s, why) => log.debug('play session ended', { session: s.id, why }),
  })

  // whoever's access changed: their sessions end if the library or the device is gone
  const unsubscribe = events.subscribe((event) => {
    if (event.topic !== 'users.updated') return
    for (const userId of event.ids ?? [...new Set(sessions.list().map((s) => s.userId))]) {
      const libraries = deps.librariesOf(userId)
      sessions.revoke(
        userId,
        (s) =>
          !!libraries &&
          seesMovies(libraries) &&
          (s.deviceId === null || deps.deviceExists(s.deviceId)),
      )
    }
  })
  const timer = setInterval(() => sessions.sweep(), SWEEP_MS)
  timer.unref?.()

  /** The device's profile: the built-in one it names (or reported from), with its report over it. */
  function profileFor(deviceId: string | null, named?: string): DeviceProfile {
    const stored = deviceId
      ? db.select().from(deviceProfiles).where(eq(deviceProfiles.deviceId, deviceId)).get()
      : undefined
    const id = named ?? stored?.base ?? DEFAULT_PROFILE
    const base = builtIn(id)
    if (!base)
      throw new AppError('invalid', `There’s no device profile called ${id}.`, {
        field: 'profile',
      })
    if (!stored || stored.base !== id) return base
    const report = ReportedProfile.safeParse(stored.report)
    return report.success ? withReport(base, report.data) : base
  }

  /** Keeps a device's report, laid over the built-in profile it names. */
  function report(deviceId: string | null, input: DeviceReport) {
    if (!deviceId)
      throw new AppError('conflict', 'Only a signed-in device can report what it plays.', {
        reason: 'no-device',
      })
    if (!builtIn(input.base))
      throw new AppError('invalid', `There’s no device profile called ${input.base}.`, {
        field: 'base',
      })
    const { base, ...rest } = input
    const parsed = ReportedProfile.safeParse(rest)
    if (!parsed.success)
      throw new AppError('invalid', 'That report isn’t a device profile.', {
        reason: parsed.error.issues[0]?.message,
      })
    const now = clock.now()
    db.insert(deviceProfiles)
      .values({ deviceId, base, report: parsed.data, reportedAt: now })
      .onConflictDoUpdate({
        target: deviceProfiles.deviceId,
        set: { base, report: parsed.data, reportedAt: now },
      })
      .run()
  }

  /** A subtitle track id as the decision takes it: the file's own stream, or a sidecar of it. */
  function subtitlePick(fileId: string, id: string | null): SubtitlePick | null {
    if (!id) return null
    const index = trackIndex(fileId, id)
    if (index !== null) return { kind: 'embedded', index }
    const row = db
      .select({ id: subtitleFiles.id, format: subtitleFiles.format })
      .from(subtitleFiles)
      .where(and(eq(subtitleFiles.id, id), eq(subtitleFiles.mediaFileId, fileId)))
      .get()
    if (!row)
      throw new AppError('invalid', 'That subtitle track isn’t this version’s.', {
        field: 'subtitleId',
      })
    return { kind: 'sidecar', id: row.id, format: row.format }
  }

  /** The decision in the API's shape: tracks by their ids rather than stream indexes. */
  function toApi(d: PlaybackDecision, fileId: string, subtitleId: string | null): ApiDecision {
    return {
      method: d.method,
      container: d.container,
      video: d.video,
      audio: d.audio
        ? {
            id: `${fileId}:${d.audio.index}`,
            action: d.audio.action,
            codec: d.audio.action === 'transcode' ? d.audio.codec : null,
            channels: d.audio.action === 'transcode' ? d.audio.channels : null,
          }
        : null,
      subtitle: d.subtitle && subtitleId ? { id: subtitleId, delivery: d.subtitle.delivery } : null,
      bitrate: d.bitrate,
      reasons: d.reasons,
    }
  }

  const toApiSession = (s: PlaySession, decision: ApiDecision, start: number): ApiSession => ({
    id: s.id,
    decision,
    url: s.decision.method === 'direct-play' ? `/stream/files/${sessions.token(s)}` : null,
    start,
    duration: s.duration,
    expiresAt: new Date(s.expiresAt).toISOString(),
  })

  /** Starts a title on a device: the version, the picks, the decision and the session. */
  function play(
    viewer: Viewer,
    tmdbId: number,
    request: PlayRequest,
    { address, locale }: { address: string; locale?: string },
  ): ApiSession {
    if (!seesMovies(viewer.libraries)) throw notHere()
    const src = movies.playback.source(tmdbId, viewer.userId, request.versionId)
    const info = src.file.info
    if (!info)
      throw new AppError('conflict', 'That file hasn’t been read yet. Try again in a minute.', {
        reason: 'no-probe',
      })
    const prefs = movies.playback.prefs(viewer.userId, tmdbId)
    // a pick is the version's only when it names this file's track
    const audioId = request.audioId !== undefined ? request.audioId : prefs.audioId
    const audio = audioId ? trackIndex(src.file.id, audioId) : null
    if (request.audioId && audio === null)
      throw new AppError('invalid', 'That sound track isn’t this version’s.', { field: 'audioId' })
    const asked = request.subtitleId !== undefined ? request.subtitleId : prefs.subtitleId
    let subtitleId = asked
    let subtitle: SubtitlePick | null
    try {
      subtitle = subtitlePick(src.file.id, asked)
    } catch (e) {
      // a remembered pick from another version is dropped; one asked for now is an error
      if (request.subtitleId !== undefined) throw e
      subtitle = null
      subtitleId = null
    }
    const profile = profileFor(viewer.deviceId, request.profile)
    const decision = decide({
      file: { path: src.file.path, size: src.file.size, info },
      profile,
      audio,
      subtitle,
      ceiling: home.has(address) ? null : REMOTE_CEILING,
      server: { burnIn: false, toneMapping: false },
      locale,
    })
    const resume = movies.client.byIds([tmdbId], viewer.userId)[0]?.position ?? 0
    const start = request.start ?? resume
    const session = sessions.start({
      userId: viewer.userId,
      deviceId: viewer.deviceId,
      itemId: src.item.id,
      tmdbId,
      title: src.item.title,
      versionId: src.versionId,
      file: { id: src.file.id, path: src.file.path, size: src.file.size },
      decision,
      position: start,
      duration: src.duration,
    })
    log.info('play session started', {
      session: session.id,
      tmdbId,
      method: decision.method,
      profile: profile.id,
    })
    return toApiSession(session, toApi(decision, src.file.id, subtitleId), start)
  }

  /** A report from the player: saves the place every few seconds, and renews the URL. */
  function progress(userId: string, id: string, report: { position: number; paused: boolean }) {
    const s = sessions.get(id, userId)
    if (!s) throw noSession()
    const { save } = sessions.heard(s, report)
    const watched = save
      ? movies.playback.position(userId, s.tmdbId, report.position, s.duration).watched
      : false
    return { watched, expiresAt: new Date(s.expiresAt).toISOString() }
  }

  /** Leaving the player: saves the place last reported, then ends the session and its URL. */
  function stop(userId: string, id: string) {
    const s = sessions.get(id, userId)
    if (!s) throw noSession()
    if (s.heardAt > s.startedAt && s.savedAt < s.heardAt)
      movies.playback.position(userId, s.tmdbId, s.position, s.duration)
    sessions.end(id)
  }

  /**
   * The file a `/stream/files/{token}` request may read, or null. The token must be this server's,
   * its session live, and the person still able to see the library from a signed-in device.
   */
  function open(token: string): { path: string; size: number; type: string } | null {
    const s = sessions.verify(token)
    if (!s) return null
    const libraries = deps.librariesOf(s.userId)
    if (!libraries || !seesMovies(libraries) || (s.deviceId && !deps.deviceExists(s.deviceId))) {
      sessions.end(s.id, 'revoked')
      return null
    }
    return {
      path: s.file.path,
      size: s.file.size,
      type: TYPES[s.decision.container ?? ''] ?? 'application/octet-stream',
    }
  }

  return {
    play,
    progress,
    stop,
    report,
    profileFor,
    open,
    /** The live sessions, for Now playing (4.3) and the test page. */
    sessions: () => sessions.list(),
    close() {
      clearInterval(timer)
      unsubscribe()
    },
  }
}

export type Playback = ReturnType<typeof createPlayback>
