// SPDX-License-Identifier: AGPL-3.0-only
// C2 Home, web/desktop (docs/product/client-home.md): a full-bleed hero, the TV's Hero + rows
// adapted for a pointer (desktop-web.md#structure; chosen over a contained hero in ADR 0017),
// then Continue watching, curated rows, spotlights and Recently added.
import {
  BackdropHero,
  Button,
  CarouselRow,
  cn,
  EmptyState,
  Icon,
  Poster,
  QualityTag,
  Skeleton,
} from '@highsea-tv/ui-web'
import { type ReactNode, useState } from 'react'
import { left, meta, qualityTags, useHome } from '../client/data.ts'
import type { ClientItem, HomeSection } from '../mock/types.ts'
import { Banners, gutter, webHref } from './shell.tsx'

// ---------------------------------------------------------------- shared pieces

function PlayButton({ item, className }: { item: ClientItem; className?: string }) {
  return (
    <Button variant="primary" icon="play" asChild className={className}>
      <a href={webHref(`/play/${item.id}`)}>{item.progress !== null ? 'Resume' : 'Play'}</a>
    </Button>
  )
}

function DetailsButton({ item }: { item: ClientItem }) {
  return (
    <Button icon="info" asChild>
      <a href={webHref(`/movies/${item.id}`)}>Details</a>
    </Button>
  )
}

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

/** Posters, with Play over the art on hover and focus. */
export function PosterRow({
  title,
  suffix,
  items,
}: {
  title: string
  suffix?: string | null
  items: ClientItem[]
}) {
  return (
    <CarouselRow title={title} suffix={suffix}>
      {items.map((m) => (
        <Poster
          key={m.id}
          title={m.title}
          src={m.art.poster}
          href={webHref(`/movies/${m.id}`)}
          quality={qualityTags(m).slice(0, 1)}
          progress={m.progress !== null ? m.progress * 100 : undefined}
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
    <CarouselRow title={section.title} itemClassName="w-[clamp(15rem,24vw,21rem)]">
      {section.items.map((m) => (
        <Poster
          key={m.id}
          title={m.title}
          src={m.art.still}
          aspect="still"
          href={webHref(`/play/${m.id}`)}
          progress={(m.progress ?? 0) * 100}
          showTitle
          caption={left(m)}
        />
      ))}
    </CarouselRow>
  )
}

/** A spotlight: wider cards with the synopsis, for a curated theme. */
function SpotlightRow({ section }: { section: HomeSection }) {
  return (
    <CarouselRow
      title={section.title}
      suffix={section.suffix}
      itemClassName="w-[clamp(17rem,30vw,26rem)]"
    >
      {section.items.map((m) => (
        <a
          key={m.id}
          href={webHref(`/movies/${m.id}`)}
          className="group/spot grid gap-3 rounded-lg border border-line bg-s1 p-3 outline-none transition-tint hover:bg-s2 focus-visible:ring-focus"
        >
          <img
            src={m.art.still}
            alt=""
            loading="lazy"
            className="aspect-still w-full rounded-md object-cover"
          />
          <span className="grid gap-1">
            <span className="font-semibold text-text text-title">{m.title}</span>
            <span className="text-caption text-text-3">{meta(m)}</span>
            <span className="line-clamp-2 text-body text-text-2">{m.synopsis}</span>
          </span>
        </a>
      ))}
    </CarouselRow>
  )
}

function Rows({ sections }: { sections: HomeSection[] }) {
  return (
    <div className="mx-auto grid max-w-[1680px] gap-8 pb-16">
      {sections.map((s) =>
        s.layout === 'hero' ? null : (
          // data-section: a curation preview scrolls to the section being edited
          <div key={s.id} data-section={s.id} className="grid">
            {s.layout === 'continue' ? (
              <ContinueRow section={s} />
            ) : s.layout === 'spotlight' ? (
              <SpotlightRow section={s} />
            ) : (
              <PosterRow title={s.title} suffix={s.suffix} items={s.items} />
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
      <div aria-busy className={cn('mx-auto grid max-w-[1680px] gap-8 pt-24', gutter)}>
        <Skeleton className="h-[40vh] rounded-lg" />
        <div className="flex gap-4 overflow-hidden">
          {[0, 1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} className="aspect-poster w-40 shrink-0 rounded-poster" />
          ))}
        </div>
      </div>
    )
  if (home.status === 'error')
    return (
      <main className={cn('mx-auto grid min-h-[60vh] max-w-[1680px] place-items-center', gutter)}>
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
      <main className={cn('mx-auto grid min-h-[60vh] max-w-[1680px] place-items-center', gutter)}>
        <EmptyState icon="movie" title="Nothing to watch yet">
          When the server’s owner adds movies, they show up here.
        </EmptyState>
      </main>
    )
  return <>{children(home.data)}</>
}

// ---------------------------------------------------------------- the hero and rows

function FullBleed({ sections }: { sections: HomeSection[] }) {
  const hero = sections.find((s) => s.layout === 'hero')
  const [index, setIndex] = useState(0)
  const item = hero?.items[index] ?? hero?.items[0]
  return (
    <main>
      {hero && item && (
        <div data-section={hero.id} className="medium:-mt-16">
          <BackdropHero
            item={{
              id: item.id,
              title: item.title,
              backdrop: item.art.backdrop,
              eyebrow: hero.title,
              meta: <Meta item={item} />,
              synopsis: item.tagline ?? item.synopsis,
            }}
            actions={
              <>
                <PlayButton item={item} />
                <DetailsButton item={item} />
                {hero.items.length > 1 && (
                  // on desktop the hero changes only on selection, never on hover
                  <div className="ms-auto flex items-center gap-1.5 self-center">
                    {hero.items.map((h, i) => (
                      <button
                        key={h.id}
                        type="button"
                        aria-label={`Show ${h.title}`}
                        aria-pressed={i === index}
                        onClick={() => setIndex(i)}
                        className="grid size-6 cursor-pointer place-items-center rounded-full outline-none focus-visible:ring-focus"
                      >
                        <span
                          className={cn(
                            'h-1.5 rounded-full transition-tint',
                            i === index ? 'w-5 bg-text' : 'w-1.5 bg-text/40',
                          )}
                        />
                      </button>
                    ))}
                  </div>
                )}
              </>
            }
            className="medium:h-[min(58svh,56.25vw)] [&>div:last-child]:mx-auto [&>div:last-child]:max-w-[1680px]"
          />
        </div>
      )}
      <div className="grid gap-8 pt-2">
        <Banners />
        <Rows sections={sections} />
      </div>
    </main>
  )
}

export function WebHome() {
  return <HomeStates>{(sections) => <FullBleed sections={sections} />}</HomeStates>
}
