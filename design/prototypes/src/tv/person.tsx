// SPDX-License-Identifier: AGPL-3.0-only
// A person on the TV (docs/product/client-people.md), as Plex's and the Apple TV app's TV pages
// lay one out: the ambient backdrop (their best-rated film here, blurred and dimmed), the round
// portrait beside the name, what they're known for and how much of theirs is here, born and died,
// and the biography cut at four lines, with More when it's longer. Then a film row for each
// department they worked in on the films here, the one they're known for first, each film with
// their role under its title; then their shows and their albums. Focus starts on the first row;
// Up and Down go row by row; Back goes back to wherever it was opened from.
import { createLibraryText } from '@highsea-tv/client/library'
import { Skeleton } from '@highsea-tv/ui'
import { useRef, useState } from 'react'
import { useParams } from 'wouter'
import { usePerson } from '../client/data.ts'
import { UnwatchedCount } from '../client/show-card.tsx'
import { showYears } from '../client/shows.ts'
import { LONG_BIO } from '../web/person.tsx'
import { TvFilmRow, TvFilmRowSkeleton } from './film-row.tsx'
import {
  TvButton,
  TvHead,
  TvMessage,
  TvRow,
  TvTile,
  tvHref,
  useInitialFocus,
  useRowNavigation,
} from './kit.tsx'

/** What the page says about the title, as the apps word it (@highsea-tv/client/library). */
const facts = createLibraryText('en')

