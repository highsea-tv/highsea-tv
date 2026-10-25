// SPDX-License-Identifier: AGPL-3.0-only
// C2 Home, mobile (docs/product/client-home.md#mobile): the locked Tabs + carousel layout. The
// header, the owner's announcement card, the featured carousel (78% wide cards with the next one
// peeking, never auto-advancing), then poster rows (about 30% wide, three and a peek).
import { Button, cn, EmptyState, Poster, Skeleton } from '@highsea-tv/ui-web'
import type { ReactNode } from 'react'
import { left, useHome } from '../client/data.ts'
import type { ClientItem, HomeSection } from '../mock/types.ts'
import { PullToRefresh } from './pull.tsx'
import { AnnouncementCard, gutter, Header, mobileHref } from './shell.tsx'

/** A row that scrolls edge to edge, its first item on the gutter. */
export function MobileRow({
  title,
  suffix,
  section,
  children,
}: {
  title: string
  suffix?: string | null
  /** A home section's id, so a curation preview can scroll to it. */
  section?: string
  children: ReactNode
}) {
  return (
    <section aria-label={title} data-section={section} className="grid gap-2.5">
      <h2 className={cn('font-semibold text-[17px]', gutter)}>
        {title}
        {suffix && <span className="font-normal text-text-2"> {suffix}</span>}
      </h2>
      <ul
        // biome-ignore lint/a11y/noNoninteractiveTabindex: a scrolling region must take focus to scroll by keyboard
        tabIndex={0}
        aria-label={title}
        className="flex snap-x snap-mandatory scroll-px-4 gap-2 overflow-x-auto px-4 outline-none [scrollbar-width:none] focus-visible:focus-ring-inset [&::-webkit-scrollbar]:hidden"
      >
        {children}
      </ul>
    </section>
  )
}

export function PosterItems({ items }: { items: ClientItem[] }) {
  return (
    <>
      {items.map((m) => (
        <li key={m.id} className="w-[30%] shrink-0 snap-start">
          <Poster
            title={m.title}
            src={m.art.poster}
            href={mobileHref(`/movies/${m.id}`)}
            progress={m.progress !== null ? m.progress * 100 : undefined}
          />
        </li>
      ))}
    </>
  )
}

function Featured({ section }: { section: HomeSection }) {
  return (
    <section aria-label={section.title} className="min-w-0">
      <ul
        // biome-ignore lint/a11y/noNoninteractiveTabindex: a scrolling region must take focus to scroll by keyboard
        tabIndex={0}
        aria-label={section.title}
        className="flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 outline-none [scrollbar-width:none] focus-visible:focus-ring-inset [&::-webkit-scrollbar]:hidden"
      >
        {section.items.map((m, i) => (
          <li key={m.id} className="w-[78%] shrink-0 snap-start">
            <a
              href={mobileHref(`/movies/${m.id}`)}
              className="relative isolate grid aspect-[4/5] content-end overflow-hidden rounded-lg outline-none transition-press focus-visible:ring-focus active:scale-97"
            >
              <img
                src={m.art.poster}
                alt=""
                className="-z-10 absolute inset-0 size-full object-cover"
              />
              <span className="-z-10 absolute inset-0 bg-[linear-gradient(0deg,var(--color-bg)_2%,transparent_55%)]" />
              <span className="grid gap-1 p-4">
                <span className="font-semibold text-[11px] text-accent-text uppercase tracking-eyebrow">
                  {i === 0 ? 'New · ' : ''}
                  {m.year} · {m.genres[0]}
                </span>
                <span className="font-semibold text-[24px] leading-[1.15] tracking-display">
                  {m.title}
                </span>
              </span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  )
}

export function MobileHome() {
  const home = useHome('mobile')
  return (
    <PullToRefresh onRefresh={home.refetch}>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 pt-1">
        <Header />
        <AnnouncementCard />
        {home.status === 'loading' ? (
          <div aria-busy className="grid gap-6">
            <div className="flex gap-3 overflow-hidden px-4">
              <Skeleton className="aspect-[4/5] w-[78%] shrink-0 rounded-lg" />
              <Skeleton className="aspect-[4/5] w-[78%] shrink-0 rounded-lg" />
            </div>
            <div className="flex gap-2 overflow-hidden px-4">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="aspect-poster w-[30%] shrink-0 rounded-poster" />
              ))}
            </div>
          </div>
        ) : home.status === 'error' ? (
          <div className={gutter}>
            <EmptyState
              tone="error"
              icon="alert"
              title="Couldn’t load the home screen"
              action={<Button onClick={home.refetch}>Try again</Button>}
            >
              {home.error.message}
            </EmptyState>
          </div>
        ) : home.data.length === 0 ? (
          <div className={gutter}>
            <EmptyState icon="movie" title="Nothing to watch yet">
              When the server’s owner adds movies, they show up here.
            </EmptyState>
          </div>
        ) : (
          home.data.map((s) =>
            s.layout === 'hero' ? (
              <div key={s.id} data-section={s.id} className="grid">
                <Featured section={s} />
              </div>
            ) : s.layout === 'continue' ? (
              <MobileRow key={s.id} title={s.title} section={s.id}>
                {s.items.map((m) => (
                  <li key={m.id} className="w-[62%] shrink-0 snap-start">
                    <Poster
                      title={m.title}
                      src={m.art.still}
                      aspect="still"
                      href={mobileHref(`/play/${m.id}`)}
                      progress={(m.progress ?? 0) * 100}
                      showTitle
                      caption={left(m)}
                    />
                  </li>
                ))}
              </MobileRow>
            ) : (
              // spotlights read as rows on a phone: there's no room for a synopsis beside the art
              <MobileRow key={s.id} title={s.title} suffix={s.suffix} section={s.id}>
                <PosterItems items={s.items} />
              </MobileRow>
            ),
          )
        )}
      </div>
    </PullToRefresh>
  )
}
