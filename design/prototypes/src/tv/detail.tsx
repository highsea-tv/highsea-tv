// SPDX-License-Identifier: AGPL-3.0-only
// C4 Item detail, TV (docs/product/client-detail.md#tv): Home's hero, with the backdrop filling the
// screen and the title's logo low on the left, here beside the poster and with the fuller details
// (the owner, 2026-10-30); then the cast and More like this as rows, which scroll the hero away. Audio and subtitles opens the shared panel; Back closes it, then leaves.
import { Poster, QualityTag, Rating, Skeleton } from '@highsea-tv/ui-web'
import { type KeyboardEvent, useRef, useState } from 'react'
import { useParams } from 'wouter'
import { left, runtime, useItem } from '../client/data.ts'
import { useMarkWatched } from '../client/item-more.tsx'
import { useAction } from '../mock/hooks.tsx'
import type { ClientItem, PlaybackPrefs } from '../mock/types.ts'
import { useBack } from './back.ts'
import { TvFilmRow } from './film-row.tsx'
import {
  TvButton,
  TvHead,
  TvMessage,
  TvRow,
  TvRowSkeleton,
  tvHref,
  useInitialFocus,
  useRowNavigation,
} from './kit.tsx'
import { TvTracksPanel } from './tracks.tsx'

export function TvDetail({ panel, onPanel }: { panel: boolean; onPanel: (open: boolean) => void }) {
  const { id } = useParams<{ id: string }>()
  const detail = useItem(id)
  const save = useAction((c, patch: PlaybackPrefs) => c.playback.setPrefs(id, patch))
  const [focusKey, setFocusKey] = useState(0)
  const [options, setOptions] = useState(false)
  const hold = useHold(() => setOptions(true))
  useInitialFocus(detail.status === 'success' && !panel && !options, `${id}:${focusKey}`)
  // Up and Down go row by row: the actions, the cast, then More like this
  const rows = useRef<HTMLDivElement>(null)
  useRowNavigation(rows, detail.status === 'success' && id)

  if (detail.status === 'loading')
    return (
      <main aria-busy className="absolute inset-0 overflow-hidden">
        <div className="relative grid grid-cols-1 gap-[1.6cqw]">
          {/* where the backdrop goes, fading as it will */}
          <div className="absolute inset-x-0 top-0 h-[56.25cqw] bg-s1" />
          <div className="absolute inset-x-0 top-0 h-[56.25cqw] bg-[linear-gradient(90deg,var(--color-bg)_7%,transparent_55%),linear-gradient(0deg,var(--color-bg)_8%,transparent_45%)]" />
          <TvHead className="px-(--tv-safe-x)" />
          <div className="relative grid h-[39cqw] max-w-[66cqw] grid-cols-[11cqw_1fr] items-end gap-[2.4cqw] px-(--tv-safe-x)">
            <Skeleton className="aspect-poster rounded-(--tv-radius-poster)" />
            <div className="grid content-end gap-[1cqw]">
              <Skeleton className="h-[6.5cqw] w-[24cqw] rounded-[0.6cqw]" />
              <Skeleton className="my-[0.15cqw] h-[1.05cqw] w-[20cqw]" />
              <div className="grid max-w-[44cqw] gap-[0.6cqw] py-[0.2cqw]">
                <Skeleton className="h-[1.1cqw] w-full" />
                <Skeleton className="h-[1.1cqw] w-full" />
                <Skeleton className="h-[1.1cqw] w-3/5" />
              </div>
              <Skeleton className="my-[0.15cqw] h-[1.05cqw] w-[12cqw]" />
              <div className="mt-[0.6cqw] flex gap-[1cqw]">
                <Skeleton className="h-[2.9cqw] w-[13cqw] rounded-(--tv-radius-button)" />
                <Skeleton className="h-[2.9cqw] w-[12cqw] rounded-(--tv-radius-button)" />
                <Skeleton className="h-[2.9cqw] w-[15cqw] rounded-(--tv-radius-button)" />
              </div>
              <Skeleton className="my-[0.15cqw] h-[0.95cqw] w-[18cqw]" />
            </div>
          </div>
          <TvRowSkeleton width="w-[8cqw]" count={11} />
        </div>
      </main>
    )
  if (detail.status === 'error')
    return (
      <TvMessage
        title={detail.error.message}
        actions={
          <TvButton primary initial href={tvHref('/')}>
            Go home
          </TvButton>
        }
      >
        It may have been removed.
      </TvMessage>
    )

  const d = detail.data
  const m = d.item
  const v = d.versions.find((x) => x.id === d.defaults.versionId) ?? d.versions[0]
  const resuming = m.progress !== null
  const close = () => {
    onPanel(false)
    setFocusKey((k) => k + 1)
  }
  return (
    <>
      <div
        {...(panel || options ? { 'data-isolate': '' } : {})}
        className="absolute inset-0 overflow-hidden"
      >
        <div
          ref={rows}
          data-scroll="y"
          data-keep="0.4"
          className="relative grid grid-cols-1 gap-[1.6cqw] pb-(--tv-safe-y) transition-lift"
        >
          {/* the whole 16:9 screen, as on Home, fading into the background at the left and foot */}
          <img
            src={m.art.backdrop}
            alt=""
            className="absolute inset-x-0 top-0 h-[56.25cqw] w-full object-cover"
          />
          <div className="absolute inset-x-0 top-0 h-[56.25cqw] bg-[linear-gradient(90deg,var(--color-bg)_7%,transparent_55%),linear-gradient(0deg,var(--color-bg)_8%,transparent_45%)]" />
          <TvHead down="actions" className="px-(--tv-safe-x)" />
          {/* the hero sits low on the first screen, leaving the top to the backdrop and the head,
          with the cast's title showing under it; it stays put while focus is in it (its keep is
          past its foot), and the page scrolls only for the rows below */}
          <section
            aria-labelledby="title"
            data-keep="1"
            className="relative grid h-[39cqw] max-w-[66cqw] grid-cols-[11cqw_1fr] items-end gap-[2.4cqw] px-(--tv-safe-x)"
          >
            <img
              src={m.art.poster}
              alt=""
              className="aspect-poster w-full rounded-(--tv-radius-poster) object-cover shadow-4"
            />
            <div className="grid content-end gap-[1cqw]">
              <h1
                id="title"
                className="font-semibold text-(length:--tv-text-hero-title) leading-[0.95] tracking-display"
              >
                {m.art.logo ? (
                  <img
                    src={m.art.logo}
                    alt={m.title}
                    className="max-h-[7.5cqw] max-w-[28cqw] object-contain object-left drop-shadow-[0_0.2cqw_0.8cqw_rgb(0_0_0/0.5)]"
                  />
                ) : (
                  m.title
                )}
              </h1>
              <p className="flex items-center gap-[1cqw] text-(length:--tv-text-meta) text-text-2">
                {m.year} · {runtime(m.runtimeMinutes)} · {m.genres.slice(0, 2).join(', ')}
                {m.rating > 0 && <Rating value={m.rating} size={20} />}
                {m.quality.map((q) => (
                  <QualityTag key={q} overlay className="text-(length:--tv-text-quality)">
                    {q}
                  </QualityTag>
                ))}
              </p>
              {m.tagline && (
                <p className="font-semibold text-(length:--tv-text-synopsis) leading-[1.45]">
                  {m.tagline}
                </p>
              )}
              <p className="line-clamp-3 max-w-[44cqw] text-(length:--tv-text-synopsis) text-text-2 leading-[1.45]">
                {m.synopsis}
              </p>
              {d.directors.length > 0 && (
                <p className="text-(length:--tv-text-meta) text-text-3">
                  Directed by {d.directors.map((x) => x.name).join(' and ')}
                </p>
              )}
              <div
                data-row=""
                data-group="actions"
                data-go-up="nav"
                className="mt-[0.6cqw] flex gap-[1cqw]"
                onKeyDownCapture={hold.down}
                onKeyUpCapture={hold.up}
              >
                <TvButton primary initial icon="play" href={tvHref(`/play/${m.id}`)}>
                  {resuming ? `Resume · ${left(m)}` : 'Play'}
                </TvButton>
                {resuming && (
                  <TvButton icon="replay" href={tvHref(`/play/${m.id}/start`)}>
                    From the start
                  </TvButton>
                )}
                <TvButton icon="subtitles" onClick={() => onPanel(true)}>
                  Audio and subtitles
                </TvButton>
              </div>
              {v && (
                <p className="text-(length:--tv-text-pill) text-text-3">
                  {v.label} ·{' '}
                  {v.audio.find((a) => a.id === d.defaults.audioId)?.label ?? 'Default audio'} ·{' '}
                  {v.subtitles.find((t) => t.id === d.defaults.subtitleId)?.label ??
                    'Subtitles off'}
                </p>
              )}
              <p className="text-(length:--tv-text-pill) text-text-3">
                {m.watched ? 'Watched · ' : ''}Hold OK for more
              </p>
            </div>
          </section>
          {d.cast.length > 0 && (
            <div data-row="" className="relative grid grid-cols-1">
              <TvRow group="cast" title="Cast" goUp="actions">
                {d.cast.map((c) => (
                  <li key={c.personId} className="w-[8cqw] shrink-0">
                    {/* cast cards are focus stops, so the row can be read by D-pad */}
                    <div
                      data-focusable=""
                      tabIndex={-1}
                      className="group/link rounded-(--tv-radius-poster) outline-none"
                    >
                      <Poster title={c.name} src={c.photo} />
                      <p className="mt-[1cqw] truncate font-semibold text-(length:--tv-text-pill) text-text-2 leading-[1.3] group-focus-visible/link:text-text">
                        {c.name}
                      </p>
                      <p className="truncate text-(length:--tv-text-pill) text-text-3 leading-[1.3]">
                        {c.character}
                      </p>
                    </div>
                  </li>
                ))}
              </TvRow>
            </div>
          )}
          {d.related.length > 0 && (
            <div data-row="" className="relative grid grid-cols-1">
              <TvFilmRow
                group="related"
                title="More like this"
                goUp="actions"
                items={d.related}
                hrefOf={(r) => tvHref(`/movies/${r.id}`)}
              />
            </div>
          )}
        </div>
      </div>
      {options && (
        <TvOptions
          item={m}
          onClose={() => {
            setOptions(false)
            setFocusKey((k) => k + 1)
          }}
        />
      )}
      {panel && v && (
        <TvTracksPanel
          versions={d.versions}
          version={v}
          audio={v.audio.find((a) => a.id === d.defaults.audioId) ?? null}
          subtitle={v.subtitles.find((t) => t.id === d.defaults.subtitleId) ?? null}
          onVersion={(versionId) => save.run({ versionId })}
          onAudio={(audioId) => save.run({ audioId })}
          onSubtitle={(subtitleId) => {
            save.run({ subtitleId })
            close()
          }}
        />
      )}
    </>
  )
}

