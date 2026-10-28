// SPDX-License-Identifier: AGPL-3.0-only
// C5 Player on the web (docs/product/player.md#web-and-desktop), ported from
// design/prototypes/src/web/player.tsx onto a real `<video>` (`playback.ts`). Over the picture:
// the title and Back on top; the scrubber with its trickplay preview, the transport and the track
// menu at the bottom; the Audio and subtitles panel with the timing nudge and its live preview.
// Subtitles come from a hidden `<track>` and are drawn here, with the person's offset added to
// the cues' times (https://developer.mozilla.org/en-US/docs/Web/API/TextTrack), so the timing
// changes without reloading. Keys: Space, ← and → 10 s, M, F and Esc, and the Media Session API
// for media keys and the browser's own controls
// (https://developer.mozilla.org/en-US/docs/Web/API/Media_Session_API). Picture in picture
// (https://developer.mozilla.org/en-US/docs/Web/API/Picture-in-Picture_API) and full screen on the
// frame (https://developer.mozilla.org/en-US/docs/Web/API/Fullscreen_API), so the chrome and
// subtitles stay drawn.

import type { ClientItem, TrickplayManifest } from '@highsea-tv/api-contract'
import { createFormat } from '@highsea-tv/client/format'
import {
  type Cue,
  chromeShown,
  createPlayerText,
  cuesAt,
  cueText,
  HIDE_MS,
  NUDGE_MS,
  nextChange,
  nextUpIn,
  SEEK_S,
  streamState,
  trickplayTile,
} from '@highsea-tv/client/player'
import { useT } from '@highsea-tv/i18n/react'
import { ApiError } from '@highsea-tv/sdk'
import { useQuery } from '@highsea-tv/sdk/react'
import { Button, cn, EmptyState, Icon, QualityTag } from '@highsea-tv/ui-web'
import { type ReactNode, type RefObject, useEffect, useRef, useState } from 'react'
import { useLocation, useParams } from 'wouter'
import { player as messages } from './messages.ts'
import { type Playback, usePlayback } from './playback.ts'
import { href } from './shell.tsx'

const { clock } = createFormat()
const nudgeText = createPlayerText()

const glassButton =
  'grid size-11 cursor-pointer place-items-center rounded-full text-text outline-none transition-tint hover:bg-text/12 focus-visible:ring-focus'

/** Pointer moves closer together than this count as one input, so moving doesn't re-render. */
const INPUT_THROTTLE_MS = 250

/**
 * The subtitle lines showing now, from the hidden track's cues with the offset applied, checked
 * each frame and drawn only when they change.
 */
function Cues({
  video,
  track,
  url,
  offsetMs,
}: {
  video: RefObject<HTMLVideoElement | null>
  track: RefObject<HTMLTrackElement | null>
  url: string | null
  offsetMs: number
}) {
  const [lines, setLines] = useState<string[]>([])
  useEffect(() => {
    const v = video.current
    if (!v || !url) {
      setLines([])
      return
    }
    let frame = 0
    let last = ''
    const tick = () => {
      const ours = track.current?.track
      for (const t of Array.from(v.textTracks)) {
        // `hidden` loads our cues without the browser drawing them; any other track (Safari's
        // native HLS lists the playlist's) stays off, so only the player draws
        const mode = t === ours ? 'hidden' : 'disabled'
        if (t.mode !== mode) t.mode = mode
      }
      const cues = ours?.cues ? (Array.from(ours.cues) as unknown as Cue[]) : []
      const now = cuesAt(cues, v.currentTime, offsetMs).map(cueText)
      const joined = now.join('\n')
      if (joined !== last) {
        last = joined
        setLines(now)
      }
      frame = requestAnimationFrame(tick)
    }
    tick()
    return () => cancelAnimationFrame(frame)
  }, [video, track, url, offsetMs])
  if (!lines.length) return null
  return (
    <p className="mx-auto w-fit max-w-[80%] whitespace-pre-line rounded-sm bg-[rgb(0_0_0/0.6)] px-3 py-1 text-center font-semibold text-[#ededee] text-[clamp(1rem,2.2vw,1.6rem)] leading-[1.3]">
      {lines.join('\n')}
    </p>
  )
}

