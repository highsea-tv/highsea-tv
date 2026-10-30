// SPDX-License-Identifier: AGPL-3.0-only
// C2 Home, TV (docs/product/client-home.md#tv): the locked Hero + rows layout (tv.md#layout).
// The featured title leads as one large card across the page, the first of the featured section's
// for now (the owner, 2026-10-30); OK opens the movie. The rows follow, each but Continue watching
// with its first slot fixed (film-row.tsx): focus there lifts the page past the featured card, Up from the first row
// comes back to it, and Up from that opens the global navigation.
// Behind the featured card, a bloom in its most vibrant colour fills the screen and fades into the
// background (the owner, 2026-10-30).
// An announcement that must be acknowledged comes first, on its own.
import { Icon, QualityTag, Skeleton } from '@highsea-tv/ui-web'
import { useReducedMotion } from 'motion/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { BloomGlow } from '../client/bloom.tsx'
import { meta, qualityTags, useAnnouncements, useHome } from '../client/data.ts'
import { useVibrant } from '../client/vibrant.ts'
import { Inline } from '../kit/inline.tsx'
import type { ClientItem, HomeSection } from '../mock/types.ts'
import { TvFilmRow, TvFilmRowSkeleton } from './film-row.tsx'
import {
  AnnouncementBanner,
  pageTop,
  ServerIdentity,
  TvButton,
  TvHead,
  TvMessage,
  TvPoster,
  TvRow,
  TvRowSkeleton,
  tvHref,
  useInitialFocus,
  useRowNavigation,
} from './kit.tsx'

/**
 * The featured title as one large card across the page, which lifts only slightly on focus: at
 * this size the posters' zoom would push it off the screen: its backdrop, with the title's logo,
 * the details and the tagline low on the left. OK opens the movie, where Play is (the owner,
 * 2026-10-30).
 */
function FeaturedCard({ item }: { item: ClientItem }) {
  return (
    <a
      href={tvHref(`/movies/${item.id}`)}
      data-focusable=""
      data-initial=""
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
 * The featured section's first title, across the page. The others wait until the featured card is
 * designed again (the owner, 2026-10-30).
 */
function Featured({ section }: { section: HomeSection }) {
  const item = section.items[0]
  if (!item) return null
  return (
    <section
      data-group="hero"
      data-go-up="nav"
      aria-label={section.title}
      className="grid grid-cols-1 px-(--tv-safe-x) py-[1cqw]"
    >
      <FeaturedCard item={item} />
    </section>
  )
}

/**
 * The featured card's bloom, in its most vibrant colour, the screen's size. It fades out once the
 * page lifts to the rows.
 */
function Bloom({ items, active, shown }: { items: ClientItem[]; active: number; shown: boolean }) {
  const found = useVibrant(items.map((m) => m.art.backdrop))
  const colors = items.map((m) => found[m.art.backdrop] ?? null)
  const key = colors.join()
  const bloom = useMemo(
    () => ({ colors: key.split(',').map((c) => c || null), active, shown }),
    [key, active, shown],
  )
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      <BloomGlow bloom={bloom} />
    </div>
  )
}

function Row({ section, goUp }: { section: HomeSection; goUp?: string }) {
  // Continue watching keeps its row of 16:9 cards, larger now, each resuming (the owner,
  // 2026-10-30); the
  // other rows have their first slot fixed, loop (the owner, 2026-10-30), and open the movie
  if (section.layout === 'continue')
    return (
      <TvRow group={section.id} title={section.title} suffix={section.suffix} goUp={goUp}>
        {section.items.map((m) => (
          <li key={m.id} className="w-[22cqw] shrink-0">
            <TvPoster item={m} wide resume href={tvHref(`/play/${m.id}`)} />
          </li>
        ))}
      </TvRow>
    )
  return (
    <TvFilmRow
      group={section.id}
      title={section.title}
      suffix={section.suffix}
      goUp={goUp}
      items={section.items}
      hrefOf={(m) => tvHref(`/movies/${m.id}`)}
      loop
    />
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
  const { page, style, lifted } = usePageOffset(pageTop)
  const rowsRef = useRef<HTMLDivElement>(null)
  useInitialFocus(true)
  useRowNavigation(rowsRef)
  return (
    <div className="absolute inset-0 overflow-hidden">
      {hero && <Bloom items={hero.items.slice(0, 1)} active={0} shown={!lifted} />}
      <div ref={page} style={style} className="relative transition-lift">
        {/* the announcement across the very top, then the head, both scrolling away with the
          page (the owner, 2026-10-30) */}
        <AnnouncementBanner />
        <TvHead className="px-(--tv-safe-x)" />
        <div
          ref={rowsRef}
          data-rows=""
          className="relative grid grid-cols-1 gap-[1.6cqw] pt-[1.6cqw] pb-(--tv-safe-y)"
        >
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
  )
}

/**
 * Home while it loads, laid out as it will be: the head, the featured card at its size with its
 * logo, details and tagline low on the left, then Continue watching and a film row.
 */
function HomeSkeleton() {
  return (
    <main aria-busy className="absolute inset-0 overflow-hidden">
      <AnnouncementBanner />
      <TvHead className="px-(--tv-safe-x)" />
      <div className="grid grid-cols-1 gap-[1.6cqw] pt-[1.6cqw]">
        <div className="px-(--tv-safe-x) py-[1cqw]">
          <div className="relative h-[40.5cqw] overflow-hidden rounded-[1.4cqw] bg-s1">
            <div className="absolute bottom-[2.8cqw] left-[2.8cqw] grid w-[34cqw] gap-[0.8cqw]">
              <Skeleton className="h-[6cqw] w-[22cqw] rounded-[0.6cqw]" />
              <Skeleton className="my-[0.15cqw] h-[1.05cqw] w-[16cqw]" />
              <div className="grid gap-[0.6cqw] py-[0.2cqw]">
                <Skeleton className="h-[1.1cqw] w-full" />
                <Skeleton className="h-[1.1cqw] w-3/5" />
              </div>
            </div>
          </div>
        </div>
        <TvRowSkeleton width="w-[22cqw]" count={5} wide resume />
        <TvFilmRowSkeleton />
      </div>
    </main>
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
  if (home.status === 'loading') return <HomeSkeleton />
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
        <ServerIdentity className="absolute top-(--tv-safe-y) left-(--tv-safe-x)" />
        <TvMessage
          title="Nothing to watch yet"
          actions={
            <TvButton initial icon="movie" href={tvHref('/movies')}>
              Movies
            </TvButton>
          }
        >
          When the server’s owner adds movies, they show up here.
        </TvMessage>
      </>
    )
  return <Home sections={home.data} />
}
