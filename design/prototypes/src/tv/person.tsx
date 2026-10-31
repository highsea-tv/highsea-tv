// SPDX-License-Identifier: AGPL-3.0-only
// A person on the TV (docs/product/client-people.md), as Plex's and the Apple TV app's TV pages
// lay one out: the ambient backdrop (their best-rated film here, blurred and dimmed), the round
// portrait beside the name, what they're known for and how many films here, born and died, and the
// biography cut at four lines, with More when it's longer. Then a film row for each department
// they worked in here, the one they're known for first, each film with their role under its
// title. Focus starts on the first row's film; Up and Down go row by row; Back goes back to
// wherever it was opened from.
import { Skeleton } from '@highsea-tv/ui-web'
import { useRef, useState } from 'react'
import { useParams } from 'wouter'
import { usePerson } from '../client/data.ts'
import { departmentTitle, lifeOf, roleNames } from '../client/detail-facts.ts'
import type { ClientPerson } from '../mock/types.ts'
import { LONG_BIO } from '../web/person.tsx'
import { TvFilmRow, TvFilmRowSkeleton } from './film-row.tsx'
import { TvButton, TvHead, TvMessage, tvHref, useInitialFocus, useRowNavigation } from './kit.tsx'

export function TvPerson() {
  const { id } = useParams<{ id: string }>()
  const found = usePerson(id)
  const rows = useRef<HTMLDivElement>(null)
  useInitialFocus(found.status === 'success', id, '[data-films] [data-focusable]')
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
        Their films may have been removed.
      </TvMessage>
    )
  const p = found.data
  const life = lifeOf(p)
  const long = (p.bio?.length ?? 0) >= LONG_BIO
  const first = p.departments[0]?.department
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
          <TvHead down={long ? 'bio' : `films-${first}`} className="px-(--tv-safe-x)" />
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
                {departmentTitle[p.knownFor]} · {p.count} {p.count === 1 ? 'movie' : 'movies'} here
              </p>
              {life && <p className="text-(length:--tv-text-pill) text-text-3">{life}</p>}
              {p.bio && <Bio person={p} long={long} />}
            </div>
          </section>
          {p.departments.map(({ department, credits }, i) => {
            const roles = new Map(credits.map((c) => [c.item.id, roleNames(c.role)]))
            return (
              <div
                key={department}
                data-row=""
                // the first row sits low, so the name above stays on screen while it's focused
                {...(i === 0 ? { 'data-films': '', 'data-keep': '0.72' } : {})}
                className="relative grid grid-cols-1"
              >
                <TvFilmRow
                  group={`films-${department}`}
                  title={departmentTitle[department]}
                  goUp={
                    i === 0 ? (long ? 'bio' : 'nav') : `films-${p.departments[i - 1]?.department}`
                  }
                  items={credits.map((c) => c.item)}
                  hrefOf={(m) => tvHref(`/movies/${m.id}`)}
                  noteOf={(m) => roles.get(m.id) ?? ''}
                />
              </div>
            )
          })}
        </div>
      </main>
    </>
  )
}

/** The biography, cut at four lines; More shows the rest in place. */
function Bio({ person: p, long }: { person: ClientPerson; long: boolean }) {
  const [open, setOpen] = useState(false)
  return (
    <div data-group="bio" className="grid justify-items-start gap-[1.1cqw] pt-[0.4cqw]">
      <p
        id="bio"
        className={`text-(length:--tv-text-synopsis) text-text-2 leading-[1.45] ${long && !open ? 'line-clamp-4' : ''}`}
      >
        {p.bio}
      </p>
      {long && (
        <TvButton aria-expanded={open} aria-controls="bio" onClick={() => setOpen(!open)}>
          {open ? 'Less' : 'More'}
        </TvButton>
      )}
    </div>
  )
}
