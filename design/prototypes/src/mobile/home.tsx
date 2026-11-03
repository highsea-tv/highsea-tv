// SPDX-License-Identifier: AGPL-3.0-only
// C2 Home, mobile (docs/product/client-home.md#mobile): the locked Tabs + carousel layout. The
// header, the owner's announcement card, the featured carousel (78% wide cards with the next one
// peeking, never auto-advancing), then rows of 16:9 cards (Continue watching's at 62%, the rest
// at 46%, two and a peek), with the title under the art; only Continue watching has a watched
// bar, between the two.

import type { ClientItem, FilmSection, HomeMusic } from '@highsea-tv/mock/types'
import { Button, cn, EmptyState, Icon, Sheet, SheetContent, Skeleton } from '@highsea-tv/ui'
import { type ReactNode, useState } from 'react'
import { useLocation } from 'wouter'
import { useContinueMenu, useLongPress } from '../client/continue-menu.ts'
import { titlePath, useHome } from '../client/data.ts'
import { MediaPoster, MediaPosterSkeleton } from '../client/media-card.tsx'
import { homeMusicCard } from '../client/music.ts'
import { ShowPoster } from '../client/show-card.tsx'
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

/** Posters about 30% wide; `wide` makes them 16:9 stills, as on Home and More like this. */
export function PosterItems({ items, wide = false }: { items: ClientItem[]; wide?: boolean }) {
  return (
    <>
      {items.map((m) => (
        <li key={m.id} className={cn('shrink-0 snap-start', wide ? 'w-[46%]' : 'w-[30%]')}>
          <MediaPoster item={m} wide={wide} href={mobileHref(titlePath(m))} />
        </li>
      ))}
    </>
  )
}

function Featured({ section }: { section: FilmSection }) {
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
              href={mobileHref(titlePath(m))}
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

const sheetAction =
  'flex min-h-12 w-full cursor-pointer items-center gap-3 rounded-md px-3 text-start text-[16px] outline-none transition-press focus-visible:ring-focus active:bg-text/8'

/**
 * A Continue watching card: a tap resumes, a long press opens a sheet to go to the title, mark it
 * watched, or take it off the row (client-home.md › Continue watching).
 */
function ContinueCard({ item }: { item: ClientItem }) {
  const [open, setOpen] = useState(false)
  const [, navigate] = useLocation()
  const menu = useContinueMenu(item)
  const press = useLongPress(() => setOpen(true))
  const act = (run: () => unknown) => () => {
    setOpen(false)
    run()
  }
  return (
    <li className="w-[62%] shrink-0 snap-start" {...press}>
      <MediaPoster item={item} resume href={mobileHref(`/play/${item.id}`)} />
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          title={item.show?.title ?? item.title}
          description={item.show ? `${item.show.code} · ${item.show.episode}` : undefined}
        >
          <div className="-mx-3 grid">
            <button
              type="button"
              onClick={act(() => navigate(menu.goTo.path))}
              className={sheetAction}
            >
              <Icon name={item.show ? 'series' : 'movie'} size={20} />
              {menu.goTo.label}
            </button>
            <button type="button" onClick={act(menu.markWatched)} className={sheetAction}>
              <Icon name="check" size={20} />
              Mark as watched
            </button>
            <button type="button" onClick={act(menu.remove)} className={sheetAction}>
              <Icon name="remove" size={20} />
              Remove from Continue watching
            </button>
          </div>
        </SheetContent>
      </Sheet>
    </li>
  )
}

/** An album's square cover or an artist's round photo, with the name under it. */
function MusicItems({ items }: { items: HomeMusic[] }) {
  return (
    <>
      {items.map((x) => {
        const c = homeMusicCard(x)
        return (
          <li key={c.id} className="w-[30%] shrink-0 snap-start">
            <a
              href={mobileHref(c.path)}
              className={cn(
                'grid gap-1.5 outline-none transition-press focus-visible:ring-focus active:scale-97',
                c.round && 'justify-items-center text-center',
              )}
            >
              <img
                src={c.src}
                alt=""
                loading="lazy"
                className={cn(
                  'aspect-square w-full bg-s2 object-cover',
                  c.round ? 'rounded-full' : 'rounded-poster',
                )}
              />
              <span className="grid min-w-0">
                <span className="truncate font-semibold text-[13px]">{c.title}</span>
                <span className="truncate text-[12px] text-text-3">{c.caption}</span>
              </span>
            </a>
          </li>
        )
      })}
    </>
  )
}

/** A row while it loads: its title, then cards of `width`, running past the edge. */
export function MobileRowSkeleton({
  width,
  wide = false,
  resume = false,
}: {
  width: string
  wide?: boolean
  resume?: boolean
}) {
  return (
    <div aria-hidden className="grid gap-2.5">
      <div className={gutter}>
        <Skeleton className="my-0.5 h-4.5 w-40" />
      </div>
      <div className="flex gap-2 overflow-hidden px-4">
        {[0, 1, 2].map((i) => (
          <MediaPosterSkeleton
            key={i}
            wide={wide}
            resume={resume}
            className={cn('shrink-0', width)}
          />
        ))}
      </div>
    </div>
  )
}

/**
 * Home while it loads, laid out as it will be: the featured cards with their eyebrow and title at
 * the bottom, the next one peeking, then Continue watching and a row of stills.
 */
function HomeSkeleton() {
  return (
    <div aria-busy className="grid gap-6">
      <div className="flex gap-3 overflow-hidden px-4">
        {[0, 1].map((i) => (
          <div
            key={i}
            className="grid aspect-[4/5] w-[78%] shrink-0 content-end gap-2 rounded-lg bg-s1 p-4"
          >
            <Skeleton className="h-2.5 w-32" />
            <Skeleton className="my-0.5 h-6 w-3/5" />
          </div>
        ))}
      </div>
      <MobileRowSkeleton width="w-[62%]" resume />
      <MobileRowSkeleton width="w-[46%]" wide />
    </div>
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
          <HomeSkeleton />
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
              When the server’s owner adds films, shows or music, they show up here.
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
                  <ContinueCard key={m.id} item={m} />
                ))}
              </MobileRow>
            ) : s.layout === 'episodes' ? (
              // Next up and New episodes play the episode, as Continue watching resumes
              <MobileRow key={s.id} title={s.title} suffix={s.suffix} section={s.id}>
                {s.items.map((m) => (
                  <li key={m.id} className="w-[62%] shrink-0 snap-start">
                    <MediaPoster item={m} wide href={mobileHref(`/play/${m.id}`)} />
                  </li>
                ))}
              </MobileRow>
            ) : s.layout === 'shows' ? (
              <MobileRow key={s.id} title={s.title} suffix={s.suffix} section={s.id}>
                {s.items.map((x) => (
                  <li key={x.id} className="w-[30%] shrink-0 snap-start">
                    <ShowPoster show={x} href={mobileHref(`/shows/${x.id}`)} />
                  </li>
                ))}
              </MobileRow>
            ) : s.layout === 'music' ? (
              <MobileRow key={s.id} title={s.title} suffix={s.suffix} section={s.id}>
                <MusicItems items={s.items} />
              </MobileRow>
            ) : (
              // spotlights read as rows on a phone: there's no room for a synopsis beside the art
              <MobileRow key={s.id} title={s.title} suffix={s.suffix} section={s.id}>
                <PosterItems items={s.items} wide />
              </MobileRow>
            ),
          )
        )}
      </div>
    </PullToRefresh>
  )
}
