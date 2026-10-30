// SPDX-License-Identifier: AGPL-3.0-only
// C2 Home, TV (docs/product/client-home.md#tv): the locked Hero + rows layout (tv.md#layout).
// The featured titles lead as a row of large 16:9 cards, the next one showing at the right edge
// (the owner, 2026-10-30); OK on one opens the movie. The rows follow: focus there lifts the page
// past the featured cards, Up from the first row comes back to them, and Up from those opens the
// global navigation. Rows remember their spot.
// Behind the featured cards, a bloom in the focused one's most vibrant colour fills the screen and
// fades into the background (the owner, 2026-10-30).
// An announcement that must be acknowledged comes first, on its own.
import { Icon, QualityTag } from '@highsea-tv/ui-web'
import { useReducedMotion } from 'motion/react'
import { useContext, useEffect, useMemo, useRef, useState } from 'react'
import { meta, qualityTags, useAnnouncements, useHome } from '../client/data.ts'
import { useVibrant } from '../client/vibrant.ts'
import { Inline } from '../kit/inline.tsx'
import type { ClientItem, HomeSection } from '../mock/types.ts'
import {
  AnnouncementBanner,
  BloomGlow,
  backdropReach,
  GlobalNav,
  pageTop,
  RailContext,
  ServerIdentity,
  TvButton,
  TvMessage,
  TvPoster,
  TvRow,
  tvHref,
  useInitialFocus,
  useTvNav,
} from './kit.tsx'

/**
 * A featured title as one large 16:9 card, which lifts only slightly on focus: at this size the
 * posters' zoom would push it under the rail: its backdrop, with the title's logo, the details and
 * the tagline low on the left. OK opens the movie, where Play is (the owner, 2026-10-30).
 */
function FeaturedCard({ item, index }: { item: ClientItem; index: number }) {
  return (
    <a
      href={tvHref(`/movies/${item.id}`)}
      data-focusable=""
      data-featured={index}
      {...(index === 0 ? { 'data-initial': '' } : {})}
      aria-label={`${item.title}, ${meta(item)}`}
      className="relative block h-[40.5cqw] overflow-hidden rounded-[1.4cqw] bg-s2 outline-none transition-lift focus-visible:scale-[1.015] focus-visible:shadow-(--tv-focus-shadow)"
    >
      <img src={item.art.backdrop} alt="" className="absolute inset-0 h-full w-full object-cover" />
      <div className="absolute inset-0 bg-[linear-gradient(90deg,rgb(0_0_0/0.7),transparent_55%),linear-gradient(0deg,rgb(0_0_0/0.6),transparent_45%)]" />
      <div className="absolute bottom-[2.8cqw] left-[2.8cqw] grid max-w-[34cqw] gap-[0.8cqw]">
        {/* the title's logo in place of its name, as the streaming apps set it; the name when TMDB
        has no logo */}
        <h2 className="font-semibold text-(length:--tv-text-hero-title) leading-[0.95] tracking-display">
          {item.art.logo ? (
            <img
              src={item.art.logo}
              alt={item.title}
              className="max-h-[7cqw] max-w-[26cqw] object-contain object-left drop-shadow-[0_0.2cqw_0.8cqw_rgb(0_0_0/0.5)]"
            />
          ) : (
            item.title
          )}
        </h2>
        <p className="flex items-center gap-[1cqw] text-(length:--tv-text-meta) text-text-2">
          {meta(item)}
          {qualityTags(item).map((q) => (
            <QualityTag key={q} overlay className="text-(length:--tv-text-quality)">
              {q}
            </QualityTag>
          ))}
        </p>
        <p className="line-clamp-2 text-(length:--tv-text-synopsis) text-text-2 leading-[1.45]">
          {item.tagline ?? item.synopsis}
        </p>
      </div>
    </a>
  )
}

/**
 * The featured titles as a row of large cards, the first whole and the next showing at the right
 * edge so there's more to see; it keeps focus in the first slot, as the rows do.
 */
