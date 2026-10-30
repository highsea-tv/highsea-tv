// SPDX-License-Identifier: AGPL-3.0-only
// C2 Home, web/desktop (docs/product/client-home.md), brought over from the TV (the owner,
// 2026-10-30): the featured title as one large card with a bloom in its colour behind the bar and
// the card, then Continue watching, and every other row with its first slot fixed (film-row.tsx).
import { Button, CarouselRow, cn, EmptyState, Icon, QualityTag, Skeleton } from '@highsea-tv/ui-web'
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import { BloomGlow } from '../client/bloom.tsx'
import { meta, qualityTags, useHome } from '../client/data.ts'
import { MediaPoster } from '../client/media-card.tsx'
import { useVibrant } from '../client/vibrant.ts'
import type { ClientItem, HomeSection } from '../mock/types.ts'
import { WebFilmRow } from './film-row.tsx'
import { gutter, webHref } from './shell.tsx'

// ---------------------------------------------------------------- shared pieces

function Meta({ item }: { item: ClientItem }) {
  return (
    <>
      <span>{meta(item)}</span>
      {qualityTags(item).map((q) => (
        <QualityTag key={q} overlay>
          {q}
        </QualityTag>
      ))}
    </>
  )
}

/** 16:9 cards on Home: Continue watching's width, so every row lines up. */
const cardWidth = 'w-[clamp(15rem,24vw,21rem)]'

/**
 * Posters, with Play over the art on hover and focus; `wide` makes them 16:9 stills, as on Home
 * and More like this. No progress bar: only Continue watching has one (client/media-card.tsx).
 */
export function PosterRow({
  title,
  suffix,
  items,
  wide = false,
}: {
  title: string
  suffix?: string | null
  items: ClientItem[]
  wide?: boolean
}) {
  return (
    <CarouselRow title={title} suffix={suffix} itemClassName={wide ? cardWidth : undefined}>
      {items.map((m) => (
        <MediaPoster
          key={m.id}
          item={m}
          wide={wide}
          titleSize="body"
          href={webHref(`/movies/${m.id}`)}
          quality={qualityTags(m).slice(0, 1)}
          actions={
            <a
              href={webHref(`/play/${m.id}`)}
              aria-label={`Play ${m.title}`}
              className="glass-badge grid size-9 place-items-center rounded-full text-text outline-none focus-visible:ring-focus"
            >
              <Icon name="play" size={16} />
            </a>
          }
        />
      ))}
    </CarouselRow>
  )
}

/** Continue watching: stills that resume where you left off. */
function ContinueRow({ section }: { section: HomeSection }) {
  return (
    <CarouselRow title={section.title} itemClassName={cardWidth}>
      {section.items.map((m) => (
        <MediaPoster key={m.id} item={m} resume href={webHref(`/play/${m.id}`)} titleSize="body" />
      ))}
    </CarouselRow>
  )
}

function Rows({ sections }: { sections: HomeSection[] }) {
  return (
    <div className="mx-auto w-full grid max-w-[1680px] gap-8 pb-16">
      {sections.map((s) =>
        s.layout === 'hero' ? null : (
          // data-section: a curation preview scrolls to the section being edited
          <div key={s.id} data-section={s.id} className="grid">
            {s.layout === 'continue' ? (
              <ContinueRow section={s} />
            ) : (
              <WebFilmRow
                title={s.title}
                suffix={s.suffix}
                items={s.items}
                hrefOf={(m) => webHref(`/movies/${m.id}`)}
                loop
              />
            )}
          </div>
        ),
      )}
    </div>
  )
}

function HomeStates({ children }: { children: (sections: HomeSection[]) => ReactNode }) {
  const home = useHome('web')
  if (home.status === 'loading')
    return (
      <div aria-busy className={cn('mx-auto w-full grid max-w-[1680px] gap-8 pt-24', gutter)}>
        <Skeleton className="h-[40vh] rounded-lg" />
        <div className="flex gap-4 overflow-hidden">
          {[0, 1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} className={cn('aspect-still shrink-0 rounded-poster', cardWidth)} />
          ))}
        </div>
      </div>
    )
  if (home.status === 'error')
    return (
      <main
        className={cn('mx-auto w-full grid min-h-[60vh] max-w-[1680px] place-items-center', gutter)}
      >
        <EmptyState
          tone="error"
          icon="alert"
          title="Couldn’t load the home screen"
          action={<Button onClick={home.refetch}>Try again</Button>}
        >
          {home.error.message}
        </EmptyState>
      </main>
    )
  if (home.data.length === 0)
    return (
      <main
        className={cn('mx-auto w-full grid min-h-[60vh] max-w-[1680px] place-items-center', gutter)}
      >
        <EmptyState icon="movie" title="Nothing to watch yet">
          When the server’s owner adds movies, they show up here.
        </EmptyState>
      </main>
    )
  return <>{children(home.data)}</>
}

