// SPDX-License-Identifier: AGPL-3.0-only
// A row of films on the TV, after Netflix's TV rows (the owner, 2026-10-30): its first slot is
// fixed at the left, a widescreen card showing one film's backdrop and logo, and box-art posters
// of the films after it follow at the right. The fixed card is the row's one focus stop. Right
// hands it the next film: the first poster slides under the card and fades as its film
// crossfades in, and the film the card held comes out the other side as a poster, going on off
// the screen at the left with the ones before it (the owner, 2026-10-30); Left gives the previous
// one back the same way. Under every row, the card's film
// is described, no wider than the card and two gaps, its synopsis at most two lines and wrapped
// with text-wrap: pretty so no line is left with one word, so nothing moves as focus does (the
// owner, 2026-10-30).
import { Poster, QualityTag, useSound } from '@highsea-tv/ui-web'
import { useReducedMotion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import { meta, qualityTags } from '../client/data.ts'
import type { ClientItem } from '../mock/types.ts'

/** The posters' width; the fixed card is as tall as they are, at 16:9. */
const poster = 10.5
const height = poster * 1.5
const wide = (height * 16) / 9

// the film coming in eases in on the slide's spring; the one going out (in the card or as the
// first poster) fades quickly, so the two don't sit on each other
const crossfade = 'transition-opacity duration-(--duration-spring-quick) ease-(--ease-spring-quick)'
const leave = 'opacity-0 transition-opacity duration-(--duration-fade-out) ease-out'
const slide = 'transform var(--duration-spring-quick) var(--ease-spring-quick)'
const step = `(${poster}cqw + var(--tv-poster-gap))`

/** Where the posters after the card start, from the card's left edge. */
const after = `(${wide}cqw + var(--tv-poster-gap))`

/**
 * Where a film's poster sits on the strip, from the card's left edge: the films before the card's
 * to its left, running off the screen, and the ones after it to its right. The card's own film is
 * hidden one place from where it came in, under the card's edge, so every poster moves exactly one
 * place a press, whichever way (the owner, 2026-10-30).
 */
const place = (i: number, at: number, dir: number) =>
  i < at
    ? `calc(${i - at} * ${step})`
    : i > at
      ? `calc(${after} + ${i - at - 1} * ${step})`
      : dir < 0
        ? '0px'
        : `calc(${after} - ${step})`

/** Where the card's film, hidden, starts from as it comes out: one place short of its slot. */
const exit = (dir: number) => (dir > 0 ? '0px' : `calc(${after} - ${step})`)

export function TvFilmRow({
  group,
  title,
  suffix,
  goUp,
  items,
  hrefOf,
  className,
}: {
  group: string
  title: string
  suffix?: string | null
  goUp?: string
  items: ClientItem[]
  hrefOf: (item: ClientItem) => string
  className?: string
}) {
  const [{ at, dir }, setAt] = useState({ at: 0, dir: 1 })
  const card = useRef<HTMLAnchorElement>(null)
  const strip = useRef<HTMLUListElement>(null)
  const play = useSound()
  const reduced = useReducedMotion()
  // on the card itself, so it runs before the spatial navigator on the TV's root: Right and Left
  // change the film while there's one to change to, and are left to the navigator at the ends
  useEffect(() => {
    const el = card.current
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return
      const by = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
      if (!by || at + by < 0 || at + by >= items.length) return
      e.preventDefault()
      // the card's film is hidden, so it jumps to where it comes out from, one place short of its
      // slot, before sliding there with the others
      const leaving = strip.current?.children[at] as HTMLElement | undefined
      if (leaving && !reduced) {
        const transition = leaving.style.transition
        leaving.style.transition = 'none'
        leaving.style.transform = `translateX(${exit(by)})`
        void leaving.offsetWidth
        leaving.style.transition = transition
      }
      setAt({ at: at + by, dir: by })
      play('navigate')
    }
    el?.addEventListener('keydown', onKey)
    return () => el?.removeEventListener('keydown', onKey)
  }, [at, items.length, play, reduced])
  const item = items[at]
  if (!item) return null
  return (
    <section
      data-group={group}
      data-go-up={goUp}
      aria-label={title}
      className={`grid grid-cols-1 gap-[0.8cqw] ${className ?? ''}`}
    >
      <h2 className="px-(--tv-safe-x) font-semibold text-(length:--tv-text-row-title)">
        {title}
        {suffix && <span className="font-normal text-text-2"> {suffix}</span>}
      </h2>
      {/* the posters run on to the screen's edges, so there's more to see; the page clips them */}
      <div className="py-[1cqw] ps-(--tv-safe-x)">
        <div className="relative" style={{ height: `${height}cqw` }}>
          <a
            ref={card}
            href={hrefOf(item)}
            data-focusable=""
            aria-label={`${item.title}, ${meta(item)}`}
            style={{ width: `${wide}cqw`, height: `${height}cqw` }}
            className="relative z-10 block overflow-hidden rounded-(--tv-radius-poster) bg-s2 outline-none transition-lift focus-visible:scale-[1.04] focus-visible:shadow-(--tv-focus-shadow)"
          >
            {/* every film's art is laid in the card, and the one it holds shows */}
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
                {/* the title's logo, as the featured card sets it; the name when TMDB has none */}
                <div className="absolute right-[1.2cqw] bottom-[1.1cqw] left-[1.2cqw]">
                  {m.art.logo ? (
                    <img
                      src={m.art.logo}
                      alt=""
                      className="max-h-[4cqw] max-w-[14cqw] object-contain object-left drop-shadow-[0_0.2cqw_0.8cqw_rgb(0_0_0/0.5)]"
                    />
                  ) : (
                    <span className="line-clamp-2 font-semibold text-[1.6cqw] leading-[1.05] tracking-display">
                      {m.title}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </a>
          {/* every film as a poster on one strip behind the card, each sliding to its place as
          the card takes the next or the previous */}
          <ul ref={strip} aria-hidden className="absolute inset-y-0 left-0">
            {items.map((m, i) => (
              <li
                key={m.id}
                style={{
                  width: `${poster}cqw`,
                  transform: `translateX(${place(i, at, dir)})`,
                  transition: reduced
                    ? 'none'
                    : `${slide}, opacity ${i === at ? 'var(--duration-fade-out) ease-out' : 'var(--duration-spring-quick) var(--ease-spring-quick)'}`,
                }}
                className={`absolute top-0 left-0 ${i === at ? 'opacity-0' : 'opacity-100'}`}
              >
                <Poster title={m.title} src={m.art.poster} />
              </li>
            ))}
          </ul>
        </div>
      </div>
      {/* the card's film described, under every row */}
      <div
        style={{ width: `calc(${wide}cqw + 2 * var(--tv-poster-gap) + var(--tv-safe-x))` }}
        className="grid max-w-full gap-[0.5cqw] ps-(--tv-safe-x) pt-[0.4cqw] pb-[1.2cqw]"
      >
        <p className="flex flex-wrap items-center gap-x-[1cqw] gap-y-[0.3cqw] font-semibold text-(length:--tv-text-meta)">
          {item.title}
          <span className="font-normal text-text-2">{meta(item)}</span>
          {qualityTags(item).map((q) => (
            <QualityTag key={q} className="text-(length:--tv-text-quality)">
              {q}
            </QualityTag>
          ))}
        </p>
        <p className="line-clamp-2 text-pretty text-(length:--tv-text-synopsis) text-text-2 leading-[1.45]">
          {item.synopsis}
        </p>
      </div>
    </section>
  )
}
