// SPDX-License-Identifier: AGPL-3.0-only
// The player's engine on the phone and the TV (C5; ADR 0051, 0052, 0055, 0059): expo-video's
// player (AVPlayer underneath) driven by `@highsea-tv/client/player`'s reducer. The web's side of
// this pair is ./playback.web.ts, a `<video>` with hls.js, behind the same `usePlayback`; what the
// two share is ./playback-shared.ts. Import it as `@highsea-tv/native/playback` (./playback-entry.ts),
// never by this file's name (apps/client/README.md › Platform files).
//
// It asks the server for a session with the person's picks and the app's built-in profile (`ios`
// or `tvos`), and plays its URL with this device's token in a header
// (https://docs.expo.dev/versions/latest/sdk/video/#videosource): the file for direct play, HLS
// otherwise, which AVPlayer plays itself. Changing the version or the sound starts a new session
// at the same place; subtitles and their timing never do. The position goes to the session every
// 10 s while playing and on pause and seek; leaving saves it and ends the session, which stops its
// ffmpeg. Now Playing and the lock screen's controls come from the player's
// `showNowPlayingNotification`, with the title and artwork in the source's `metadata`; AirPlay
// from `allowsExternalPlayback`, all three on the phone only: the docs list none of them for tvOS
// (https://docs.expo.dev/versions/latest/sdk/video/#videoplayer).
import {
  type Cue,
  clampSeek,
  initialPlayer,
  parseCues,
  playerReducer,
} from '@highsea-tv/client/player'
import { useClient } from '@highsea-tv/sdk/react'
import { useEventListener } from 'expo'
import { useVideoPlayer, type VideoPlayer } from 'expo-video'
import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import { Platform } from 'react-native'
import { playbackProfile } from './device.ts'
import { useMedia } from './media.ts'
import {
  TRANSCODE_LIMIT,
  type UsePlayback,
  useChoices,
  useReportTimer,
  useSessionStart,
  useStarts,
  useStoppedEvent,
} from './playback-shared.ts'

export { TRANSCODE_LIMIT } from './playback-shared.ts'

/**
 * Empties the player. expo-video warns on every `replace`, since on iOS it loads a new asset on
 * the main thread, but with no source it loads nothing: it only cancels a load under way and
 * clears the item (VideoPlayer.swift's `replaceCurrentItem`), which `replaceAsync(null)` wouldn't
 * cancel. So the warning is turned off here, by its documented second argument.
 */
const clear = (player: VideoPlayer) => player.replace(null, true)

export const usePlayback: UsePlayback<VideoPlayer> = (id, fromStart) => {
  const client = useClient()
  const media = useMedia()
  const [state, dispatch] = useReducer(playerReducer, undefined, () => initialPlayer(Date.now()))
  const [external, setExternal] = useState(false)
  // counts the sources loaded, so the subtitle choice below is made again on each one
  const [loads, setLoads] = useState(0)
  const [cues, setCues] = useState<Cue[]>([])
  // true once the current stream plays: until then the player's events are about nothing the
  // server should save
  const playingStream = useRef(false)
  // where the stream should start once it's loaded: AVPlayer seeks only an item it has read
  const pendingStart = useRef<number | null>(null)
  // the place last heard from the player, kept for leaving after the player is let go
  const position = useRef(0)
  const stateRef = useRef(state)
  stateRef.current = state
  // the start's key (`useStarts`)
  const started = useRef<string | null>(null)
  const mediaRef = useRef(media)
  mediaRef.current = media
  // the title and its poster for Now Playing, read when a session starts
  const nowPlaying = useRef<{ title?: string; artwork: string | null }>({ artwork: null })

  const player = useVideoPlayer(null, (p) => {
    p.timeUpdateEventInterval = 0.25
    if (Platform.isTV) return
    p.showNowPlayingNotification = true
    p.staysActiveInBackground = true
    p.allowsExternalPlayback = true
  })

  const { session, live, generation, begin, stopped } = useSessionStart({
    client,
    id,
    dispatch,
    started,
    profile: () => playbackProfile,
    /** Lets go of the picture: the player's source. */
    clearPicture: () => {
      player.pause()
      clear(player)
      playingStream.current = false
      pendingStart.current = null
    },
    attach: async (s, current) => {
      const src = s.url ? mediaRef.current(s.url) : undefined
      if (!src) return
      const { title, artwork } = nowPlaying.current
      const art = artwork ? mediaRef.current(artwork)?.uri : undefined
      position.current = s.start
      pendingStart.current = s.start || null
      await player.replaceAsync({
        ...src,
        // AVPlayer needs telling a playlist is HLS when its address doesn't end in .m3u8
        contentType: s.decision.method === 'direct-play' ? 'progressive' : 'hls',
        metadata: { title, ...(art ? { artwork: art } : {}) },
      })
      if (current()) player.play()
    },
  })
  const c = useChoices(id, session)
  const { subtitle, subtitlePath } = c
  const burnt = c.burnt
  const d = c.detail.data
  nowPlaying.current = { title: d?.item.title, artwork: d?.item.art.poster ?? null }

  // the chosen subtitle's cues, from the session's WebVTT; the offset is added as they're drawn
  useEffect(() => {
    setCues([])
    const src = subtitlePath ? mediaRef.current(subtitlePath) : undefined
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
  }, [subtitlePath])

  const retry = useStarts(c, fromStart, () => stateRef.current.position, begin, started)

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
    [client, live, generation],
  )

  const report = useCallback(
    (paused = !player.playing) => {
      const s = live.current
      if (!s || !playingStream.current) return
      const at = position.current
      dispatch({ type: 'reported', position: at, at: Date.now() })
      client.playback
        .progress({ params: { id: s.id }, body: { position: at, paused } })
        .catch(stopped)
    },
    [client, player, live, stopped],
  )

  useStoppedEvent(
    client,
    live,
    (s) => (playingStream.current ? position.current : s.start),
    stopped,
  )
  // `report`'s argument defaults to the player's own state
  useReportTimer(stateRef, report)

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
    detail: c.detail,
    state,
    dispatch,
    player,
    session,
    version: c.version,
    audio: c.audio,
    subtitle,
    // the engine loads the WebVTT itself, with the device's token in a header (`cues`)
    subtitleUrl: null,
    cues,
    burnt: !!burnt,
    pictureTrack: c.pictureTrack,
    offsetMs: c.offsetMs,
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
    retry,
    setVersion: c.setVersion,
    setAudio: c.setAudio,
    setSubtitle: c.setSubtitle,
    nudge: c.nudge,
  }
}

export type Playback = ReturnType<typeof usePlayback>
