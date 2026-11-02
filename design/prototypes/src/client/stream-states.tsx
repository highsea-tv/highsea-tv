// SPDX-License-Identifier: AGPL-3.0-only
// The player's stream states (player.md#states; checkpoint 4.0b), drawn over the frame the same
// way on every platform: Getting it ready and Buffering as a spinner with the chrome showing; a
// stream that didn't start, and one stopped from Now playing, over a scrim with what to do next;
// Next up as the credits start, and Skip intro and Skip credits over an episode's. Each platform passes its own button, so TV's take the D-pad.
import { cn, Icon, Poster } from '@highsea-tv/ui'
import { type ReactNode, useEffect, useState } from 'react'
import type { UpNext } from '../mock/types.ts'
import type { Player } from './player.ts'

export type StreamAction = (props: {
  primary?: boolean
  initial?: boolean
  onClick: () => void
  children: ReactNode
}) => ReactNode

type Size = 'web' | 'mobile' | 'tv'

const text: Record<Size, { title: string; body: string; small: string; spinner: string }> = {
  web: {
    title: 'text-title',
    body: 'text-body text-text-2',
    small: 'text-caption text-text-2',
    spinner: 'size-7',
  },
  mobile: {
    title: 'text-[18px] font-semibold',
    body: 'text-[14px] text-text-2',
    small: 'text-[13px] text-text-2',
    spinner: 'size-7',
  },
  tv: {
    title: 'text-[2.4cqw] font-semibold leading-[1.15]',
    body: 'text-(length:--tv-text-synopsis) text-text-2 leading-[1.45]',
    small: 'text-(length:--tv-text-meta) text-text-2',
    spinner: 'size-[2.2cqw]',
  },
}

/** The prototype's admin and message for a stopped stream; the product sends both with the stop. */
const stoppedBy = { name: 'Ines', message: 'The server is restarting in five minutes.' }
/** Seconds Next up counts down before the next film starts. */
export const NEXT_UP_S = 10

/** Getting it ready and Buffering: a spinner over the frame, under the chrome. */
export function StreamWaiting({ player, size }: { player: Player; size: Size }) {
  const t = text[size]
  if (player.stream !== 'preparing' && player.stream !== 'buffering') return null
  return (
    <div
      role="status"
      className="pointer-events-none absolute inset-0 z-10 grid place-items-center"
    >
      <div
        className={cn(
          'glass-badge grid justify-items-center gap-2 rounded-lg text-center',
          size === 'tv' ? 'gap-[0.8cqw] px-[2.4cqw] py-[1.6cqw]' : 'px-6 py-4',
          player.stream === 'buffering' &&
            (size === 'tv' ? 'rounded-full p-[1.4cqw]' : 'rounded-full p-4'),
        )}
      >
        <Icon name="loading" size={28} className={cn('animate-spin', t.spinner)} aria-hidden />
        {player.stream === 'preparing' ? (
          <>
            <span className={t.title}>Getting it ready</span>
            <span className={t.small}>Making the first minute for your connection.</span>
          </>
        ) : (
          <span className="sr-only">Buffering</span>
        )}
      </div>
    </div>
  )
}

/** A stream that didn't start, or one stopped from Now playing: over a scrim, with what's next. */
export function StreamMessage({
  player,
  size,
  action,
  onBack,
}: {
  player: Player
  size: Size
  action: StreamAction
  onBack: () => void
}) {
  const t = text[size]
  if (player.stream !== 'failed' && player.stream !== 'stopped') return null
  const failed = player.stream === 'failed'
  return (
    <div
      role="alertdialog"
      aria-labelledby="stream-message"
      data-isolate=""
      className="absolute inset-0 z-30 grid place-items-center bg-[rgb(0_0_0/0.72)] p-6"
    >
      <div
        className={cn(
          'grid max-w-md justify-items-center text-center',
          size === 'tv' ? 'max-w-[46cqw] gap-[1.4cqw]' : 'gap-3',
        )}
      >
        <h2 id="stream-message" className={t.title}>
          {failed ? 'This film didn’t start' : `${stoppedBy.name} stopped this stream`}
        </h2>
        {failed ? (
          <p className={t.body}>
            highsea couldn’t read the file. Try again, or choose another version in Audio and
            subtitles.
          </p>
        ) : (
          <>
            <blockquote
              className={cn(
                'rounded-md border border-line bg-s2/80 text-text',
                size === 'tv'
                  ? 'px-[1.6cqw] py-[1cqw] text-(length:--tv-text-synopsis)'
                  : 'px-4 py-2',
              )}
            >
              “{stoppedBy.message}”
            </blockquote>
            <p className={t.body}>You can start it again from where you were.</p>
          </>
        )}
        <div
          className={cn(
            'flex flex-wrap justify-center',
            size === 'tv' ? 'mt-[1cqw] gap-[1cqw]' : 'mt-2 gap-2',
          )}
        >
          {action({
            primary: true,
            initial: true,
            onClick: player.clearStream,
            children: failed ? 'Try again' : 'Start again',
          })}
          {action({ onClick: onBack, children: 'Back' })}
        </div>
      </div>
    </div>
  )
}

