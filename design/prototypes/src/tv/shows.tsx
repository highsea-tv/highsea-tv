// SPDX-License-Identifier: AGPL-3.0-only
// Shows, TV: laid out as Movies is, the title with the sorts and Unwatched as choices on its right,
// the posters seven a row with each one's seasons under it and how many episodes are left on the
// art, and the alphabet rail at the left while sorted by title. Choosing a sort keeps focus on the
// choice, as on every library (the owner, 2026-10-31).
import { useState } from 'react'
import { useShows } from '../client/data.ts'
import { UnwatchedCount } from '../client/show-card.tsx'
import { arrangeShows, type ShowSort, seasonsCount } from '../client/shows.ts'
import { letterOf } from '../web/library.tsx'
import {
  TvButton,
  TvHead,
  TvMessage,
  TvTile,
  TvTileSkeleton,
  tvHref,
  useInitialFocus,
} from './kit.tsx'
import { motion, room, TvLetterRail, useIndexBox } from './library.tsx'

const sortChoices: { value: ShowSort; label: string }[] = [
  { value: 'title', label: 'A–Z' },
  { value: 'added', label: 'Recently added' },
  { value: 'year', label: 'Newest' },
]

const choice =
  'rounded-full px-[1.2cqw] py-[0.45cqw] font-semibold text-(length:--tv-text-pill) text-text-2 outline-none transition-lift focus-visible:scale-(--scale-button) focus-visible:shadow-(--tv-focus-shadow) aria-pressed:bg-text/12 aria-pressed:text-text'

export function TvShows() {
  const shows = useShows()
  const [sort, setSort] = useState<ShowSort>('title')
  const [unwatched, setUnwatched] = useState(false)
  const index = useIndexBox(shows.status)
  const titled = sort === 'title'
  useInitialFocus(shows.status === 'success', null, '[data-group="grid"] [data-focusable]')
  if (shows.status === 'error')
    return (
      <TvMessage
        title="Couldn’t load the shows"
        actions={
          <TvButton primary initial onClick={shows.refetch}>
            Try again
          </TvButton>
        }
      >
        {shows.error.message}
      </TvMessage>
    )
  const items = arrangeShows(shows.data ?? [], 'all', sort, unwatched)
  const present = new Set(items.map((s) => letterOf(s.sortTitle)))
  return (
    <>
      <TvLetterRail index={index} shown={titled} present={present} />
      <main ref={index.main} className="absolute inset-0 overflow-hidden">
        <div
          data-scroll="y"
          data-keep="0.4"
          className="relative grid grid-cols-1 gap-[1.6cqw] px-(--tv-safe-x) pb-(--tv-safe-y) transition-lift"
        >
          <TvHead down="sort" />
          <div className="flex items-end gap-[2cqw]">
            <h1 className="font-semibold text-[2.6cqw] leading-none tracking-display">Shows</h1>
            <div
              data-group="sort"
              data-go-up="nav"
              data-go-down="grid"
              className="ms-auto flex gap-[0.8cqw]"
            >
              {sortChoices.map((s) => (
                <button
                  key={s.value}
                  type="button"
                  data-focusable=""
                  aria-pressed={sort === s.value}
                  onClick={() => setSort(s.value)}
                  className={choice}
                >
                  {s.label}
                </button>
              ))}
              <span aria-hidden className="mx-[0.4cqw] w-px self-stretch bg-text/20" />
              <button
                type="button"
                data-focusable=""
                aria-pressed={unwatched}
                onClick={() => setUnwatched((u) => !u)}
                className={choice}
              >
                Unwatched
              </button>
            </div>
          </div>
          <div
            className={`grid transition-[grid-template-columns,column-gap] ${motion} ${titled ? room.open : room.shut}`}
          >
            <div aria-hidden />
            {shows.status === 'loading' && (
              <div aria-busy className="grid grid-cols-7 gap-x-(--tv-poster-gap) gap-y-[1.6cqw]">
                {Array.from({ length: 14 }, (_, i) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: placeholders have no identity
                  <TvTileSkeleton key={i} />
                ))}
              </div>
            )}
            <ul
              ref={index.grid}
              data-group="grid"
              data-go-left={titled ? 'alpha' : undefined}
              data-go-up="sort"
              className="grid grid-cols-7 gap-x-(--tv-poster-gap) gap-y-[1.6cqw]"
            >
              {items.map((s, i) => {
                const l = letterOf(s.sortTitle)
                const firstOfLetter = i === 0 || letterOf(items[i - 1]?.sortTitle ?? '') !== l
                return (
                  <li key={s.id} {...(firstOfLetter && titled ? { 'data-letter': l } : {})}>
                    <TvTile
                      title={s.title}
                      caption={seasonsCount(s.seasons)}
                      src={s.art.poster}
                      href={tvHref(`/shows/${s.id}`)}
                      status={<UnwatchedCount show={s} />}
                    />
                  </li>
                )
              })}
            </ul>
          </div>
        </div>
      </main>
    </>
  )
}
