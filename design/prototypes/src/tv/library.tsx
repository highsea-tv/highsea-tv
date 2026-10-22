// SPDX-License-Identifier: AGPL-3.0-only
// C3 Library browse, TV (docs/product/client-library.md#tv): the poster grid, each with its title
// and year, with an alphabet
// rail on the left. The rail is isolated: Left from the grid's first column enters it, Up and Down
// run through the letters (only the ones with titles), and OK jumps the grid to that letter.
// Sort is a row of choices above the grid, beside Movies and Collections; Up from the grid reaches
// those, Right from them the sort.
import { useState } from 'react'
import { useLibrary } from '../client/data.ts'
import { arrange, type Sort } from '../web/library.tsx'
import { LibraryKind } from './collections.tsx'
import {
  GlobalNav,
  ServerIdentity,
  TvButton,
  TvMessage,
  TvPoster,
  tvHref,
  useInitialFocus,
} from './kit.tsx'

const LETTERS = ['#', ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ']
const letterOf = (sortTitle: string) => {
  const c = sortTitle.charAt(0).toUpperCase()
  return /[A-Z]/.test(c) ? c : '#'
}

const sortChoices: { value: Sort; label: string }[] = [
  { value: 'title', label: 'A–Z' },
  { value: 'added', label: 'Recently added' },
  { value: 'year', label: 'Newest' },
]

export function TvLibrary() {
  const library = useLibrary()
  const [sort, setSort] = useState<Sort>('title')
  useInitialFocus(library.status === 'success', sort, '[data-group="grid"] [data-focusable]')
  if (library.status === 'error')
    return (
      <TvMessage
        title="Couldn’t load the library"
        actions={
          <TvButton primary initial onClick={library.refetch}>
            Try again
          </TvButton>
        }
      >
        {library.error.message}
      </TvMessage>
    )
  const items = arrange(library.data ?? [], 'all', sort)
  const present = new Set(items.map((m) => letterOf(m.sortTitle)))
  const jump = (letter: string) => {
    const el = document.querySelector<HTMLElement>(
      `[data-platform="tv"] [data-letter="${letter}"] [data-focusable]`,
    )
    el?.focus({ preventScroll: true })
  }
  return (
    <>
      <GlobalNav down="kind" />
      {sort === 'title' && (
        <nav
          aria-label="Jump to a letter"
          data-group="alpha"
          data-isolate=""
          data-go-right="grid"
          className="absolute top-[7cqw] bottom-(--tv-safe-y) left-[1.2cqw] z-10 grid content-start gap-[0.1cqw]"
        >
          {LETTERS.map((l) => (
            <button
              key={l}
              type="button"
              disabled={!present.has(l)}
              {...(present.has(l) ? { 'data-focusable': '' } : {})}
              onClick={() => jump(l)}
              className="grid h-[1.55cqw] w-[2.2cqw] place-items-center rounded-[0.3cqw] font-semibold text-(length:--tv-text-quality) text-text-2 outline-none transition-lift focus-visible:scale-125 focus-visible:bg-text focus-visible:text-bg disabled:text-text-3/40"
            >
              {l}
            </button>
          ))}
        </nav>
      )}
      <main className="absolute inset-0 overflow-hidden [mask-image:linear-gradient(transparent,black_3.2cqw)]">
        <div
          data-scroll="y"
          data-keep="0.35"
          className="relative grid grid-cols-1 gap-[1.6cqw] px-(--tv-safe-x) pt-[7cqw] pb-[4cqw] transition-lift"
        >
          {/* in the track, so it scrolls away rather than covering the grid */}
          <ServerIdentity />
          <div className="flex items-end gap-[2cqw]">
            <h1 className="font-semibold text-[2.6cqw] leading-none tracking-display">Movies</h1>
            <LibraryKind current="movies" down="grid" right="sort" />
            <div
              data-group="sort"
              data-go-up="nav"
              data-go-left="kind"
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
                  className="rounded-full px-[1.2cqw] py-[0.45cqw] font-semibold text-(length:--tv-text-pill) text-text-2 outline-none transition-lift focus-visible:scale-(--scale-button) focus-visible:shadow-(--tv-focus-shadow) aria-pressed:bg-text/12 aria-pressed:text-text"
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
          <ul
            data-group="grid"
            data-go-left={sort === 'title' ? 'alpha' : undefined}
            data-go-up="kind"
            className="grid grid-cols-7 gap-x-(--tv-poster-gap) gap-y-[1.6cqw]"
          >
            {items.map((m, i) => {
              const l = letterOf(m.sortTitle)
              const firstOfLetter = i === 0 || letterOf(items[i - 1]?.sortTitle ?? '') !== l
              return (
                <li key={m.id} {...(firstOfLetter && sort === 'title' ? { 'data-letter': l } : {})}>
                  <TvPoster item={m} href={tvHref(`/movies/${m.id}`)} />
                </li>
              )
            })}
          </ul>
        </div>
      </main>
    </>
  )
}
