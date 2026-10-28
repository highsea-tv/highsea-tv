// SPDX-License-Identifier: AGPL-3.0-only
// Playback (checkpoint 4.1a, ADR 0051 and 0052): the runtime joins the movie library, the device's
// profile and `@highsea-tv/stream`'s decision into a play session, and answers `/stream` for it.
//
// - A device's profile is the built-in one it names, with its latest report laid over it
//   (`device_profiles`).
// - At home, streams are never limited; away, Settings › Playback's remote ceiling applies
//   (playback-settings.md). Home is a private address (RFC 1918, RFC 4193 and loopback,
//   `PRIVATE_RANGES`), as the client's address is resolved through trusted proxies.
// - A library the person can't see answers 404, as the reads do, and taking it away, or signing
//   the device out, ends their sessions at once (`users.updated`).
// - A direct stream or a transcode is HLS made on demand (4.1b, ADR 0051): each session has a
//   folder in the data folder's `transcodes/`, which goes when the session ends. A direct stream's
//   segments follow the file's keyframes, read once by ffprobe and kept (`file_keyframes`).
// - Text subtitles are sent as WebVTT, converted once a session; picture subtitles aren't sent.
// - Now playing (4.3a) hears each session start, report and end through `hooks`, and staff stop a
//   session with `stopFor`: its player's next report gets a 404 saying who stopped it and why,
//   and the person hears `playback.stopped` so it asks at once.
import type {
  PlaybackDecision as ApiDecision,
  PlaySession as ApiSession,
  ClientSubtitle,
  DeviceReport,
  PlayRequest,
} from '@highsea-tv/api-contract'
import { SESSIONS_TOPICS } from '@highsea-tv/api-contract'
import { AppError, type Clock, type EventBus, type Logger } from '@highsea-tv/core'
import { type Db, schema } from '@highsea-tv/db'
import type { Movies } from '@highsea-tv/media/movies'
import { type MediaInfo, trackIndex } from '@highsea-tv/media/shared'
import { PRIVATE_RANGES, parseTrustedProxies } from '@highsea-tv/network'
import {
  type Ceiling,
  type DecisionInput,
  decide,
  isTextSubtitle,
  type PlaybackDecision,
  type SubtitlePick,
  type SubtitlePlan,
} from '@highsea-tv/stream/decision'
import {
  type HlsSource,
  mediaPlaylist,
  multivariantPlaylist,
  readKeyframes,
  type SubtitleRendition,
  scaledSize,
  subtitlePlaylist,
  type Transcode,
  type Transcodes,
  transcodeCodecs,
} from '@highsea-tv/stream/hls'
import {
  builtIn,
  type DeviceProfile,
  ReportedProfile,
  withReport,
} from '@highsea-tv/stream/profiles'
import { createSessions, type EndReason, type PlaySession } from '@highsea-tv/stream/sessions'
import type { TrickplayManifest } from '@highsea-tv/stream/trickplay'
import { and, eq } from 'drizzle-orm'
import type { NowPlayingService } from './now-playing.ts'
import type { Trickplay } from './trickplay.ts'

const { deviceProfiles, fileKeyframes, subtitleFiles } = schema

