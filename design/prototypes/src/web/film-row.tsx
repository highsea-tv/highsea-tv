// SPDX-License-Identifier: AGPL-3.0-only
// A row of films on the web and desktop, the TV's (tv/film-row.tsx) brought over with Home (the
// owner, 2026-10-30): its first slot is fixed at the left, a widescreen card with one film's
// backdrop and logo, and box-art posters of the films after it follow at the right, running on to
// the window's edge. The card opens its film. Its film changes as on the TV, every poster moving
// one place: with Left and Right while the card has focus, with the arrows at the row's edges on
// hover, or by clicking a poster, which brings that film into the card. Under the row, the card's
// film is described, no wider than the card, so nothing moves as the film changes. Home's rows
// loop: past the last film comes the first again, either way.
import { cn, Icon, Poster, QualityTag, useSound } from '@highsea-tv/ui-web'
import { useReducedMotion } from 'motion/react'
import {
  type CSSProperties,
  type KeyboardEvent,
  type RefObject,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import { meta, qualityTags } from '../client/data.ts'
import type { ClientItem } from '../mock/types.ts'

// the posters' width, from a phone's to a large monitor's; the card is as tall, at 16:9
const sizes = {
  '--poster': 'clamp(6.5rem, 10.5vw, 12rem)',
  '--gap': '0.75rem',
  '--height': 'calc(var(--poster) * 1.5)',
  '--wide': 'calc(var(--poster) * 1.5 * 16 / 9)',
} as CSSProperties

// The card, the title and the description stay on the page's gutter (--g, as `gutter`); the row
// reaches past it on both sides by one poster and its gap, or to the window's edge where that's
// nearer (the owner, 2026-10-30). The films either side show there, fading out, and the arrows sit
// in it. 1680px is the page's width (home.tsx).
const inset = [
  '[--g:1rem] medium:[--g:2rem] wide:[--g:4rem]',
  '[--inset:min(var(--poster)+var(--gap),max(0px,(100vw-1680px)/2)+var(--g))]',
].join(' ')

// the fade across each inset, eased so it has no edge (an ease-in-out curve sampled at five stops),
// as a mask so it works over the bloom or any background, and always there, not only on hover
const ease = [0, 0.06, 0.25, 0.6, 0.88, 1]
const ramp = (side: 'start' | 'end') =>
  ease
    .map((a, i) => {
      const at = `calc((var(--inset) - var(--gap)) * ${i / (ease.length - 1)})`
      return `rgb(0 0 0 / ${side === 'start' ? a : 1 - a}) ${side === 'start' ? at : `calc(100% - var(--inset) + var(--gap) + ${at})`}`
    })
    .join(', ')
const fade = {
  maskImage: `linear-gradient(90deg, ${ramp('start')}, ${ramp('end')})`,
} as CSSProperties

// as on the TV: the film coming in eases in on the slide's spring, the one going out fades quickly
const crossfade = 'transition-opacity duration-(--duration-spring-quick) ease-(--ease-spring-quick)'
const leave = 'opacity-0 transition-opacity duration-(--duration-fade-out) ease-out'
const slide = 'transform var(--duration-spring-quick) var(--ease-spring-quick)'
const step = '(var(--poster) + var(--gap))'
const after = '(var(--wide) + var(--gap))'

/** Where a slot's poster sits from the card's left edge (tv/film-row.tsx's `place`). */
const place = (v: number, pos: number, dir: number) =>
  v < pos
    ? `calc(${v - pos} * ${step})`
    : v > pos
      ? `calc(${after} + ${v - pos - 1} * ${step})`
      : dir < 0
        ? '0px'
        : `calc(${after} - ${step})`

const exit = (dir: number) => (dir > 0 ? '0px' : `calc(${after} - ${step})`)

/** Slots kept around the card's: enough after it to pass a wide window's edge, two before it. */
const AHEAD = 13
const BEHIND = 2
const mod = (a: number, n: number) => ((a % n) + n) % n

/** The card's width in posters: as tall, at 16:9. */
const WIDE = (1.5 * 16) / 9

/**
 * The posters' width, so that the card and a whole number of posters fill the page's width
 * exactly: the last whole poster ends on the right gutter as the card starts on the left one, and
 * the films past either end show alike (the owner, 2026-10-30). As many posters as come nearest
 * the size `sizes` gives them; until it's measured, that size.
 */
function usePosterWidth(section: RefObject<HTMLElement | null>) {
  const [poster, setPoster] = useState<number | null>(null)
  useLayoutEffect(() => {
    const el = section.current
    if (!el) return
    const fit = () => {
      // in rems, as `sizes` and the gutter are, so larger text scales them alike
      const rem = Number.parseFloat(getComputedStyle(document.documentElement).fontSize) || 16
      const gutter = Number.parseFloat(getComputedStyle(el).getPropertyValue('--g')) * rem
      const gap = 0.75 * rem
      const width = el.clientWidth - 2 * gutter
      const target = Math.min(Math.max(6.5 * rem, window.innerWidth * 0.105), 12 * rem)
      const n = Math.max(1, Math.round((width - WIDE * target) / (target + gap)))
      setPoster((width - n * gap) / (WIDE + n))
    }
    fit()
    const observer = new ResizeObserver(fit)
    observer.observe(el)
    return () => observer.disconnect()
  }, [section])
  return poster
}

export function WebFilmRow({
  title,
  suffix,
  items,
  hrefOf,
  loop = false,
}: {
  title: string
  suffix?: string | null
  items: ClientItem[]
  hrefOf: (item: ClientItem) => string
  /** Past the last film comes the first again, either way. */
  loop?: boolean
}) {
  const [{ pos, dir }, setPos] = useState({ pos: 0, dir: 1 })
  const n = items.length
  const loops = loop && n > 1
  const at = loops ? mod(pos, n) : pos
  const strip = useRef<HTMLUListElement>(null)
  const section = useRef<HTMLElement>(null)
  const poster = usePosterWidth(section)
  const play = useSound()
  const reduced = useReducedMotion()
  const described = useId()
  const can = (by: number) => loops || (pos + by >= 0 && pos + by < n)

  const move = (by: number) => {
    if (!by || !can(by)) return
    // one place: the card's film jumps to where it comes out from before sliding with the others
    const leaving = strip.current?.querySelector<HTMLElement>(`[data-slot="${pos}"]`)
    if (leaving && !reduced && Math.abs(by) === 1) {
      const transition = leaving.style.transition
      leaving.style.transition = 'none'
      leaving.style.transform = `translateX(${exit(by)})`
      void leaving.offsetWidth
      leaving.style.transition = transition
    }
    setPos({ pos: pos + by, dir: Math.sign(by) })
    play('navigate')
  }
  const onKey = (e: KeyboardEvent) => {
    if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return
    const by = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
    if (!by || !can(by)) return
    e.preventDefault()
    move(by)
  }

  const slots: number[] = []
  for (let v = pos - BEHIND; v <= pos + AHEAD; v++) if (loops || (v >= 0 && v < n)) slots.push(v)
  const item = items[at]
  if (!item) return null
  const arrow = (by: 1 | -1) => (
    // for the pointer, as the carousels' paging arrows are; the keyboard has Left and Right
    <button
      type="button"
      tabIndex={-1}
      aria-hidden
      onClick={() => move(by)}
      className={cn(
        'absolute inset-y-0 z-20 hidden w-(--inset) cursor-pointer items-center justify-center text-text opacity-0 transition-tint [@media(hover:hover)]:flex',
        by < 0 ? 'start-0' : 'end-0',
        can(by)
          ? 'group-focus-within/film:opacity-100 group-hover/film:opacity-100'
          : 'pointer-events-none',
      )}
    >
      <span className="grid size-10 place-items-center rounded-full bg-bg/70">
        <Icon name={by < 0 ? 'chevron-left' : 'chevron-right'} size={24} />
      </span>
    </button>
  )
  return (
    <section
      aria-label={title}
      ref={section}
      style={poster ? ({ ...sizes, '--poster': `${poster}px` } as CSSProperties) : sizes}
      className={cn('group/film relative grid grid-cols-1 gap-3', inset)}
    >
      <h2 className="px-(--g) text-title">
        {title}
        {suffix && <span className="font-normal text-text-2"> {suffix}</span>}
      </h2>
      <div className="relative mx-[calc(var(--g)-var(--inset))]">
        {arrow(-1)}
        {arrow(1)}
        {/* the padding keeps the card's lift and focus ring inside the mask */}
        <div style={fade} className="overflow-x-clip px-(--inset) py-2">
          <div className="relative h-(--height)">
            <a
              href={hrefOf(item)}
              onKeyDown={onKey}
              aria-label={`${item.title}, ${meta(item)}`}
              aria-describedby={described}
              className="relative z-10 block h-(--height) w-(--wide) overflow-hidden rounded-poster bg-s2 outline-none transition-lift hover:scale-[1.02] focus-visible:ring-focus"
            >
              {items.map((m, i) => (
                <div
                  key={m.id}
                  aria-hidden
                  className={`absolute inset-0 ${i === at ? `opacity-100 ${crossfade}` : leave}`}
                >
                  <img
                    src={m.art.backdrop}
                    alt=""
                    loading="lazy"
                    className="absolute inset-0 h-full w-full object-cover"
                  />
                  <div className="absolute inset-0 bg-[linear-gradient(20deg,rgb(0_0_0/0.65),transparent_55%)]" />
                  <div className="absolute inset-x-4 bottom-3.5">
                    {m.art.logo ? (
                      <img
                        src={m.art.logo}
                        alt=""
                        className="max-h-[calc(var(--height)*0.26)] max-w-[70%] object-contain object-left drop-shadow-[0_2px_8px_rgb(0_0_0/0.5)]"
                      />
                    ) : (
                      <span className="line-clamp-2 font-semibold text-title leading-[1.05] tracking-display">
                        {m.title}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </a>
            {/* every film as a poster on one strip behind the card; a click brings one into it */}
            <ul ref={strip} aria-hidden className="absolute inset-y-0 left-0">
              {slots.map((v) => {
                const m = items[mod(v, n)] as ClientItem
                return (
                  <li
                    key={v}
                    data-slot={v}
                    style={{
                      transform: `translateX(${place(v, pos, dir)})`,
                      transition: reduced
                        ? 'none'
                        : `${slide}, opacity ${v === pos ? 'var(--duration-fade-out) ease-out' : 'var(--duration-spring-quick) var(--ease-spring-quick)'}`,
                    }}
                    className={cn(
                      'absolute top-0 left-0 w-(--poster)',
                      v === pos ? 'pointer-events-none opacity-0' : 'opacity-100',
                    )}
                  >
                    <button
                      type="button"
                      tabIndex={-1}
                      onClick={() => move(v - pos)}
                      className="block w-full cursor-pointer rounded-poster transition-lift hover:brightness-110"
                    >
                      <Poster title={m.title} src={m.art.poster} />
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        </div>
      </div>
      {/* the card's film described */}
      <div className="px-(--g)">
        <div id={described} className="grid w-[calc(var(--wide)+2*var(--gap))] max-w-full gap-1.5">
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 font-semibold text-body">
            {item.title}
            <span className="font-normal text-text-2">{meta(item)}</span>
            {qualityTags(item).map((q) => (
              <QualityTag key={q}>{q}</QualityTag>
            ))}
          </p>
          <p className="line-clamp-2 text-pretty text-body text-text-2">{item.synopsis}</p>
        </div>
      </div>
    </section>
  )
}
