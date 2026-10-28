// SPDX-License-Identifier: AGPL-3.0-only
// C5 Player chrome, web/desktop (docs/product/player.md#web-and-desktop). Over a still frame: the
// title and Back on top; the scrubber with a trickplay frame, the transport and the track menu
// at the bottom; the Audio and subtitles panel with the timing nudge and its live preview line.
// Keyboard: Space plays or pauses, ←/→ seek 10 s, M mutes, F full screen, Esc closes the panel.
// Picture in picture (4.2b) sits beside Full screen where the browser has the Picture-in-Picture
// API (https://developer.mozilla.org/docs/Web/API/Picture-in-Picture_API); the prototype has no
// video to hand it, so the frame shows what the tab shows while the film plays in its window.
import { Button, cn, EmptyState, Icon, QualityTag } from '@highsea-tv/ui-web'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation, useParams } from 'wouter'
import { clock } from '../client/data.ts'
import {
  HIDE_MS,
  NUDGE_MS,
  offsetHint,
  offsetLabel,
  type Player,
  SEEK_S,
  sampleCue,
  trickplayAt,
  usePlayer,
} from '../client/player.ts'
import {
  NextUp,
  type StreamAction,
  StreamMessage,
  StreamWaiting,
} from '../client/stream-states.tsx'
import { webHref } from './shell.tsx'

const glassButton =
  'grid size-11 cursor-pointer place-items-center rounded-full text-text outline-none transition-tint hover:bg-text/12 focus-visible:ring-focus'

/** The subtitle line on the frame, where the timing nudge shows its effect. */
export function CueLine({ player, className }: { player: Player; className?: string }) {
  const title = player.detail.data?.item.title ?? ''
  if (!player.subtitle) return null
  return (
    <p
      className={cn(
        'mx-auto w-fit max-w-[80%] rounded-sm bg-[rgb(0_0_0/0.6)] px-3 py-1 text-center font-semibold text-[#ededee] text-[clamp(1rem,2.2vw,1.6rem)] leading-[1.3]',
        className,
      )}
    >
      {sampleCue(title)}
    </p>
  )
}

/**
 * The live preview: the line's speech and the subtitle as two bars on one time axis, so a nudge
 * shows which way the subtitle moved. 1px is 10 ms; the frame is ±600 ms.
 */
export function NudgePreview({ offsetMs, className }: { offsetMs: number; className?: string }) {
  const shift = Math.max(-600, Math.min(600, offsetMs)) / 10
  return (
    <div aria-hidden className={cn('relative h-12 overflow-hidden rounded-sm bg-s2', className)}>
      <div className="absolute inset-y-0 left-1/2 w-px bg-line-strong" />
      <div className="absolute top-2 left-[calc(50%-60px)] h-3 w-[120px] rounded-full bg-text-3/60" />
      <span className="absolute top-1.5 left-2 font-mono text-[10px] text-text-3">Speech</span>
      <div
        className="absolute bottom-2 h-3 w-[120px] rounded-full bg-accent transition-[left] duration-200"
        style={{ left: `calc(50% - 60px + ${shift}px)` }}
      />
      <span className="absolute bottom-1.5 left-2 font-mono text-[10px] text-text-3">Subtitle</span>
    </div>
  )
}

/** One choice in a list: a real radio, styled as a row. */
function RadioRow({
  name,
  checked,
  onChange,
  children,
}: {
  name: string
  checked: boolean
  onChange: () => void
  children: React.ReactNode
}) {
  return (
    <label className="flex w-full cursor-pointer items-center gap-2 rounded-sm px-2.5 py-2 text-ui transition-tint hover:bg-text/8 has-[:focus-visible]:ring-focus">
      <input type="radio" name={name} checked={checked} onChange={onChange} className="sr-only" />
      <Icon name="check" size={14} className={checked ? '' : 'invisible'} />
      {children}
    </label>
  )
}