export function TvPerson() {
  const { id } = useParams<{ id: string }>()
  const found = usePerson(id)
  const rows = useRef<HTMLDivElement>(null)
  useInitialFocus(found.status === 'success', id, '[data-first] [data-focusable]')
  useRowNavigation(rows, found.status === 'success' && id)
  if (found.status === 'loading')
    return (
      <main aria-busy className="absolute inset-0 grid content-start gap-[1.6cqw] overflow-hidden">
        <TvHead className="px-(--tv-safe-x)" />
        <div className="flex items-center gap-[3cqw] px-(--tv-safe-x) pt-[1cqw] pb-[2cqw]">
          <Skeleton className="size-[13cqw] shrink-0 rounded-full" />
          <div className="grid w-[44cqw] gap-[1.1cqw]">
            <Skeleton className="my-[0.2cqw] h-[3.4cqw] w-[28cqw] rounded-[0.5cqw]" />
            <Skeleton className="my-[0.15cqw] h-[1.05cqw] w-[16cqw]" />
            <div className="grid gap-[0.6cqw] py-[0.2cqw]">
              <Skeleton className="h-[1.1cqw] w-full" />
              <Skeleton className="h-[1.1cqw] w-full" />
              <Skeleton className="h-[1.1cqw] w-3/5" />
            </div>
          </div>
        </div>
        <TvFilmRowSkeleton />
      </main>
    )
  if (found.status === 'error')
    return (
      <TvMessage
        title={found.error.message}
        actions={
          <TvButton primary initial href={tvHref('/search')}>
            Search
          </TvButton>
        }
      >
        What they were part of may have been removed.
      </TvMessage>
    )
  const p = found.data
  const life = facts.lifeOf(p)
  const long = (p.bio?.length ?? 0) >= LONG_BIO
  // the rows in order, so each knows the one above it: the films by department, the shows, the music
  const groups = [
    ...p.departments.map((x) => `films-${x.department}`),
    ...(p.shows.length > 0 ? ['shows'] : []),
    ...(p.albums.length > 0 ? ['music'] : []),
  ]
  const above = (group: string) => {
    const i = groups.indexOf(group)
    return i > 0 ? (groups[i - 1] ?? 'nav') : long ? 'bio' : p.artist ? 'artist' : 'nav'
  }
  // the first row sits low, so the name above stays on screen while it's focused
  const firstRow = (group: string) =>
    group === groups[0] ? { 'data-first': '', 'data-keep': '0.72' } : {}
  return (
    <>
      <img
        src={p.backdrop}
        alt=""
        className="absolute inset-0 h-full w-full scale-110 object-cover blur-[2.6cqw] brightness-[0.45]"
      />
      <div className="absolute inset-0 bg-[linear-gradient(90deg,var(--color-bg)_10%,transparent_70%)]" />
      <main className="absolute inset-0 overflow-hidden">
        <div
          ref={rows}
          data-scroll="y"
          data-keep="0.4"
          className="relative grid grid-cols-1 gap-[1.6cqw] pb-(--tv-safe-y) transition-lift"
        >
          <TvHead
            down={p.artist ? 'artist' : long ? 'bio' : groups[0]}
            className="px-(--tv-safe-x)"
          />
          <section
            aria-labelledby="name"
            data-row=""
            data-keep="1"
            className="flex items-center gap-[3cqw] px-(--tv-safe-x) pt-[1cqw] pb-[2cqw]"
          >
            <img
              src={p.photo}
              alt=""
              className="size-[13cqw] shrink-0 rounded-full bg-s1 object-cover shadow-(--tv-focus-shadow)"
            />
            <div className="grid max-w-[48cqw] justify-items-start gap-[1.1cqw]">
              <h1 id="name" className="font-semibold text-[3.6cqw] leading-[0.95] tracking-display">
                {p.name}
              </h1>
              <p className="text-(length:--tv-text-meta) text-text-2">
                {facts.departmentTitle(p.knownFor)} · {facts.hereOf(p.counts)}
              </p>
              {life && <p className="text-(length:--tv-text-pill) text-text-3">{life}</p>}
              {/* the reverse of the artist page's Their films and shows (prototype-gaps.md › 3.5) */}
              {p.artist && (
                <div data-group="artist" data-go-up="nav" data-go-down={long ? 'bio' : groups[0]}>
                  <TvButton icon="music" href={tvHref(`/music/artists/${p.artist}`)}>
                    Their music
                  </TvButton>
                </div>
              )}
              {p.bio && <Bio text={p.bio} long={long} />}
            </div>
          </section>
          {p.departments.map(({ department, credits }) => {
            const roles = new Map(credits.map((c) => [c.item.id, facts.roleNames(c.role)]))
            const group = `films-${department}`
            return (
              <div
                key={department}
                data-row=""
                {...firstRow(group)}
                className="relative grid grid-cols-1"
              >
                <TvFilmRow
                  group={group}
                  title={facts.departmentTitle(department)}
                  goUp={above(group)}
                  items={credits.map((c) => c.item)}
                  hrefOf={(m) => tvHref(`/movies/${m.id}`)}
                  noteOf={(m) => roles.get(m.id) ?? ''}
                />
              </div>
            )
          })}
          {p.shows.length > 0 && (
            <div data-row="" {...firstRow('shows')} className="relative grid grid-cols-1">
              <TvRow group="shows" title="Shows" goUp={above('shows')}>
                {p.shows.map(({ show, role }) => (
                  <li key={show.id} className="w-[12cqw] shrink-0">
                    <TvTile
                      title={show.title}
                      caption={`${facts.roleNames(role)} · ${showYears(show)}`}
                      src={show.art.poster}
                      href={tvHref(`/shows/${show.id}`)}
                      status={<UnwatchedCount show={show} />}
                    />
                  </li>
                ))}
              </TvRow>
            </div>
          )}
          {p.albums.length > 0 && (
            <div data-row="" {...firstRow('music')} className="relative grid grid-cols-1">
              <TvRow group="music" title="Albums" goUp={above('music')}>
                {p.albums.map((a) => (
                  <li key={a.id} className="w-[12cqw] shrink-0">
                    <TvTile
                      square
                      title={a.title}
                      caption={String(a.year)}
                      src={a.cover}
                      href={tvHref(`/music/albums/${a.id}`)}
                    />
                  </li>
                ))}
              </TvRow>
            </div>
          )}
        </div>
      </main>
    </>
  )
}

/** A biography, cut at four lines; More shows the rest in place. An artist's page shares it. */
export function Bio({ text, long }: { text: string; long: boolean }) {
  const [open, setOpen] = useState(false)
  return (
    <div data-group="bio" className="grid justify-items-start gap-[1.1cqw] pt-[0.4cqw]">
      <p
        id="bio"
        className={`text-(length:--tv-text-synopsis) text-text-2 leading-[1.45] ${long && !open ? 'line-clamp-4' : ''}`}
      >
        {text}
      </p>
      {long && (
        <TvButton aria-expanded={open} aria-controls="bio" onClick={() => setOpen(!open)}>
          {open ? 'Less' : 'More'}
        </TvButton>
      )}
    </div>
  )
}