function Featured({ section }: { section: HomeSection }) {
  return (
    <section
      data-group="hero"
      data-go-up="nav"
      aria-label={section.title}
      className="grid grid-cols-1"
    >
      <div className="grid grid-cols-1">
        <ul
          data-scroll="x"
          data-keep="start"
          className="flex w-max gap-[2cqw] px-(--tv-safe-x) py-[1cqw] transition-lift"
        >
          {section.items.map((m, i) => (
            <li key={m.id} className="w-[72cqw] shrink-0">
              <FeaturedCard item={m} index={i} />
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

/**
 * The featured cards' bloom, in each card's most vibrant colour: still on the screen while the
 * rail pushes the page, and handed to the rail, which paints it over its background too. It fades
 * out once the page lifts to the rows.
 */
function Bloom({ items, active, shown }: { items: ClientItem[]; active: number; shown: boolean }) {
  const host = useContext(RailContext)
  const found = useVibrant(items.map((m) => m.art.backdrop))
  const colors = items.map((m) => found[m.art.backdrop] ?? null)
  const key = colors.join()
  const bloom = useMemo(
    () => ({ colors: key.split(',').map((c) => c || null), active, shown }),
    [key, active, shown],
  )
  const setBloom = host?.setBloom
  useEffect(() => {
    setBloom?.(bloom)
  }, [setBloom, bloom])
  useEffect(() => () => setBloom?.(null), [setBloom])
  return (
    <div aria-hidden className={`pointer-events-none absolute inset-0 ${backdropReach}`}>
      <BloomGlow bloom={bloom} />
    </div>
  )
}

/** Which featured card focus is on, or was last on. */
function useActiveFeatured() {
  const [active, setActive] = useState(0)
  useEffect(() => {
    const onFocus = (e: FocusEvent) => {
      const card = (e.target as HTMLElement).closest<HTMLElement>('[data-featured]')
      if (card) setActive(Number(card.dataset.featured))
    }
    document.addEventListener('focusin', onFocus)
    return () => document.removeEventListener('focusin', onFocus)
  }, [])
  return active
}

function Row({ section, goUp }: { section: HomeSection; goUp?: string }) {
  // every card on Home is 16:9; Continue watching's resume, the rest open the movie
  const resume = section.layout === 'continue'
  return (
    <TvRow group={section.id} title={section.title} suffix={section.suffix} goUp={goUp}>
      {section.items.map((m) => (
        <li key={m.id} className="w-[17cqw] shrink-0">
          <TvPoster
            item={m}
            wide
            resume={resume}
            href={tvHref(resume ? `/play/${m.id}` : `/movies/${m.id}`)}
          />
        </li>
      ))}
    </TvRow>
  )
}

/**
 * The page moves as one: while focus is on the hero or the featured row it rests at the top; on
 * any row below, it lifts so that row's title sits at the safe area's top, with the next row under
 * it, and the hero goes out of view.
 */
function usePageOffset(clear: number) {
  const page = useRef<HTMLDivElement>(null)
  const reduced = useReducedMotion()
  const [offset, setOffset] = useState(0)
  useEffect(() => {
    const el = page.current
    const reveal = (target: EventTarget | null) => {
      const row = (target as HTMLElement | null)?.closest<HTMLElement>('[data-row]')
      if (!el?.parentElement) return
      if (!row || row.dataset.row === '0') return setOffset(0)
      // layout positions: both boxes carry the same transform
      const top = row.getBoundingClientRect().top - el.getBoundingClientRect().top
      const safe = (el.clientWidth / 100) * clear
      const max = el.scrollHeight - el.parentElement.clientHeight
      setOffset(Math.max(0, Math.min(top - safe, max)))
    }
    const onFocus = (e: FocusEvent) => reveal(e.target)
    // a curation preview (A11) asks for the section being edited, without moving focus
    const onReveal = (e: Event) => reveal((e as CustomEvent<HTMLElement>).detail)
    el?.addEventListener('focusin', onFocus)
    window.addEventListener('highsea:reveal', onReveal)
    return () => {
      el?.removeEventListener('focusin', onFocus)
      window.removeEventListener('highsea:reveal', onReveal)
    }
  }, [clear])
  const style = { transform: `translateY(${-offset}px)`, transition: reduced ? 'none' : undefined }
  return { page, style, lifted: offset > 0 }
}

function Home({ sections }: { sections: HomeSection[] }) {
  const hero = sections.find((s) => s.layout === 'hero')
  const rows = sections.filter((s) => s !== hero)
  const { page, style, lifted } = usePageOffset(pageTop(useTvNav()))
  const active = useActiveFeatured()
  useInitialFocus(true)
  return (
    <>
      <GlobalNav lifted={lifted} />
      {/* lifted, the row above fades out under the top edge rather than being cut */}
      <div
        className={`absolute inset-0 overflow-hidden ${lifted ? '[mask-image:linear-gradient(transparent,black_3.2cqw)]' : ''}`}
      >
        {hero && <Bloom items={hero.items} active={active} shown={!lifted} />}
        <div ref={page} style={style} className="relative transition-lift">
          <ServerIdentity />
          <div
            data-rows=""
            className="relative grid grid-cols-1 gap-[1.6cqw] pt-[calc(6cqw-var(--tv-head,0px))] pb-(--tv-safe-y)"
          >
            <AnnouncementBanner />
            {hero && (
              <div data-row={0} data-section={hero.id} className="grid grid-cols-1">
                <Featured section={hero} />
              </div>
            )}
            {rows.map((s, i) => (
              <div key={s.id} data-row={i + 1} data-section={s.id} className="grid grid-cols-1">
                <Row section={s} goUp={i === 0 && hero ? 'hero' : undefined} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  )
}

function AcknowledgeScreen() {
  const a = useAnnouncements('tv')
  const m = a.modal
  useInitialFocus(!!m, m?.id)
  if (!m) return null
  return (
    <main className="grid h-full place-items-center bg-bg">
      <div className="grid max-w-[44cqw] gap-[1.4cqw] overflow-hidden rounded-[1cqw] bg-s1 p-[2.4cqw]">
        {m.image && (
          // the TV can't follow a link, so a call to action stays on the other apps
          <img
            src={m.image}
            alt=""
            className="-mx-[2.4cqw] -mt-[2.4cqw] mb-[0.4cqw] aspect-[21/9] w-[calc(100%+4.8cqw)] max-w-none object-cover"
          />
        )}
        <p className="flex items-center gap-[0.6cqw] font-semibold text-(length:--tv-text-eyebrow) text-accent-text uppercase tracking-eyebrow">
          <Icon name="announcement" size={24} className="size-[1.1cqw]" />
          From the server’s owner
        </p>
        <h1 className="font-semibold text-[2.4cqw] leading-[1.15]">{m.title}</h1>
        <p className="text-(length:--tv-text-synopsis) text-text-2 leading-[1.45]">
          <Inline text={m.body} />
        </p>
        <div data-group="ack" className="flex">
          <TvButton primary initial onClick={() => a.dismiss(m.id)}>
            Got it
          </TvButton>
        </div>
      </div>
    </main>
  )
}

export function TvHome() {
  const home = useHome('tv')
  const a = useAnnouncements('tv')
  if (a.modal) return <AcknowledgeScreen />
  if (home.status === 'loading')
    return (
      <main aria-busy className="grid h-full place-items-center">
        <Icon name="loading" size={48} className="size-[3cqw] animate-spin text-text-3" />
      </main>
    )
  if (home.status === 'error')
    return (
      <TvMessage
        title="Couldn’t load the home screen"
        actions={
          <TvButton primary initial onClick={home.refetch}>
            Try again
          </TvButton>
        }
      >
        {home.error.message}
      </TvMessage>
    )
  if (home.data.length === 0)
    return (
      <>
        <ServerIdentity />
        <TvMessage
          title="Nothing to watch yet"
          actions={
            <TvButton initial icon="library" href={tvHref('/library')}>
              Library
            </TvButton>
          }
        >
          When the server’s owner adds movies, they show up here.
        </TvMessage>
      </>
    )
  return <Home sections={home.data} />
}
