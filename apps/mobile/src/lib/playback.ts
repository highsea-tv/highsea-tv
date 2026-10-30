// SPDX-License-Identifier: AGPL-3.0-only
// The player's engine on the phone (C5; ADR 0051, 0052, 0055, 0059): expo-video's player
// (AVPlayer underneath) driven by `@highsea-tv/client/player`'s reducer, as the web's
// `usePlayback` drives a `<video>` (apps/web/src/playback.ts). It asks the server for a session
// with the person's picks and the `ios` built-in profile, and plays its URL with this device's
// token in a header (https://docs.expo.dev/versions/latest/sdk/video/#videosource): the file for
// direct play, HLS otherwise, which AVPlayer plays itself. Changing the version or the sound
// starts a new session at the same place; subtitles and their timing never do. The position goes
// to the session every 10 s while playing and on pause and seek; leaving saves it and ends the
// session, which stops its ffmpeg. Now Playing and the lock screen's controls come from the
// player's `showNowPlayingNotification`, with the title and artwork in the source's `metadata`;
// AirPlay from `allowsExternalPlayback`
// (https://docs.expo.dev/versions/latest/sdk/video/#videoplayer).
import type { PlaySession } from '@highsea-tv/api-contract'
import { useItem, usePicks } from '@highsea-tv/client/data'
import {
  type Cue,
  clampSeek,
  initialPlayer,
  nudged,
  parseCues,
  playerReducer,
  REPORT_MS,
  reportDue,
} from '@highsea-tv/client/player'
import { ApiError } from '@highsea-tv/sdk'
import { useClient } from '@highsea-tv/sdk/react'
import { useEventListener } from 'expo'
import { useVideoPlayer } from 'expo-video'
import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import { useMedia } from './media.ts'

/** The player's error when the server is transcoding all it's allowed to, and this one gave up. */
export const TRANSCODE_LIMIT = 'transcode-limit'

type Picks = {
  versionId: string | null
  audioId: string | null
  subtitleId: string | null
  subtitleOffsetMs: number
}

