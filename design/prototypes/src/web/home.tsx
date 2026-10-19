// SPDX-License-Identifier: AGPL-3.0-only
// C2 Home, web/desktop (docs/product/client-home.md). The web home is new design work, so the
// prototype builds two options for the owner to pick at checkpoint 3:
//   A. Full-bleed hero: the TV's Hero + rows, adapted for a pointer (desktop-web.md#structure).
//   B. Contained hero: a framed spotlight card with the other featured titles beside it.
// Both share the rows below: Continue watching, curated rows, spotlights and Recently added.
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
} from '@highsea/ui-web'
import { type ReactNode, useState } from 'react'
import { left, meta, qualityTags, useHome } from '../client/data.ts'
import type { ClientItem, HomeSection } from '../mock/types.ts'
import { useProto } from '../screen/screen.tsx'
import { Banners, gutter, webHref } from './shell.tsx'

export type HomeOption = 'a' | 'b'

const KEY = 'highsea-proto:web-home'

export function savedOption(): HomeOption {
  try {
    return localStorage.getItem(KEY) === 'b' ? 'b' : 'a'
  } catch {
    return 'a'
  }
}

function remember(option: HomeOption) {
  try {
    localStorage.setItem(KEY, option)
  } catch {
    // the switch still works for this visit
  }
}

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

/** The prototype's own switch between the two options: meta, not part of the design. */
function OptionSwitch({ option }: { option: HomeOption }) {
  const link = (o: HomeOption, label: string) => (
    <a
      href={webHref(`/home/${o}`)}
      onClick={() => remember(o)}
      aria-current={o === option ? 'page' : undefined}
      className="rounded-full px-2.5 py-1 outline-none aria-[current=page]:bg-text aria-[current=page]:text-bg focus-visible:ring-focus"
    >
      {label}
    </a>
  )
  return (
    <nav
      aria-label="Prototype: web home options"
      className="fixed right-4 bottom-4 z-40 flex items-center gap-1 rounded-full border border-line-strong bg-s2 p-1 font-mono text-[11px] text-text-2 shadow-3"
    >
      <span className="hidden px-2 uppercase medium:inline">Prototype</span>
      {link('a', 'A · Full-bleed')}
      {link('b', 'B · Contained')}
    </nav>
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

// ---------------------------------------------------------------- option A

function OptionA({ sections }: { sections: HomeSection[] }) {
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

// ---------------------------------------------------------------- option B

function OptionB({ sections }: { sections: HomeSection[] }) {
  const hero = sections.find((s) => s.layout === 'hero')
  const [index, setIndex] = useState(0)
  const item = hero?.items[index] ?? hero?.items[0]
  return (
    <main className="grid gap-8 pt-4">
      <Banners />
      {hero && item && (
        <section
          aria-label={hero.title}
          data-section={hero.id}
          className={cn(
            'mx-auto grid w-full max-w-[1680px] gap-4 expanded:grid-cols-[minmax(0,1fr)_20rem]',
            gutter,
          )}
        >
          <div className="relative isolate flex min-h-[22rem] items-end overflow-hidden rounded-xl border border-line bg-s1 expanded:aspect-[21/9] expanded:min-h-0">
            <img
              src={item.art.backdrop}
              alt=""
              className="-z-10 absolute inset-0 size-full object-cover"
            />
            <div className="-z-10 absolute inset-0 bg-[linear-gradient(90deg,var(--color-bg)_4%,color-mix(in_srgb,var(--color-bg)_55%,transparent)_45%,transparent_75%)]" />
            <div className="grid max-w-[34rem] gap-3 p-6 medium:p-8">
              <p className="font-semibold text-[12px] text-accent-text uppercase tracking-eyebrow">
                {hero.title}
              </p>
              <h2 className="text-balance text-display">{item.title}</h2>
              <p className="flex flex-wrap items-center gap-2 text-text-2 text-ui">
                <Meta item={item} />
              </p>
              <p className="line-clamp-3 text-body text-text-2">{item.tagline ?? item.synopsis}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <PlayButton item={item} />
                <DetailsButton item={item} />
              </div>
            </div>
          </div>
          <div className="grid content-start gap-2">
            <h3 className="font-mono text-label text-text-3 uppercase">Also featured</h3>
            <ul className="grid gap-2 medium:grid-cols-3 expanded:grid-cols-1">
              {hero.items.map((h, i) => (
                <li key={h.id}>
                  <button
                    type="button"
                    aria-pressed={i === index}
                    onClick={() => setIndex(i)}
                    className="grid w-full cursor-pointer grid-cols-[6.5rem_minmax(0,1fr)] items-center gap-3 rounded-lg border border-transparent p-2 text-start outline-none transition-tint hover:bg-s1 focus-visible:ring-focus aria-pressed:border-line aria-pressed:bg-s1"
                  >
                    <img
                      src={h.art.still}
                      alt=""
                      className="aspect-still w-full rounded-sm object-cover"
                    />
                    <span className="grid min-w-0">
                      <span className="truncate font-semibold text-text text-ui">{h.title}</span>
                      <span className="truncate text-caption text-text-3">{meta(h)}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}
      <Rows sections={sections} />
    </main>
  )
}

export function WebHome({ option }: { option: HomeOption }) {
  const { preview } = useProto()
  return (
    <>
      <HomeStates>
        {(sections) =>
          option === 'a' ? <OptionA sections={sections} /> : <OptionB sections={sections} />
        }
      </HomeStates>
      {!preview && <OptionSwitch option={option} />}
    </>
  )
}