/**
 * The live preview: the line's speech and the subtitle as two bars on one time axis, so a nudge
 * shows which way the subtitle moved. 1px is 10 ms; the frame is ±600 ms.
 */
function NudgePreview({ offsetMs }: { offsetMs: number }) {
  const shift = Math.max(-600, Math.min(600, offsetMs)) / 10
  const t = useT(messages)
  return (
    <div aria-hidden className="relative h-12 overflow-hidden rounded-sm bg-s2">
      <div className="absolute inset-y-0 left-1/2 w-px bg-line-strong" />
      <div className="absolute top-2 left-[calc(50%-60px)] h-3 w-[120px] rounded-full bg-text-3/60" />
      <span className="absolute top-1.5 left-2 font-mono text-[10px] text-text-3">
        {t('speech')}
      </span>
      <div
        className="absolute bottom-2 h-3 w-[120px] rounded-full bg-accent transition-[left] duration-200"
        style={{ left: `calc(50% - 60px + ${shift}px)` }}
      />
      <span className="absolute bottom-1.5 left-2 font-mono text-[10px] text-text-3">
        {t('subtitle')}
      </span>
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
  children: ReactNode
}) {
  return (
    <label className="flex w-full cursor-pointer items-center gap-2 rounded-sm px-2.5 py-2 text-ui transition-tint hover:bg-text/8 has-[:focus-visible]:ring-focus">
      <input type="radio" name={name} checked={checked} onChange={onChange} className="sr-only" />
      <Icon name="check" size={14} className={checked ? '' : 'invisible'} />
      {children}
    </label>
  )
}

function TracksPanel({ p, onClose }: { p: Playback; onClose: () => void }) {
  const t = useT(messages)
  const v = p.version
  const d = p.detail.data
  if (!v || !d) return null
  const picture = !!p.subtitle && !!p.session && !p.subtitleUrl
  // a version waiting for its file has nothing to play yet
  const versions = d.versions.filter((x) => x.playable || x.id === v.id)
  return (
    <aside
      aria-label={t('tracks')}
      className="glass-scrim absolute inset-y-0 right-0 z-20 grid w-full max-w-[22rem] content-start gap-5 overflow-y-auto border-line border-l bg-bg/80 p-5"
    >
      <div className="flex items-center">
        <h2 className="text-title">{t('tracks')}</h2>
        <Button
          variant="ghost"
          iconOnly
          icon="close"
          aria-label={t('close')}
          onClick={onClose}
          className="ms-auto"
        />
      </div>
      {versions.length > 1 && (
        <section aria-labelledby="p-version" className="grid gap-1">
          <h3 id="p-version" className="font-mono text-label text-text-3 uppercase">
            {t('version')}
          </h3>
          <div role="radiogroup" aria-labelledby="p-version">
            {versions.map((x) => (
              <RadioRow
                key={x.id}
                name="version"
                checked={x.id === v.id}
                onChange={() => p.setVersion(x.id)}
              >
                {x.label}
                <span className="ms-auto text-caption text-text-3">
                  {x.detail?.split(' · ').slice(-1)[0]}
                </span>
              </RadioRow>
            ))}
          </div>
        </section>
      )}
      {v.audio.length > 0 && (
        <section aria-labelledby="p-audio" className="grid gap-1">
          <h3 id="p-audio" className="font-mono text-label text-text-3 uppercase">
            {t('audio')}
          </h3>
          <div role="radiogroup" aria-labelledby="p-audio">
            {v.audio.map((a) => (
              <RadioRow
                key={a.id}
                name="audio"
                checked={a.id === p.audio?.id}
                onChange={() => p.setAudio(a.id)}
              >
                {a.label}
              </RadioRow>
            ))}
          </div>
        </section>
      )}
      <section aria-labelledby="p-subs" className="grid gap-1">
        <h3 id="p-subs" className="font-mono text-label text-text-3 uppercase">
          {t('subtitles')}
        </h3>
        <div role="radiogroup" aria-labelledby="p-subs">
          {[null, ...v.subtitles].map((s) => (
            <RadioRow
              key={s?.id ?? 'off'}
              name="subtitles"
              checked={(s?.id ?? null) === (p.subtitle?.id ?? null)}
              onChange={() => p.setSubtitle(s?.id ?? null)}
            >
              {s ? s.label : t('off')}
            </RadioRow>
          ))}
        </div>
        {picture && <p className="px-2.5 text-caption text-text-3">{t('pictureTrack')}</p>}
      </section>
      {p.subtitle && !picture && (
        <section aria-labelledby="p-timing" className="grid gap-2">
          <h3 id="p-timing" className="font-mono text-label text-text-3 uppercase">
            {t('timing')}
          </h3>
          <div className="flex items-center gap-2">
            <Button
              iconOnly
              icon="remove"
              aria-label={t('earlier', { ms: NUDGE_MS })}
              onClick={() => p.nudge(-1)}
            />
            <output aria-live="polite" className="min-w-24 text-center font-mono text-text text-ui">
              {nudgeText.offsetLabel(p.offsetMs)}
            </output>
            <Button
              iconOnly
              icon="add"
              aria-label={t('later', { ms: NUDGE_MS })}
              onClick={() => p.nudge(1)}
            />
            <Button
              variant="ghost"
              size="sm"
              onClick={() => p.nudge(0)}
              disabled={p.offsetMs === 0}
              className="ms-auto"
            >
              {t('reset')}
            </Button>
          </div>
          <NudgePreview offsetMs={p.offsetMs} />
          <p className="text-caption text-text-3">
            {nudgeText.offsetHint(p.offsetMs)} {t('saved')}
          </p>
        </section>
      )}
    </aside>
  )
}

