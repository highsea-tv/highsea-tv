// SPDX-License-Identifier: AGPL-3.0-only
// C5 Player chrome, the state every platform shares (docs/product/player.md). There's no real
// video in Phase 2: a still stands in for the frame, and the position runs on a real-time timer.
// Picks (version, audio, subtitles, the subtitle nudge) save per title as they change, and the
// position is reported on pause, on seek and on the way out, for Resume.
import {
  leavePlayer as leave,
  NUDGE_MS,
  playNext as next,
  type StreamState,
} from '@highsea-tv/client/player'
import type { ClientDetail, PlaybackPrefs } from '@highsea-tv/mock/types'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useAction, useQuery } from '../mock/hooks.tsx'
import { useStreamState } from './data.ts'
import { musicPlayer } from './music-player.ts'
import { usePlaybackSettings } from './prefs.tsx'

type Navigate = (to: string, options?: { replace?: boolean }) => void

/** The browser's history as @highsea-tv/client's player rules take it. */
const browser = (navigate: Navigate) => ({
  canGoBack: () => history.length > 1,
  back: () => history.back(),
  replace: (to: string) => navigate(to, { replace: true }),
})

/**
 * Leaves the player for the page it was opened from, so Back there doesn't return to the player.
 * Opened directly, `to` takes the player's place.
 */
export const leavePlayer = (navigate: Navigate, to: string) => leave(browser(navigate), to)

/** The next title takes the player's place, so leaving it still goes back where this began. */
export const playNext = (navigate: Navigate, id: string) => next(browser(navigate), id)

