// SPDX-License-Identifier: AGPL-3.0-only
// The player's state (C5, docs/product/player.md; ADR 0055), as a reducer any platform's video
// element drives: the web's `<video>` now, the native players later. It holds the session's
// lifecycle and the media's events, and derives what the chrome shows: the stream's states
// (Getting it ready, Buffering after a second, Didn't start, Stopped, Next up), whether the chrome
// shows, and when the position is due to be reported. Pure, with the clock passed in, so it's
// tested without a DOM. Beside it, what every platform's player works out the same way: the
// subtitle cues showing at a time with the person's offset, the trickplay tile for a time, the
// browser's report of what it decodes (ADR 0052) and the nudge's words.
import type { DeviceReport, PlaybackDecision, TrickplayManifest } from '@highsea-tv/api-contract'
import { createT, defineMessages } from '@highsea-tv/i18n'

/** One nudge of the subtitle timing, matching the admin's (movies.md#decisions). */
export const NUDGE_MS = 50
/** The server's limit on the nudge (PlaybackPrefsPatch). */
export const NUDGE_LIMIT_MS = 60_000
/** ← and → seek this far. */
export const SEEK_S = 10
/** The chrome hides after this long without input while playing. */
export const HIDE_MS = 3000
/** Next up shows for a film's last this-many seconds, counting down to the next. */
export const NEXT_UP_S = 10
/** The position goes to the session this often while playing (and on pause, seek and leaving). */
export const REPORT_MS = 10_000
/** A stall shows Buffering only after this long, so a short one never flashes a spinner. */
export const BUFFERING_DELAY_MS = 1000

export type Method = PlaybackDecision['method']

/** What's drawn over the frame (player.md#states). */
export type StreamState = 'normal' | 'preparing' | 'buffering' | 'failed' | 'stopped' | 'next-up'

export type StoppedBy = { name: string; message: string | null }

export type PlayerState = {
  /** Asking for a session, starting one, playing it, or no stream to play. */
  phase: 'idle' | 'starting' | 'ready' | 'failed' | 'stopped'
  method: Method | null
  playing: boolean
  /** Seconds in, as the video last said. */
  position: number
  /** Seconds; 0 until known. */
  duration: number
  /** When the video last said it's waiting for data; null while it has what it needs. */
  waitingSince: number | null
  /** When the person last moved the pointer or pressed a key. */
  inputAt: number
  /** When the position last went to the server, and where it was. */
  reportedAt: number | null
  reportedPosition: number | null
  /** Next up was cancelled for this film's ending. */
  nextCancelled: boolean
  stoppedBy: StoppedBy | null
  /** Why it didn't start, for the log; the screen says it in plain words. */
  error: string | null
}

export type PlayerEvent =
  /** A session asked for, or asked for again (Try again, a new version or sound track). */
  | { type: 'start'; at: number }
  /** The server's answer: how it plays, where from, and how long it is. */
  | { type: 'session'; method: Method; start: number; duration: number | null; at: number }
  /** The video has enough to play (`canplay`), or plays (`playing`). */
  | { type: 'ready' }
  | { type: 'play' }
  | { type: 'pause' }
  /** `waiting`: it ran out of data. `playing` or `canplay` clears it. */
  | { type: 'waiting'; at: number }
  | { type: 'time'; position: number }
  | { type: 'duration'; duration: number }
  | { type: 'seek'; position: number }
  | { type: 'ended' }
  | { type: 'error'; message: string }
  /** Stopped from Now playing (4.3), with the admin's name and message. */
  | { type: 'stopped'; by: StoppedBy }
  | { type: 'input'; at: number }
  | { type: 'reported'; position: number; at: number }
  | { type: 'cancel-next' }

export const initialPlayer = (at = 0): PlayerState => ({
  phase: 'idle',
  method: null,
  playing: false,
  position: 0,
  duration: 0,
  waitingSince: null,
  inputAt: at,
  reportedAt: null,
  reportedPosition: null,
  nextCancelled: false,
  stoppedBy: null,
  error: null,
})