/** The trickplay frame for a time, cut from its sheet and shown 160px wide. */
function Preview({
  id,
  versionId,
  manifest,
  seconds,
}: {
  id: number
  versionId: string
  manifest: TrickplayManifest
  seconds: number
}) {
  const tile = trickplayTile(manifest, seconds)
  if (!tile) return null
  const scale = 160 / tile.width
  const sheet = `/api/v1/items/movie/${id}/trickplay/${tile.sheet}.jpg?versionId=${encodeURIComponent(versionId)}`
  return (
    <div
      className="w-40 rounded-sm border border-line-strong bg-s2 bg-no-repeat shadow-3"
      style={{
        height: tile.height * scale,
        backgroundImage: `url("${sheet}")`,
        backgroundSize: `${manifest.columns * tile.width * scale}px auto`,
        backgroundPosition: `${-tile.x * scale}px ${-tile.y * scale}px`,
      }}
    />
  )
}

function Scrubber({
  p,
  manifest,
  id,
}: {
  p: Playback
  manifest: TrickplayManifest | null
  id: number
}) {
  const t = useT(messages)
  const [hover, setHover] = useState<{ x: number; t: number } | null>(null)
  const ref = useRef<HTMLInputElement>(null)
  const { position, duration } = p.state
  const at = (clientX: number) => {
    const r = ref.current?.getBoundingClientRect()
    if (!r || !duration) return null
    const f = Math.max(0, Math.min(1, (clientX - r.left) / r.width))
    return { x: f * r.width, t: f * duration }
  }
  return (
    <div className="relative">
      {hover && (
        <div
          aria-hidden
          className="pointer-events-none absolute bottom-6 grid -translate-x-1/2 justify-items-center gap-1 text-center"
          style={{ left: hover.x }}
        >
          {manifest && p.version && (
            <Preview id={id} versionId={p.version.id} manifest={manifest} seconds={hover.t} />
          )}
          <span className="font-mono text-[12px] text-text">{clock(hover.t)}</span>
        </div>
      )}
      <input
        ref={ref}
        type="range"
        min={0}
        max={duration || 0}
        step={1}
        value={Math.min(position, duration || position)}
        onChange={(e) => p.seekTo(Number(e.target.value))}
        onPointerMove={(e) => setHover(at(e.clientX))}
        onPointerLeave={() => setHover(null)}
        aria-label={t('position')}
        aria-valuetext={t('positionText', { at: clock(position), total: clock(duration) })}
        className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-text/25 accent-[var(--color-accent)] outline-none focus-visible:ring-focus"
        style={{
          background: `linear-gradient(90deg, var(--color-accent) ${(position / Math.max(1, duration)) * 100}%, rgb(255 255 255 / 0.25) 0)`,
        }}
      />
    </div>
  )
}