const HOLD_MS = 600

/**
 * A long press of OK (client-detail.md#mark-as-watched): a press shorter than HOLD_MS still
 * selects what has focus when OK is let go; a longer one opens the options instead.
 */
function useHold(onHold: () => void) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  return {
    down: (e: KeyboardEvent) => {
      if (e.key !== 'Enter') return
      e.preventDefault()
      if (e.repeat || timer.current) return
      timer.current = setTimeout(() => {
        // OK is let go in the options, outside this group, so the hold ends here
        timer.current = null
        onHold()
      }, HOLD_MS)
    },
    up: (e: KeyboardEvent) => {
      if (e.key !== 'Enter' || !timer.current) return
      clearTimeout(timer.current)
      timer.current = null
      ;(e.target as HTMLElement).click()
    },
  }
}

/** What a long press of OK opens: Mark as watched or unwatched. Back closes it. */
function TvOptions({ item, onClose }: { item: ClientItem; onClose: () => void }) {
  const mark = useMarkWatched(item)
  useBack(onClose)
  useInitialFocus(true, item.id, '[data-options] [data-initial]')
  return (
    <div
      data-isolate=""
      data-options=""
      role="dialog"
      aria-label={item.title}
      className="absolute inset-0 grid place-items-center bg-bg/70"
    >
      <div className="grid min-w-[28cqw] gap-[1cqw] rounded-(--tv-radius-poster) bg-s2 p-[2cqw] shadow-4">
        <p className="font-semibold text-(length:--tv-text-button)">{item.title}</p>
        <TvButton
          primary
          initial
          icon={item.watched ? 'replay' : 'check'}
          onClick={async () => {
            await mark.run()
            onClose()
          }}
        >
          {mark.label}
        </TvButton>
        <TvButton onClick={onClose}>Cancel</TvButton>
      </div>
    </div>
  )
}
