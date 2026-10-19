// SPDX-License-Identifier: AGPL-3.0-only
// C5 Player chrome, the state every platform shares (docs/product/player.md). There's no real
// video in Phase 2: a still stands in for the frame, and the position runs on a real-time timer.
// Picks (version, audio, subtitles, the subtitle nudge) save per title as they change, and the
// position is reported on pause, on seek and on the way out, for Resume.
import { useCallback, useEffect, useRef, useState } from 'react'
import { useAction, useQuery } from '../mock/hooks.tsx'
import type { ClientDetail, PlaybackPrefs } from '../mock/types.ts'

/** One nudge of the subtitle timing, matching the admin's (movies.md#decisions). */
export const NUDGE_MS = 50
export const SEEK_S = 10
/** The chrome hides after this long without input while playing. */
export const HIDE_MS = 3000

export function usePlayer(id: string, fromStart: boolean) {
  const detail = useQuery(`client:item:${id}`, (c) => c.library.item(id))
  const prefs = useQuery(`client:prefs:${id}`, (c) => c.playback.prefs(id))
  const savePrefs = useAction((c, patch: PlaybackPrefs) => c.playback.setPrefs(id, patch))
  const report = useAction((c, position: number) => c.playback.progress(id, position))

  const d = detail.data
  const duration = d ? d.item.runtimeMinutes * 60 : 0
  const [position, setPosition] = useState<number | null>(null)
  const [playing, setPlaying] = useState(true)
  const [local, setLocal] = useState<PlaybackPrefs>({})
  const pos = position ?? (d && !fromStart ? d.item.position : 0)
  const posRef = useRef(pos)
  posRef.current = pos

  // the clock: one second a second while playing, stopping at the end
  useEffect(() => {
    if (!playing || !duration) return
    const t = setInterval(
      () => setPosition((p) => Math.min(duration, (p ?? posRef.current) + 1)),
      1000,
    )
    return () => clearInterval(t)
  }, [playing, duration])
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