function WaitingCard({ preparing }: { preparing: boolean }) {
  const t = useT(messages)
  return (
    <div
      role="status"
      className="pointer-events-none absolute inset-0 z-10 grid place-items-center"
    >
      <div
        className={cn(
          'glass-badge grid justify-items-center gap-2 rounded-lg px-6 py-4 text-center',
          !preparing && 'rounded-full p-4',
        )}
      >
        <Icon name="loading" size={28} className="size-7 animate-spin" aria-hidden />
        {preparing ? (
          <>
            <span className="font-semibold text-[22px]">{t('preparing')}</span>
            <span className="text-caption text-text-2">{t('preparingBody')}</span>
          </>
        ) : (
          <span className="sr-only">{t('buffering')}</span>
        )}
      </div>
    </div>
  )
}

/** Didn't start, or stopped from Now playing: over a scrim, with what to do next. */
function StreamMessage({ p, onBack }: { p: Playback; onBack: () => void }) {
  const t = useT(messages)
  const failed = p.state.phase === 'failed'
  const by = p.state.stoppedBy
  return (
    <div
      role="alertdialog"
      aria-labelledby="stream-message"
      className="absolute inset-0 z-30 grid place-items-center bg-[rgb(0_0_0/0.72)] p-6"
    >
      <div className="grid max-w-md justify-items-center gap-3 text-center">
        <h2 id="stream-message" className="font-semibold text-[22px]">
          {failed ? t('failed') : t('stopped', { name: by?.name ?? '' })}
        </h2>
        {failed ? (
          <p className="text-text-2 text-ui">{t('failedBody')}</p>
        ) : (
          <>
            {by?.message && (
              <blockquote className="rounded-md border border-line bg-s2/80 px-4 py-2 text-text">
                “{by.message}”
              </blockquote>
            )}
            <p className="text-text-2 text-ui">{t('stoppedBody')}</p>
          </>
        )}
        <div className="mt-2 flex flex-wrap justify-center gap-2">
          <Button variant="primary" autoFocus onClick={p.retry}>
            {failed ? t('tryAgain') : t('startAgain')}
          </Button>
          <Button variant="secondary" onClick={onBack}>
            {t('backButton')}
          </Button>
        </div>
      </div>
    </div>
  )
}

/** Next up: in a film's last seconds, the next one in its collection, counting down with it. */
function NextUpCard({
  next,
  seconds,
  onPlay,
  onCancel,
}: {
  next: ClientItem
  seconds: number
  onPlay: () => void
  onCancel: () => void
}) {
  const t = useT(messages)
  return (
    <section
      aria-labelledby="next-up"
      className="glass-scrim absolute right-8 bottom-28 z-30 grid w-80 gap-3 rounded-lg border border-line bg-bg/80 p-4 shadow-4"
    >
      <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-3">
        {next.art.backdrop ? (
          <img
            src={next.art.backdrop}
            alt=""
            className="aspect-still w-24 rounded-sm object-cover"
          />
        ) : (
          <div className="aspect-still w-24 rounded-sm bg-s2" />
        )}
        <div className="grid min-w-0">
          <h2 id="next-up" className="font-mono text-caption text-text-2 uppercase">
            {t('nextUp')}
          </h2>
          <span className="truncate font-semibold text-text text-ui">{next.title}</span>
          <span className="text-caption text-text-2">{t('startsIn', { seconds })}</span>
        </div>
      </div>
      <div className="flex gap-2">
        <Button variant="primary" onClick={onPlay}>
          {t('playNow')}
        </Button>
        <Button variant="secondary" onClick={onCancel}>
          {t('cancel')}
        </Button>
      </div>
    </section>
  )
}

