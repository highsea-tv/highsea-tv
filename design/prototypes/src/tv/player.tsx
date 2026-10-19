// SPDX-License-Identifier: AGPL-3.0-only
// C5 Player chrome, TV (docs/product/player.md#tv). The remote, mapped:
//   OK            play or pause            ← →  seek 10 s (on the scrubber)
//   ↓             Audio and subtitles      Back  close the panel, hide the chrome, then leave
//   Play/Pause    play or pause, from anywhere
// The chrome shows on any key and hides after 3 s while playing. A legend of the mapping sits
// under the scrubber while the chrome shows.
import { cn, Icon, QualityTag } from '@highsea/ui-web'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation, useParams } from 'wouter'
import { clock } from '../client/data.ts'
import { HIDE_MS, SEEK_S, trickplayAt, usePlayer } from '../client/player.ts'
import { CueLine } from '../web/player.tsx'
import { useBack } from './back.ts'
import { TvButton, TvMessage, tvHref, useInitialFocus } from './kit.tsx'
import { TvTracksPanel } from './tracks.tsx'

export function TvPlayer({ fromStart = false }: { fromStart?: boolean }) {
  const { id } = useParams<{ id: string }>()
  const [, navigate] = useLocation()
  const player = usePlayer(id, fromStart)
  const [panel, setPanel] = useState(false)
  const [shown, setShown] = useState(true)
  const [seeking, setSeeking] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const scrubber = useRef<HTMLDivElement>(null)
  const ready = player.detail.status === 'success'
  useInitialFocus(ready && !panel, panel, '[data-player-scrubber]')

  const wake = useCallback(() => {
    setShown(true)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      setShown(false)
      setSeeking(false)
    }, HIDE_MS)
  }, [])

  useBack(() => {
    if (panel) setPanel(false)
    else if (shown && player.playing) setShown(false)
    else navigate(`/movies/${id}`)
  })

  // any key wakes the chrome; Play/Pause works from anywhere
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      wake()
      if (e.key === 'MediaPlayPause') player.toggle()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [wake, player])

  // the scrubber keeps Left and Right for seeking, and OK for play/pause
  useEffect(() => {
    const el = scrubber.current
    if (!el) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault()
        setSeeking(true)
        player.seekBy(e.key === 'ArrowLeft' ? -SEEK_S : SEEK_S)
      } else if (e.key === 'Enter') {
        e.preventDefault()
        setSeeking(false)
        player.toggle()
      }
    }
    el.addEventListener('keydown', onKey)
    return () => el.removeEventListener('keydown', onKey)
  }, [player])

  useEffect(() => {
    wake()
    return () => clearTimeout(timer.current)
  }, [wake])

  if (player.detail.status === 'error')
    return (
      <TvMessage
        title={player.detail.error.message}
        actions={
          <TvButton primary initial href={tvHref('/')}>
            Go home
          </TvButton>
        }
      >
        It may have been removed.
      </TvMessage>
    )

  const d = player.detail.data
  const chrome = shown || !player.playing || panel
  const fraction = player.position / Math.max(1, player.duration)
  return (
    <div className="absolute inset-0 bg-[#000]">
      {d && (
        <img src={d.item.art.still} alt="" className="absolute inset-0 size-full object-cover" />
      )}
      <h1 className="sr-only">Playing {d?.item.title ?? ''}</h1>
      <div
        className={cn(
          'absolute inset-x-0 transition-[bottom] duration-200',
          chrome ? 'bottom-[24%]' : 'bottom-[9%]',
        )}
      >
        <CueLine player={player} className="text-[1.8cqw]" />
      </div>

      <div
        {...(panel ? { 'data-isolate': '' } : {})}
        className={cn(
          'absolute inset-0 transition-opacity duration-200',
          chrome ? 'opacity-100' : 'opacity-0',
        )}
      >
        <div className="absolute inset-x-0 top-0 flex items-start gap-[1.2cqw] bg-[linear-gradient(rgb(0_0_0/0.7),transparent)] px-(--tv-safe-x) pt-(--tv-safe-y) pb-[4cqw]">
          <div className="grid gap-[0.3cqw]">
            <p className="font-semibold text-[2.2cqw] leading-[1.15]">{d?.item.title}</p>
            {player.version && (
              <p className="text-(length:--tv-text-meta) text-text-2">{player.version.detail}</p>
            )}
          </div>
          {player.version && (
            <QualityTag overlay className="ms-auto text-(length:--tv-text-quality)">
              {player.version.label}
            </QualityTag>
          )}
        </div>
        {!player.playing && (
          <div
            aria-hidden
            className="glass-badge absolute top-1/2 left-1/2 grid size-[6cqw] -translate-1/2 place-items-center rounded-full"
          >
            <Icon name="play" size={48} className="size-[2.6cqw]" />
          </div>
        )}
        <div className="absolute inset-x-0 bottom-0 grid gap-[1.2cqw] bg-[linear-gradient(transparent,rgb(0_0_0/0.8))] px-(--tv-safe-x) pt-[6cqw] pb-(--tv-safe-y)">
          <div data-group="scrub" data-go-down="controls" className="relative">
            {seeking && d && (
              <div
                aria-hidden
                className="absolute bottom-[1.6cqw] grid -translate-x-1/2 gap-[0.4cqw] text-center"
                style={{ left: `${fraction * 100}%` }}
              >
                <img
                  src={trickplayAt(d.item.art.still, player.position)}
                  alt=""
                  className="aspect-still w-[14cqw] rounded-[0.4cqw] border border-line-strong object-cover shadow-4"
                />
              </div>
            )}
            <div
              ref={scrubber}
              role="slider"
              tabIndex={-1}
              data-focusable=""
              data-player-scrubber=""
              aria-label="Position"
              aria-valuemin={0}
              aria-valuemax={player.duration}
              aria-valuenow={player.position}
              aria-valuetext={`${clock(player.position)} of ${clock(player.duration)}`}
              className="group/scrub h-[0.5cqw] rounded-full bg-text/25 outline-none transition-[height] focus-visible:h-[0.8cqw]"
            >
              <div
                className="relative h-full rounded-full bg-accent"
                style={{ width: `${fraction * 100}%` }}
              >
                <span className="absolute top-1/2 right-0 size-[1.4cqw] translate-x-1/2 -translate-y-1/2 scale-0 rounded-full bg-text transition-transform group-focus-visible/scrub:scale-100" />
              </div>
            </div>
            <div className="mt-[0.8cqw] flex justify-between font-mono text-(length:--tv-text-meta) text-text-2">
              <span>{clock(player.position)}</span>
              <span>−{clock(player.duration - player.position)}</span>
            </div>
          </div>
          <div data-group="controls" data-go-up="scrub" className="flex items-center gap-[1cqw]">
            <TvButton
              icon="subtitles"
              onClick={() => {
                setSeeking(false)
                setPanel(true)
              }}
            >
              Audio and subtitles
            </TvButton>
            <p className="ms-auto flex gap-[1.6cqw] text-(length:--tv-text-pill) text-text-2">
              <span>◀ ▶ Seek {SEEK_S} s</span>
              <span>OK {player.playing ? 'Pause' : 'Play'}</span>
              <span>▼ Audio and subtitles</span>
              <span>Back {player.playing ? 'Hide' : 'Leave'}</span>
            </p>
          </div>
        </div>
      </div>
      {panel && player.version && (
        <TvTracksPanel
          versions={d?.versions ?? []}
          version={player.version}
          audio={player.audio}
          subtitle={player.subtitle}
          onVersion={player.setVersion}
          onAudio={player.setAudio}
          onSubtitle={player.setSubtitle}
          timing={{ offsetMs: player.offsetMs, nudge: player.nudge }}
        />
      )}
    </div>
  )
}
