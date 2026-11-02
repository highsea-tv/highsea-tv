// SPDX-License-Identifier: AGPL-3.0-only
// The A–Z scrubber down the right edge of the phone's library lists when they're sorted by name
// (prototype-gaps.md › 4.2), as iOS's section index is: every letter in the tint, those without
// titles dimmed. Touching a letter scrolls to its first title, and dragging along the column keeps
// jumping as the finger passes each letter, at once, as iOS does. A dimmed letter lands on the
// nearest letter that has titles. From the keyboard each letter is a button, the dimmed ones
// skipped, and a letter focuses its first title, as the web's index does. The letters are the
// web's and the TV's (`LETTERS` and `letterOf` in web/library.tsx).
import { cn } from '@highsea-tv/ui'
import { type ReactNode, type PointerEvent as ReactPointerEvent, useRef, useState } from 'react'
import { LETTERS, letterOf } from '../web/library.tsx'

/**
 * Where the letters start, for a list's sort keys (null for a title the sort doesn't index): the
 * letters present, and the `data-letter` mark the first title of each letter carries.
 */
export function useLetters(keys: (string | null)[], on: boolean) {
  const present = new Set(on ? keys.map((k) => letterOf(k ?? '')) : [])
  const mark = (i: number) => {
    if (!on) return {}
    const l = letterOf(keys[i] ?? '')
    return i === 0 || letterOf(keys[i - 1] ?? '') !== l ? { 'data-letter': l } : {}
  }
  return { on, present, mark }
}

/** The nearest letter with titles: this one, then the next ones, then the ones before it. */
const nearest = (l: string, present: Set<string>) => {
  const i = LETTERS.indexOf(l)
  const after = LETTERS.slice(i).find((x) => present.has(x))
  return after ?? LETTERS.slice(0, i).findLast((x) => present.has(x)) ?? null
}

/**
 * The list with the scrubber beside it. The column sits in the page's right gutter, widened a
 * little so the list keeps clear of it, and its letters stay in view as the page scrolls; the
 * list is at least as tall as the column, so a short one doesn't leave it hanging below.
 */
export function LetterIndexed({
  letters,
  children,
}: {
  letters: ReturnType<typeof useLetters>
  children: ReactNode
}) {
  const root = useRef<HTMLDivElement>(null)
  const column = useRef<HTMLDivElement>(null)
  const [held, setHeld] = useState<string | null>(null)
  if (!letters.on) return children

  const jump = (l: string, focus: boolean) => {
    const to = nearest(l, letters.present)
    const el = to && root.current?.querySelector<HTMLElement>(`[data-letter="${to}"]`)
    if (!el) return
    el.scrollIntoView({ block: 'start' })
    if (focus) el.querySelector<HTMLElement>('a, button')?.focus({ preventScroll: true })
  }
  const at = (y: number) => {
    const r = column.current?.getBoundingClientRect()
    if (!r || r.height === 0) return null
    const i = Math.floor(((y - r.top) / r.height) * LETTERS.length)
    return LETTERS[Math.min(LETTERS.length - 1, Math.max(0, i))] ?? null
  }
  const touch = (e: ReactPointerEvent) => {
    const l = at(e.clientY)
    if (!l || l === held) return
    setHeld(l)
    jump(l, false)
  }

  return (
    <div
      ref={root}
      className="relative min-h-[min(27rem,calc(100svh-16rem))] pe-2 [&_[data-letter]]:scroll-mt-4"
    >
      {children}
      <nav aria-label="Jump to a letter" className="-end-4 absolute inset-y-0 w-6">
        <div
          ref={column}
          // the column takes the finger itself, so Home's and the libraries' pull to refresh and
          // the page's own scrolling leave it alone
          onTouchStart={(e) => e.stopPropagation()}
          onPointerDown={(e) => {
            e.stopPropagation()
            e.currentTarget.setPointerCapture?.(e.pointerId)
            setHeld(null)
            touch(e)
          }}
          onPointerMove={(e) => held !== null && touch(e)}
          onPointerUp={() => setHeld(null)}
          onPointerCancel={() => setHeld(null)}
          className="sticky top-4 flex touch-none select-none flex-col"
        >
          {LETTERS.map((l) => (
            <button
              key={l}
              type="button"
              disabled={!letters.present.has(l)}
              onClick={() => jump(l, true)}
              className={cn(
                'pointer-events-none grid h-[min(1rem,calc((100svh-16rem)/27))] w-full place-items-center rounded-sm font-semibold text-[11px] text-accent-text leading-none outline-none focus-ring-inset disabled:text-text-3/40',
                held === l && 'bg-s2',
              )}
            >
              {l}
            </button>
          ))}
        </div>
      </nav>
    </div>
  )
}
