// SPDX-License-Identifier: AGPL-3.0-only
// The player's engine on the web (C5; ADR 0051, 0052, 0053, 0055; one-client-platform.md › A):
// the web's side of ./playback.ts, a `<video>` driven by `@highsea-tv/client/player`'s reducer,
// behind the same `usePlayback`. What the two share is ./playback-shared.ts. expo-video's own web
// player won't do here: it sets the `<video>`'s `src` to the source's URI (expo-video 58.0.11's
// `VideoPlayer.web.tsx`, `replace`, and `VideoView.web.tsx`'s `src={getSourceUri(…)}`), with no
// Media Source Extensions and no headers, so it plays HLS only where the browser does, which is
// Safari. Metro takes this file for the client's web build (apps/client/README.md › Platform
// files); Vite and Bun, which don't read `.web` files, take it as `@highsea-tv/native/playback`'s
// `default` target (apps/web).
//
// It reports what this browser decodes once per browser version, asks the server for a session
// with the person's picks, and plays its URL: the file itself for direct play, HLS through hls.js
// where Media Source Extensions are available
// (https://github.com/video-dev/hls.js/blob/master/docs/API.md), loaded as a chunk of its own
// only when a stream needs it, or natively where the browser plays HLS itself (Safari:
// `canPlayType('application/vnd.apple.mpegurl')`). Changing the version or the sound starts a new
// session at the same place; subtitles and their timing never do. The position goes to the
// session every 10 s while playing and on pause and seek; leaving saves it with `keepalive`, so it
// survives the page closing (https://developer.mozilla.org/en-US/docs/Web/API/RequestInit#keepalive),
// and ends the session, which stops its ffmpeg. The browser reads the subtitle's cues from a
// hidden `<track>` for `subtitleUrl`, which the screen puts in the `<video>`, so `cues` stays empty.
import type { PlaySession } from '@highsea-tv/api-contract'
import {
  type Base,
  baseProfile,
  type Cue,
  clampSeek,
  deviceReport,
  initialPlayer,
  playerReducer,
  reportKey,
} from '@highsea-tv/client/player'
import type { HighseaClient } from '@highsea-tv/sdk'
import { useClient } from '@highsea-tv/sdk/react'
import type HlsType from 'hls.js'
import { type RefObject, useCallback, useEffect, useReducer, useRef } from 'react'
import type { usePlayback as native } from './playback.ts'
import {
  TRANSCODE_LIMIT,
  type UsePlayback,
  useChoices,
  useReportTimer,
  useSessionStart,
  useStarts,
  useStoppedEvent,
} from './playback-shared.ts'
import { useWebHost, type WebHost } from './web-host.ts'

export { TRANSCODE_LIMIT } from './playback-shared.ts'

const API = '/api/v1'
const REPORTED = 'highsea:device-report'
const NO_CUES: Cue[] = []

/** The web's handle on the picture: pass `attach` to the `<video>` as its ref. */
type WebPlayer = {
  /** The video's events, into the reducer. */
  attach: (v: HTMLVideoElement | null) => (() => void) | undefined
  video: RefObject<HTMLVideoElement | null>
}

/**
 * HDR this browser and screen show, from `MediaCapabilities.decodingInfo()` with HDR's transfer
 * functions (https://developer.mozilla.org/en-US/docs/Web/API/MediaCapabilities/decodingInfo)
 * and the screen's `dynamic-range` (https://developer.mozilla.org/en-US/docs/Web/CSS/@media/dynamic-range).
 */
async function hdrSupport(): Promise<{ formats: string[]; dolbyVision: number[] }> {
  const none = { formats: [], dolbyVision: [] }
  if (!navigator.mediaCapabilities?.decodingInfo || !matchMedia('(dynamic-range: high)').matches)
    return none
  const ask = (transferFunction: 'pq' | 'hlg', hdrMetadataType?: 'smpteSt2086') =>
    navigator.mediaCapabilities
      .decodingInfo({
        type: 'media-source',
        video: {
          contentType: 'video/mp4; codecs="hvc1.2.4.L153.B0"',
          width: 3840,
          height: 2160,
          bitrate: 20_000_000,
          framerate: 24,
          colorGamut: 'rec2020',
          transferFunction,
          ...(hdrMetadataType ? { hdrMetadataType } : {}),
        },
      })
      .then((r) => r.supported)
      .catch(() => false)
  const [hdr10, hlg] = await Promise.all([ask('pq', 'smpteSt2086'), ask('hlg')])
  return {
    formats: [hdr10 && 'hdr10', hlg && 'hlg'].filter((f): f is string => !!f),
    dolbyVision: [],
  }
}

let reporting: Promise<void> | null = null

/**
 * Tells the server what this browser decodes (ADR 0052), once per browser version: the report is
 * kept against the user agent, and a new version asks again. Failing to report only means the
 * server decides from the built-in profile.
 */
