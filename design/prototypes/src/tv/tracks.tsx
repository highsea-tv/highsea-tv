// SPDX-License-Identifier: AGPL-3.0-only
// Audio and subtitles on TV: a panel from the right, isolated so the D-pad stays inside it until
// Back closes it. The item detail and the player share it; the player adds the subtitle timing
// nudge (±50 ms on Left and Right) with its live preview line.
import { cn, Icon } from '@highsea-tv/ui-web'
import { useEffect, useRef } from 'react'
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
  versions,
  version,
  audio,
  subtitle,
  onVersion,
  onAudio,
  onSubtitle,
  timing,
}: {
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
  useEffect(() => {
    root.current?.querySelector<HTMLElement>('[data-panel-first]')?.focus({ preventScroll: true })
  }, [])
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
  return (
    <aside
      ref={root}
      aria-label="Audio and subtitles"
      data-isolate=""
      data-group="tracks"
      className="absolute inset-y-0 right-0 z-30 grid w-[32cqw] content-start gap-[1.6cqw] overflow-hidden bg-s1/95 px-[2.4cqw] py-(--tv-safe-y) backdrop-blur-pill"
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