/** The profile for a device that names none and never reported one. */
const DEFAULT_PROFILE = 'web-chromium'
const SWEEP_MS = 60_000
/** How long a stopped session's player can still learn who stopped it. */
const NOTICE_MS = 10 * 60_000

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
  /** The sessions' folders and their ffmpeg runs (`@highsea-tv/stream/hls`). */
  transcodes: Transcodes
  /** Settings › Playback's remote ceiling, or null for none (4.3a). */
  ceiling(): Ceiling | null
  /** ffprobe's binary, for keyframes. */
  ffprobe: string
  /** A file's subtitle tracks, as the client API lists them. */
  subtitles(fileId: string): ClientSubtitle[]
  /** The scrubber's previews, by file. */
  trickplay: Pick<Trickplay, 'manifest' | 'sheet'>
  /** Now playing (4.3a): hears sessions start, move and end. */
  hooks?: NowPlayingService['hooks']
}) {
  const { db, clock, events, movies, transcodes } = deps
  const log = deps.logger.child('playback')
  const home = parseTrustedProxies(PRIVATE_RANGES.join(',')).trusted
  /** Sessions staff stopped: who and why, for the player's next report. */
  const notices = new Map<
    string,
    { userId: string; by: string; message: string | null; at: number }
  >()
  const sessions = createSessions({
    now: () => clock.now(),
    onEnd: (s, why: EndReason) => {
      log.debug('play session ended', { session: s.id, why })
      void transcodes.end(s.id)
      const notice = notices.get(s.id)
      deps.hooks?.ended(s, why, notice && { name: notice.by, message: notice.message })
    },
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
  const timer = setInterval(() => {
    sessions.sweep()
    transcodes.sweep()
    const t = clock.now()
    for (const [id, n] of notices) if (t - n.at >= NOTICE_MS) notices.delete(id)
  }, SWEEP_MS)
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

  /** What a run burns in (4.3): the film's picture track, or ASS from the film or a sidecar. */
  function burnInOf(
    file: { path: string },
    info: MediaInfo,
    d: PlaybackDecision,
  ): HlsSource['burnIn'] {
    const pick = d.subtitle?.delivery === 'burn-in' ? d.subtitle.pick : null
    if (!pick) return null
    if (pick.kind === 'sidecar') {
      const row = db
        .select({ path: subtitleFiles.path })
        .from(subtitleFiles)
        .where(eq(subtitleFiles.id, pick.id))
        .get()
      return row ? { kind: 'text', input: row.path, index: null } : null
    }
    const codec = info.subtitles.find((s) => s.index === pick.index)?.codec
    return isTextSubtitle(codec ?? '')
      ? { kind: 'text', input: file.path, index: pick.index }
      : { kind: 'picture', index: pick.index }
  }

  type SubtitleDelivery = SubtitlePlan['delivery']

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

  const isHls = (d: PlaybackDecision) => d.method === 'direct-stream' || d.method === 'transcode'

  /** What the player loads: the file, or the multivariant playlist; the token is the session's. */
  function urlOf(s: PlaySession): string | null {
    if (s.decision.method === 'direct-play') return `/stream/files/${sessions.token(s)}`
    return isHls(s.decision) ? `/stream/hls/${sessions.token(s)}/main.m3u8` : null
  }

  const toApiSession = (
    s: PlaySession,
    decision: ApiDecision,
    start: number,
    delivery: (trackId: string) => SubtitleDelivery,
  ): ApiSession => ({
    id: s.id,
    decision,
    url: urlOf(s),
    subtitles: deps.subtitles(s.file.id).map((t) => ({
      id: t.id,
      url: isTextSubtitle(t.format)
        ? `/stream/subtitles/${sessions.token(s)}/${encodeURIComponent(t.id)}.vtt`
        : null,
      delivery: delivery(t.id),
    })),
    start,
    duration: s.duration,
    expiresAt: new Date(s.expiresAt).toISOString(),
  })

  /** Keyframes being read now, so two sessions of a file read it once. */
  const reading = new Map<string, Promise<number[]>>()

  /** A file's keyframes: kept from an earlier read when the file's size is the same, else read. */
  function keyframes(file: { id: string; path: string; size: number }, index: number) {
    const kept = db.select().from(fileKeyframes).where(eq(fileKeyframes.fileId, file.id)).get()
    if (kept && kept.size === file.size) return Promise.resolve(kept.times)
    const pending = reading.get(file.id)
    if (pending) return pending
    const read = readKeyframes(deps.ffprobe, file.path, index)
      .then((times) => {
        const row = { size: file.size, times, readAt: clock.now() }
        try {
          db.insert(fileKeyframes)
            .values({ fileId: file.id, ...row })
            .onConflictDoUpdate({ target: fileKeyframes.fileId, set: row })
            .run()
        } catch {
          // the file left the library while it was read: nothing to keep
        }
        return times
      })
      .finally(() => reading.delete(file.id))
    reading.set(file.id, read)
    return read
  }

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
    const input: DecisionInput = {
      file: { path: src.file.path, size: src.file.size, info },
      profile,
      audio,
      subtitle,
      ceiling: home.has(address) ? null : deps.ceiling(),
      server: { burnIn: true, toneMapping: false },
      locale,
    }
    const decision = decide(input)
    if (isHls(decision) && !src.duration)
      throw new AppError('conflict', 'That file’s length isn’t known, so it can’t be streamed.', {
        reason: 'no-duration',
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
      address,
      away: !home.has(address),
    })
    deps.hooks?.started(session, { info, year: src.item.year })
    // the session's folder; a stream's first run starts now, where the player will
    const video = info.video
    const sound = info.audio.find((a) => a.index === decision.audio?.index)
    const source: HlsSource = {
      input: src.file.path,
      duration: src.duration ?? 0,
      decision,
      video: video
        ? { index: video.index, codec: video.codec, width: video.width, height: video.height }
        : null,
      start,
      keyframes: () => (video ? keyframes(src.file, video.index) : Promise.resolve([])),
      audio: sound ? { channels: sound.channels, layout: sound.layout } : null,
      burnIn: burnInOf(src.file, info, decision),
    }
    const transcode = transcodes.open(session.id, source)
    if (isHls(decision)) transcode.prepare()
    log.info('play session started', {
      session: session.id,
      tmdbId,
      method: decision.method,
      profile: profile.id,
    })
    // how each track would be sent on this device, so the player knows which start a new stream:
    // the decision's own, made with that track picked
    const delivery = (trackId: string): SubtitleDelivery => {
      if (trackId === subtitleId && decision.subtitle) return decision.subtitle.delivery
      const pick = subtitlePick(src.file.id, trackId)
      return decide({ ...input, subtitle: pick }).subtitle?.delivery ?? 'unavailable'
    }
    return toApiSession(session, toApi(decision, src.file.id, subtitleId), start, delivery)
  }

  /** A report from the player: saves the place every few seconds, and renews the URL. */
  function progress(userId: string, id: string, report: { position: number; paused: boolean }) {
    const s = sessions.get(id, userId)
    if (!s) throw ended(userId, id)
    const was = s.paused
    const { save } = sessions.heard(s, report)
    const watched = save
      ? movies.playback.position(userId, s.tmdbId, report.position, s.duration).watched
      : false
    if (watched) s.finished = true
    deps.hooks?.heard(s.paused, was)
    return { watched, expiresAt: new Date(s.expiresAt).toISOString() }
  }

  /** Leaving the player: saves the place last reported, then ends the session and its URL. */
  function stop(userId: string, id: string) {
    const s = sessions.get(id, userId)
    if (!s) throw ended(userId, id)
    if (s.heardAt > s.startedAt && s.savedAt < s.heardAt)
      movies.playback.position(userId, s.tmdbId, s.position, s.duration)
    sessions.end(id)
  }

  /** A session that's gone: a 404 that says who stopped it, when someone did (`StoppedDetails`). */
  function ended(userId: string, id: string): AppError {
    const n = notices.get(id)
    if (!n || n.userId !== userId) return noSession()
    return new AppError('not-found', `${n.by} stopped this stream.`, {
      reason: 'stopped',
      by: n.by,
      message: n.message,
    })
  }

  /**
   * Now playing's Stop: ends someone's session and its URL at once, keeps who stopped it and why
   * for their player, and tells them over the event stream.
   */
  function stopFor(id: string, by: { name: string }, message: string) {
    const s = sessions.list().find((x) => x.id === id)
    if (!s) throw new AppError('not-found', 'That stream has already ended.')
    notices.set(id, { userId: s.userId, by: by.name, message: message || null, at: clock.now() })
    if (s.heardAt > s.startedAt && s.savedAt < s.heardAt)
      movies.playback.position(s.userId, s.tmdbId, s.position, s.duration)
    sessions.end(id, 'staff')
    events.emit({ topic: SESSIONS_TOPICS.stopped, ids: [id], to: [s.userId] })
    log.info('play session stopped from Now playing', { session: id })
  }

  /**
   * The session a `/stream` request's token names, or null. The token must be this server's, its
   * session live, and the person still able to see the library from a signed-in device.
   */
  function live(token: string): PlaySession | null {
    const s = sessions.verify(token)
    if (!s) return null
    const libraries = deps.librariesOf(s.userId)
    if (!libraries || !seesMovies(libraries) || (s.deviceId && !deps.deviceExists(s.deviceId))) {
      sessions.end(s.id, 'revoked')
      return null
    }
    return s
  }

  /** The file a `/stream/files/{token}` request may read, or null. */
  function open(token: string): { path: string; size: number; type: string } | null {
    const s = live(token)
    if (!s) return null
    return {
      path: s.file.path,
      size: s.file.size,
      type: TYPES[s.decision.container ?? ''] ?? 'application/octet-stream',
    }
  }

  /** A stream's session and its transcode, for `/stream/hls/{token}/…`; null when it's gone. */
  function streamOf(token: string): { s: PlaySession; t: Transcode } | null {
    const s = live(token)
    const t = s && isHls(s.decision) ? transcodes.get(s.id) : null
    return s && t ? { s, t } : null
  }

  /** The text tracks as HLS renditions, each with a name of its own (RFC 8216 § 4.3.4.1.1). */
  function renditions(s: PlaySession): SubtitleRendition[] {
    const seen = new Map<string, number>()
    return deps
      .subtitles(s.file.id)
      .filter((t) => isTextSubtitle(t.format))
      .map((t) => {
        const n = (seen.get(t.label) ?? 0) + 1
        seen.set(t.label, n)
        return {
          name: n > 1 ? `${t.label} (${n})` : t.label,
          language: t.language || null,
          forced: t.forced,
          uri: `subs/${encodeURIComponent(t.id)}.m3u8`,
        }
      })
  }

  /** `main.m3u8`, the one variant and its subtitles, or `video.m3u8`, its segments. */
  async function playlist(token: string, name: 'main' | 'video'): Promise<string | null> {
    const stream = streamOf(token)
    if (!stream) return null
    const { s, t } = stream
    if (name === 'video') return mediaPlaylist(await t.segments())
    const d = s.decision
    const plan = d.video
    const source = t.source.video
    const size =
      plan?.action === 'transcode' && source ? scaledSize(source, plan.height) : (source ?? null)
    const audioBits =
      d.audio?.action === 'transcode' ? (d.audio.channels > 2 ? 384_000 : 160_000) : 0
    // a copy's codecs are the file's, which the player reads from the init; RFC 8216 says SHOULD
    const transcoded = plan?.action === 'transcode' && d.audio?.action !== 'copy'
    return multivariantPlaylist(
      {
        bandwidth: plan?.action === 'transcode' ? plan.bitrate + audioBits : (d.bitrate ?? 0),
        codecs: transcoded && size ? transcodeCodecs(size.height, !!d.audio) : null,
        width: size?.width ?? null,
        height: size?.height ?? null,
        uri: 'video.m3u8',
      },
      renditions(s),
    )
  }

  /** A segment's pieces in order, made if they aren't yet; null when the session's gone. */
  async function segment(token: string, index: number): Promise<string[] | null> {
    const stream = streamOf(token)
    return stream ? stream.t.segment(index) : null
  }

  /** The stream's initialization section. */
  async function init(token: string): Promise<string | null> {
    const stream = streamOf(token)
    return stream ? stream.t.init() : null
  }

  /** Where a session's text track is read from: the film's own stream, or a sidecar. */
  function subtitleInput(s: PlaySession, trackId: string) {
    const track = deps.subtitles(s.file.id).find((t) => t.id === trackId)
    if (!track || !isTextSubtitle(track.format)) return null
    const index = trackIndex(s.file.id, trackId)
    if (index !== null) return { input: s.file.path, index }
    const row = db
      .select({ path: subtitleFiles.path })
      .from(subtitleFiles)
      .where(and(eq(subtitleFiles.id, trackId), eq(subtitleFiles.mediaFileId, s.file.id)))
      .get()
    return row ? { input: row.path, index: null } : null
  }

  /** A text track's rendition playlist: the whole track as one segment. */
  function subtitleList(token: string, trackId: string): string | null {
    const stream = streamOf(token)
    if (!stream || !subtitleInput(stream.s, trackId)) return null
    return subtitlePlaylist(stream.t.source.duration, `${encodeURIComponent(trackId)}.vtt`)
  }

  /** A text track as WebVTT, converted once a session: the file's path, or null. */
  async function subtitle(token: string, trackId: string): Promise<string | null> {
    const s = live(token)
    const from = s && subtitleInput(s, trackId)
    const t = s && transcodes.get(s.id)
    return from && t ? t.subtitle(trackId, from.input, from.index) : null
  }

  /** A version's previews for the scrubber; the manifest is null until they're made. */
  function trickplay(
    viewer: Viewer,
    tmdbId: number,
    versionId?: string,
  ): { versionId: string; manifest: TrickplayManifest | null; fileId: string } {
    if (!seesMovies(viewer.libraries)) throw notHere()
    const src = movies.playback.source(tmdbId, viewer.userId, versionId)
    return {
      versionId: src.versionId,
      fileId: src.file.id,
      manifest: deps.trickplay.manifest(src.file.id, src.file.size),
    }
  }

  /** A sheet of a version's previews: its path, or a 404 when there's no such sheet. */
  function trickplaySheet(viewer: Viewer, tmdbId: number, n: number, versionId?: string): string {
    const { fileId, manifest } = trickplay(viewer, tmdbId, versionId)
    if (!manifest || n >= manifest.sheets)
      throw new AppError('not-found', 'Those previews aren’t made yet.')
    return deps.trickplay.sheet(fileId, n)
  }

  return {
    play,
    trickplay,
    trickplaySheet,
    progress,
    stop,
    stopFor,
    report,
    profileFor,
    open,
    /** Whether an address is away from home: the test that applies the remote ceiling. */
    away: (address: string) => !home.has(address),
    hls: { playlist, segment, init, subtitleList },
    subtitle,
    /** The live sessions, for Now playing (4.3) and the test page. */
    sessions: () => sessions.list(),
    close() {
      clearInterval(timer)
      unsubscribe()
    },
  }
}

export type Playback = ReturnType<typeof createPlayback>