export function WebPlayer() {
  const { id } = useParams<{ id: string }>()
  const [location] = useLocation()
  // a new film is a new player: Next up moves from one to the next
  return <Player key={id} id={Number(id)} fromStart={location.endsWith('/start')} />
}

function Player({ id, fromStart }: { id: number; fromStart: boolean }) {
  const t = useT(messages)
  const [, navigate] = useLocation()
  const p = usePlayback(id, fromStart)
  const { state, dispatch } = p
  const [panel, setPanel] = useState(false)
  const [muted, setMuted] = useState(false)
  const [pip, setPip] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  const root = useRef<HTMLDivElement>(null)
  const track = useRef<HTMLTrackElement>(null)
  const pipAvailable = typeof document !== 'undefined' && document.pictureInPictureEnabled === true

  const versionId = p.version?.id
  const trickplay = useQuery(`client:trickplay:${id}:${versionId ?? ''}`, (c) =>
    versionId
      ? c.playback.trickplay({ params: { type: 'movie', id }, query: { versionId } })
      : Promise.resolve(null),
  )
  const nextUp = useQuery(`client:next:${id}`, (c) =>
    c.playback.next({ params: { type: 'movie', id } }),
  )
  const next = nextUp.data?.item ?? null
  const stream = streamState(state, now, !!next)

  const wake = () => {
    const at = Date.now()
    if (at - state.inputAt < INPUT_THROTTLE_MS) return
    dispatch({ type: 'input', at })
    setNow(at)
  }

  // the clock moves only when something is due: Buffering's delay, or the chrome hiding
  useEffect(() => {
    const t0 = Date.now()
    const due = [nextChange(state, t0), state.playing ? state.inputAt + HIDE_MS : null].filter(
      (x): x is number => x !== null && x > t0,
    )
    if (!due.length) return
    const timer = setTimeout(() => setNow(Date.now()), Math.min(...due) - t0 + 10)
    return () => clearTimeout(timer)
  }, [state])

  useEffect(() => {
    root.current?.focus()
  }, [])

  const exit = () => navigate(`/movies/${id}`)
  const playNext = () => {
    if (next) navigate(`/play/${next.id}`)
  }

  // at zero the next film plays; Cancel lets this one end as before
  const left = nextUpIn(state)
  useEffect(() => {
    if (stream === 'next-up' && left === 0 && next) navigate(`/play/${next.id}`)
  }, [stream, left, next, navigate])

  // muting and picture in picture follow the video, whichever control changed them
  useEffect(() => {
    const v = p.video.current
    if (!v) return
    const sync = () => setMuted(v.muted)
    const enter = () => setPip(true)
    const exitPip = () => setPip(false)
    v.addEventListener('volumechange', sync)
    v.addEventListener('enterpictureinpicture', enter)
    v.addEventListener('leavepictureinpicture', exitPip)
    return () => {
      v.removeEventListener('volumechange', sync)
      v.removeEventListener('enterpictureinpicture', enter)
      v.removeEventListener('leavepictureinpicture', exitPip)
    }
  }, [p.video])

  const d = p.detail.data
  // the keyboard's and headphones' media keys, and the browser's own controls
  useEffect(() => {
    if (!d || !('mediaSession' in navigator)) return
    const ms = navigator.mediaSession
    ms.metadata = new MediaMetadata({
      title: d.item.title,
      artwork: d.item.art.poster ? [{ src: d.item.art.poster }] : [],
    })
    const v = () => p.video.current
    const handlers: [MediaSessionAction, MediaSessionActionHandler][] = [
      [
        'play',
        () =>
          v()
            ?.play()
            .catch(() => {}),
      ],
      ['pause', () => v()?.pause()],
      ['seekbackward', (e) => p.seekBy(-(e.seekOffset ?? SEEK_S))],
      ['seekforward', (e) => p.seekBy(e.seekOffset ?? SEEK_S)],
      ['seekto', (e) => e.seekTime !== undefined && p.seekTo(e.seekTime)],
    ]
    for (const [action, h] of handlers)
      try {
        ms.setActionHandler(action, h)
      } catch {}
    return () => {
      ms.metadata = null
      for (const [action] of handlers)
        try {
          ms.setActionHandler(action, null)
        } catch {}
    }
  }, [d, p.video, p.seekBy, p.seekTo])

  const toggleMute = () => {
    const v = p.video.current
    if (v) v.muted = !v.muted
  }
  const toggleFullScreen = () => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
    else root.current?.requestFullscreen?.().catch(() => {})
  }
  const togglePip = () => {
    if (document.pictureInPictureElement) document.exitPictureInPicture().catch(() => {})
    else p.video.current?.requestPictureInPicture().catch(() => {})
  }

  const onKey = (e: React.KeyboardEvent) => {
    wake()
    const target = e.target as HTMLElement
    const inControl = target.closest('input, aside')
    if (e.key === ' ' && !target.closest('button, input')) {
      e.preventDefault()
      p.toggle()
    } else if (e.key === 'ArrowLeft' && !inControl) p.seekBy(-SEEK_S)
    else if (e.key === 'ArrowRight' && !inControl) p.seekBy(SEEK_S)
    else if ((e.key === 'm' || e.key === 'M') && !target.closest('input')) toggleMute()
    else if ((e.key === 'f' || e.key === 'F') && !target.closest('input')) toggleFullScreen()
    else if (e.key === 'Escape') {
      if (panel) setPanel(false)
      else exit()
    }
  }

  if (p.detail.status === 'error') {
    const missing = p.detail.error instanceof ApiError && p.detail.error.status === 404
    return (
      <main className="grid min-h-screen place-items-center bg-bg p-4">
        <EmptyState
          icon="movie"
          tone="error"
          title={missing ? t('missing') : p.detail.error.message}
          action={
            <Button asChild>
              <a href={href('/')}>{t('goHome')}</a>
            </Button>
          }
        />
      </main>
    )
  }

  const waiting = stream === 'preparing' || stream === 'buffering'
  const message = stream === 'failed' || stream === 'stopped'
  const chrome = chromeShown(state, now, panel) || waiting
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
      {/* biome-ignore lint/a11y/useMediaCaption: subtitles are a hidden <track>, drawn by <Cues> */}
      <video
        ref={p.attach}
        playsInline
        preload="auto"
        onClick={p.toggle}
        className="absolute inset-0 size-full object-contain"
      >
        {p.subtitleUrl && p.subtitle && (
          <track
            ref={track}
            key={p.subtitleUrl}
            kind="subtitles"
            src={p.subtitleUrl}
            srcLang={p.subtitle.language || undefined}
            label={p.subtitle.label}
          />
        )}
      </video>
      <h1 className="sr-only">{t('playing', { title: d?.item.title ?? '' })}</h1>

      {pip && (
        <div className="absolute inset-0 grid place-items-center bg-[#000]">
          <div className="grid justify-items-center gap-4 text-center">
            <Icon name="picture-in-picture" size={40} className="text-text-2" />
            <p className="text-text-2 text-ui">{t('pipShowing')}</p>
            <Button variant="secondary" onClick={togglePip}>
              {t('pipBack')}
            </Button>
          </div>
        </div>
      )}

      <div
        className={cn(
          'pointer-events-none absolute inset-x-0 bottom-[16%] transition-[bottom] duration-200',
          chrome && 'bottom-[22%]',
        )}
      >
        {!pip && <Cues video={p.video} track={track} url={p.subtitleUrl} offsetMs={p.offsetMs} />}
      </div>

      <div
        className={cn(
          'transition-opacity duration-200',
          chrome ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
      >
        <div className="absolute inset-x-0 top-0 flex items-center gap-3 bg-[linear-gradient(rgb(0_0_0/0.7),transparent)] p-4 medium:px-8">
          <button type="button" aria-label={t('back')} onClick={exit} className={glassButton}>
            <Icon name="arrow-left" size={20} />
          </button>
          <div className="grid min-w-0">
            <span className="truncate font-semibold text-title">{d?.item.title}</span>
            {p.version?.detail && (
              <span className="truncate text-caption text-text-2">{p.version.detail}</span>
            )}
          </div>
          {p.version && (
            <QualityTag overlay className="ms-auto">
              {p.version.label}
            </QualityTag>
          )}
        </div>

        {!state.playing && !waiting && !message && (
          // a big target over the frame; the transport's Play is the one assistive tech uses
          <button
            type="button"
            aria-hidden
            tabIndex={-1}
            onClick={p.toggle}
            className="glass-badge absolute top-1/2 left-1/2 grid size-20 -translate-1/2 cursor-pointer place-items-center rounded-full outline-none focus-visible:ring-focus"
          >
            <Icon name="play" size={34} />
          </button>
        )}

        <div className="absolute inset-x-0 bottom-0 grid gap-2 bg-[linear-gradient(transparent,rgb(0_0_0/0.75))] px-4 pt-16 pb-4 medium:px-8">
          <Scrubber p={p} manifest={trickplay.data?.manifest ?? null} id={id} />
          <div className="flex items-center gap-1">
            <button
              type="button"
              aria-label={state.playing ? t('pause') : t('play')}
              onClick={p.toggle}
              className={glassButton}
            >
              <Icon name={state.playing ? 'pause' : 'play'} size={22} />
            </button>
            <button
              type="button"
              aria-label={t('backBy', { seconds: SEEK_S })}
              onClick={() => p.seekBy(-SEEK_S)}
              className={glassButton}
            >
              <Icon name="replay" size={20} />
            </button>
            <button
              type="button"
              aria-label={t('forwardBy', { seconds: SEEK_S })}
              onClick={() => p.seekBy(SEEK_S)}
              className={glassButton}
            >
              <Icon name="replay" size={20} className="-scale-x-100" />
            </button>
            <button
              type="button"
              aria-label={muted ? t('unmute') : t('mute')}
              aria-pressed={muted}
              onClick={toggleMute}
              // phones and tablets set the volume with their own buttons; this leaves Picture in
              // picture and Full screen room at 390
              className={cn(glassButton, 'hidden medium:grid')}
            >
              <Icon name={muted ? 'mute' : 'sound'} size={20} />
            </button>
            <span className="ms-2 font-mono text-[13px] text-text-2">
              {clock(state.position)} / {clock(state.duration)}
            </span>
            <button
              type="button"
              aria-label={t('tracks')}
              aria-expanded={panel}
              onClick={() => setPanel((o) => !o)}
              className={cn(glassButton, 'ms-auto')}
            >
              <Icon name="subtitles" size={20} />
            </button>
            {pipAvailable && (
              <button
                type="button"
                aria-label={t('pip')}
                aria-pressed={pip}
                onClick={togglePip}
                className={glassButton}
              >
                <Icon name="picture-in-picture" size={20} />
              </button>
            )}
            <button
              type="button"
              aria-label={t('fullScreen')}
              onClick={toggleFullScreen}
              className={glassButton}
            >
              <Icon name="view" size={20} />
            </button>
          </div>
        </div>
      </div>
      {panel && <TracksPanel p={p} onClose={() => setPanel(false)} />}
      {waiting && <WaitingCard preparing={stream === 'preparing'} />}
      {message && <StreamMessage p={p} onBack={exit} />}
      {stream === 'next-up' && next && (
        <NextUpCard
          next={next}
          seconds={left}
          onPlay={playNext}
          onCancel={() => dispatch({ type: 'cancel-next' })}
        />
      )}
    </div>
  )
}
