// SPDX-License-Identifier: AGPL-3.0-only
// What the player's two engines share (C5; ADR 0051, 0052, 0055; one-client-platform.md › A):
// expo-video on the phone and the TV (./playback.ts) and the `<video>` with hls.js on the web
// (./playback.web.ts) sit behind one hook, `usePlayback`, so one player screen sits on top. Here,
// once: the API the screen reads (`PlaybackApi`, the platform's own picture handle aside), the
// person's choices of version, sound and subtitle and the rules they follow, when a stream starts
// again, the reports' timer, and how a session stopped from Now playing is heard. What the
// player's state does is `@highsea-tv/client/player`'s reducer. Nothing here imports a platform.
import type { PlaySession } from '@highsea-tv/api-contract'
import { useItem, usePicks } from '@highsea-tv/client/data'
import {
  type Cue,
  nudged,
  type PlayerEvent,
  type PlayerState,
  REPORT_MS,
  reportDue,
  type StoppedBy,
} from '@highsea-tv/client/player'
import { ApiError, type HighseaClient } from '@highsea-tv/sdk'
import { type Dispatch, type RefObject, useCallback, useEffect, useRef, useState } from 'react'

/** The player's error when the server is transcoding all it's allowed to, and this one gave up. */
export const TRANSCODE_LIMIT = 'transcode-limit'

type Picks = {
  versionId: string | null
  audioId: string | null
  subtitleId: string | null
  subtitleOffsetMs: number
}

/** What a start asks for: the version and the sound, and the subtitle, which goes with each start
 *  (the server may need it) but never restarts one. */
export type Choice = { versionId?: string; audioId?: string | null; subtitleId: string | null }

/**
 * The person's choices for this film: the saved picks with this visit's changes over them, and
 * what they come to against the title and the current session. Each change is saved as it's made.
 */
export function useChoices(id: number, session: PlaySession | null) {
  const detail = useItem(id)
  const { picks, save } = usePicks(id)
  const [local, setLocal] = useState<Partial<Picks>>({})

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
  // nudges count from the last one asked for, so presses quicker than a render all add up
  const offsetRef = useRef(offsetMs)
  offsetRef.current = offsetMs
  // a subtitle the server draws into the picture (4.3) is part of the stream: choosing one, or
  // leaving one, starts again. Judged by the last session's list, kept while the next one starts
  const tracks = useRef<PlaySession['subtitles']>([])
  if (session) tracks.current = session.subtitles
  const burnt =
    subtitle && tracks.current.find((t) => t.id === subtitle.id)?.delivery === 'burn-in'
      ? subtitle.id
      : null
  // the chosen subtitle's WebVTT as the server gives it (a path), when the app draws it
  const subtitlePath =
    subtitle && !burnt ? (session?.subtitles.find((t) => t.id === subtitle.id)?.url ?? null) : null
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

  return {
    detail,
    /** The title and the picks are here, with a version to play. */
    ready: !!d && picks.status !== 'loading' && !!version,
    version,
    audio,
    subtitle,
    offsetMs,
    /** The id of the chosen subtitle when the server draws it into the picture. */
    burnt,
    subtitlePath,
    subtitleRef,
    /** The chosen subtitle is a picture the app can't draw yet. */
    pictureTrack: !!subtitle && !burnt && !!session && !subtitlePath,
    setVersion: (versionId: string) => set({ versionId }),
    setAudio: (audioId: string) => set({ audioId }),
    setSubtitle: (subtitleId: string | null) => set({ subtitleId }),
    nudge: (dir: 1 | -1 | 0) => {
      offsetRef.current = nudged(offsetRef.current, dir)
      set({ subtitleOffsetMs: offsetRef.current })
    },
  }
}

type Choices = ReturnType<typeof useChoices>

/**
 * Starts once the title and the picks are here, and again when the version, the sound or a
 * burned-in subtitle changes; keyed by their ids, since every progress report refetches the
 * title as new objects. The first start begins where the person left off, or at 0 for Start
 * again; later ones where the stream is. `started` holds the key, which `keepBurns` updates and
 * leaving clears. Returns Try again (or Start again): a new session from where it was.
 */
export function useStarts(
  c: Choices,
  fromStart: boolean,
  position: () => number,
  begin: (start: number | undefined, choice: Choice) => void,
  started: RefObject<string | null>,
) {
  const versionId = c.version?.id
  const audioId = c.audio?.id ?? null
  const { ready, burnt, subtitleRef } = c
  const at = useRef(position)
  at.current = position
  useEffect(() => {
    if (!ready || !versionId) return
    const key = `${versionId}|${audioId ?? ''}|${burnt ?? ''}`
    if (started.current === key) return
    const first = started.current === null
    started.current = key
    // Taken as the start begins: on the web a subtitle picked while the device report is
    // awaited goes out on the next start instead (one extra restart if it needs burning in).
    const subtitleId = subtitleRef.current
    begin(first ? (fromStart ? 0 : undefined) : at.current(), { versionId, audioId, subtitleId })
  }, [ready, versionId, audioId, burnt, begin, fromStart, started, subtitleRef])
  return () =>
    begin(at.current() || undefined, { versionId, audioId, subtitleId: subtitleRef.current })
}

/**
 * Asking the server for a session and handing it to the engine's picture, the same on every
 * platform: each start lets go of the last stream (`clearPicture`, then the session's end), asks
 * with the platform's `profile`, ends an answer that arrives after a newer start instead of
 * playing it, and gives the session to `attach`, which asks `current()` after anything it awaits.
 * `stopped` hears a report's error: stopped from Now playing (4.3a), the stream is let go and the
 * screen says who stopped it. `started` is `useStarts`' key.
 */
