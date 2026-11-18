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
//   segments follow the file's keyframes, read once by ffprobe and kept (`file_keyframes`), after
//   the import rather than at the first play (`ahead.ts`).
// - The person's own playback preferences (client-settings.md › Playback, ADR 0027's 2026-11-01
//   section) start a film in their audio language and with their subtitles, unless they've picked
//   for that title already, and cap its quality at home and away; the remote ceiling still holds.
// - Text subtitles are sent as WebVTT. A stream's come in segments, in step with the picture
//   (HT-49): the film's own written by the session's runs as they read it, a sidecar converted
//   once a session. A file played as it is has them whole; picture subtitles aren't sent.
// - Where a start's time went is logged, a few lines a play (phase 5, A1's finding of 2026-11-17):
//   the decision with the start position, a file's keyframes when they had to be read, and the
//   first segment a player is served, with how long it waited and how long it took to send. The
//   runner's own lines (ffmpeg's start, its first segment) come through the same source.
// - Now playing (4.3a) hears each session start, report and end through `hooks`, and staff stop a
//   session with `stopFor`: its player's next report gets a 404 saying who stopped it and why,
//   and the person hears `playback.stopped` so it asks at once.

import { readFile } from 'node:fs/promises'
import type {
  PlaybackDecision as ApiDecision,
  PlaySession as ApiSession,
  ClientSubtitle,
  DeviceReport,
  PlayRequest,
} from '@highsea-tv/api-contract'
import { SESSIONS_TOPICS } from '@highsea-tv/api-contract'
import { AppError, type Clock, type EventBus, type Logger } from '@highsea-tv/core'
import { unref } from '@highsea-tv/core/timers'
import { type Db, schema } from '@highsea-tv/db'
import type { Movies } from '@highsea-tv/media/movies'
import { type MediaInfo, trackIndex } from '@highsea-tv/media/shared'
import { PRIVATE_RANGES, parseTrustedProxies } from '@highsea-tv/network'
import { capOf, type Preferences } from '@highsea-tv/personalization/keys'
import {
  type Ceiling,
  type DecisionInput,
  decide,
  isTextSubtitle,
  type PlaybackDecision,
  type SubtitlePick,
  type SubtitlePlan,
} from '@highsea-tv/stream/decision'
import { toneMapOn } from '@highsea-tv/stream/hardware'
import {
  cueBlocks,
  type Hardware,
  type HlsSource,
  mediaPlaylist,
  multivariantPlaylist,
  type SubtitleRendition,
  scaledSize,
  subtitlePlaylist,
  type Transcode,
  type Transcodes,
  transcodeCodecs,
  webvttSegment,
} from '@highsea-tv/stream/hls'
import {
  builtIn,
  type DeviceProfile,
  ReportedProfile,
  withReport,
} from '@highsea-tv/stream/profiles'
import { createSessions, type EndReason, type PlaySession } from '@highsea-tv/stream/sessions'
import type { TrickplayManifest } from '@highsea-tv/stream/trickplay'
import { toLanguageCode } from '@highsea-tv/subtitles/shared'
import { and, eq } from 'drizzle-orm'
import type { Ahead } from './ahead.ts'
import type { NowPlayingService } from './now-playing.ts'
import type { Trickplay } from './trickplay.ts'

const { deviceProfiles, subtitleFiles } = schema

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
  /** The profile watching now on the device (ADR 0068). */
  profileId: string
  deviceId: string | null
  libraries: 'all' | string[]
}

const seesMovies = (libraries: 'all' | string[]) =>
  libraries === 'all' || libraries.includes('movies')

