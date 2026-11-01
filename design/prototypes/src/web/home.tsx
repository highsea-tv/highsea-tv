// SPDX-License-Identifier: AGPL-3.0-only
// C2 Home, web/desktop (docs/product/client-home.md), brought over from the TV (the owner,
// 2026-10-30): the featured title as one large card with a bloom in its colour behind the bar and
// the card, then Continue watching, and every other row with its first slot fixed (film-row.tsx).
import {
  Button,
  CarouselRow,
  cn,
  EmptyState,
  Icon,
  Menu,
  MenuContent,
  MenuItem,
  MenuTrigger,
  Poster,
  QualityTag,
  Skeleton,
  SkeletonText,
} from '@highsea-tv/ui-web'
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation } from 'wouter'
import { BloomGlow } from '../client/bloom.tsx'
import { useContinueMenu } from '../client/continue-menu.ts'
import { isFilmSection, meta, qualityTags, useHome } from '../client/data.ts'
import { MediaPoster, MediaPosterSkeleton } from '../client/media-card.tsx'
import { ShowPoster } from '../client/show-card.tsx'
import { useVibrant } from '../client/vibrant.ts'
import type { ClientItem, FilmSection, HomeSection } from '../mock/types.ts'
import { WebFilmRow, WebFilmRowSkeleton } from './film-row.tsx'
import { ArtistCard } from './music.tsx'
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

/** ⋯ on a Continue watching card: go to the title, mark it watched, or take it off the row. */
function ContinueMenu({ item }: { item: ClientItem }) {
  const menu = useContinueMenu(item)
  const [, navigate] = useLocation()
  return (
    <Menu>
      <MenuTrigger asChild>
        <button
          type="button"
          aria-label={`More for ${item.show?.title ?? item.title}`}
          className="glass-badge grid size-9 cursor-pointer place-items-center rounded-full text-text outline-none focus-visible:ring-focus"
        >
          <Icon name="more" size={16} />
        </button>
      </MenuTrigger>
      <MenuContent align="end" className="w-72">
        <MenuItem icon={item.show ? 'series' : 'movie'} onSelect={() => navigate(menu.goTo.path)}>
          {menu.goTo.label}
        </MenuItem>
        <MenuItem icon="check" onSelect={menu.markWatched}>
          Mark as watched
        </MenuItem>
        <MenuItem icon="remove" onSelect={menu.remove}>
          Remove from Continue watching
        </MenuItem>
      </MenuContent>
    </Menu>
  )
}

/**
 * Continue watching: stills that resume where you left off. Next up and New episodes are stills
 * too, of the episode each plays, without the progress bar.
 */
function StillRow({ section, resume }: { section: FilmSection; resume: boolean }) {
  return (
    <CarouselRow title={section.title} suffix={section.suffix} itemClassName={cardWidth}>
      {section.items.map((m) => (
        <MediaPoster
          key={m.id}
          item={m}
          wide
          resume={resume}
          href={webHref(`/play/${m.id}`)}
          titleSize="body"
          actions={resume ? <ContinueMenu item={m} /> : undefined}
        />
      ))}
    </CarouselRow>
  )
}

/** A row of shows or of music: posters with the unwatched count, or square covers and artists. */
function Row({ section: s }: { section: HomeSection }) {
  if (s.layout === 'shows')
    return (
      <CarouselRow title={s.title} suffix={s.suffix}>
        {s.items.map((x) => (
          <ShowPoster key={x.id} show={x} titleSize="body" href={webHref(`/shows/${x.id}`)} />
        ))}
      </CarouselRow>
    )
  if (s.layout === 'music')
    return (
      <CarouselRow title={s.title} suffix={s.suffix}>
        {s.items.map((x) =>
          x.kind === 'artist' ? (
            <ArtistCard key={x.artist.id} artist={x.artist} />
          ) : (
            <Poster
              key={x.album.id}
              aspect="square"
              title={x.album.title}
              src={x.album.cover}
              href={webHref(`/music/albums/${x.album.id}`)}
              showTitle
              titleSize="body"
              caption={x.album.artist.name}
            />
          ),
        )}
      </CarouselRow>
    )
  if (s.layout === 'continue' || s.layout === 'episodes')
    return <StillRow section={s} resume={s.layout === 'continue'} />
  return (
    <WebFilmRow
      title={s.title}
      suffix={s.suffix}
      items={s.items}
      hrefOf={(m) => webHref(`/movies/${m.id}`)}
      loop
    />
  )
}

function Rows({ sections }: { sections: HomeSection[] }) {
  return (
    <div className="mx-auto w-full grid max-w-[1680px] gap-20 pb-16">
      {sections.map((s) =>
        s.layout === 'hero' ? null : (
          // data-section: a curation preview scrolls to the section being edited
          <div key={s.id} data-section={s.id} className="grid">
            <Row section={s} />
          </div>
        ),
      )}
    </div>
  )
}

/**
 * Home while it loads, laid out as it will be: the featured card at its size, with its logo, meta
 * and tagline at the bottom left; Continue watching's stills; then two film rows.
 */
function HomeSkeleton() {
  return (
    <main aria-busy className="overflow-x-clip">
      <div className="grid gap-20 pb-16">
        <div className={cn('mx-auto w-full max-w-[1680px]', gutter)}>
          <div className="relative h-[clamp(18rem,min(62svh,42vw),44rem)] overflow-hidden rounded-[1.25rem] bg-s1">
            <div className="absolute inset-x-5 bottom-5 grid max-w-[38rem] gap-3 medium:inset-x-10 medium:bottom-9">
              <Skeleton className="h-[clamp(3rem,6vw,5.5rem)] w-[min(22rem,70%)] rounded-md" />
              <Skeleton className="h-4 w-56" />
              <SkeletonText lines={2} className="max-w-[30rem]" />
            </div>
          </div>
        </div>
        <div className="mx-auto grid w-full max-w-[1680px] gap-20">
          <section
            aria-hidden
            className="grid gap-3 [--row-gutter:1rem] medium:[--row-gutter:2rem] wide:[--row-gutter:4rem]"
          >
            <div className="px-(--row-gutter)">
              <Skeleton className="h-6 w-52" />
            </div>
            <div className="flex gap-3 overflow-hidden px-(--row-gutter) py-3">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <MediaPosterSkeleton key={i} resume className={cn('shrink-0', cardWidth)} />
              ))}
            </div>
          </section>
          <WebFilmRowSkeleton />
          <WebFilmRowSkeleton />
        </div>
      </div>
    </main>
  )
}

function HomeStates({ children }: { children: (sections: HomeSection[]) => ReactNode }) {
  const home = useHome('web')
  if (home.status === 'loading') return <HomeSkeleton />
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
          When the server’s owner adds films, shows or music, they show up here.
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
  const hero = sections.find((s): s is FilmSection => isFilmSection(s) && s.layout === 'hero')
  // the featured section's first title; the others wait until the card is designed again, as on
  // the TV (the owner, 2026-10-30)
  const item = hero?.items[0]
  const { ref, inView } = useMostlyInView()
  return (
    // not positioned: the bloom is placed from the page's top, behind the bar;
    // clipped across, as the film rows reach into the page's margins
    <main className="overflow-x-clip">
      {item && <Bloom item={item} shown={inView} />}
      <div className="relative grid gap-20">
        {hero && item && (
          <div
            ref={ref}
            data-section={hero.id}
            className={cn('mx-auto w-full max-w-[1680px]', gutter)}
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
