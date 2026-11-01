// SPDX-License-Identifier: AGPL-3.0-only
// C3 Library browse, TV (docs/product/client-library.md#tv): the poster grid, each with its title
// and year, with an alphabet
// rail on the left: a column of its own at the container's left edge, beside the grid, which fills
// the rest (the owner, 2026-10-30). The rail is isolated: Left from the grid's first column enters it, Up and Down
// run through the letters (only the ones with titles), and OK jumps the grid to that letter.
// Movies is its own destination in the global nav (the owner, 2026-10-30), so the title stands
// alone, with the sort, Unwatched and the genre as a row of choices on its right; Up from the grid
// reaches them. An empty library says so, and choices that match nothing offer Show everything.
import { cn, Icon } from '@highsea-tv/ui-web'
import { type ReactNode, useLayoutEffect, useRef, useState } from 'react'
import { useLibrary } from '../client/data.ts'
import { ALL, arrange, genresOf, LETTERS, letterOf, type Sort } from '../web/library.tsx'
import {
  TvButton,
  TvHead,
  TvMessage,
  TvPoster,
  TvTileSkeleton,
  tvHref,
  useInitialFocus,
} from './kit.tsx'
import { TvMenu } from './song-menu.tsx'

/**
 * The rail's column: the letters' width, and the room the grid leaves for it. Another sort closes
 * the room with spring.quick as the rail fades, and A–Z opens it again, rather than snapping (the
 * owner, 2026-10-30); grid-template-columns interpolates between track lists of the same shape
 * (CSS Grid 1 § 7.2, https://www.w3.org/TR/css-grid-1/#track-sizing).
 */
const rail = 'w-[2cqw]'
export const motion = 'duration-(--duration-spring-quick) ease-(--ease-spring-quick)'
export const room = {
  open: 'grid-cols-[2cqw_minmax(0,1fr)] gap-x-(--tv-poster-gap)',
  shut: 'grid-cols-[0cqw_minmax(0,1fr)] gap-x-0',
}

const sortChoices: { value: Sort; label: string }[] = [
  { value: 'title', label: 'A–Z' },
  { value: 'added', label: 'Recently added' },
  { value: 'year', label: 'Newest' },
]

/** A choice beside a library's title: a sort, Unwatched, the genre. */
export const choice =
  'rounded-full px-[1.2cqw] py-[0.45cqw] font-semibold text-(length:--tv-text-pill) text-text-2 outline-none transition-lift focus-visible:scale-(--scale-button) focus-visible:shadow-(--tv-focus-shadow) aria-pressed:bg-text/12 aria-pressed:text-text'

/**
 * The genre, the last of a library's choices, as the web and phone have it: OK opens the genres
 * over the page, in columns, with the one in force focused; choosing one closes them and focus
 * stays on this choice, as it does on the sorts (the owner, 2026-10-31).
 */