function reportDevice(client: HighseaClient, base: Base) {
  reporting ??= (async () => {
    const key = reportKey(navigator.userAgent)
    try {
      if (localStorage.getItem(REPORTED) === key) return
    } catch {}
    if (typeof MediaSource === 'undefined') return
    const body = deviceReport(base, (t) => MediaSource.isTypeSupported(t), await hdrSupport())
    await client.playback.report({ body })
    try {
      localStorage.setItem(REPORTED, key)
    } catch {}
  })().catch(() => {})
  return reporting
}

/**
 * Leaving: a last report to the session, paused, which the server saves at once
 * (`@highsea-tv/stream/sessions`' `heard`), then the session's end. Within the app the end waits
 * for the report, so it can't save an older place over it; when the page is closing nothing can
 * wait, so both go with `keepalive` and the end saves the place last heard if it arrives first.
 */
function leave(host: WebHost, session: PlaySession, position: number, closing: boolean) {
  const init = { keepalive: true, credentials: 'same-origin' } as const
  const path = `${API}/playback/sessions/${encodeURIComponent(session.id)}`
  const end = () => host.fetch(path, { ...init, method: 'DELETE' }).catch(() => {})
  const report = host
    .fetch(`${path}/progress`, {
      ...init,
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ position, paused: true }),
    })
    .catch(() => {})
  if (closing) end()
  else report.then(end)
}

/**
 * Typed by the native side, as platform files are (apps/client/README.md › Platform files, rule
 * 4), with the web's own `player`. A parameter or result that doesn't fit `UsePlayback` fails
 * here, and so does the native hook losing that type (`never`); an extra field returned on
 * either side isn't a type error, so test/playback.test.ts compares the returned keys.
 */
type Engine<Player> = typeof native extends UsePlayback<unknown> ? UsePlayback<Player> : never