export function useSessionStart(o: {
  client: HighseaClient
  id: number
  dispatch: Dispatch<PlayerEvent>
  started: RefObject<string | null>
  /** The built-in profile this platform starts from (ADR 0052), named as the server knows it. */
  profile: () => string | Promise<string>
  clearPicture: () => void
  attach: (s: PlaySession, current: () => boolean) => void | Promise<void>
}) {
  const { client, dispatch, started } = o
  const [session, setSession] = useState<PlaySession | null>(null)
  const live = useRef<PlaySession | null>(null)
  // each start bumps this, so a slow answer to an older one is ended, not played
  const generation = useRef(0)
  // the engine's latest callbacks and title, read when they're needed
  const latest = useRef(o)
  latest.current = o

  const begin = useCallback(
    async (start: number | undefined, choice: Choice) => {
      const gen = ++generation.current
      latest.current.clearPicture()
      const last = live.current
      live.current = null
      if (last) client.playback.stop({ params: { id: last.id } }).catch(() => {})
      setSession(null)
      dispatch({ type: 'start', at: Date.now() })
      const profile = await latest.current.profile()
      let s: PlaySession
      try {
        s = await client.playback.play({
          params: { type: 'movie', id: latest.current.id },
          body: { ...choice, ...(start === undefined ? {} : { start }), profile },
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
      keepBurns(started, s)
      dispatch({
        type: 'session',
        method: s.decision.method,
        start: s.start,
        duration: s.duration,
        at: Date.now(),
      })
      await latest.current.attach(s, () => gen === generation.current)
    },
    [client, dispatch, started],
  )

  const stopped = useCallback(
    (e: unknown) => {
      const by = stoppedBy(e)
      if (!by) return
      generation.current++
      live.current = null
      latest.current.clearPicture()
      dispatch({ type: 'stopped', by })
    },
    [dispatch],
  )

  return { session, live, generation, begin, stopped }
}

/**
 * What a session burns in, as the server decided, goes into the start's key, so its list
 * arriving doesn't start it again.
 */
function keepBurns(started: RefObject<string | null>, s: PlaySession) {
  const burns = s.decision.subtitle?.delivery === 'burn-in' ? s.decision.subtitle.id : ''
  if (started.current) started.current = started.current.replace(/\|[^|]*$/, `|${burns}`)
}

/**
 * Stopped from Now playing (4.3a): the session's answer is a 404 with who stopped it and their
 * message (`StoppedDetails`). Anything else is no stop.
 */
function stoppedBy(e: unknown): StoppedBy | null {
  const d = e instanceof ApiError ? (e.details as Record<string, unknown> | null) : null
  if (d?.reason !== 'stopped' || typeof d.by !== 'string') return null
  return { name: d.by, message: typeof d.message === 'string' ? d.message : null }
}

/**
 * The server says this session was stopped (`playback.stopped`, sent to this person alone):
 * asking about it at once, paused at `at`, brings who stopped it, even before the stream played.
 */
export function useStoppedEvent(
  client: HighseaClient,
  live: RefObject<PlaySession | null>,
  at: (s: PlaySession) => number,
  onError: (e: unknown) => void,
) {
  const place = useRef(at)
  place.current = at
  useEffect(
    () =>
      client.events.subscribe((e) => {
        const s = live.current
        if (e.topic !== 'playback.stopped' || !s || !e.ids?.includes(s.id)) return
        client.playback
          .progress({ params: { id: s.id }, body: { position: place.current(s), paused: true } })
          .catch(onError)
      }),
    [client, live, onError],
  )
}

/** Reports every REPORT_MS while playing, checked each second. */
export function useReportTimer(state: RefObject<PlayerState>, report: () => void) {
  useEffect(() => {
    const t = setInterval(
      () => {
        if (reportDue(state.current, Date.now())) report()
      },
      Math.min(1000, REPORT_MS),
    )
    return () => clearInterval(t)
  }, [state, report])
}

/** Each engine's `usePlayback`: the same arguments, and the same API but for `Player`. */
export type UsePlayback<Player> = (id: number, fromStart: boolean) => PlaybackApi<Player>

/**
 * What the player screen reads, the same from both engines. `Player` is the platform's handle
 * on the picture: expo-video's `VideoPlayer` for its `VideoView`, or the web's `<video>`.
 */
export type PlaybackApi<Player> = {
  detail: Choices['detail']
  state: PlayerState
  dispatch: Dispatch<PlayerEvent>
  player: Player
  session: PlaySession | null
  version: Choices['version']
  audio: Choices['audio']
  subtitle: Choices['subtitle']
  /**
   * The web's: the chosen subtitle's WebVTT at the address the page loads it from, for the
   * `<track>` the screen puts in the `<video>`. Always null on the phone and the TV, whose engine
   * loads the file itself with the device's token in a header and gives its `cues`.
   */
  subtitleUrl: string | null
  /** Its cues, where the engine reads them itself; on the web the browser reads them (`player`). */
  cues: Cue[]
  /** The chosen subtitle is drawn into the picture by the server. */
  burnt: boolean
  /** The chosen subtitle is a picture the app can't draw yet. */
  pictureTrack: boolean
  offsetMs: number
  /** Playing on another screen (AirPlay). */
  external: boolean
  toggle: () => void
  seekTo: (to: number) => void
  seekBy: (by: number) => void
  /** Try again, or Start again: a new session from where it was. */
  retry: () => void
  setVersion: (versionId: string) => void
  setAudio: (audioId: string) => void
  setSubtitle: (subtitleId: string | null) => void
  nudge: (dir: 1 | -1 | 0) => void
}