// ---------------------------------------------------------------- the featured card and rows

/**
 * The featured title as one large card inside the page's gutters, as on the TV (the owner,
 * 2026-10-30): its backdrop, with the title's logo, the details and the tagline low on the left.
 * The card opens the movie, where Play is.
 */
function FeaturedCard({ item }: { item: ClientItem }) {
  return (
    <a
      href={webHref(`/movies/${item.id}`)}
      aria-label={`${item.title}, ${meta(item)}`}
      className="relative block h-[clamp(18rem,min(62svh,42vw),44rem)] overflow-hidden rounded-[1.25rem] bg-s2 outline-none transition-lift hover:scale-[1.01] focus-visible:ring-focus"
    >
      <img src={item.art.backdrop} alt="" className="absolute inset-0 h-full w-full object-cover" />
      <div className="absolute inset-0 bg-[linear-gradient(90deg,rgb(0_0_0/0.7),transparent_55%),linear-gradient(0deg,rgb(0_0_0/0.6),transparent_45%)]" />
      <div className="absolute inset-x-5 bottom-5 grid max-w-[38rem] gap-3 medium:inset-x-10 medium:bottom-9">
        {/* the title's logo in place of its name, as the streaming apps set it; the name when TMDB
        has no logo */}
        <h2 className="text-balance text-display">
          {item.art.logo ? (
            <img
              src={item.art.logo}
              alt={item.title}
              className="max-h-[clamp(4rem,9vw,8rem)] max-w-[min(26rem,70%)] object-contain object-left drop-shadow-[0_2px_10px_rgb(0_0_0/0.5)]"
            />
          ) : (
            item.title
          )}
        </h2>
        <p className="flex flex-wrap items-center gap-2 text-text-2 text-body">
          <Meta item={item} />
        </p>
        <p className="line-clamp-2 text-body text-text-2">{item.tagline ?? item.synopsis}</p>
      </div>
    </a>
  )
}

/**
 * The featured card's bloom, in its most vibrant colour, from the page's top to past the card. It
 * fades out once the card has mostly scrolled out of view.
 */
function Bloom({ item, shown }: { item: ClientItem; shown: boolean }) {
  const found = useVibrant([item.art.backdrop])
  const color = found[item.art.backdrop] ?? null
  const bloom = useMemo(() => ({ colors: [color], active: 0, shown }), [color, shown])
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-x-0 top-0 h-[calc(clamp(18rem,min(62svh,42vw),44rem)+24rem)] [mask-image:linear-gradient(black_55%,transparent)]"
    >
      <BloomGlow bloom={bloom} at="40% 50%" />
    </div>
  )
}

/** Whether most of the element is in view. */
function useMostlyInView() {
  const ref = useRef<HTMLDivElement>(null)
  const [inView, setInView] = useState(true)
  useEffect(() => {
    const el = ref.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(([e]) => setInView((e?.intersectionRatio ?? 1) >= 0.4), {
      threshold: [0, 0.4, 1],
    })
    io.observe(el)
    return () => io.disconnect()
  }, [])
  return { ref, inView }
}

function Home({ sections }: { sections: HomeSection[] }) {
  const hero = sections.find((s) => s.layout === 'hero')
  // the featured section's first title; the others wait until the card is designed again, as on
  // the TV (the owner, 2026-10-30)
  const item = hero?.items[0]
  const { ref, inView } = useMostlyInView()
  return (
    // not positioned: the bloom is placed from the page's top, behind the banner and the bar
    <main>
      {item && <Bloom item={item} shown={inView} />}
      <div className="relative grid gap-8">
        {hero && item && (
          <div
            ref={ref}
            data-section={hero.id}
            className={cn('mx-auto w-full max-w-[1680px] pt-2', gutter)}
          >
            <FeaturedCard item={item} />
          </div>
        )}
        <Rows sections={sections} />
      </div>
    </main>
  )
}

export function WebHome() {
  return <HomeStates>{(sections) => <Home sections={sections} />}</HomeStates>
}
