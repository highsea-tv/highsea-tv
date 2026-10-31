// SPDX-License-Identifier: AGPL-3.0-only
// The music player's progress bar as the song's own shape: bars of its loudness from start to end
// (the server's loudness analysis, as Plex's gives Plexamp its waveform and SoundCloud draws its
// tracks), filled with the accent up to where the song is. While it plays, the bars at the
// playhead move with the music, as an equalizer's do: the shape is the whole song, the motion is
// now. With reduced motion they hold still. On the web and the phone a range input lies over the
// bars, so dragging, tapping and the arrow keys seek as any slider's do; the TV wraps it in its own
// slider for the remote.
import { cn } from '@highsea-tv/ui-web'
import { useReducedMotion } from 'motion/react'
import { type CSSProperties, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { clock } from './data.ts'
import { MUSIC_SEEK_S } from './music-player.ts'

/** The bars at and just behind the playhead that move while the song plays. */
const LIVE_BEHIND = 10
const LIVE_AHEAD = 2

/** The loudest step in each of `count` even buckets: peaks stay, however few bars fit. */
function resample(levels: number[], count: number): number[] {
  if (count <= 0 || levels.length === 0) return []
  return Array.from({ length: count }, (_, i) => {
    const from = Math.floor((i * levels.length) / count)
    const to = Math.max(from + 1, Math.floor(((i + 1) * levels.length) / count))
    let peak = 0
    for (let j = from; j < to; j++) peak = Math.max(peak, levels[j] as number)
    return peak
  })
}

/**
 * A bar's height from its loudness: quiet passages drop well below loud ones, as a waveform drawn
 * on a decibel-like scale does, and nothing quite vanishes.
 */
const heightOf = (level: number) => Math.round(12 + 88 * Math.max(0, (level - 0.15) / 0.85) ** 1.6)

export type WaveformProps = {
  loudness: number[]
  position: number
  duration: number
  playing: boolean
  /** A bar's width and the gap after it, in px; or a fixed number of bars (the TV's, in screen units). */
  bar?: { width: number; gap: number } | { count: number }
  /** Seeks to a position in seconds; without it the waveform only shows progress. */
  onSeek?: (seconds: number) => void
  /** The song's title, for the slider's name. */
  label?: string
  className?: string
  barClassName?: string
}

export function Waveform({
  loudness,
  position,
  duration,
  playing,
  bar = { width: 3, gap: 2 },
  onSeek,
  label = 'Position',
  className,
  barClassName,
}: WaveformProps) {
  const root = useRef<HTMLDivElement>(null)
  const bars = useRef<(HTMLSpanElement | null)[]>([])
  const reduced = useReducedMotion()
  const [measured, setMeasured] = useState(0)
  const [hover, setHover] = useState<number | null>(null)

  // as many bars as fit, so the shape fills the bar at any width
  const fixed = 'count' in bar ? bar.count : 0
  const width = 'width' in bar ? bar.width : 0
  const gap = 'gap' in bar ? bar.gap : 0
  useLayoutEffect(() => {
    const el = root.current
    if (fixed || !el) return
    const fit = () => setMeasured(Math.max(8, Math.floor((el.clientWidth + gap) / (width + gap))))
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(el)
    return () => ro.disconnect()
  }, [fixed, width, gap])
  const count = fixed || measured
  const levels = useMemo(() => resample(loudness, count), [loudness, count])
  const fraction = duration > 0 ? Math.min(1, position / duration) : 0
  const at = Math.floor(fraction * count)
  const atRef = useRef(at)
  atRef.current = at
  const levelsRef = useRef(levels)
  levelsRef.current = levels

  // the equalizer: the bars round the playhead rise and fall, written straight to their style so
  // React doesn't render sixty times a second
  useEffect(() => {
    if (!playing || reduced) return
    let frame = 0
    let last = 0
    const moved = new Set<number>()
    const step = (t: number) => {
      frame = requestAnimationFrame(step)
      // about twenty steps a second reads as music without flicker
      if (t - last < 48) return
      last = t
      const p = atRef.current
      for (const i of moved) {
        if (i >= p - LIVE_BEHIND && i <= p + LIVE_AHEAD) continue
        const el = bars.current[i]
        if (el) el.style.scale = ''
        moved.delete(i)
      }
      for (let i = Math.max(0, p - LIVE_BEHIND); i <= p + LIVE_AHEAD && i < count; i++) {
        const el = bars.current[i]
        if (!el) continue
        // nearer the playhead, more motion; two waves at odd speeds so it never repeats plainly
        const near = 1 - Math.abs(i - p) / (LIVE_BEHIND + 1)
        const wave = Math.abs(Math.sin(t / 170 + i * 1.7) * 0.6 + Math.sin(t / 97 + i * 0.9) * 0.4)
        // never past the waveform's top
        const most = 100 / heightOf(levelsRef.current[i] ?? 1)
        el.style.scale = `1 ${Math.min(most, 0.3 + 0.7 * (1 - near) + wave * 1.1 * near)}`
        moved.add(i)
      }
    }
    frame = requestAnimationFrame(step)
    return () => {
      cancelAnimationFrame(frame)
      for (const i of moved) {
        const el = bars.current[i]
        if (el) el.style.scale = ''
      }
    }
  }, [playing, reduced, count])

  const hoverAt = hover === null ? null : Math.floor(hover * count)
  return (
    <div
      ref={root}
      className={cn('group/wave relative flex items-end', className)}
      style={{ gap: fixed ? undefined : gap } as CSSProperties}
    >
      {levels.map((level, i) => (
        <span
          // biome-ignore lint/suspicious/noArrayIndexKey: a bar is its place in the song
          key={i}
          ref={(el) => {
            bars.current[i] = el
          }}
          aria-hidden
          className={cn(
            'min-w-0 flex-1 origin-bottom rounded-full transition-[background-color,scale] duration-150',
            i < at || (i === at && fraction > 0)
              ? 'bg-accent'
              : hoverAt !== null && i <= hoverAt
                ? 'bg-text/50'
                : 'bg-text/25',
            barClassName,
          )}
          style={{ height: `${heightOf(level)}%` }}
        />
      ))}
      {onSeek && (
        <>
          {hover !== null && (
            <span
              aria-hidden
              className="pointer-events-none absolute bottom-full mb-1.5 -translate-x-1/2 rounded-sm bg-s3 px-1.5 py-0.5 font-mono text-[11px] text-text shadow-2"
              style={{ left: `${hover * 100}%` }}
            >
              {clock(hover * duration)}
            </span>
          )}
          <input
            type="range"
            min={0}
            max={Math.round(duration)}
            step={MUSIC_SEEK_S}
            value={Math.round(position)}
            onChange={(e) => onSeek(Number(e.target.value))}
            onPointerMove={(e) => {
              if (e.pointerType !== 'mouse') return
              const r = e.currentTarget.getBoundingClientRect()
              setHover(Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)))
            }}
            onPointerLeave={() => setHover(null)}
            aria-label={label}
            aria-valuetext={`${clock(position)} of ${clock(duration)}`}
            // transparent through its own parts rather than opacity, so the bars show through and
            // its focus ring still draws round the whole waveform
            className="absolute inset-0 size-full cursor-pointer appearance-none rounded-sm bg-transparent outline-none focus-visible:ring-focus [&::-moz-range-thumb]:size-0 [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:opacity-0 [&::-moz-range-track]:bg-transparent [&::-webkit-slider-thumb]:size-0 [&::-webkit-slider-thumb]:appearance-none"
          />
        </>
      )}
    </div>
  )
}

/**
 * The mark beside what's playing (a song in its album's list, the TV's Now playing in the head):
 * three bars moving as an equalizer's do, still while paused.
 */
export function PlayingBars({ playing, className }: { playing: boolean; className?: string }) {
  return (
    <span aria-hidden className={cn('inline-flex h-[0.9em] items-end gap-[0.12em]', className)}>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          data-paused={playing ? undefined : ''}
          className="playing-bar h-full w-[0.18em] rounded-full bg-current"
          style={{ animationDuration: `${[760, 1040, 880][i]}ms`, animationDelay: `-${i * 230}ms` }}
        />
      ))}
    </span>
  )
}
