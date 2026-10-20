'use client'
// SPDX-License-Identifier: AGPL-3.0-only
// A row of titles. Pointer: trackpad and wheel scroll it, and paging arrows appear at the edges on
// hover. Keyboard: the row is one Tab stop; arrows move between items (plays `navigate`), and at
// either end focus stays put and nudges 0.2u, silently (sound.md#event-taxonomy).
import {
  Children,
  type KeyboardEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react'
import { Icon } from '../icons/icon.tsx'
import { cn } from '../lib/cn.ts'
import { useSound } from '../sound/context.tsx'

const FOCUSABLE = 'a[href], button:not([disabled]), [tabindex]:not([data-row-skip])'

export type CarouselRowProps = {
  title: ReactNode
  /** A curated-by suffix after the title, in `text-2`. */
  suffix?: ReactNode
  /** A link or button at the end of the header ("See all"). */
  action?: ReactNode
  /** One child per item. */
  children: ReactNode
  /** Width of each item. Default fits about 6–9 posters by breakpoint. */
  itemClassName?: string
  /**
   * Arrow keys move between items. Turn it off where a spatial focus engine owns the arrows (TV);
   * items then keep their own tab stops.
   */
  roving?: boolean
  /**
   * Lines the row up with its container's content edge (an admin column) instead of the page-edge
   * gutter. A sliver of inset stays, so lifted posters aren't clipped.
   */
  flush?: boolean
  className?: string
}

export function CarouselRow({
  title,
  suffix,
  action,
  children,
  itemClassName = 'w-[clamp(7.5rem,13vw,10.5rem)]',
  roving = true,
  flush = false,
  className,
}: CarouselRowProps) {
  const headingId = useId()
  const track = useRef<HTMLUListElement>(null)
  const [edges, setEdges] = useState({ start: true, end: true })
  const play = useSound()
  const items = Children.toArray(children)

  const targets = useCallback(
    () =>
      [...(track.current?.children ?? [])].map(
        (li) => li.querySelector<HTMLElement>(FOCUSABLE) ?? null,
      ),
    [],
  )

  const measure = useCallback(() => {
    const el = track.current
    if (!el) return
    setEdges({
      start: el.scrollLeft <= 1,
      end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 1,
    })
  }, [])

  // one tab stop per row: the first item, or the last one focused
  const setRoving = useCallback(
    (active: HTMLElement | null) => {
      if (!roving) return
      const all = targets()
      const current = active ?? all.find((t) => t?.tabIndex === 0) ?? all[0]
      for (const t of all) if (t) t.tabIndex = t === current ? 0 : -1
    },
    [roving, targets],
  )

  // biome-ignore lint/correctness/useExhaustiveDependencies: re-run when the items change
  useEffect(() => {
    setRoving(null)
    measure()
  }, [items.length, setRoving, measure])

  useEffect(() => {
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [measure])

  const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

  const page = (dir: 1 | -1) => {
    const el = track.current
    if (!el) return
    el.scrollBy({ left: dir * el.clientWidth * 0.85, behavior: reduced() ? 'auto' : 'smooth' })
  }

  const onKeyDown = (e: KeyboardEvent<HTMLUListElement>) => {
    if (!roving) return
    const keys = { ArrowLeft: -1, ArrowRight: 1, Home: -Infinity, End: Infinity } as const
    const step = keys[e.key as keyof typeof keys]
    if (step === undefined || e.altKey || e.ctrlKey || e.metaKey) return
    const all = targets()
    const from = all.findIndex((t) => t?.contains(document.activeElement))
    if (from < 0) return
    e.preventDefault()
    const to = Math.max(
      0,
      Math.min(all.length - 1, Number.isFinite(step) ? from + step : step < 0 ? 0 : all.length - 1),
    )
    const next = all[to]
    const current = all[from]
    if (to === from || !next) {
      if (current && !reduced() && typeof current.animate === 'function') {
        const d = (window.innerWidth / 100) * 0.2 * Math.sign(step)
        current.animate([{ translate: '0 0' }, { translate: `${d}px 0` }, { translate: '0 0' }], {
          duration: 240,
          easing: 'ease-out',
        })
      }
      return
    }
    setRoving(next)
    next.focus({ preventScroll: true })
    next.scrollIntoView({
      block: 'nearest',
      inline: 'nearest',
      behavior: reduced() ? 'auto' : 'smooth',
    })
    play('navigate')
  }

  const arrow = (dir: 1 | -1, hidden: boolean) => (
    <button
      type="button"
      tabIndex={-1}
      aria-hidden
      onClick={() => page(dir)}
      className={cn(
        'absolute top-0 bottom-0 z-20 hidden w-(--row-gutter) min-w-10 cursor-pointer items-center justify-center text-text opacity-0 transition-tint [@media(hover:hover)]:flex',
        dir < 0
          ? 'start-0 bg-[linear-gradient(90deg,var(--color-bg),transparent)]'
          : 'end-0 bg-[linear-gradient(270deg,var(--color-bg),transparent)]',
        hidden ? 'pointer-events-none' : 'group-hover/row:opacity-100',
      )}
    >
      <Icon name={dir < 0 ? 'chevron-left' : 'chevron-right'} size={24} />
    </button>
  )

  return (
    // min-w-0 and a minmax(0, 1fr) column: otherwise the row, as a grid or flex item, and its own
    // column grow to the whole track's width instead of scrolling it
    <section
      aria-labelledby={headingId}
      className={cn(
        'group/row relative grid min-w-0 grid-cols-1 gap-3',
        flush
          ? '-mx-1.5 [--row-gutter:0.375rem]'
          : '[--row-gutter:1rem] medium:[--row-gutter:2rem] wide:[--row-gutter:4rem]',
        className,
      )}
    >
      <div className="flex items-baseline gap-3 px-(--row-gutter)">
        <h2 id={headingId} className="text-title">
          {title}
          {suffix && <span className="font-normal text-text-2"> {suffix}</span>}
        </h2>
        {action && <div className="ms-auto text-ui">{action}</div>}
      </div>
      <div className="relative">
        {arrow(-1, edges.start)}
        <ul
          ref={track}
          onScroll={measure}
          onKeyDown={onKeyDown}
          onFocus={(e) => {
            if (roving && e.target instanceof HTMLElement) setRoving(e.target)
          }}
          className="relative flex snap-x snap-mandatory scroll-px-(--row-gutter) gap-3 overflow-x-auto overscroll-x-contain px-(--row-gutter) py-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {items.map((child, i) => (
            <li
              // biome-ignore lint/suspicious/noArrayIndexKey: children carry their own keys
              key={i}
              className={cn('shrink-0 snap-start', itemClassName)}
            >
              {child}
            </li>
          ))}
        </ul>
        {arrow(1, edges.end)}
      </div>
    </section>
  )
}
