// SPDX-License-Identifier: AGPL-3.0-only
// A row of films on the TV, after Netflix's TV rows (the owner, 2026-10-30): its first slot is
// fixed at the left, a widescreen card showing one film's backdrop and logo, and box-art posters
// of the films after it follow at the right. The fixed card is the row's one focus stop. Right
// hands it the next film: the first poster fades out as its film crossfades into the card, and
// the posters slide left one place behind it; Left gives the previous one back. Nothing ever
// leaves the row at its left. Under every row, the card's film
// is described, no wider than the card and two gaps, its synopsis at most two lines and wrapped
// with text-wrap: pretty so no line is left with one word, so nothing moves as focus does (the
// owner, 2026-10-30).
import { Poster, QualityTag, useSound } from '@highsea-tv/ui-web'
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
  const [at, setAt] = useState(0)
  const card = useRef<HTMLAnchorElement>(null)
  const play = useSound()
  // on the card itself, so it runs before the spatial navigator on the TV's root: Right and Left
  // change the film while there's one to change to, and are left to the navigator at the ends
  useEffect(() => {
    const el = card.current
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return
      const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
      if (!step || at + step < 0 || at + step >= items.length) return
      e.preventDefault()
      setAt(at + step)
      play('navigate')
    }
    el?.addEventListener('keydown', onKey)
    return () => el?.removeEventListener('keydown', onKey)
  }, [at, items.length, play])
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
      {/* the posters run on to the screen's right edge, so there's more to see */}
      <div className="flex gap-(--tv-poster-gap) py-[1cqw] ps-(--tv-safe-x)">
        <a
          ref={card}
          href={hrefOf(item)}
          data-focusable=""
          aria-label={`${item.title}, ${meta(item)}`}
          style={{ width: `${wide}cqw`, height: `${height}cqw` }}
          className="relative z-10 block shrink-0 overflow-hidden rounded-(--tv-radius-poster) bg-s2 outline-none transition-lift focus-visible:scale-[1.04] focus-visible:shadow-(--tv-focus-shadow)"
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
        {/* the posters, the films after the card's; they slide left one place each time the card
        takes the next, the one whose film it took fading out as it goes */}
        <div aria-hidden className="min-w-0 flex-1 overflow-hidden">
          <ul
            className="flex gap-(--tv-poster-gap) transition-transform duration-(--duration-spring-quick) ease-(--ease-spring-quick) motion-reduce:transition-none"
            style={{
              transform: `translateX(calc(${-at} * (${poster}cqw + var(--tv-poster-gap))))`,
            }}
          >
            {items.slice(1).map((m, i) => (
              <li
                key={m.id}
                style={{ width: `${poster}cqw` }}
                className={`shrink-0 ${i < at ? leave : `opacity-100 ${crossfade}`}`}
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