export const usePlayback: Engine<WebPlayer> = (id, fromStart) => {
  const client = useClient()
  const host = useWebHost()
  const hostRef = useRef(host)
  hostRef.current = host
  const [state, dispatch] = useReducer(playerReducer, undefined, () => initialPlayer(Date.now()))
  const video = useRef<HTMLVideoElement | null>(null)
  const hls = useRef<HlsType | null>(null)
  // true once the current stream plays: until then the video's events (a `pause` from letting go
  // of the last stream, the seek to the start) are about nothing the server should save
  const playingStream = useRef(false)
  const stateRef = useRef(state)
  stateRef.current = state
  // the start's key (`useStarts`)
  const started = useRef<string | null>(null)

  const { session, live, generation, begin, stopped } = useSessionStart({
    client,
    id,
    dispatch,
    started,
    // what this browser decodes goes to the server first, once per version (ADR 0052)
    profile: async () => {
      const base = baseProfile(navigator.userAgent, hostRef.current.app)
      await reportDevice(client, base)
      return base
    },
    /** Lets go of the picture: hls.js and the video's source. */
    clearPicture: () => {
      hls.current?.destroy()
      hls.current = null
      const v = video.current
      if (v) {
        v.removeAttribute('src')
        v.load()
      }
      playingStream.current = false
    },
    attach: async (s, current) => {
      const v = video.current
      if (!s.url || !v) return
      const url = hostRef.current.media(s.url)
      const nativeHls = v.canPlayType('application/vnd.apple.mpegurl') !== ''
      const { default: Hls } =
        s.decision.method === 'direct-play' ? { default: null } : await import('hls.js')
      if (!current()) return
      if (!Hls || (!Hls.isSupported() && nativeHls)) {
        v.src = url
        v.addEventListener(
          'loadedmetadata',
          () => {
            if (s.start) v.currentTime = s.start
          },
          { once: true },
        )
      } else if (Hls.isSupported()) {
        // start where the session does, and leave subtitles to the player: the playlist lists them
        // for Apple's players, but here they're drawn from the session's WebVTT with the
        // person's offset (https://github.com/video-dev/hls.js/blob/v1.7.3/docs/API.md#startposition,
        // #enablewebvtt, #renderTextTracksNatively)
        const h = new Hls({
          startPosition: s.start,
          enableWebVTT: false,
          enableIMSC1: false,
          enableCEA708Captions: false,
          renderTextTracksNatively: false,
          // a transcode past Settings › Playback's limit waits up to a minute for a slot before the
          // server answers (4.3's answer 7): wait longer than that for the first byte, and don't
          // retry its 503, which says the wait is over (the LoadPolicy's `shouldRetry`,
          // https://github.com/video-dev/hls.js/blob/v1.7.3/docs/API.md#shouldretry; 1.7.3's
          // hls.d.ts passes it the loader's response, whose `code` is the HTTP status)
          fragLoadPolicy: {
            default: {
              maxTimeToFirstByteMs: 75_000,
              maxLoadTimeMs: 120_000,
              timeoutRetry: { maxNumRetry: 2, retryDelayMs: 0, maxRetryDelayMs: 0 },
              errorRetry: {
                maxNumRetry: 6,
                retryDelayMs: 1000,
                maxRetryDelayMs: 8000,
                shouldRetry: (_config, _count, _timeout, response, retry) =>
                  response?.code === 503 ? false : retry,
              },
            },
          },
        })
        h.on(Hls.Events.ERROR, (_e, data) => {
          if (!data.fatal || !current()) return
          // 503: it waited a minute past Settings › Playback's limit (4.3's answer 7). hls.js
          // gives a failed load's HTTP status in `response.code`
          // (https://github.com/video-dev/hls.js/blob/v1.7.3/docs/API.md#errors)
          dispatch({
            type: 'error',
            message: data.response?.code === 503 ? TRANSCODE_LIMIT : data.details,
          })
        })
        h.loadSource(url)
        h.attachMedia(v)
        hls.current = h
      } else {
        dispatch({ type: 'error', message: 'This browser plays neither HLS nor MSE.' })
        return
      }
      // the person pressed Play to get here, so the browser lets it play with sound
      v.play().catch(() => {})
    },
  })
  const c = useChoices(id, session)

  const retry = useStarts(c, fromStart, () => stateRef.current.position, begin, started)

  // leaving: on unmount, and on the page closing
  useEffect(() => {
    const out = (closing: boolean) => {
      // a session still being asked for is ended when it arrives
      generation.current++
      const s = live.current
      if (!s) return
      live.current = null
      // before the stream plays, the place is still where the session started
      const v = video.current
      leave(hostRef.current, s, playingStream.current && v ? v.currentTime : s.start, closing)
      playingStream.current = false
      hls.current?.destroy()
      hls.current = null
    }
    const closing = () => out(true)
    addEventListener('pagehide', closing)
    return () => {
      removeEventListener('pagehide', closing)
      out(false)
      // StrictMode runs effects twice in development; the next mount starts afresh
      started.current = null
    }
  }, [live, generation])

  const report = useCallback(() => {
    const s = live.current
    const v = video.current
    if (!s || !v || !playingStream.current) return
    const position = v.currentTime
    dispatch({ type: 'reported', position, at: Date.now() })
    client.playback
      .progress({ params: { id: s.id }, body: { position, paused: v.paused } })
      .catch(stopped)
  }, [client, live, stopped])

  useStoppedEvent(
    client,
    live,
    (s) => {
      const v = video.current
      return playingStream.current && v ? v.currentTime : s.start
    },
    stopped,
  )
  useReportTimer(stateRef, report)

  const attach = useCallback(
    (v: HTMLVideoElement | null) => {
      video.current = v
      if (!v) return
      const off = new AbortController()
      const on = (type: string, f: () => void) =>
        v.addEventListener(type, f, { signal: off.signal })
      on('loadedmetadata', () => dispatch({ type: 'duration', duration: v.duration }))
      on('durationchange', () => dispatch({ type: 'duration', duration: v.duration }))
      on('canplay', () => dispatch({ type: 'ready' }))
      on('playing', () => {
        if (live.current) playingStream.current = true
        dispatch({ type: 'ready' })
        dispatch({ type: 'play' })
      })
      on('play', () => dispatch({ type: 'play' }))
      on('pause', () => {
        dispatch({ type: 'pause' })
        if (!v.ended) report()
      })
      on('waiting', () => dispatch({ type: 'waiting', at: Date.now() }))
      on('timeupdate', () => dispatch({ type: 'time', position: v.currentTime }))
      on('seeking', () => dispatch({ type: 'seek', position: v.currentTime }))
      on('seeked', report)
      on('ended', () => {
        dispatch({ type: 'ended' })
        report()
      })
      on('error', () => {
        // hls.js reports its own errors; this is direct play's, or native HLS's
        if (!hls.current && live.current && v.error)
          dispatch({ type: 'error', message: v.error.message || `media error ${v.error.code}` })
      })
      // the element stays in `video` until the next one: React clears refs before effects
      // clean up, and leaving reads the place from it
      return () => off.abort()
    },
    [report, live],
  )

  const seekTo = useCallback((s: number) => {
    const v = video.current
    if (v) v.currentTime = clampSeek(stateRef.current, s)
  }, [])

  return {
    detail: c.detail,
    state,
    dispatch,
    player: { attach, video },
    session,
    version: c.version,
    audio: c.audio,
    subtitle: c.subtitle,
    subtitleUrl: c.subtitlePath ? host.media(c.subtitlePath) : null,
    cues: NO_CUES,
    burnt: !!c.burnt,
    pictureTrack: c.pictureTrack,
    offsetMs: c.offsetMs,
    external: false,
    toggle: () => {
      const v = video.current
      if (!v) return
      if (v.paused || v.ended) {
        if (v.ended) v.currentTime = 0
        v.play().catch(() => {})
      } else v.pause()
    },
    seekTo,
    seekBy: (by: number) => seekTo((video.current?.currentTime ?? 0) + by),
    retry,
    setVersion: c.setVersion,
    setAudio: c.setAudio,
    setSubtitle: c.setSubtitle,
    nudge: c.nudge,
  }
}

export type Playback = ReturnType<typeof usePlayback>
