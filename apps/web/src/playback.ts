// SPDX-License-Identifier: AGPL-3.0-only
// The player's engine on the web (C5; ADR 0051, 0052, 0055): a `<video>` driven by
// `@highsea-tv/client/player`'s reducer. It reports what this browser decodes once per browser
// version, asks the server for a session with the person's picks, and plays its URL: the file
// itself for direct play, HLS through hls.js where Media Source Extensions are available
// (https://github.com/video-dev/hls.js/blob/master/docs/API.md), or natively where the browser
// plays HLS itself (Safari: `canPlayType('application/vnd.apple.mpegurl')`). Changing the version
// or the sound starts a new session at the same place; subtitles and their timing never do.
// The position goes to the session every 10 s while playing and on pause and seek; leaving saves
// it with `keepalive`, so it survives the page closing
// (https://developer.mozilla.org/en-US/docs/Web/API/RequestInit#keepalive), and ends the session,
// which stops its ffmpeg.
import type { PlaySession } from '@highsea-tv/api-contract'
import { useItem, usePicks } from '@highsea-tv/client/data'
import {
  type Base,
  baseProfile,
  clampSeek,
  deviceReport,
  initialPlayer,
  nudged,
  playerReducer,
  REPORT_MS,
  reportDue,
  reportKey,
} from '@highsea-tv/client/player'
import { ApiError, type HighseaClient } from '@highsea-tv/sdk'
import { useClient } from '@highsea-tv/sdk/react'
import type HlsType from 'hls.js'
import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import { desktopOs } from './desktop/window.tsx'
import { hostFetch, inApp, media } from './host.ts'

/** The player's error when the server is transcoding all it's allowed to, and this one gave up. */
export const TRANSCODE_LIMIT = 'transcode-limit'

const API = '/api/v1'
const REPORTED = 'highsea:device-report'

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
function leave(session: PlaySession, position: number, closing: boolean) {
  const init = { keepalive: true, credentials: 'same-origin' } as const
  const path = `${API}/playback/sessions/${encodeURIComponent(session.id)}`
  const end = () => hostFetch(path, { ...init, method: 'DELETE' }).catch(() => {})
  const report = hostFetch(`${path}/progress`, {
    ...init,
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ position, paused: true }),
  }).catch(() => {})
  if (closing) end()
  else report.then(end)
}

type Picks = {
  versionId: string | null
  audioId: string | null
  subtitleId: string | null
  subtitleOffsetMs: number
}