/**
 * Next up (player.md › Next up), as the credits start: the next episode, or the next season's
 * first, or a film's collection's next part, each counting down; otherwise three films that play
 * only when picked, as Netflix and the Apple TV app offer them.
 */
export function NextUp({
  player,
  next,
  size,
  action,
  onPlay,
}: {
  player: Player
  next: UpNext | null | undefined
  size: Size
  action: StreamAction
  onPlay: (id: string) => void
}) {
  const t = text[size]
  const active = player.stream === 'next-up' && !!next
  const counts = active && next.kind !== 'choices' && player.autoplay
  const [left, setLeft] = useState(NEXT_UP_S)
  useEffect(() => {
    if (!counts) return
    setLeft(NEXT_UP_S)
    const timer = setInterval(() => setLeft((n) => Math.max(0, n - 1)), 1000)
    return () => clearInterval(timer)
  }, [counts])
  useEffect(() => {
    if (counts && left === 0) onPlay(next.id)
  }, [counts, left, next, onPlay])
  if (!active || !next) return null
  const tv = size === 'tv'
  const titleText = cn(
    'truncate font-semibold text-text',
    tv ? 'text-(length:--tv-text-button)' : size === 'web' ? 'text-body' : 'text-ui',
  )
  return (
    <section
      aria-labelledby="next-up"
      data-isolate=""
      className={cn(
        'glass-scrim absolute z-30 grid rounded-lg border border-line bg-bg/80 shadow-4',
        tv
          ? cn(
              'right-(--tv-safe-x) bottom-[14cqw] gap-[1cqw] p-[1.4cqw]',
              next.kind === 'choices' ? 'w-[46cqw]' : 'w-[30cqw]',
            )
          : size === 'mobile'
            ? cn('right-12 bottom-16 gap-3 p-3', next.kind === 'choices' ? 'w-96' : 'w-72')
            : cn(
                'right-8 bottom-28 gap-3 p-4',
                next.kind === 'choices' ? 'w-[min(32rem,calc(100%-4rem))]' : 'w-80',
              ),
      )}
    >
      {next.kind === 'choices' ? (
        <>
          <h2 id="next-up" className={cn('font-mono uppercase', t.small)}>
            More like this
          </h2>
          <ul className={cn('grid grid-cols-3', tv ? 'gap-[1cqw]' : 'gap-3')}>
            {next.items.map((item, i) => (
              <li key={item.id} className="min-w-0">
                <button
                  type="button"
                  onClick={() => onPlay(item.id)}
                  {...(tv
                    ? { 'data-focusable': '', ...(i === 0 ? { 'data-initial': '' } : {}) }
                    : {})}
                  className="group/link grid w-full min-w-0 gap-1.5 rounded-sm text-left outline-none"
                >
                  <Poster title={item.title} src={item.art.still} aspect="still" />
                  <span className={cn(t.small, 'truncate group-focus-visible/link:text-text')}>
                    {item.title}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <div className="flex">{action({ onClick: player.clearStream, children: 'Close' })}</div>
        </>
      ) : (
        <>
          <div
            className={cn(
              'grid grid-cols-[auto_minmax(0,1fr)] items-center',
              tv ? 'gap-[1cqw]' : 'gap-3',
            )}
          >
            <img
              src={next.still}
              alt=""
              className={cn('aspect-still rounded-sm object-cover', tv ? 'w-[10cqw]' : 'w-24')}
            />
            <div className="grid min-w-0">
              <h2 id="next-up" className={cn('font-mono uppercase', t.small)}>
                {next.kind === 'episode'
                  ? next.season !== null
                    ? `Season ${next.season} starts`
                    : 'Next episode'
                  : 'Next up'}
              </h2>
              <span className={titleText}>{next.title}</span>
              <span className={cn(t.small, 'truncate')}>
                {player.autoplay ? `${next.line} · Starts in ${left} s` : next.line}
              </span>
            </div>
          </div>
          <div className={cn('flex', tv ? 'gap-[1cqw]' : 'gap-2')}>
            {action({
              primary: true,
              // on TV the remote needs a focus; elsewhere Space during the credits still pauses
              initial: tv,
              onClick: () => onPlay(next.id),
              children: 'Play now',
            })}
            {action({ onClick: player.clearStream, children: 'Cancel' })}
          </div>
        </>
      )}
    </section>
  )
}

/**
 * Skip intro while an episode's intro plays, and Skip credits while its credits play with Next up
 * put away, at the bottom right (player.md › Episodes).
 */
export function SkipButton({
  player,
  size,
  action,
}: {
  player: Player
  size: Size
  action: StreamAction
}) {
  const intro = player.intro
  if (player.stream !== 'normal' || (!intro && !player.credits)) return null
  return (
    <div
      data-skip=""
      className={cn(
        'absolute z-20',
        size === 'tv'
          ? 'right-(--tv-safe-x) bottom-[14cqw]'
          : size === 'mobile'
            ? 'right-12 bottom-24'
            : 'right-8 bottom-32',
      )}
    >
      {action({
        // on TV it takes the focus while it shows, as the Apple TV app's does, so OK skips
        initial: size === 'tv',
        onClick: intro ? () => player.seekTo(intro.end) : player.skipCredits,
        children: intro ? 'Skip intro' : 'Skip credits',
      })}
    </div>
  )
}
