// SPDX-License-Identifier: AGPL-3.0-only
// Audio and subtitles on TV: a dialog at the right, inside the safe area, isolated so the D-pad
// stays inside it until Back closes it. The item detail and the player share it; the player adds
// the subtitle timing nudge (±50 ms on Left and Right) with its live preview line.
import { cn, Icon } from '@highsea-tv/ui-web'
import { useEffect, useRef, useState } from 'react'
import { NUDGE_MS, offsetHint, offsetLabel, PICTURE_TIMING } from '../client/player.ts'
import type { ClientTrack, ClientVersion } from '../mock/types.ts'
import { NudgePreview } from '../web/player.tsx'

const option =
  'flex w-full items-center gap-[0.8cqw] rounded-[0.5cqw] px-[1cqw] py-[0.7cqw] text-start text-(length:--tv-text-button) text-text-2 outline-none transition-lift focus-visible:scale-[1.03] focus-visible:bg-text focus-visible:text-bg not-focus-visible:aria-checked:text-text'

function Group<T extends { id: string; label: string }>({
  title,
  items,
  current,
  onPick,
  first = false,
}: {
  title: string
  items: T[]
  current: string | null
  onPick: (id: string) => void
  first?: boolean
}) {
  return (
    <section aria-label={title} className="grid gap-[0.4cqw]">
      <h3 className="font-semibold text-(length:--tv-text-eyebrow) text-text-3 uppercase tracking-eyebrow">
        {title}
      </h3>
      <div role="radiogroup" aria-label={title}>
        {items.map((t, i) => (
          // biome-ignore lint/a11y/useSemanticElements: a D-pad list, each row one focus stop
          <button
            key={t.id}
            type="button"
            role="radio"
            aria-checked={t.id === current}
            data-focusable=""
            {...(first && i === 0 ? { 'data-panel-first': '' } : {})}
            onClick={() => onPick(t.id)}
            className={option}
          >
            <Icon
              name="check"
              size={24}
              className={cn('size-[1.1cqw]', t.id === current ? '' : 'invisible')}
            />
            {t.label}
          </button>
        ))}
      </div>
    </section>
  )
}