export function usePlayback(id: number, fromStart: boolean) {
  const client = useClient()
  const media = useMedia()
  const detail = useItem(id)
  const { picks, save } = usePicks(id)
  const [state, dispatch] = useReducer(playerReducer, undefined, () => initialPlayer(Date.now()))
  const [session, setSession] = useState<PlaySession | null>(null)
  const [local, setLocal] = useState<Partial<Picks>>({})
  const [external, setExternal] = useState(false)
  // counts the sources loaded, so the subtitle choice below is made again on each one
  const [loads, setLoads] = useState(0)
  const [cues, setCues] = useState<Cue[]>([])
  const live = useRef<PlaySession | null>(null)
  // each start bumps this, so a slow answer to an older one is ended, not played
  const generation = useRef(0)
  // true once the current stream plays: until then the player's events are about nothing the
  // server should save
  const playingStream = useRef(false)
  // where the stream should start once it's loaded: AVPlayer seeks only an item it has read
  const pendingStart = useRef<number | null>(null)
  // the place last heard from the player, kept for leaving after the player is let go
  const position = useRef(0)
  const stateRef = useRef(state)
  stateRef.current = state
  const mediaRef = useRef(media)
  mediaRef.current = media

  const player = useVideoPlayer(null, (p) => {
    p.timeUpdateEventInterval = 0.25
    p.showNowPlayingNotification = true
    p.staysActiveInBackground = true
    p.allowsExternalPlayback = true
  })

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
  // a subtitle the server draws into the picture is part of the stream: choosing one, or leaving
  // one, starts again. Judged by the last session's list, kept while the next one starts
  const tracks = useRef<PlaySession['subtitles']>([])
  if (session) tracks.current = session.subtitles
  const track = subtitle ? tracks.current.find((t) => t.id === subtitle.id) : undefined
  const burnt = subtitle && track?.delivery === 'burn-in' ? subtitle.id : null
  const subtitleUrl =
    subtitle && !burnt ? (session?.subtitles.find((t) => t.id === subtitle.id)?.url ?? null) : null
  // the subtitle goes with each start (the server may need it), but changing it never restarts
  const subtitleRef = useRef<string | null>(null)
  subtitleRef.current = subtitle?.id ?? null

  // the chosen subtitle's cues, from the session's WebVTT; the offset is added as they're drawn
  useEffect(() => {
    setCues([])
    const src = subtitleUrl ? mediaRef.current(subtitleUrl) : undefined
    if (!src) return
    let gone = false
    fetch(src.uri, { headers: src.headers })
      .then((r) => (r.ok ? r.text() : ''))
      .then((text) => {
        if (!gone) setCues(parseCues(text))
      })
      .catch(() => {})
    return () => {
      gone = true
    }
  }, [subtitleUrl])

  const set = useCallback(
    (patch: Partial<Picks>) => {
      setLocal((l) => ({ ...l, ...patch }))
      save.run(patch).catch(() => {})
    },
    [save],
  )

  /** Lets go of the current stream: the player's source and the session. */
  const release = useCallback(() => {
    player.pause()
    player.replace(null)
    playingStream.current = false
    pendingStart.current = null
    const s = live.current
    live.current = null
    if (s) client.playback.stop({ params: { id: s.id } }).catch(() => {})
  }, [client, player])

  const title = d?.item.title
  const artwork = d?.item.art.poster ?? null
  const begin = useCallback(
    async (start: number | undefined, choice: { versionId?: string; audioId?: string | null }) => {
      const gen = ++generation.current
      release()
      setSession(null)
      dispatch({ type: 'start', at: Date.now() })
      let s: PlaySession
      try {
        s = await client.playback.play({
          params: { type: 'movie', id },
          body: {
            ...choice,
            subtitleId: subtitleRef.current,
            ...(start === undefined ? {} : { start }),
            profile: 'ios',
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
      const src = s.url ? mediaRef.current(s.url) : undefined
      if (!src) return
      const art = artwork ? mediaRef.current(artwork)?.uri : undefined
      position.current = s.start
      pendingStart.current = s.start || null
      await player.replaceAsync({
        ...src,
        // AVPlayer needs telling a playlist is HLS when its address doesn't end in .m3u8
        contentType: s.decision.method === 'direct-play' ? 'progressive' : 'hls',
        metadata: { title, ...(art ? { artwork: art } : {}) },
      })
      if (gen !== generation.current) return
      player.play()
    },
    [client, id, release, player, title, artwork],
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

  // leaving: a last report, paused, which the server saves at once, then the session's end, after
  // it, so the end can't save an older place over it
  useEffect(
    () => () => {
      generation.current++
      const s = live.current
      live.current = null
      if (s) {
        const at = playingStream.current ? position.current : s.start
        client.playback
          .progress({ params: { id: s.id }, body: { position: at, paused: true } })
          .catch(() => {})
          .then(() => client.playback.stop({ params: { id: s.id } }))
          .catch(() => {})
      }
      playingStream.current = false
      // StrictMode runs effects twice in development; the next mount starts afresh
      started.current = null
    },
    [client],
  )

  /**
   * Stopped from Now playing (4.3a): the session's answer is a 404 with who stopped it and their
   * message (`StoppedDetails`). The stream is let go, and the screen says so.
   */
  const stoppedBy = useCallback(
    (e: unknown) => {
      const x = e instanceof ApiError ? (e.details as Record<string, unknown> | null) : null
      if (x?.reason !== 'stopped' || typeof x.by !== 'string') return
      generation.current++
      live.current = null
      player.pause()
      player.replace(null)
      playingStream.current = false
      dispatch({
        type: 'stopped',
        by: { name: x.by, message: typeof x.message === 'string' ? x.message : null },
      })
    },
    [player],
  )

  const report = useCallback(
    (paused = !player.playing) => {
      const s = live.current
      if (!s || !playingStream.current) return
      const at = position.current
      dispatch({ type: 'reported', position: at, at: Date.now() })
      client.playback
        .progress({ params: { id: s.id }, body: { position: at, paused } })
        .catch(stoppedBy)
    },
    [client, player, stoppedBy],
  )

  // the server says this session was stopped (`playback.stopped`, sent to this person alone):
  // asking about it at once brings who stopped it, even before the stream played
  useEffect(
    () =>
      client.events.subscribe((e) => {
        const s = live.current
        if (e.topic !== 'playback.stopped' || !s || !e.ids?.includes(s.id)) return
        const at = playingStream.current ? position.current : s.start
        client.playback
          .progress({ params: { id: s.id }, body: { position: at, paused: true } })
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

  // the player's events, into the reducer
  // (https://docs.expo.dev/versions/latest/sdk/video/#videoplayerevents)
  useEventListener(player, 'statusChange', ({ status, error }) => {
    if (!live.current) return
    if (status === 'readyToPlay') {
      if (player.duration > 0) dispatch({ type: 'duration', duration: player.duration })
      const at = pendingStart.current
      pendingStart.current = null
      if (at) player.currentTime = at
      dispatch({ type: 'ready' })
    } else if (status === 'loading') dispatch({ type: 'waiting', at: Date.now() })
    else if (status === 'error')
      dispatch({
        type: 'error',
        // a transcode past Settings › Playback's limit answers 503 after its wait (4.3's
        // answer 7), which AVPlayer reports in its message
        message: /\b503\b/.test(error?.message ?? '')
          ? TRANSCODE_LIMIT
          : (error?.message ?? 'media error'),
      })
  })
  useEventListener(player, 'playingChange', ({ isPlaying }) => {
    if (isPlaying) {
      if (live.current) playingStream.current = true
      dispatch({ type: 'ready' })
      dispatch({ type: 'play' })
    } else {
      dispatch({ type: 'pause' })
      if (player.status === 'readyToPlay' && stateRef.current.phase === 'ready') report(true)
    }
  })
  useEventListener(player, 'timeUpdate', ({ currentTime }) => {
    if (!playingStream.current) return
    position.current = currentTime
    dispatch({ type: 'time', position: currentTime })
  })
  useEventListener(player, 'playToEnd', () => {
    dispatch({ type: 'ended' })
    report(true)
  })
  useEventListener(player, 'isExternalPlaybackActiveChange', ({ isExternalPlaybackActive }) =>
    setExternal(isExternalPlaybackActive),
  )

  // on another screen the phone draws nothing, so the TV shows the chosen subtitle from the HLS
  // playlist's renditions, matched by language, and none on the phone again
  // (https://docs.expo.dev/versions/latest/sdk/video/#subtitletrack). It's made again once each
  // source has loaded: before then expo-video has no item to select on, and AVPlayer, given
  // expo-video's criteria preferring a legible track, turns one of the renditions on by itself
  useEventListener(player, 'sourceLoad', () => setLoads((n) => n + 1))
  const subtitleLanguage = subtitle && !burnt ? subtitle.language : null
  // biome-ignore lint/correctness/useExhaustiveDependencies: loads is the trigger, not a value read
  useEffect(() => {
    if (!external || !subtitleLanguage) {
      player.subtitleTrack = null
      return
    }
    player.subtitleTrack =
      player.availableSubtitleTracks.find((t) => t.language === subtitleLanguage) ?? null
  }, [player, external, subtitleLanguage, loads])

  const seekTo = useCallback(
    (to: number) => {
      const at = clampSeek(stateRef.current, to)
      player.currentTime = at
      position.current = at
      dispatch({ type: 'seek', position: at })
      report()
    },
    [player, report],
  )

  return {
    detail,
    state,
    dispatch,
    player,
    session,
    version,
    audio,
    subtitle,
    cues,
    /** The chosen subtitle is drawn into the picture by the server. */
    burnt: !!burnt,
    /** The chosen subtitle is a picture the app can't draw yet. */
    pictureTrack: !!subtitle && !burnt && !!session && !subtitleUrl,
    offsetMs,
    /** Playing on another screen through AirPlay. */
    external,
    toggle: () => {
      if (player.playing) player.pause()
      else {
        if (stateRef.current.duration && stateRef.current.position >= stateRef.current.duration)
          seekTo(0)
        player.play()
      }
    },
    seekTo,
    seekBy: (by: number) => seekTo(position.current + by),
    /** Try again, or Start again: a new session from where it was. */
    retry: () =>
      begin(stateRef.current.position || undefined, {
        versionId: version?.id,
        audioId: audio?.id ?? null,
      }),
    setVersion: (v: string) => set({ versionId: v }),
    setAudio: (a: string) => set({ audioId: a }),
    setSubtitle: (s: string | null) => set({ subtitleId: s }),
    nudge: (dir: 1 | -1 | 0) => set({ subtitleOffsetMs: nudged(offsetMs, dir) }),
  }
}

export type Playback = ReturnType<typeof usePlayback>