/** Inside Next up's window: the film's last NEXT_UP_S seconds. */
const nearEnd = (s: Pick<PlayerState, 'duration' | 'position'>) =>
  s.duration > 0 && s.duration - s.position <= NEXT_UP_S

export function playerReducer(s: PlayerState, e: PlayerEvent): PlayerState {
  switch (e.type) {
    case 'start':
      return {
        ...s,
        phase: 'starting',
        method: null,
        waitingSince: e.at,
        stoppedBy: null,
        error: null,
      }
    case 'session':
      return {
        ...s,
        phase: e.method === 'unplayable' ? 'failed' : 'starting',
        method: e.method,
        position: e.start,
        duration: e.duration ?? s.duration,
        waitingSince: e.at,
        error: e.method === 'unplayable' ? 'unplayable' : null,
      }
    case 'ready':
      return s.phase === 'starting' || s.phase === 'ready'
        ? { ...s, phase: 'ready', waitingSince: null }
        : s
    case 'play':
      return { ...s, playing: true }
    case 'pause':
      return { ...s, playing: false, waitingSince: null }
    case 'waiting':
      return s.phase === 'ready' && s.waitingSince === null ? { ...s, waitingSince: e.at } : s
    case 'time':
      // seeking back out of the last seconds lets Next up show again at the end
      return {
        ...s,
        position: e.position,
        nextCancelled: s.nextCancelled && nearEnd({ ...s, position: e.position }),
      }
    case 'duration':
      return e.duration > 0 && Number.isFinite(e.duration) ? { ...s, duration: e.duration } : s
    case 'seek':
      return {
        ...s,
        position: e.position,
        nextCancelled: s.nextCancelled && nearEnd({ ...s, position: e.position }),
      }
    case 'ended':
      return { ...s, playing: false, waitingSince: null, position: s.duration || s.position }
    case 'error':
      return { ...s, phase: 'failed', playing: false, waitingSince: null, error: e.message }
    case 'stopped':
      return { ...s, phase: 'stopped', playing: false, waitingSince: null, stoppedBy: e.by }
    case 'input':
      return { ...s, inputAt: e.at }
    case 'reported':
      return { ...s, reportedAt: e.at, reportedPosition: e.position }
    case 'cancel-next':
      return { ...s, nextCancelled: true }
  }
}

/**
 * What's drawn over the frame. Getting it ready is a stream the server is making (a remux or a
 * transcode) before its first segments; anything else that waits shows Buffering only after
 * BUFFERING_DELAY_MS. Next up needs a next film, and shows in the last seconds until cancelled.
 */
export function streamState(s: PlayerState, now: number, hasNext: boolean): StreamState {
  if (s.phase === 'failed') return 'failed'
  if (s.phase === 'stopped') return 'stopped'
  if (s.phase === 'idle') return 'normal'
  if (s.phase === 'starting' && (s.method === 'direct-stream' || s.method === 'transcode'))
    return 'preparing'
  if (s.waitingSince !== null && now - s.waitingSince >= BUFFERING_DELAY_MS) return 'buffering'
  if (s.phase === 'ready' && hasNext && !s.nextCancelled && nearEnd(s)) return 'next-up'
  return 'normal'
}

/** When `streamState` may next change on its own: Buffering's delay running out. */
export function nextChange(s: PlayerState, now: number): number | null {
  if (s.waitingSince === null) return null
  const at = s.waitingSince + BUFFERING_DELAY_MS
  return at > now ? at : null
}

/** Next up's "Starts in N s": the film's seconds left, so it pauses when the film does. */
export const nextUpIn = (s: PlayerState) => Math.max(0, Math.ceil(s.duration - s.position))

/**
 * Whether the chrome shows: while paused, while waiting, while a panel is open, and for HIDE_MS
 * after the last input.
 */
