// SPDX-License-Identifier: AGPL-3.0-only
// C3 Library browse, TV (docs/product/client-library.md#tv): the poster grid, each with its title
// and year, with an alphabet
// rail on the left. The rail is isolated: Left from the grid's first column enters it, Up and Down
// run through the letters (only the ones with titles), and OK jumps the grid to that letter.
// Movies is its own destination in the global nav (the owner, 2026-10-30), so the title stands
// alone, with the sort as a row of choices on its right; Up from the grid reaches the sort.
import { useLayoutEffect, useRef, useState } from 'react'
import { useLibrary } from '../client/data.ts'
import { arrange, type Sort } from '../web/library.tsx'
import { TvButton, TvHead, TvMessage, TvPoster, tvHref, useInitialFocus } from './kit.tsx'

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

/** A track's translation down the page, from a transform (`none` and '' are none). */
const shiftOf = (transform: string) =>
  !transform || transform === 'none' ? 0 : new DOMMatrixReadOnly(transform).m42

/**
 * The letter index's box: it starts level with the first row's top as that row shows with focus
 * in it (arriving lifts the grid a little, to keep focus in view), and its square letters share
 * the height from there to the safe area's foot. Measured, since the header sets where the grid
 * starts; while focus is further down (or on the index), the index stays where it was rather than
 * following the first row off the screen. It's hidden until focus first reaches the first row, so
 * it shows once, in place, rather than at the grid's resting spot and then moving.
 */
function useIndexBox(ready: unknown) {
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

export function TvLibrary() {
  const library = useLibrary()
  const [sort, setSort] = useState<Sort>('title')
  const [unwatched, setUnwatched] = useState(false)
  // after an error the grid isn't there, and the index only shows sorted by title, so both
  // re-measure it once they're back
  const index = useIndexBox(`${library.status}:${sort}`)
  useInitialFocus(
    library.status === 'success',
    `${sort}:${unwatched}`,
    '[data-group="grid"] [data-focusable]',
  )
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
  const items = arrange(library.data ?? [], 'all', sort, unwatched)
  const present = new Set(items.map((m) => letterOf(m.sortTitle)))
  const jump = (letter: string) => {
    const el = document.querySelector<HTMLElement>(
      `[data-platform="tv"] [data-letter="${letter}"] [data-focusable]`,
    )
    el?.focus({ preventScroll: true })
  }
  return (
    <>
      {sort === 'title' && (
        <nav
          ref={index.nav}
          aria-label="Jump to a letter"
          data-group="alpha"
          data-isolate=""
          data-go-right="grid"
          // from the first row's top to the safe area's foot, centred in the left gutter
          style={{ top: index.top, left: `calc((var(--tv-safe-x) - ${index.size}px) / 2)` }}
          className={`absolute bottom-(--tv-safe-y) z-10 grid content-start ${index.placed ? '' : 'invisible'}`}
        >
          {LETTERS.map((l) => (
            <button
              key={l}
              type="button"
              disabled={!present.has(l)}
              {...(present.has(l) ? { 'data-focusable': '' } : {})}
              onClick={() => jump(l)}
              style={{ width: index.size, height: index.size }}
              className="grid place-items-center rounded-[0.3cqw] font-semibold text-(length:--tv-text-quality) text-text-2 outline-none transition-lift focus-visible:scale-125 focus-visible:bg-text focus-visible:text-bg disabled:text-text-3/40"
            >
              {l}
            </button>
          ))}
        </nav>
      )}
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
                  className="rounded-full px-[1.2cqw] py-[0.45cqw] font-semibold text-(length:--tv-text-pill) text-text-2 outline-none transition-lift focus-visible:scale-(--scale-button) focus-visible:shadow-(--tv-focus-shadow) aria-pressed:bg-text/12 aria-pressed:text-text"
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
                className="rounded-full px-[1.2cqw] py-[0.45cqw] font-semibold text-(length:--tv-text-pill) text-text-2 outline-none transition-lift focus-visible:scale-(--scale-button) focus-visible:shadow-(--tv-focus-shadow) aria-pressed:bg-text/12 aria-pressed:text-text"
              >
                Unwatched
              </button>
            </div>
          </div>
          <ul
            ref={index.grid}
            data-group="grid"
            data-go-left={sort === 'title' ? 'alpha' : undefined}
            data-go-up="sort"
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
