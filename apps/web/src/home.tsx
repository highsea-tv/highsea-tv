// SPDX-License-Identifier: AGPL-3.0-only
// C2 Home on the web (docs/product/client-home.md), ported from design/prototypes/src/web/home.tsx:
// a full-bleed hero, then Continue watching, the owner's rows, spotlights and Recently added, in
// the person's order. Built-in rows have no title from the server; they're named here.
import type { ClientItem, HomeItem, HomeSection } from '@highsea-tv/api-contract'
import { useHome } from '@highsea-tv/client/data'
import { useT } from '@highsea-tv/i18n/react'
import {
  BackdropHero,
  Button,
  CarouselRow,
  cn,
  EmptyState,
  Icon,
  Poster,
  Skeleton,
} from '@highsea-tv/ui-web'
import { type ReactNode, useState } from 'react'
import { home as messages } from './messages.ts'
import { Banners, gutter, href, useFormat } from './shell.tsx'

type T = ReturnType<typeof useT<typeof messages>>

/** The server's title, or this app's name for a built-in row. */
const titleOf = (s: HomeSection, t: T) =>
  s.title ?? (s.id === 'continue' ? t('continue') : s.id === 'recent' ? t('recent') : '')

function PlayButton({ item }: { item: ClientItem }) {
  const t = useT(messages)
  return (
    <Button variant="primary" icon="play" asChild>
      <a href={href(`/play/${item.id}`)}>{item.progress !== null ? t('resume') : t('play')}</a>
    </Button>
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
  const t = useT(messages)
  return (
    <CarouselRow title={title} suffix={suffix}>
      {items.map((m) => (
        <Poster
          key={m.id}
          title={m.title}
          src={m.art.poster ?? undefined}
          href={href(`/movies/${m.id}`)}
          progress={m.progress !== null ? m.progress * 100 : undefined}
          actions={
            m.playable && (
              <a
                href={href(`/play/${m.id}`)}
                aria-label={t('playTitle', { title: m.title })}
                className="glass-badge grid size-9 place-items-center rounded-full text-text outline-none focus-visible:ring-focus"
              >
                <Icon name="play" size={16} />
              </a>
            )
          }
        />
      ))}
    </CarouselRow>
  )
}

/** Continue watching: stills that resume where you left off. */
function ContinueRow({ section, title }: { section: HomeSection; title: string }) {
  const f = useFormat()
  return (
    <CarouselRow title={title} itemClassName="w-[clamp(15rem,24vw,21rem)]">
      {section.items.map((m) => (
        <Poster
          key={m.id}
          title={m.title}
          src={m.art.backdrop ?? m.art.poster ?? undefined}
          aspect="still"
          href={href(`/play/${m.id}`)}
          progress={(m.progress ?? 0) * 100}
          showTitle
          caption={f.left(m)}
        />
      ))}
    </CarouselRow>
  )
}

/** A spotlight: wider cards with the synopsis, for a curated theme. */
function SpotlightRow({ section, title }: { section: HomeSection; title: string }) {
  const f = useFormat()
  return (
    <CarouselRow title={title} suffix={section.suffix} itemClassName="w-[clamp(17rem,30vw,26rem)]">
      {section.items.map((m) => (
        <a
          key={m.id}
          href={href(`/movies/${m.id}`)}
          className="group/spot grid gap-3 rounded-lg border border-line bg-s1 p-3 outline-none transition-tint hover:bg-s2 focus-visible:ring-focus"
        >
          {m.art.backdrop ? (
            <img
              src={m.art.backdrop}
              alt=""
              loading="lazy"
              className="aspect-still w-full rounded-md object-cover"
            />
          ) : (
            <span className="aspect-still w-full rounded-md bg-s2" />
          )}
          <span className="grid gap-1">
            <span className="font-semibold text-text text-title">{m.title}</span>
            <span className="text-caption text-text-3">{f.meta(m)}</span>
            <span className="line-clamp-2 text-body text-text-2">{m.tagline ?? m.synopsis}</span>
          </span>
        </a>
      ))}
    </CarouselRow>
  )
}

function Rows({ sections }: { sections: HomeSection[] }) {
  const t = useT(messages)
  return (
    <div className="mx-auto w-full grid max-w-[1680px] gap-8 pb-16">
      {sections.map((s) =>
        s.layout === 'hero' || s.items.length === 0 ? null : (
          <div key={s.id} data-section={s.id} className="grid">
            {s.layout === 'continue' ? (
              <ContinueRow section={s} title={titleOf(s, t)} />
            ) : s.layout === 'spotlight' ? (
              <SpotlightRow section={s} title={titleOf(s, t)} />
            ) : (
              <PosterRow title={titleOf(s, t)} suffix={s.suffix} items={s.items} />
            )}
          </div>
        ),
      )}
    </div>
  )
}

function HomeStates({ children }: { children: (sections: HomeSection[]) => ReactNode }) {
  const t = useT(messages)
  const home = useHome('web')
  if (home.status === 'loading')
    return (
      <div aria-busy className={cn('mx-auto w-full grid max-w-[1680px] gap-8 pt-24', gutter)}>
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
      <main
        className={cn('mx-auto w-full grid min-h-[60vh] max-w-[1680px] place-items-center', gutter)}
      >
        <EmptyState
          tone="error"
          icon="alert"
          title={t('failed')}
          action={<Button onClick={home.refetch}>{t('tryAgain')}</Button>}
        >
          {home.error.message}
        </EmptyState>
      </main>
    )
  if (home.data.every((s) => s.items.length === 0))
    return (
      <main
        className={cn('mx-auto w-full grid min-h-[60vh] max-w-[1680px] place-items-center', gutter)}
      >
        <EmptyState icon="movie" title={t('emptyTitle')}>
          {t('emptyBody')}
        </EmptyState>
      </main>
    )
  return <>{children(home.data)}</>
}

function Hero({
  hero,
  item,
  index,
  onShow,
}: {
  hero: HomeSection
  item: HomeItem
  index: number
  onShow: (i: number) => void
}) {
  const t = useT(messages)
  const f = useFormat()
  return (
    <div data-section={hero.id} className="medium:-mt-16">
      <BackdropHero
        item={{
          id: String(item.id),
          title: item.title,
          backdrop: item.art.backdrop ?? undefined,
          eyebrow: hero.title ?? undefined,
          meta: <span>{f.meta(item)}</span>,
          synopsis: item.tagline ?? item.synopsis,
        }}
        actions={
          <>
            {item.playable && <PlayButton item={item} />}
            <Button icon="info" asChild>
              <a href={href(`/movies/${item.id}`)}>{t('details')}</a>
            </Button>
            {hero.items.length > 1 && (
              // on desktop the hero changes only on selection, never on hover
              <div className="ms-auto flex items-center gap-1.5 self-center">
                {hero.items.map((h, i) => (
                  <button
                    key={h.id}
                    type="button"
                    aria-label={t('show', { title: h.title })}
                    aria-pressed={i === index}
                    onClick={() => onShow(i)}
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
        className="medium:h-[min(58svh,56.25vw)] [&>div:last-child]:mx-auto [&>div:last-child]:w-full [&>div:last-child]:max-w-[1680px]"
      />
    </div>
  )
}

function FullBleed({ sections }: { sections: HomeSection[] }) {
  const hero = sections.find((s) => s.layout === 'hero' && s.items.length > 0)
  const [index, setIndex] = useState(0)
  const item = hero?.items[index] ?? hero?.items[0]
  return (
    <main className={cn(!hero && 'pt-6')}>
      {hero && item && <Hero hero={hero} item={item} index={index} onShow={setIndex} />}
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