export function TvGenreChoice({
  genres,
  value,
  all,
  onPick,
}: {
  genres: string[]
  value: string
  /** The value that means every genre. */
  all: string
  onPick: (genre: string) => void
}) {
  const [open, setOpen] = useState(false)
  const label = value === all ? 'All genres' : value
  return (
    <>
      <button
        type="button"
        data-focusable=""
        aria-haspopup="dialog"
        aria-pressed={value !== all}
        aria-label={`Genre: ${label}`}
        onClick={() => setOpen(true)}
        className={cn(choice, 'flex items-center gap-[0.4cqw]')}
      >
        {label}
        <Icon name="chevron-down" size={20} className="size-[1cqw]" />
      </button>
      {open && (
        <TvMenu
          name="Genre"
          cols={3}
          items={[all, ...genres].map((g) => ({
            label: g === all ? 'All genres' : g,
            current: g === value,
            run: () => onPick(g),
          }))}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  )
}

/**
 * A library with nothing in it (client-library.md › States): said in the page, under the head,
 * whose own destination takes the focus, since there's nothing else to choose.
 */
export function TvEmptyLibrary({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="grid max-w-[46cqw] gap-[0.8cqw] pt-[2cqw]">
      <h2 className="font-semibold text-(length:--tv-text-row-title)">{title}</h2>
      <p className="text-(length:--tv-text-synopsis) text-text-2 leading-[1.45]">{children}</p>
    </div>
  )
}

/**
 * The choices matched nothing: said where the grid was, with Show everything, which clears the
 * genre and Unwatched, so Down from the choices always has somewhere to go.
 */
export function TvNothingMatches({
  children,
  onClear,
}: {
  children: ReactNode
  onClear: () => void
}) {
  return (
    <div
      data-group="grid"
      data-go-up="sort"
      className="grid max-w-[46cqw] justify-items-start gap-[0.8cqw] pt-[2cqw]"
    >
      <h2 className="font-semibold text-(length:--tv-text-row-title)">Nothing matches</h2>
      <p className="text-(length:--tv-text-synopsis) text-text-2 leading-[1.45]">{children}</p>
      <TvButton className="mt-[0.6cqw]" onClick={onClear}>
        Show everything
      </TvButton>
    </div>
  )
}

/**
 * Focus on arrival: the grid's first title once it loads, or the head's own destination when the
 * library is empty; after that, choosing a sort or view keeps focus on the choice, so the next one
 * is a press away (the owner, 2026-10-31, for every library). Show everything (`key`) focuses
 * the grid again, since the button it was on has gone.
 */
export function useLibraryFocus(ready: boolean, empty: boolean, key: number) {
  useInitialFocus(
    ready,
    `${empty}:${key}`,
    empty ? '[data-group="nav"] [aria-current="page"]' : '[data-group="grid"] [data-focusable]',
  )
}

/** A track's translation down the page, from a transform (`none` and '' are none). */
const shiftOf = (transform: string) =>
  !transform || transform === 'none' ? 0 : new DOMMatrixReadOnly(transform).m42

/**
 * The letter index's box: it starts level with the first row's top as that row shows with focus
 * in it (arriving lifts the grid a little, to keep focus in view), and its square letters share the
 * height from there to the safe area's foot. Measured, since the header sets where the grid starts; while focus is further down (or on the index), the index stays where it was rather than
 * following the first row off the screen. It's hidden until focus first reaches the first row, so
 * it shows once, in place, rather than at the grid's resting spot and then moving.
 */
export function useIndexBox(ready: unknown) {
  const main = useRef<HTMLElement>(null)
  const nav = useRef<HTMLElement>(null)
  const grid = useRef<HTMLUListElement>(null)
  const [box, setBox] = useState({ top: 0, size: 0, placed: false })
  // biome-ignore lint/correctness/useExhaustiveDependencies: `ready` re-runs it on purpose
  useLayoutEffect(() => {
    const m = main.current
    const g = grid.current
    const n = nav.current
    const track = g?.closest<HTMLElement>('[data-scroll]')
    if (!m || !g || !n || !track) return
    let top: number | undefined
    setBox((b) => ({ ...b, placed: false }))
    const measure = () => {
      const first = g.firstElementChild as HTMLElement | null
      const row = document.activeElement?.closest('li')
      if (!row || !first || !g.contains(row) || row.offsetTop !== first.offsetTop) {
        if (top === undefined) return
      } else {
        // where the grid is going, not where its transition has it now: the navigator sets the
        // track's transform at once and the transition only draws the way there
        const now = g.getBoundingClientRect().top - m.getBoundingClientRect().top
        top = now - shiftOf(getComputedStyle(track).transform) + shiftOf(track.style.transform)
      }
      // the index stops at the safe area's foot, which its own `bottom` holds in pixels
      const foot = Number.parseFloat(getComputedStyle(n).bottom) || 0
      setBox({ top, size: (m.clientHeight - top - foot) / LETTERS.length, placed: true })
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(m)
    observer.observe(g)
    // on the document, so it runs after the navigator on the TV's root has moved the track
    document.addEventListener('focusin', measure)
    // Up and Down stay in the index: at either end they do nothing, rather than finding the grid's
    // posters above or below. Listened for here, before the navigator on the TV's root sees it
    const step = (e: KeyboardEvent) => {
      if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return
      e.preventDefault()
      const all = [...n.querySelectorAll<HTMLElement>('[data-focusable]')]
      const at = all.indexOf(document.activeElement as HTMLElement)
      all[e.key === 'ArrowUp' ? at - 1 : at + 1]?.focus()
    }
    n.addEventListener('keydown', step)
    return () => {
      observer.disconnect()
      document.removeEventListener('focusin', measure)
      n.removeEventListener('keydown', step)
    }
  }, [ready])
  return { main, nav, grid, ...box }
}

/**
 * The alphabet rail: isolated, Up and Down run through the letters with titles, and OK focuses the
 * grid's first title under that letter (its `<li data-letter>`). Right goes back to the grid.
 */
export function TvLetterRail({
  index,
  shown,
  present,
}: {
  index: ReturnType<typeof useIndexBox>
  shown: boolean
  present: Set<string>
}) {
  const jump = (letter: string) => {
    const el = document.querySelector<HTMLElement>(
      `[data-platform="tv"] [data-letter="${letter}"] [data-focusable]`,
    )
    el?.focus({ preventScroll: true })
  }
  return (
    <nav
      ref={index.nav}
      aria-label="Jump to a letter"
      aria-hidden={!shown || undefined}
      inert={!shown}
      data-group="alpha"
      data-isolate=""
      data-go-right="grid"
      // from the first row's top to the safe area's foot, in its column at the container's
      // left edge; the grid moves under focus and the rail stays, so it's outside the track
      style={{ top: index.top }}
      className={`absolute start-(--tv-safe-x) bottom-(--tv-safe-y) z-10 grid content-start justify-items-center transition-opacity ${motion} ${rail} ${shown && index.placed ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
    >
      {LETTERS.map((l) => (
        <button
          key={l}
          type="button"
          disabled={!present.has(l)}
          {...(shown && present.has(l) ? { 'data-focusable': '' } : {})}
          onClick={() => jump(l)}
          // square: a 27th of the height, or the column's width if that's less
          style={{ width: `min(${index.size}px, 2cqw)`, height: `min(${index.size}px, 2cqw)` }}
          className="grid place-items-center rounded-[0.3cqw] font-semibold text-(length:--tv-text-quality) text-text-2 outline-none transition-lift focus-visible:scale-125 focus-visible:bg-text focus-visible:text-bg disabled:text-text-3/40"
        >
          {l}
        </button>
      ))}
    </nav>
  )
}

export function TvLibrary() {
  const library = useLibrary()
  const [sort, setSort] = useState<Sort>('title')
  const [unwatched, setUnwatched] = useState(false)
  const [genre, setGenre] = useState(ALL)
  const [cleared, setCleared] = useState(0)
  const all = library.data ?? []
  const none = library.status === 'success' && all.length === 0
  const items = arrange(all, genre, sort, unwatched)
  // after an error, or while nothing matches, the grid isn't there, so it re-measures once it's back
  const index = useIndexBox(`${library.status}:${items.length > 0}`)
  useLibraryFocus(library.status === 'success', none, cleared)
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
  const titled = sort === 'title' && items.length > 0
  const present = new Set(items.map((m) => letterOf(m.sortTitle)))
  return (
    <>
      <TvLetterRail index={index} shown={titled} present={present} />
      <main ref={index.main} className="absolute inset-0 overflow-hidden">
        <div
          data-scroll="y"
          data-keep="0.4"
          className={`relative grid grid-cols-1 gap-[1.6cqw] px-(--tv-safe-x) pb-(--tv-safe-y) transition-lift`}
        >
          {/* in the track, so it scrolls away with the page */}
          <TvHead down="sort" />
          <div className="flex items-end gap-[2cqw]">
            <h1 className="font-semibold text-[2.6cqw] leading-none tracking-display">Movies</h1>
            {/* nothing to sort or filter in an empty library */}
            {!none && (
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
                <TvGenreChoice genres={genresOf(all)} value={genre} all={ALL} onPick={setGenre} />
              </div>
            )}
          </div>
          {none ? (
            <TvEmptyLibrary title="No movies yet">
              When the server’s owner adds movies, they show up here.
            </TvEmptyLibrary>
          ) : library.status === 'success' && items.length === 0 ? (
            <TvNothingMatches
              onClear={() => {
                setGenre(ALL)
                setUnwatched(false)
                setCleared((c) => c + 1)
              }}
            >
              {genre === ALL
                ? 'You’ve watched everything here.'
                : unwatched
                  ? `You’ve watched everything in ${genre}.`
                  : `There’s nothing in ${genre} here.`}
            </TvNothingMatches>
          ) : (
            <div
              className={`grid transition-[grid-template-columns,column-gap] ${motion} ${titled ? room.open : room.shut}`}
            >
              {/* the rail's room; the rail itself stays put outside the moving track */}
              <div aria-hidden />
              {library.status === 'loading' && (
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
                {items.map((m, i) => {
                  const l = letterOf(m.sortTitle)
                  const firstOfLetter = i === 0 || letterOf(items[i - 1]?.sortTitle ?? '') !== l
                  return (
                    <li key={m.id} {...(firstOfLetter && titled ? { 'data-letter': l } : {})}>
                      <TvPoster item={m} href={tvHref(`/movies/${m.id}`)} />
                    </li>
                  )
                })}
              </ul>
            </div>
          )}
        </div>
      </main>
    </>
  )
}