export function TracksPanel({ player, onClose }: { player: Player; onClose: () => void }) {
  const v = player.version
  const d = player.detail.data
  if (!v || !d) return null
  return (
    <aside
      aria-label="Audio and subtitles"
      className="glass-scrim absolute inset-y-0 right-0 z-20 grid w-full max-w-[22rem] content-start gap-5 overflow-y-auto border-line border-l bg-bg/80 p-5"
    >
      <div className="flex items-center">
        <h2 className="text-title">Audio and subtitles</h2>
        <Button
          variant="ghost"
          iconOnly
          icon="close"
          aria-label="Close"
          onClick={onClose}
          className="ms-auto"
        />
      </div>
      {d.versions.length > 1 && (
        <section aria-labelledby="p-version" className="grid gap-1">
          <h3 id="p-version" className="font-mono text-label text-text-3 uppercase">
            Version
          </h3>
          <div role="radiogroup" aria-labelledby="p-version">
            {d.versions.map((x) => (
              <RadioRow
                key={x.id}
                name="version"
                checked={x.id === v.id}
                onChange={() => player.setVersion(x.id)}
              >
                {x.label}
                <span className="ms-auto text-caption text-text-3">
                  {x.detail.split(' · ').slice(-1)[0]}
                </span>
              </RadioRow>
            ))}
          </div>
        </section>
      )}
      <section aria-labelledby="p-audio" className="grid gap-1">
        <h3 id="p-audio" className="font-mono text-label text-text-3 uppercase">
          Audio
        </h3>
        <div role="radiogroup" aria-labelledby="p-audio">
          {v.audio.map((a) => (
            <RadioRow
              key={a.id}
              name="audio"
              checked={a.id === player.audio?.id}
              onChange={() => player.setAudio(a.id)}
            >
              {a.label}
            </RadioRow>
          ))}
        </div>
      </section>
      <section aria-labelledby="p-subs" className="grid gap-1">
        <h3 id="p-subs" className="font-mono text-label text-text-3 uppercase">
          Subtitles
        </h3>
        <div role="radiogroup" aria-labelledby="p-subs">
          {[null, ...v.subtitles].map((t) => {
            const on = (t?.id ?? null) === (player.subtitle?.id ?? null)
            return (
              <RadioRow
                key={t?.id ?? 'off'}
                name="subtitles"
                checked={on}
                onChange={() => player.setSubtitle(t?.id ?? null)}
              >
                {t ? t.label : 'Off'}
              </RadioRow>
            )
          })}
        </div>
      </section>
      {player.subtitle && (
        <section aria-labelledby="p-timing" className="grid gap-2">
          <h3 id="p-timing" className="font-mono text-label text-text-3 uppercase">
            Subtitle timing
          </h3>
          <div className="flex items-center gap-2">
            <Button
              iconOnly
              icon="remove"
              aria-label={`Show subtitles ${NUDGE_MS} ms earlier`}
              onClick={() => player.nudge(-1)}
            />
            <output aria-live="polite" className="min-w-24 text-center font-mono text-text text-ui">
              {offsetLabel(player.offsetMs)}
            </output>
            <Button
              iconOnly
              icon="add"
              aria-label={`Show subtitles ${NUDGE_MS} ms later`}
              onClick={() => player.nudge(1)}
            />
            <Button
              variant="ghost"
              size="sm"
              onClick={() => player.nudge(0)}
              disabled={player.offsetMs === 0}
              className="ms-auto"
            >
              Reset
            </Button>
          </div>
          <NudgePreview offsetMs={player.offsetMs} />
          <p className="text-caption text-text-3">
            {offsetHint(player.offsetMs)} Saved for this movie.
          </p>
        </section>
      )}
    </aside>
  )
}

export function Scrubber({ player }: { player: Player }) {
  const [hover, setHover] = useState<{ x: number; t: number } | null>(null)
  const still = player.detail.data?.item.art.still ?? ''
  const ref = useRef<HTMLInputElement>(null)
  const at = (clientX: number) => {
    const r = ref.current?.getBoundingClientRect()
    if (!r) return null
    const f = Math.max(0, Math.min(1, (clientX - r.left) / r.width))
    return { x: f * r.width, t: f * player.duration }
  }
  return (
    <div className="relative">
      {hover && (
        <div
          aria-hidden
          className="pointer-events-none absolute bottom-6 grid -translate-x-1/2 gap-1 text-center"
          style={{ left: hover.x }}
        >
          <img
            src={trickplayAt(still, hover.t)}
            alt=""
            className="aspect-still w-40 rounded-sm border border-line-strong object-cover shadow-3"
          />
          <span className="font-mono text-[12px] text-text">{clock(hover.t)}</span>
        </div>
      )}
      <input
        ref={ref}
        type="range"
        min={0}
        max={player.duration}
        step={1}
        value={player.position}
        onChange={(e) => player.seekTo(Number(e.target.value))}
        onPointerMove={(e) => setHover(at(e.clientX))}
        onPointerLeave={() => setHover(null)}
        aria-label="Position"
        aria-valuetext={`${clock(player.position)} of ${clock(player.duration)}`}
        className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-text/25 accent-[var(--color-accent)] outline-none focus-visible:ring-focus"
        style={{
          background: `linear-gradient(90deg, var(--color-accent) ${(player.position / Math.max(1, player.duration)) * 100}%, rgb(255 255 255 / 0.25) 0)`,
        }}
      />
    </div>
  )
}

