// SPDX-License-Identifier: AGPL-3.0-only
// The player's routes in the mock (one-client-platform-b.md › B2, the player): play sessions,
// their reports and their end, the device's report, what plays next and the trickplay manifest,
// in the contract's shapes (@highsea-tv/api-contract's playback), as packages/runtime's
// playback.ts answers them. There's no ffmpeg here: every session plays one clip the caller
// serves beside the client, Sintel's 52 s from the subtitle sync's fixtures with its English cues
// as WebVTT (design/prototypes/mock-media.ts makes both), whichever film and version is asked
// for. Without one (the phone and the TV in mock mode, and tests), a session has no URL, and the
// player waits on it as on a first transcode.
//
// The toolbar's stream state (player.md#states) picks what the session is:
// - normal: direct play of the clip, from where the person left off;
// - preparing: a transcode whose first segments never come;
// - buffering: direct play of a file that never answers, so the player waits;
// - failed: nothing this device can play (`unplayable`);
// - stopped: the clip, stopped from Now playing as it starts, by Ines with her message, so the
//   player hears `playback.stopped` and its report is the 404 that says who and why;
// - next-up: the clip from its last seconds, where Next up shows.
import type {
  ClientItem,
  ClientVersion,
  PlaybackDecision,
  PlaySession,
  ProgressResult,
  Trickplay,
} from '@highsea-tv/api-contract'
import { NEXT_UP_S, type StreamState } from '@highsea-tv/client/player'

/** The clip the caller serves, as the page loads it: full addresses, or paths on the page's host. */
export type MockMedia = {
  /** An MP4 (H.264 and AAC) every browser and AVPlayer plays directly. */
  clip: string
  /** The clip's cues as WebVTT. */
  subtitles: string
  /** Its length in seconds. */
  duration: number
}

/**
 * The clip's files, as design/prototypes/mock-media.ts makes them beside the client's mock export
 * (`/web/mock-media/`), and its length: the caller puts them under its own base.
 */
export const MOCK_CLIP = {
  clip: 'mock-media/sintel.mp4',
  subtitles: 'mock-media/sintel.en.vtt',
  duration: 52,
} as const

/** Who stops a stream in the stopped state, and why: the prototype's Ines (stream-states.tsx). */
export const STOPPED_BY = { by: 'Ines', message: 'The server is restarting in five minutes.' }

/** How long after a session starts the stopped state's stop comes, in real ms. */
export const STOP_AFTER_MS = 800

/** A session's life: the URL works this long after the last report (the server's TTL). */
const TTL_MS = 5 * 60_000

/** A live session; every report saves its place at once, so leaving has nothing left to save. */
type Session = { id: string; userId: string; tmdbId: number; duration: number }

/** What a session needs of the film: its place and the version's tracks, from films.ts's detail. */
export type PlayFilm = { item: ClientItem; version: ClientVersion }

const PICTURE_FORMATS = new Set(['pgs', 'hdmv_pgs_subtitle', 'vobsub', 'dvd_subtitle', 'sup'])

export type PlayRequest = {
  versionId?: string
  audioId?: string | null
  subtitleId?: string | null
  start?: number
}

export function createPlays(o: {
  media: MockMedia | undefined
  stream: () => StreamState
  now: () => number
  /** `playback.stopped`, to the person whose stream it was. */
  stopped: (id: string, userId: string) => void
}) {
  const sessions = new Map<string, Session>()
  const stopped = new Map<string, { userId: string; by: string; message: string }>()
  let n = 0
  const expires = () => new Date(o.now() + TTL_MS).toISOString()

  /** POST /items/movie/{id}/play. */
  function play(userId: string, film: PlayFilm, body: PlayRequest): PlaySession {
    const stream = o.stream()
    const media = o.media
    const duration = media?.duration ?? (film.item.runtimeMinutes ?? 0) * 60
    const v = film.version
    const audio = v.audio.find((a) => a.id === body.audioId) ?? v.audio.find((a) => a.default)
    const subs = v.subtitles
    const subtitle = subs.find((s) => s.id === body.subtitleId) ?? null
    const text = (s: { format: string }) => !PICTURE_FORMATS.has(s.format)
    // where the person left off is the film's fraction of its length, on the clip's
    const length = (film.item.runtimeMinutes ?? 0) * 60
    const resumed = length > 0 ? (film.item.position / length) * duration : 0
    const asked = body.start ?? resumed
    const start =
      stream === 'next-up'
        ? Math.max(0, duration - NEXT_UP_S + 2)
        : asked > 0 && asked < duration - 1
          ? asked
          : 0
    // no clip served: every stream waits, as a first transcode does
    const method: PlaybackDecision['method'] =
      stream === 'failed'
        ? 'unplayable'
        : stream === 'preparing' || !media
          ? 'transcode'
          : 'direct-play'
    const id = `ps-mock-${++n}`
    const decision: PlaybackDecision = {
      method,
      container: 'mp4',
      video:
        method === 'transcode'
          ? { action: 'transcode', codec: 'h264', height: 1080, bitrate: 8_000_000, toSdr: false }
          : method === 'unplayable'
            ? null
            : { action: 'copy' },
      audio: audio
        ? {
            id: audio.id,
            action: method === 'transcode' ? 'transcode' : 'copy',
            codec: method === 'transcode' ? 'aac' : audio.codec,
            channels: method === 'transcode' ? 2 : audio.channels,
          }
        : null,
      subtitle: subtitle
        ? { id: subtitle.id, delivery: text(subtitle) ? 'external' : 'unavailable' }
        : null,
      bitrate: method === 'unplayable' ? null : 2_000_000,
      reasons:
        method === 'unplayable'
          ? [
              {
                kind: 'rejected',
                code: 'video.codec',
                message: 'This device can’t play the video, and the server can’t transcode it.',
              },
            ]
          : method === 'transcode'
            ? [{ kind: 'warning', code: 'method.transcode', message: 'Transcoding the video.' }]
            : [],
    }
    sessions.set(id, { id, userId, tmdbId: film.item.id, duration })
    if (stream === 'stopped') {
      stopped.set(id, { userId, ...STOPPED_BY })
      setTimeout(() => {
        if (sessions.delete(id)) o.stopped(id, userId)
      }, STOP_AFTER_MS)
    }
    return {
      id,
      decision,
      // buffering: a direct play whose file never comes, so the player waits on it
      url: method === 'direct-play' && stream !== 'buffering' && media ? media.clip : null,
      subtitles: subs.map((s) => ({
        id: s.id,
        url: text(s) && media && method !== 'unplayable' ? media.subtitles : null,
        delivery: text(s) ? 'external' : 'unavailable',
      })),
      start,
      duration: duration || null,
      expiresAt: expires(),
    }
  }

  /** The session, or the 404's details: who stopped it, when someone did. */
  function find(userId: string, id: string): Session | { stopped: typeof STOPPED_BY } | null {
    const s = sessions.get(id)
    if (s && s.userId === userId) return s
    const n = stopped.get(id)
    if (n && n.userId === userId) return { stopped: { by: n.by, message: n.message } }
    return null
  }

  return {
    play,
    find,
    /** A report renews the URL; the caller saves the place to the film. */
    heard: (): Omit<ProgressResult, 'watched'> => ({ expiresAt: expires() }),
    /** DELETE /playback/sessions/{id}: its URL stops working at once. */
    end: (s: Session) => sessions.delete(s.id),
    trickplay: (versionId: string): Trickplay => ({ versionId, manifest: null }),
    dispose: () => sessions.clear(),
  }
}

export type Plays = ReturnType<typeof createPlays>
