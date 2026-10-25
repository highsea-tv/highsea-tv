// SPDX-License-Identifier: AGPL-3.0-only
// The player's stream states (player.md#states; checkpoint 4.0b), drawn over the frame the same
// way on every platform: Getting it ready and Buffering as a spinner with the chrome showing; a
// stream that didn't start, and one stopped from Now playing, over a scrim with what to do next;
// Next up in a film's last seconds. Each platform passes its own button, so TV's take the D-pad.
import { cn, Icon } from '@highsea-tv/ui-web'
import { type ReactNode, useEffect, useState } from 'react'
import type { ClientItem } from '../mock/types.ts'
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
    title: 'text-[22px] font-semibold',
    body: 'text-ui text-text-2',
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

/** Next up: in a film's last seconds, the next one in its collection, counting down. */
export function NextUp({
  player,
  next,
  size,
  action,
  onPlay,
}: {
  player: Player
  next: ClientItem | undefined
  size: Size
  action: StreamAction
  onPlay: (id: string) => void
}) {
  const t = text[size]
  const active = player.stream === 'next-up' && !!next
  const [left, setLeft] = useState(NEXT_UP_S)
  useEffect(() => {
    if (!active) return
    setLeft(NEXT_UP_S)
    const timer = setInterval(() => setLeft((n) => Math.max(0, n - 1)), 1000)
    return () => clearInterval(timer)
  }, [active])
  useEffect(() => {
    if (active && left === 0 && next) onPlay(next.id)
  }, [active, left, next, onPlay])
  if (!active || !next) return null
  return (
    <section
      aria-labelledby="next-up"
      data-isolate=""
      className={cn(
        'glass-scrim absolute z-30 grid rounded-lg border border-line bg-bg/80 shadow-4',
        size === 'tv'
          ? 'right-(--tv-safe-x) bottom-[14cqw] w-[30cqw] gap-[1cqw] p-[1.4cqw]'
          : size === 'mobile'
            ? 'right-12 bottom-16 w-72 gap-3 p-3'
            : 'right-8 bottom-28 w-80 gap-3 p-4',
      )}
    >
      <div
        className={cn(
          'grid grid-cols-[auto_minmax(0,1fr)] items-center',
          size === 'tv' ? 'gap-[1cqw]' : 'gap-3',
        )}
      >
        <img
          src={next.art.still}
          alt=""
          className={cn(
            'aspect-still rounded-sm object-cover',
            size === 'tv' ? 'w-[10cqw]' : 'w-24',
          )}
        />
        <div className="grid min-w-0">
          <h2 id="next-up" className={cn('font-mono uppercase', t.small)}>
            Next up
          </h2>
          <span
            className={cn(
              'truncate font-semibold text-text',
              size === 'tv' ? 'text-(length:--tv-text-button)' : 'text-ui',
            )}
          >
            {next.title}
          </span>
          <span className={t.small}>Starts in {left} s</span>
        </div>
      </div>
      <div className={cn('flex', size === 'tv' ? 'gap-[1cqw]' : 'gap-2')}>
        {action({
          primary: true,
          // on TV the remote needs a focus; elsewhere Space during the credits still pauses
          initial: size === 'tv',
          onClick: () => onPlay(next.id),
          children: 'Play now',
        })}
        {action({ onClick: player.clearStream, children: 'Cancel' })}
      </div>
    </section>
  )
}