export function chromeShown(s: PlayerState, now: number, panel = false) {
  return (
    panel ||
    !s.playing ||
    s.phase !== 'ready' ||
    s.waitingSince !== null ||
    now - s.inputAt < HIDE_MS
  )
}

/** Whether the position is due at the server: every REPORT_MS while playing, once it has moved. */
export function reportDue(s: PlayerState, now: number) {
  if (s.phase !== 'ready' || !s.playing) return false
  if (s.reportedPosition !== null && Math.abs(s.reportedPosition - s.position) < 1) return false
  return s.reportedAt === null || now - s.reportedAt >= REPORT_MS
}

/** Seconds to seek to, kept inside the film. */
export const clampSeek = (s: Pick<PlayerState, 'duration'>, to: number) =>
  Math.max(0, s.duration > 0 ? Math.min(s.duration, to) : to)

// ---------------------------------------------------------------------------------------------
// Subtitles: drawn by the player, from a hidden <track>'s cues, with the person's offset added to
// their times (https://developer.mozilla.org/en-US/docs/Web/API/TextTrackCue), so changing the
// timing never reloads the stream.

export type Cue = { startTime: number; endTime: number; text: string }

/**
 * The cues showing at `t` seconds with the offset applied: a positive offset shows each cue
 * later. A cue's own times aren't changed; the player asks with the offset each time.
 */
export function cuesAt(cues: Iterable<Cue>, t: number, offsetMs: number): string[] {
  const at = t - offsetMs / 1000
  const out: string[] = []
  for (const c of cues) if (c.startTime <= at && at < c.endTime) out.push(c.text)
  return out
}

/** WebVTT cue text without its tags (`<i>`, `<c.yellow>`, `<00:01.000>`), as plain lines. */
export const cueText = (text: string) =>
  text
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lrm;|&rlm;/g, '')

/** One more nudge, back to on time, or the same offset kept inside the server's limit. */
export const nudged = (offsetMs: number, dir: 1 | -1 | 0) =>
  dir === 0 ? 0 : Math.max(-NUDGE_LIMIT_MS, Math.min(NUDGE_LIMIT_MS, offsetMs + dir * NUDGE_MS))

// ---------------------------------------------------------------------------------------------
// Trickplay: the scrubber's preview for a time, as a tile cut from one of the manifest's sheets.

export type TrickplayTile = { sheet: number; x: number; y: number; width: number; height: number }

/** The tile for `seconds` in: thumbnail `n` shows `n × interval` (TrickplayManifest). */
export function trickplayTile(m: TrickplayManifest, seconds: number): TrickplayTile | null {
  if (m.count < 1 || m.interval <= 0) return null
  const n = Math.max(0, Math.min(m.count - 1, Math.floor(seconds / m.interval)))
  const perSheet = m.columns * m.rows
  const i = n % perSheet
  return {
    sheet: Math.floor(n / perSheet),
    x: (i % m.columns) * m.width,
    y: Math.floor(i / m.columns) * m.height,
    width: m.width,
    height: m.height,
  }
}

// ---------------------------------------------------------------------------------------------
// What a browser decodes (ADR 0052), asked with `MediaSource.isTypeSupported()` by the codec
// strings RFC 6381 and each codec's MP4 or WebM binding use
// (https://developer.mozilla.org/en-US/docs/Web/API/MediaSource/isTypeSupported_static).

export type Base = 'web-chromium' | 'web-chromium-macos' | 'web-firefox' | 'web-safari'

