// SPDX-License-Identifier: AGPL-3.0-only
// The chosen subtitle's cues, for both engines (HT-49). A stream's subtitle is a rendition
// playlist of WebVTT segments at the picture's own times (RFC 8216 § 3.5), cut as the server reads
// the film, so only the segments around where it's playing are loaded: the one showing and those
// in the next `SUBTITLE_AHEAD_S`, each once, again a little later when the server hasn't read
// that far yet (it answers 503). A file played as it is has its subtitle whole, one segment. The
// phone and the TV draw the cues; the web lays them on its `<video>`'s own text track. Nothing
// here imports a platform.
import {
  type Cue,
  isSubtitlePlaylist,
  mergeCues,
  parseCues,
  type SubtitleSegment,
  subtitleSegments,
  subtitleSegmentsFor,
} from '@highsea-tv/client/player'
import { useEffect, useRef, useState } from 'react'

/** How long before a segment, or the playlist, that didn't come is asked for again. */
export const SUBTITLE_RETRY_MS = 2000

const NONE: Cue[] = []

/**
 * The cues of the subtitle at `path`, loaded around `at`, the film's time the cues are drawn
 * for (the position less the person's offset). `fetchText` reads a server path, and throws when
 * the answer isn't 200.
 */
export function useSubtitleCues(
  path: string | null,
  at: number,
  fetchText: (path: string) => Promise<string>,
): Cue[] {
  const [cues, setCues] = useState<Cue[]>(NONE)
  const [segments, setSegments] = useState<SubtitleSegment[] | null>(null)
  // a segment that didn't come is asked for again when this changes
  const [retry, setRetry] = useState(0)
  const fetchRef = useRef(fetchText)
  fetchRef.current = fetchText
  // which subtitle the loads in flight are for, and the segments loaded or loading for it
  const generation = useRef(0)
  const have = useRef(new Set<number>())

  // a new subtitle: its playlist, or the whole file as one segment
  useEffect(() => {
    const g = ++generation.current
    have.current = new Set()
    setCues(NONE)
    setSegments(null)
    if (!path) return
    if (!isSubtitlePlaylist(path)) {
      setSegments([{ start: 0, end: Number.POSITIVE_INFINITY, path }])
      return
    }
    let timer: ReturnType<typeof setTimeout> | undefined
    const load = () => {
      fetchRef
        .current(path)
        .then((text) => {
          if (g === generation.current) setSegments(subtitleSegments(text, path))
        })
        .catch(() => {
          if (g === generation.current) timer = setTimeout(load, SUBTITLE_RETRY_MS)
        })
    }
    load()
    return () => clearTimeout(timer)
  }, [path])

  // the segments for where it's playing, each once
  const wanted = segments ? subtitleSegmentsFor(segments, Math.max(0, at)).join(',') : ''
  // biome-ignore lint/correctness/useExhaustiveDependencies: `retry` asks again for what didn't come
  useEffect(() => {
    if (!segments || !wanted) return
    const g = generation.current
    for (const i of wanted.split(',').map(Number)) {
      const segment = segments[i]
      if (!segment || have.current.has(i)) continue
      have.current.add(i)
      fetchRef
        .current(segment.path)
        .then((text) => {
          if (g === generation.current) setCues((c) => mergeCues(c, parseCues(text)))
        })
        .catch(() => {
          if (g !== generation.current) return
          have.current.delete(i)
          setTimeout(() => {
            if (g === generation.current) setRetry((n) => n + 1)
          }, SUBTITLE_RETRY_MS)
        })
    }
  }, [segments, wanted, retry])

  return cues
}