export function TvTracksPanel({
  open,
  versions,
  version,
  audio,
  subtitle,
  onVersion,
  onAudio,
  onSubtitle,
  timing,
}: {
  /** Shown. It stays mounted while it slides out, then unmounts. */
  open: boolean
  versions: ClientVersion[]
  version: ClientVersion
  audio: ClientTrack | null
  subtitle: ClientTrack | null
  onVersion: (id: string) => void
  onAudio: (id: string) => void
  onSubtitle: (id: string | null) => void
  /** The player's subtitle nudge. */
  timing?: { offsetMs: number; nudge: (dir: 1 | -1 | 0) => void }
}) {
  const root = useRef<HTMLElement>(null)
  const nudger = useRef<HTMLDivElement>(null)
  // mounted while open and while it slides out after closing
  const [present, setPresent] = useState(open)
  if (open && !present) setPresent(true)
  // focus moves in when it opens, and back to what opened it when it closes
  const opener = useRef<HTMLElement | null>(null)
  useEffect(() => {
    if (!open || !present) return
    opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    root.current?.querySelector<HTMLElement>('[data-panel-first]')?.focus({ preventScroll: true })
  }, [open, present])
  useEffect(() => {
    if (open || !opener.current) return
    if (opener.current.isConnected) opener.current.focus({ preventScroll: true })
    opener.current = null
  }, [open])
  // unmount when the exit's transition ends; the timer covers one that never fires (a hidden page)
  useEffect(() => {
    if (open || !present) return
    const t = window.setTimeout(() => setPresent(false), 600)
    return () => window.clearTimeout(t)
  }, [open, present])
  // Left and Right on the timing row nudge, instead of moving focus
  useEffect(() => {
    const el = nudger.current
    if (!el || !timing) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault()
        timing.nudge(e.key === 'ArrowLeft' ? -1 : 1)
      }
    }
    el.addEventListener('keydown', onKey)
    return () => el.removeEventListener('keydown', onKey)
  }, [timing])
  if (!present) return null
  return (
    <aside
      ref={root}
      // closing: out of the D-pad's and the screen reader's reach while it slides away
      inert={!open}
      data-closing={open ? undefined : ''}
      onTransitionEnd={(e) => {
        if (!open && e.target === e.currentTarget && e.propertyName === 'opacity') setPresent(false)
      }}
      aria-label="Audio and subtitles"
      data-isolate=""
      data-group="tracks"
      // a dialog at half the safe area's inset (the owner, 2026-10-31): it slides in from the right
      // and back out when closed, at once with reduced motion (the token is 1 ms)
      className="absolute inset-y-[calc(var(--tv-safe-y)/2)] right-[calc(var(--tv-safe-x)/2)] z-30 grid w-[32cqw] content-start gap-[1.6cqw] overflow-hidden rounded-[1cqw] bg-s1/95 p-[2.4cqw] shadow-[0_1cqw_3cqw_rgb(0_0_0/0.45)] backdrop-blur-pill transition-[translate,opacity] duration-(--duration-spring-quick) ease-(--ease-spring-quick) starting:translate-x-[3cqw] starting:opacity-0 data-closing:translate-x-[3cqw] data-closing:opacity-0"
    >
      <h2 className="font-semibold text-(length:--tv-text-row-title)">Audio and subtitles</h2>
      {versions.length > 1 && (
        <Group title="Version" items={versions} current={version.id} onPick={onVersion} first />
      )}
      <Group
        title="Audio"
        items={version.audio}
        current={audio?.id ?? null}
        onPick={onAudio}
        first={versions.length < 2}
      />
      <Group
        title="Subtitles"
        items={[{ id: 'off', label: 'Off' }, ...version.subtitles]}
        current={subtitle?.id ?? 'off'}
        onPick={(id) => onSubtitle(id === 'off' ? null : id)}
      />
      {timing && subtitle?.picture && (
        <section aria-label="Subtitle timing" className="grid gap-[0.6cqw]">
          <h3 className="font-semibold text-(length:--tv-text-eyebrow) text-text-3 uppercase tracking-eyebrow">
            Subtitle timing
          </h3>
          <p className="text-(length:--tv-text-pill) text-text-2">{PICTURE_TIMING}</p>
        </section>
      )}
      {timing && subtitle && !subtitle.picture && (
        <section aria-label="Subtitle timing" className="grid gap-[0.6cqw]">
          <h3 className="font-semibold text-(length:--tv-text-eyebrow) text-text-3 uppercase tracking-eyebrow">
            Subtitle timing
          </h3>
          <div
            ref={nudger}
            role="slider"
            tabIndex={-1}
            data-focusable=""
            aria-label={`Subtitle timing, in ${NUDGE_MS} ms steps`}
            aria-valuenow={timing.offsetMs}
            aria-valuetext={offsetLabel(timing.offsetMs)}
            className="flex items-center justify-between rounded-[0.5cqw] bg-text/12 px-[1cqw] py-[0.7cqw] text-(length:--tv-text-button) outline-none transition-lift focus-visible:shadow-(--tv-focus-shadow)"
          >
            <Icon name="chevron-left" size={24} className="size-[1.2cqw]" />
            <span className="font-mono">{offsetLabel(timing.offsetMs)}</span>
            <Icon name="chevron-right" size={24} className="size-[1.2cqw]" />
          </div>
          <NudgePreview offsetMs={timing.offsetMs} className="h-[3cqw]" />
          <p className="text-(length:--tv-text-pill) text-text-2">{offsetHint(timing.offsetMs)}</p>
        </section>
      )}
      <p className="text-(length:--tv-text-pill) text-text-3">Back closes. Saved for this movie.</p>
    </aside>
  )
}