/** The built-in profile a browser starts from, from its user agent. */
export function baseProfile(userAgent: string): Base {
  if (/Firefox\//.test(userAgent)) return 'web-firefox'
  if (/Safari\//.test(userAgent) && !/Chrom(e|ium)\//.test(userAgent)) return 'web-safari'
  return /Macintosh/.test(userAgent) ? 'web-chromium-macos' : 'web-chromium'
}

/**
 * The report from what the browser says it decodes. `hdr` comes from `decodingInfo()` and the
 * screen (`dynamic-range: high`), which the caller asks, since they're asynchronous.
 */
export function deviceReport(
  base: Base,
  can: (type: string) => boolean,
  hdr: DeviceReport['hdr'] = { formats: [], dolbyVision: [] },
): DeviceReport {
  const video: NonNullable<DeviceReport['video']> = []
  if (can('video/mp4; codecs="avc1.640028"'))
    video.push({
      codec: 'h264',
      profiles: ['constrained baseline', 'baseline', 'main', 'high'],
      bitDepths: [8],
    })
  const hevc = [
    can('video/mp4; codecs="hvc1.1.6.L120.90"') && 'main',
    can('video/mp4; codecs="hvc1.2.4.L120.90"') && 'main 10',
  ].filter((p): p is string => !!p)
  if (hevc.length)
    video.push({
      codec: 'hevc',
      profiles: hevc,
      bitDepths: hevc.includes('main 10') ? [8, 10] : [8],
      // Safari plays HEVC in MP4 only with the `hvc1` sample entry (Apple's HLS authoring spec)
      ...(base === 'web-safari' ? { tag: 'hvc1' } : {}),
    })
  if (can('video/webm; codecs="vp8"')) video.push({ codec: 'vp8', bitDepths: [8] })
  if (can('video/webm; codecs="vp09.00.10.08"')) {
    const p2 = can('video/webm; codecs="vp09.02.10.10"')
    video.push({
      codec: 'vp9',
      profiles: p2 ? ['profile 0', 'profile 2'] : ['profile 0'],
      bitDepths: p2 ? [8, 10] : [8],
    })
  }
  if (can('video/mp4; codecs="av01.0.05M.08"'))
    video.push({
      codec: 'av1',
      profiles: ['main'],
      bitDepths: can('video/mp4; codecs="av01.0.05M.10"') ? [8, 10] : [8],
    })
  const audio: NonNullable<DeviceReport['audio']> = []
  const add = (type: string, codec: string, maxChannels: number) => {
    if (can(type)) audio.push({ codec, maxChannels })
  }
  add('audio/mp4; codecs="mp4a.40.2"', 'aac', 8)
  add('audio/mpeg', 'mp3', 2)
  add('audio/mp4; codecs="flac"', 'flac', 8)
  add('audio/webm; codecs="opus"', 'opus', 8)
  add('audio/webm; codecs="vorbis"', 'vorbis', 8)
  add('audio/mp4; codecs="alac"', 'alac', 8)
  add('audio/mp4; codecs="ac-3"', 'ac3', 6)
  add('audio/mp4; codecs="ec-3"', 'eac3', 8)
  return { base, video, audio, hdr }
}

/**
 * What a report depends on: the browser and its version. When it changes, the browser asks
 * again and reports again; the same browser never reports twice.
 */
export const reportKey = (userAgent: string) => `v1 ${userAgent}`

// ---------------------------------------------------------------------------------------------
// The nudge's words (ADR 0021), the same on every platform.

export const playerMessages = defineMessages({
  onTime: 'On time',
  later: '+{ms} ms',
  earlier: '−{ms} ms',
  hintOnTime: 'Subtitles match the audio track’s timing.',
  hintLater: 'Subtitles appear {ms} ms later.',
  hintEarlier: 'Subtitles appear {ms} ms earlier.',
})

export function createPlayerText(locale = 'en') {
  const t = createT(playerMessages, locale)
  return {
    /** "+150 ms", "−50 ms", "On time". */
    offsetLabel: (ms: number) =>
      ms === 0 ? t('onTime') : t(ms > 0 ? 'later' : 'earlier', { ms: Math.abs(ms) }),
    /** Plain words for the nudge's direction. */
    offsetHint: (ms: number) =>
      ms === 0 ? t('hintOnTime') : t(ms > 0 ? 'hintLater' : 'hintEarlier', { ms: Math.abs(ms) }),
  }
}