const notHere = () => new AppError('not-found', 'That movie isn’t in the library.')
const noSession = () => new AppError('not-found', 'That play session has ended.')
const NO_HARDWARE: Hardware = { accel: null, toneMapping: false, cpuToneMap: false }

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
  /** The person's preferences on the device, resolved through ADR 0027's layers. */
  preferences?: (userId: string, deviceId: string | null) => Preferences
  /** A file's keyframes and its own text subtitles, read ahead of the first play (`ahead.ts`). */
  ahead: Pick<Ahead, 'keyframes' | 'subtitle'>
  /** A file's subtitle tracks, as the client API lists them. */
  subtitles(fileId: string): ClientSubtitle[]
  /** The scrubber's previews, by file. */
  trickplay: Pick<Trickplay, 'manifest' | 'sheet'>
  /** Now playing (4.3a): hears sessions start, move and end. */
  hooks?: NowPlayingService['hooks']
  /** The path transcodes take and tone mapping (4.3b, ADR 0056); the processor without. */
  hardware?: () => Hardware
}) {
  const { db, clock, events, movies, transcodes } = deps
  const log = deps.logger.child('playback')
  /** Whether a film with this HDR is tone mapped here, as the runner will (`toneMapOn`). */
  const toneMaps = (hdr: string) => {
    const hw = deps.hardware?.() ?? NO_HARDWARE
    return hw.toneMapping && toneMapOn(hdr, hw.accel, hw.cpuToneMap) !== null
  }
  const home = parseTrustedProxies(PRIVATE_RANGES.join(',')).trusted
  /** Sessions staff stopped: who and why, for the player's next report. */
  const notices = new Map<
    string,
    { userId: string; by: string; message: string | null; at: number }
  >()
  /**
   * Each live HLS session's start, and when its playlist was first answered, until its first
   * segment is served: what the "first segment served" line counts from.
   */
  const served = new Map<string, { startedAt: number; playlistAt: number | null }>()
  /**
   * How many segments each live HLS session has been sent whole. One that ends with one or none
   * is a player that gave up (HT-56: a resume Chrome couldn't decode left only "first segment
   * served" behind), so its end is said at warn; every other end stays at debug.
   */
  const segmentsSent = new Map<string, number>()
  const sessions = createSessions({
    now: () => clock.now(),
    onEnd: (s, why: EndReason) => {
      const segments = segmentsSent.get(s.id)
      segmentsSent.delete(s.id)
      if (segments !== undefined && segments <= 1)
        log.warn('play session ended early', { session: s.id, why, segments })
      else log.debug('play session ended', { session: s.id, why })
      served.delete(s.id)
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
  unref(timer)

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

  /** The film's track in a language, the default one first. */
  function audioIn(info: MediaInfo, language: string): number | null {
    const tracks = info.audio.filter((a) => toLanguageCode(a.language) === language)
    return (tracks.find((a) => a.default) ?? tracks[0])?.index ?? null
  }

  /**
   * The person's subtitles for a film they haven't picked for: a full track in their language
   * (forced ones are for foreign lines only), unless they want them only for foreign audio and
   * this is in their language.
   */
  function subtitleFor(
    fileId: string,
    info: MediaInfo,
    audio: number | null,
    mine: Preferences,
  ): string | null {
    const wanted = mine['playback.subtitles']
    if (wanted === 'off') return null
    const heard = info.audio.find((a) => a.index === audio) ?? info.audio.find((a) => a.default)
    const spoken = toLanguageCode((heard ?? info.audio[0])?.language)
    if (mine['playback.onlyForeign'] && spoken === wanted) return null
    const tracks = deps.subtitles(fileId).filter((t) => t.language === wanted && !t.forced)
    return (tracks.find((t) => !t.hi) ?? tracks[0])?.id ?? null
  }

  /** The tighter of two ceilings, each part on its own. */
  function under(a: Ceiling | null, b: Ceiling | null): Ceiling | null {
    if (!a || !b) return a ?? b
    const least = (x: number | null, y: number | null) =>
      x === null ? y : y === null ? x : Math.min(x, y)
    return { bitrate: least(a.bitrate, b.bitrate), height: least(a.height, b.height) }
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
      // a stream's text tracks come in segments, in step with the picture (HT-49); a file played
      // as it is has its tracks whole
      url: !isTextSubtitle(t.format)
        ? null
        : isHls(s.decision)
          ? `/stream/hls/${sessions.token(s)}/subs/${encodeURIComponent(t.id)}.m3u8`
          : `/stream/subtitles/${sessions.token(s)}/${encodeURIComponent(t.id)}.vtt`,
      delivery: delivery(t.id),
    })),
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
    const asked = clock.now()
    const src = movies.playback.source(tmdbId, viewer, request.versionId)
    const info = src.file.info
    if (!info)
      throw new AppError('conflict', 'That file hasn’t been read yet. Try again in a minute.', {
        reason: 'no-probe',
      })
    const prefs = movies.playback.prefs(viewer, tmdbId)
    const mine = deps.preferences?.(viewer.userId, viewer.deviceId) ?? null
    // the person's languages stand back once they've picked anything for the title
    const own = movies.playback.hasPrefs(viewer, tmdbId)
    // a pick is the version's only when it names this file's track
    const audioId = request.audioId !== undefined ? request.audioId : prefs.audioId
    let audio = audioId ? trackIndex(src.file.id, audioId) : null
    if (request.audioId && audio === null)
      throw new AppError('invalid', 'That sound track isn’t this version’s.', { field: 'audioId' })
    if (audio === null && request.audioId === undefined && mine) {
      const language = mine['playback.audio']
      if (language !== 'original') audio = audioIn(info, language)
    }
    const wanted =
      request.subtitleId !== undefined
        ? request.subtitleId
        : mine && !own
          ? subtitleFor(src.file.id, info, audio, mine)
          : prefs.subtitleId
    let subtitleId = wanted
    let subtitle: SubtitlePick | null
    try {
      subtitle = subtitlePick(src.file.id, wanted)
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
      ceiling: home.has(address)
        ? mine && capOf(mine['playback.qualityHome'])
        : under(deps.ceiling(), mine && capOf(mine['playback.qualityAway'])),
      // tone mapped when it's on and something here can: the path in use, or the processor (4.3b)
      server: { burnIn: true, toneMapping: toneMaps(info.video?.hdr ?? 'none') },
      locale,
    }
    const decision = decide(input)
    const decisionMs = clock.now() - asked
    if (isHls(decision) && !src.duration)
      throw new AppError('conflict', 'That file’s length isn’t known, so it can’t be streamed.', {
        reason: 'no-duration',
      })
    const resume = movies.client.byIds([tmdbId], viewer.profileId)[0]?.position ?? 0
    const start = request.start ?? resume
    const session = sessions.start({
      userId: viewer.userId,
      profileId: viewer.profileId,
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
        ? {
            index: video.index,
            codec: video.codec,
            width: video.width,
            height: video.height,
            hdr: video.hdr,
            bitDepth: video.bitDepth,
          }
        : null,
      start,
      keyframes: async () => {
        if (!video) return []
        const from = clock.now()
        const { times, read } = await deps.ahead.keyframes(src.file, video.index)
        // kept from the read after the import, this takes no time and says nothing
        if (read)
          log.info('keyframes read', {
            session: session.id,
            keyframes: times.length,
            ms: clock.now() - from,
          })
        return times
      },
      audio: sound ? { channels: sound.channels, layout: sound.layout } : null,
      burnIn: burnInOf(src.file, info, decision),
      // the film's own text subtitles, written by every run from the read it makes (HT-49)
      subtitles: info.subtitles.filter((t) => isTextSubtitle(t.codec)).map((t) => t.index),
    }
    const transcode = transcodes.open(session.id, source)
    if (isHls(decision)) {
      transcode.prepare()
      segmentsSent.set(session.id, 0)
    }
    served.set(session.id, { startedAt: asked, playlistAt: null })
    log.info('play session started', {
      session: session.id,
      tmdbId,
      method: decision.method,
      profile: profile.id,
      // where the player starts, in seconds: past 0 is a resume
      start,
      decisionMs,
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
      ? movies.playback.position(s, s.tmdbId, report.position, s.duration).watched
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
      movies.playback.position(s, s.tmdbId, s.position, s.duration)
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
      movies.playback.position(s, s.tmdbId, s.position, s.duration)
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
    if (name === 'video') {
      const segments = await t.segments()
      const timing = served.get(s.id)
      if (timing && timing.playlistAt === null) timing.playlistAt = clock.now()
      return mediaPlaylist(segments, { start: t.source.start })
    }
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

  /**
   * A segment was sent whole: the session's first is logged, with how long the player waited for
   * it to be made, how long it took to send (the network's part) and when the playlist was ready.
   */
  function sent(
    token: string,
    index: number,
    took: { waitMs: number; sendMs: number; bytes: number },
  ) {
    const s = sessions.verify(token)
    const count = s && segmentsSent.get(s.id)
    if (s && count !== undefined && count !== null) segmentsSent.set(s.id, count + 1)
    const timing = s && served.get(s.id)
    if (!s || !timing) return
    served.delete(s.id)
    const now = clock.now()
    log.info('first segment served', {
      session: s.id,
      segment: index,
      ...took,
      playlistMs: timing.playlistAt === null ? null : timing.playlistAt - timing.startedAt,
      sincePlayMs: now - timing.startedAt,
    })
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

  /**
   * A text track's rendition playlist (HT-49): a WebVTT segment for each of the picture's, at
   * `subs/{track}/{i}.vtt`, beside the playlist.
   */
  async function subtitleList(token: string, trackId: string): Promise<string | null> {
    const stream = streamOf(token)
    if (!stream || !subtitleInput(stream.s, trackId)) return null
    const segments = await stream.t.segments()
    return subtitlePlaylist(segments, (i) => `${encodeURIComponent(trackId)}/${i}.vtt`)
  }

  /**
   * Segment `i` of a text track, as WebVTT, or null. The film's own track is cut from what the
   * session's runs have read (`subtitleSegment`), so nothing reads the film for it; a sidecar, a
   * small file of its own, is converted once a session and cut from that.
   */
  async function subtitleSegment(token: string, trackId: string, i: number) {
    const stream = streamOf(token)
    const from = stream && subtitleInput(stream.s, trackId)
    if (!stream || !from) return null
    const { t } = stream
    const segment = (await t.segments())[i]
    if (!segment) return null
    if (from.index !== null) return t.subtitleSegment(from.index, i)
    const path = await t.subtitle(trackId, from.input, null)
    const cues = cueBlocks(await readFile(path, 'utf8'))
    return webvttSegment(cues, segment.start, segment.start + segment.duration)
  }

  /**
   * A text track as WebVTT, whole: the file's path, or null. A file played as it is (only MP4,
   * MOV and WebM are, `profiles`) has no runs to read its subtitles, so the film's own track is
   * taken out once and kept (`ahead.ts`); a sidecar, a small file of its own, is converted once
   * a session.
   */
  async function subtitle(token: string, trackId: string): Promise<string | null> {
    const s = live(token)
    const from = s && subtitleInput(s, trackId)
    if (!s || !from) return null
    if (from.index !== null) {
      const asked = clock.now()
      const { path, made } = await deps.ahead.subtitle(s.file, from.index)
      if (made)
        log.info('subtitle converted', { session: s.id, track: trackId, ms: clock.now() - asked })
      return path
    }
    const t = transcodes.get(s.id)
    return t ? t.subtitle(trackId, from.input, from.index) : null
  }

  /** A version's previews for the scrubber; the manifest is null until they're made. */
  function trickplay(
    viewer: Viewer,
    tmdbId: number,
    versionId?: string,
  ): { versionId: string; manifest: TrickplayManifest | null; fileId: string } {
    if (!seesMovies(viewer.libraries)) throw notHere()
    const src = movies.playback.source(tmdbId, viewer, versionId)
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
    hls: { playlist, segment, init, subtitleList, subtitleSegment, sent },
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