export function usePlayback(id: number, fromStart: boolean) {
  const client = useClient()
  const detail = useItem(id)
  const { picks, save } = usePicks(id)
  const [state, dispatch] = useReducer(playerReducer, undefined, () => initialPlayer(Date.now()))
  const [session, setSession] = useState<PlaySession | null>(null)
  const [local, setLocal] = useState<Partial<Picks>>({})
  const video = useRef<HTMLVideoElement | null>(null)
  const hls = useRef<HlsType | null>(null)
  const live = useRef<PlaySession | null>(null)
  // each start bumps this, so a slow answer to an older one is ended, not played
  const generation = useRef(0)
  // true once the current stream plays: until then the video's events (a `pause` from letting go
  // of the last stream, the seek to the start) are about nothing the server should save
  const playingStream = useRef(false)
  const stateRef = useRef(state)
  stateRef.current = state

  const d = detail.data
  const merged: Partial<Picks> = { ...picks.data, ...local }
  // a pick of a version still waiting for its file falls back, as the server's own choice does
  const version =
    d?.versions.find((v) => v.id === merged.versionId && v.playable) ??
    d?.versions.find((v) => v.playable) ??
    d?.versions[0] ??
    null
  const audio =
    version?.audio.find((a) => a.id === merged.audioId) ??
    version?.audio.find((a) => a.default) ??
    version?.audio[0] ??
    null
  const subtitle = version?.subtitles.find((t) => t.id === merged.subtitleId) ?? null
  const offsetMs = merged.subtitleOffsetMs ?? 0
  // a subtitle the server draws into the picture (4.3) is part of the stream: choosing one, or
  // leaving one, starts again. Judged by the last session's list, kept while the next one starts
  const tracks = useRef<PlaySession['subtitles']>([])
  if (session) tracks.current = session.subtitles
  const burnt =
    subtitle && tracks.current.find((t) => t.id === subtitle.id)?.delivery === 'burn-in'
      ? subtitle.id
      : null
  const subtitleUrl =
    subtitle && !burnt
      ? media(session?.subtitles.find((t) => t.id === subtitle.id)?.url ?? null)
      : null
  // the subtitle goes with each start (the server may need it), but changing it never restarts
  const subtitleRef = useRef<string | null>(null)
  subtitleRef.current = subtitle?.id ?? null

  const set = useCallback(
    (patch: Partial<Picks>) => {
      setLocal((l) => ({ ...l, ...patch }))
      save.run(patch).catch(() => {})
    },
    [save],
  )

  /** Lets go of the current stream: hls.js, the video's source and the session. */
  const release = useCallback(() => {
    hls.current?.destroy()
    hls.current = null
    const v = video.current
    if (v) {
      v.removeAttribute('src')
      v.load()
    }
    playingStream.current = false
    const s = live.current
    live.current = null
    if (s) client.playback.stop({ params: { id: s.id } }).catch(() => {})
  }, [client])

  const begin = useCallback(
    async (start: number | undefined, choice: { versionId?: string; audioId?: string | null }) => {
      const gen = ++generation.current
      release()
      setSession(null)
      dispatch({ type: 'start', at: Date.now() })
      const base = baseProfile(navigator.userAgent, inApp ? desktopOs : undefined)
      await reportDevice(client, base)
      let s: PlaySession
      try {
        s = await client.playback.play({
          params: { type: 'movie', id },
          body: {
            ...choice,
            subtitleId: subtitleRef.current,
            ...(start === undefined ? {} : { start }),
            profile: base,
          },
        })
      } catch (e) {
        if (gen === generation.current) dispatch({ type: 'error', message: (e as Error).message })
        return
      }
      if (gen !== generation.current) {
        client.playback.stop({ params: { id: s.id } }).catch(() => {})
        return
      }
      live.current = s
      setSession(s)
      // what this stream burns in, as the server decided: the start's key, so its list arriving
      // doesn't start it again
      const burns = s.decision.subtitle?.delivery === 'burn-in' ? s.decision.subtitle.id : ''
      if (started.current) started.current = started.current.replace(/\|[^|]*$/, `|${burns}`)
      dispatch({
        type: 'session',
        method: s.decision.method,
        start: s.start,
        duration: s.duration,
        at: Date.now(),
      })
      const v = video.current
      if (!s.url || !v) return
      const nativeHls = v.canPlayType('application/vnd.apple.mpegurl') !== ''
      const { default: Hls } =
        s.decision.method === 'direct-play' ? { default: null } : await import('hls.js')
      if (gen !== generation.current) return
      if (!Hls || (!Hls.isSupported() && nativeHls)) {
        v.src = media(s.url)
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
          if (!data.fatal || gen !== generation.current) return
          // 503: it waited a minute past Settings › Playback's limit (4.3's answer 7). hls.js
          // gives a failed load's HTTP status in `response.code`
          // (https://github.com/video-dev/hls.js/blob/v1.7.3/docs/API.md#errors)
          dispatch({
            type: 'error',
            message: data.response?.code === 503 ? TRANSCODE_LIMIT : data.details,
          })
        })
        h.loadSource(media(s.url))
        h.attachMedia(v)
        hls.current = h
      } else {
        dispatch({ type: 'error', message: 'This browser plays neither HLS nor MSE.' })
        return
      }
      // the person pressed Play to get here, so the browser lets it play with sound
      v.play().catch(() => {})
    },
    [client, id, release],
  )

  // start once the title and the picks are here, and again when the version or sound changes;
  // keyed by their ids, since every progress report refetches the title as new objects
  const ready = !!d && picks.status !== 'loading' && !!version
  const versionId = version?.id
  const audioId = audio?.id ?? null
  const started = useRef<string | null>(null)
  useEffect(() => {
    if (!ready || !versionId) return
    const key = `${versionId}|${audioId ?? ''}|${burnt ?? ''}`
    if (started.current === key) return
    const first = started.current === null
    started.current = key
    const at = first ? (fromStart ? 0 : undefined) : stateRef.current.position
    begin(at, { versionId, audioId })
  }, [ready, versionId, audioId, burnt, begin, fromStart])

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
      leave(s, playingStream.current && v ? v.currentTime : s.start, closing)
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
  }, [])

  /**
   * Stopped from Now playing (4.3a): the session's answer is a 404 with who stopped it and their
   * message (`StoppedDetails`). The stream is let go, and the screen says so.
   */
  const stoppedBy = useCallback((e: unknown) => {
    const d = e instanceof ApiError ? (e.details as Record<string, unknown> | null) : null
    if (d?.reason !== 'stopped' || typeof d.by !== 'string') return
    generation.current++
    live.current = null
    hls.current?.destroy()
    hls.current = null
    const v = video.current
    if (v) {
      v.removeAttribute('src')
      v.load()
    }
    playingStream.current = false
    dispatch({
      type: 'stopped',
      by: { name: d.by, message: typeof d.message === 'string' ? d.message : null },
    })
  }, [])

  const report = useCallback(() => {
    const s = live.current
    const v = video.current
    if (!s || !v || !playingStream.current) return
    const position = v.currentTime
    dispatch({ type: 'reported', position, at: Date.now() })
    client.playback
      .progress({ params: { id: s.id }, body: { position, paused: v.paused } })
      .catch(stoppedBy)
  }, [client, stoppedBy])

  // the server says this session was stopped (`playback.stopped`, sent to this person alone):
  // asking about it at once brings who stopped it, even before the stream played
  useEffect(
    () =>
      client.events.subscribe((e) => {
        const s = live.current
        if (e.topic !== 'playback.stopped' || !s || !e.ids?.includes(s.id)) return
        const v = video.current
        const position = playingStream.current && v ? v.currentTime : s.start
        client.playback
          .progress({ params: { id: s.id }, body: { position, paused: true } })
          .catch(stoppedBy)
      }),
    [client, stoppedBy],
  )

  // every REPORT_MS while playing, checked each second
  useEffect(() => {
    const t = setInterval(
      () => {
        if (reportDue(stateRef.current, Date.now())) report()
      },
      Math.min(1000, REPORT_MS),
    )
    return () => clearInterval(t)
  }, [report])

  /** The video's events, into the reducer. Pass to the `<video>` as its ref. */
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
    [report],
  )

  const seekTo = useCallback((s: number) => {
    const v = video.current
    if (v) v.currentTime = clampSeek(stateRef.current, s)
  }, [])

  return {
    detail,
    state,
    dispatch,
    session,
    version,
    audio,
    subtitle,
    subtitleUrl,
    /** The chosen subtitle is drawn into the picture by the server. */
    burnt: !!burnt,
    offsetMs,
    attach,
    video,
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
    /** Try again, or Start again: a new session from where it was. */
    retry: () =>
      begin(stateRef.current.position || undefined, {
        versionId: version?.id,
        audioId: audio?.id ?? null,
      }),
    setVersion: (versionId: string) => set({ versionId }),
    setAudio: (audioId: string) => set({ audioId }),
    setSubtitle: (subtitleId: string | null) => set({ subtitleId }),
    nudge: (dir: 1 | -1 | 0) => set({ subtitleOffsetMs: nudged(offsetMs, dir) }),
  }
}

export type Playback = ReturnType<typeof usePlayback>