export function usePlayer(id: string, fromStart: boolean) {
  const detail = useQuery(`client:item:${id}`, (c) => c.library.item(id))
  const prefs = useQuery(`client:prefs:${id}`, (c) => c.playback.prefs(id))
  const savePrefs = useAction((c, patch: PlaybackPrefs) => c.playback.setPrefs(id, patch))
  const report = useAction((c, position: number) => c.playback.progress(id, position))

  // the person's Playback settings (client-settings.md#playback): what plays next, and intros
  const [settings] = usePlaybackSettings()
  const d = detail.data
  const duration = d ? d.item.runtimeMinutes * 60 : 0
  const [position, setPosition] = useState<number | null>(null)
  const [playing, setPlaying] = useState(true)
  // the playback speed (the web player's Speed, prototype-gaps.md › 4.1)
  const [rate, setRate] = useState(1)
  const [local, setLocal] = useState<PlaybackPrefs>({})
  const pos = position ?? (d && !fromStart ? d.item.position : 0)
  const posRef = useRef(pos)
  posRef.current = pos

  // the stream's state, from the prototype's toolbar (player.md#states); Try again, Cancel and
  // Start again set it back to normal until the toolbar picks another
  const picked = useStreamState()
  const [cleared, setCleared] = useState<StreamState | null>(null)
  // Next up comes in by itself where the credits start (a film's last 20 s), until Cancel
  const endsAt = d?.episode?.credits ?? duration - 20
  const [dismissed, setDismissed] = useState(false)
  const chosen: StreamState = cleared === picked ? 'normal' : picked
  const arrived = !!d?.upNext && !dismissed && duration > 0 && pos >= endsAt
  const stream: StreamState = chosen === 'normal' && arrived ? 'next-up' : chosen
  // waiting for segments, or no stream at all: the position holds
  const held =
    stream === 'preparing' || stream === 'buffering' || stream === 'failed' || stream === 'stopped'
  // Next up shows as the credits start, so the review starts there
  useEffect(() => {
    if (picked === 'next-up' && duration) {
      setPosition(endsAt)
      setPlaying(true)
    }
  }, [picked, duration, endsAt])

  // Skip intros automatically jumps to the intro's end as it starts, as Netflix's setting does
  const intro = d?.episode?.intro
  useEffect(() => {
    if (settings.skipIntros && intro && pos >= intro.start && pos < intro.end)
      setPosition(intro.end)
  }, [settings.skipIntros, intro, pos])

  // a film playing pauses the music, as one player on a device does; it waits in its bar
  useEffect(() => {
    if (musicPlayer.get().playing) musicPlayer.toggle()
  }, [])

  // the clock: one second a second while playing (more or less at another speed), stopping at
  // the end
  useEffect(() => {
    if (!playing || !duration || held) return
    const t = setInterval(
      () => setPosition((p) => Math.min(duration, (p ?? posRef.current) + rate)),
      1000,
    )
    return () => clearInterval(t)
  }, [playing, duration, held, rate])
  useEffect(() => {
    if (playing && duration && pos >= duration) setPlaying(false)
  }, [playing, duration, pos])

  // report the position on the way out, once playback has really started (not on React's
  // development double-mount, before the title has loaded)
  const reportRef = useRef(report.run)
  reportRef.current = report.run
  const started = useRef(false)
  if (d) started.current = true
  useEffect(
    () => () => {
      if (started.current) reportRef.current(posRef.current).catch(() => {})
    },
    [],
  )

  const merged: PlaybackPrefs = { ...prefs.data, ...local }
  const defaults: ClientDetail['defaults'] | undefined = d?.defaults
  const version =
    d?.versions.find((v) => v.id === (merged.versionId ?? defaults?.versionId)) ?? d?.versions[0]
  const audioId = merged.audioId ?? defaults?.audioId ?? version?.audio[0]?.id ?? null
  const subtitleId =
    merged.subtitleId !== undefined ? merged.subtitleId : (defaults?.subtitleId ?? null)
  const offsetMs = merged.subtitleOffsetMs ?? 0

  const set = useCallback(
    (patch: PlaybackPrefs) => {
      setLocal((l) => ({ ...l, ...patch }))
      savePrefs.run(patch).catch(() => {})
    },
    [savePrefs],
  )

  const seekTo = useCallback(
    (s: number) => {
      const next = Math.max(0, Math.min(duration, s))
      setPosition(next)
      report.run(next).catch(() => {})
    },
    [duration, report],
  )

  return {
    detail,
    duration,
    position: pos,
    playing,
    stream,
    /** Back to a normal stream: Try again, Start again, or Cancel on Next up. */
    clearStream: () => {
      setCleared(picked)
      if (stream === 'next-up') setDismissed(true)
      else setPlaying(true)
    },
    /** Next up counts down to play by itself only with Play the next episode automatically on. */
    autoplay: settings.autoplayNext,
    /** While the intro plays, Skip intro jumps to its end (player.md › Episodes). */
    intro:
      d?.episode?.intro && pos >= d.episode.intro.start && pos < d.episode.intro.end
        ? d.episode.intro
        : null,
    /**
     * While an episode's credits play with Next up put away, or nothing next: Skip credits hands
     * back to Next up, or ends the episode (player.md › Episodes).
     */
    credits: !!d?.episode?.credits && duration > 0 && pos >= endsAt && pos < duration,
    skipCredits: () => {
      if (d?.upNext) setDismissed(false)
      else setPosition(duration)
    },
    version,
    audio: version?.audio.find((a) => a.id === audioId) ?? null,
    subtitle: version?.subtitles.find((t) => t.id === subtitleId) ?? null,
    offsetMs,
    toggle: () => {
      if (playing) report.run(posRef.current).catch(() => {})
      // at the end, Play starts over
      if (!playing && posRef.current >= duration) setPosition(0)
      setPlaying(!playing)
    },
    seekBy: (s: number) => seekTo(posRef.current + s),
    seekTo,
    rate,
    setRate,
    setVersion: (versionId: string) => set({ versionId }),
    setAudio: (audioId: string) => set({ audioId }),
    setSubtitle: (subtitleId: string | null) => set({ subtitleId }),
    nudge: (dir: 1 | -1 | 0) =>
      set({ subtitleOffsetMs: dir === 0 ? 0 : offsetMs + dir * NUDGE_MS }),
  }
}

export type Player = ReturnType<typeof usePlayer>

/** "+150 ms", "−50 ms", "On time". */
export const offsetLabel = (ms: number) =>
  ms === 0 ? 'On time' : `${ms > 0 ? '+' : '−'}${Math.abs(ms)} ms`

/**
 * In place of the nudge for a subtitle that's a picture, which the server draws into the film
 * (checkpoint 4.3's answer 6).
 */
export const PICTURE_TIMING =
  'This subtitle is drawn into the picture, so its timing can’t be changed.'

/** Plain words for the nudge's direction. */
export const offsetHint = (ms: number) =>
  ms === 0
    ? 'Subtitles match the audio track’s timing.'
    : ms > 0
      ? `Subtitles appear ${Math.abs(ms)} ms later.`
      : `Subtitles appear ${Math.abs(ms)} ms earlier.`

/** A line of dialogue for the preview, per title (the prototype has no real cues). */
export const sampleCue = (title: string) =>
  title === 'Sintel' ? 'Where did you go, Scales?' : 'I didn’t think anyone would find this place.'

/** Trickplay: the frame shown while scrubbing. The prototype reuses the title's still. */
export const trickplayAt = (still: string, _seconds: number) => still