/** The stream states' buttons on web and desktop. */
export const webStreamAction: StreamAction = ({ primary, initial, onClick, children }) => (
  <Button variant={primary ? 'primary' : 'secondary'} autoFocus={initial} onClick={onClick}>
    {children}
  </Button>
)

export function WebPlayer({ fromStart = false }: { fromStart?: boolean }) {
  const { id } = useParams<{ id: string }>()
  const [, navigate] = useLocation()
  const player = usePlayer(id, fromStart)
  const [panel, setPanel] = useState(false)
  const [muted, setMuted] = useState(false)
  const [shown, setShown] = useState(true)
  const [pip, setPip] = useState(false)
  // Firefox has no API, only its own toggle on the video, so the button is left out there
  const pipAvailable = typeof document !== 'undefined' && document.pictureInPictureEnabled === true
  const root = useRef<HTMLDivElement>(null)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)

  const wake = useCallback(() => {
    setShown(true)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setShown(false), HIDE_MS)
  }, [])
  useEffect(() => {
    wake()
    root.current?.focus()
    return () => clearTimeout(timer.current)
  }, [wake])

  const exit = () => navigate(`/movies/${id}`)

  const onKey = (e: React.KeyboardEvent) => {
    wake()
    const target = e.target as HTMLElement
    const inControl = target.closest('input, aside')
    if (e.key === ' ' && !target.closest('button, input')) {
      e.preventDefault()
      player.toggle()
    } else if (e.key === 'ArrowLeft' && !inControl) player.seekBy(-SEEK_S)
    else if (e.key === 'ArrowRight' && !inControl) player.seekBy(SEEK_S)
    else if (e.key === 'm' || e.key === 'M') setMuted((m) => !m)
    else if (e.key === 'f' || e.key === 'F') {
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
      else root.current?.requestFullscreen?.().catch(() => {})
    } else if (e.key === 'Escape') {
      if (panel) setPanel(false)
      else exit()
    }
  }

  if (player.detail.status === 'error')
    return (
      <main className="grid min-h-screen place-items-center bg-bg p-4">
        <EmptyState
          icon="movie"
          tone="error"
          title={player.detail.error.message}
          action={
            <Button asChild>
              <a href={webHref('/')}>Go home</a>
            </Button>
          }
        >
          It may have been removed.
        </EmptyState>
      </main>
    )

  const d = player.detail.data
  const waiting = player.stream === 'preparing' || player.stream === 'buffering'
  const chrome = shown || !player.playing || panel || waiting
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: the player takes its keyboard shortcuts here
    <div
      ref={root}
      tabIndex={-1}
      onKeyDown={onKey}
      onPointerMove={wake}
      className={cn(
        'relative h-screen w-full overflow-hidden bg-[#000] text-text outline-none',
        !chrome && 'cursor-none',
      )}
    >
      {d && (
        <img src={d.item.art.still} alt="" className="absolute inset-0 size-full object-cover" />
      )}
      <h1 className="sr-only">Playing {d?.item.title ?? ''}</h1>

      {pip && (
        <div className="absolute inset-0 grid place-items-center bg-[#000]">
          <div className="grid justify-items-center gap-4 text-center">
            <Icon name="picture-in-picture" size={40} className="text-text-2" />
            <p className="text-text-2 text-ui">Playing in picture in picture</p>
            <Button variant="secondary" onClick={() => setPip(false)}>
              Back to this tab
            </Button>
          </div>
        </div>
      )}

      <div
        className={cn(
          'absolute inset-x-0 bottom-[16%] transition-[bottom] duration-200',
          chrome && 'bottom-[22%]',
        )}
      >
        {!pip && <CueLine player={player} />}
      </div>

      <div
        className={cn(
          'transition-opacity duration-200',
          chrome ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
      >
        <div className="absolute inset-x-0 top-0 flex items-center gap-3 bg-[linear-gradient(rgb(0_0_0/0.7),transparent)] p-4 medium:px-8">
          <button type="button" aria-label="Back to details" onClick={exit} className={glassButton}>
            <Icon name="arrow-left" size={20} />
          </button>
          <div className="grid min-w-0">
            <span className="truncate font-semibold text-title">{d?.item.title}</span>
            {player.version && (
              <span className="truncate text-caption text-text-2">{player.version.detail}</span>
            )}
          </div>
          {player.version && (
            <QualityTag overlay className="ms-auto">
              {player.version.label}
            </QualityTag>
          )}
        </div>

        {!player.playing && (
          // a big target over the frame; the transport's Play is the one assistive tech uses
          <button
            type="button"
            aria-hidden
            tabIndex={-1}
            onClick={player.toggle}
            className="glass-badge absolute top-1/2 left-1/2 grid size-20 -translate-1/2 cursor-pointer place-items-center rounded-full outline-none focus-visible:ring-focus"
          >
            <Icon name="play" size={34} />
          </button>
        )}

        <div className="absolute inset-x-0 bottom-0 grid gap-2 bg-[linear-gradient(transparent,rgb(0_0_0/0.75))] px-4 pt-16 pb-4 medium:px-8">
          <Scrubber player={player} />
          <div className="flex items-center gap-1">
            <button
              type="button"
              aria-label={player.playing ? 'Pause' : 'Play'}
              onClick={player.toggle}
              className={glassButton}
            >
              <Icon name={player.playing ? 'pause' : 'play'} size={22} />
            </button>
            <button
              type="button"
              aria-label={`Back ${SEEK_S} seconds`}
              onClick={() => player.seekBy(-SEEK_S)}
              className={glassButton}
            >
              <Icon name="replay" size={20} />
            </button>
            <button
              type="button"
              aria-label={`Forward ${SEEK_S} seconds`}
              onClick={() => player.seekBy(SEEK_S)}
              className={glassButton}
            >
              <Icon name="replay" size={20} className="-scale-x-100" />
            </button>
            <button
              type="button"
              aria-label={muted ? 'Unmute' : 'Mute'}
              aria-pressed={muted}
              onClick={() => setMuted((m) => !m)}
              // phones and tablets set the volume with their own buttons; this leaves Picture in
              // picture and Full screen room at 390
              className={cn(glassButton, 'hidden medium:grid')}
            >
              <Icon name={muted ? 'mute' : 'sound'} size={20} />
            </button>
            <span className="ms-2 font-mono text-[13px] text-text-2">
              {clock(player.position)} / {clock(player.duration)}
            </span>
            <button
              type="button"
              aria-label="Audio and subtitles"
              aria-expanded={panel}
              onClick={() => setPanel((p) => !p)}
              className={cn(glassButton, 'ms-auto')}
            >
              <Icon name="subtitles" size={20} />
            </button>
            {pipAvailable && (
              <button
                type="button"
                aria-label="Picture in picture"
                aria-pressed={pip}
                onClick={() => setPip((p) => !p)}
                className={glassButton}
              >
                <Icon name="picture-in-picture" size={20} />
              </button>
            )}
            <button
              type="button"
              aria-label="Full screen"
              onClick={() => root.current?.requestFullscreen?.().catch(() => {})}
              className={glassButton}
            >
              <Icon name="view" size={20} />
            </button>
          </div>
        </div>
      </div>
      {panel && <TracksPanel player={player} onClose={() => setPanel(false)} />}
      <StreamWaiting player={player} size="web" />
      <StreamMessage player={player} size="web" action={webStreamAction} onBack={exit} />
      <NextUp
        player={player}
        next={d?.related[0]}
        size="web"
        action={webStreamAction}
        onPlay={(next) => navigate(`/play/${next}`)}
      />
    </div>
  )
}
