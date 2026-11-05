// SPDX-License-Identifier: AGPL-3.0-only
// The DOM side of the spatial model: the TV prototype's D-pad focus, and in a browser the engine
// behind the library's TV focus stops (../engine.web.tsx), where tvOS and Android TV use their own
// (one-client-platform.md › A, question 5). Like the renderer's `.web` files it's typechecked with
// the DOM's types (tsconfig.dom.json), and left out of tsconfig.native.json, whose code has none.
// Markup contract (the reference board's, then the focus guides' three below it):
//   [data-focusable]           an item D-pad focus can land on (it also needs a tabindex)
//   [data-group="id"]          a row or region; the last focused item is remembered per group
//   [data-isolate]             a region entered only through a focus guide (a nav rail)
//   [data-go-up|down|left|right="group"]  a focus guide on an ancestor
//   [data-scroll="x|y"]        a track that moves by transform to keep focus in view
//   [data-keep="0.3"]          where in the viewport the track keeps focus (default 0.5); "start"
//                              keeps it in the track's first slot, an item always flush there. A
//                              group inside a y track may set its own, so a page's top can stay
//                              put while the rows below it scroll
//   [data-center]              don't clamp the track at its ends
//   [data-initial]             where focus starts when nothing has it
// What react-native-tvos's TVFocusGuideView does, for the library's stops in a browser:
//   [data-trap="up down …"]    focus doesn't leave this region in those directions (trapFocus*)
//   [data-guide]               a region that hands focus arriving from outside to its
//                              destinations (`destinations`), which the `destinations` option reads
//   [data-kept="center|rest"]  a page's part that lands as a whole, its centre at the track's
//                              keep, or the track at its start for `rest` (TvPage's Kept)
// The item focus leaves drops its ring at once rather than easing it out, while its scale and
// colours ease back as before and the item gaining focus eases in (the owner, 2026-10-30).
import { type Box, type Direction, isAhead, pickBest, trackOffset, trackStart } from './spatial.ts'

export type NavigatorOptions = {
  /** Focus moved by an arrow key. Play `navigate` here. */
  onMove?: (to: HTMLElement, from: HTMLElement) => void
  /** Nothing qualified in that direction. Focus stayed put and nudged. */
  onEdge?: (at: HTMLElement, dir: Direction) => void
  /** Turns off the edge nudge and makes tracks jump. */
  reducedMotion?: () => boolean
  /** A [data-guide]'s destinations, the stops it hands focus to. */
  destinations?: (guide: HTMLElement) => readonly HTMLElement[]
  /**
   * How a track moves to its new place. The prototype's x tracks take `spring.quick` from the
   * tokens' CSS variables and its y tracks their own class's; a page without the variables names
   * its easings here.
   */
  transition?: (axis: 'x' | 'y') => string
}

const KEYS: Record<string, Direction> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
}

const box = (el: Element): Box => el.getBoundingClientRect()
const trapping = (el: Element, dir: Direction) =>
  (el.getAttribute('data-trap') ?? '').split(' ').includes(dir)
const groupOf = (el: Element) => el.closest<HTMLElement>('[data-group]')?.dataset.group ?? ''

/** 0.2u at the root's width: the edge nudge distance. */
const nudgeDistance = (root: HTMLElement) => (root.clientWidth / 100) * 0.2

export type SpatialNavigator = {
  /** Moves focus as if `dir` was pressed. Returns the newly focused element, if any. */
  move(dir: Direction): HTMLElement | null
  /** Re-applies track positions for the focused item (after a resize). */
  refresh(): void
  destroy(): void
}

export function createSpatialNavigator(
  root: HTMLElement,
  options: NavigatorOptions = {},
): SpatialNavigator {
  const memory = new Map<string, HTMLElement>()
  const reduced = () => options.reducedMotion?.() ?? false
  const items = () => [...root.querySelectorAll<HTMLElement>('[data-focusable]')]
  const current = () => {
    const active = document.activeElement
    return active instanceof HTMLElement && root.contains(active)
      ? active.closest<HTMLElement>('[data-focusable]')
      : null
  }

  /** The regions around `from` that keep focus in for `dir`. */
  const trapsOf = (from: HTMLElement, dir: Direction) => {
    const traps: HTMLElement[] = []
    for (let at = from.closest<HTMLElement>('[data-trap]'); at; ) {
      if (trapping(at, dir)) traps.push(at)
      at = at.parentElement?.closest<HTMLElement>('[data-trap]') ?? null
    }
    return traps
  }

  /**
   * Where focus goes when it enters a guide from outside: the outermost guide around `to` that
   * `from` isn't in hands it to its first mounted destination, as tvOS's focus guide does.
   */
  const guided = (from: HTMLElement, to: HTMLElement): HTMLElement => {
    let goal: HTMLElement | null = null
    for (let g = to.closest<HTMLElement>('[data-guide]'); g; ) {
      if (!g.contains(from)) {
        const first = options.destinations?.(g).find((d) => d.isConnected)
        if (first) goal = first
      }
      g = g.parentElement?.closest<HTMLElement>('[data-guide]') ?? null
    }
    return goal ?? to
  }

  const pick = (from: HTMLElement, dir: Direction): HTMLElement | 'trapped' | null => {
    const traps = trapsOf(from, dir)
    const inside = (el: Element) => traps.every((t) => t.contains(el))
    // a guide with somewhere to send focus is a target itself, as its frame is on tvOS
    const guides = options.destinations
      ? [...root.querySelectorAll<HTMLElement>('[data-guide]')].filter(
          (g) => !g.contains(from) && options.destinations?.(g).some((d) => d.isConnected),
        )
      : []
    const candidates = [...items(), ...guides].filter((el) => {
      if (el === from) return false
      if (!inside(el)) return false
      const isolated = el.closest('[data-isolate]')
      return !isolated || isolated.contains(from)
    })
    const a = box(from)
    const best = candidates[pickBest(dir, a, candidates.map(box))]
    if (best && options.destinations) {
      const to = guided(from, best)
      if (to !== best) return to
    }
    if (!best && traps.length > 0) {
      // nothing inside the trap that way: focus stays, as tvOS's does, without the edge's nudge
      const outside = items().some((el) => el !== from && !inside(el) && isAhead(dir, a, box(el)))
      if (outside) return 'trapped'
    }
    if (!best) {
      const guide = from.closest<HTMLElement>(`[data-go-${dir}]`)?.getAttribute(`data-go-${dir}`)
      if (!guide) return null
      const remembered = memory.get(guide)
      if (remembered?.isConnected) return remembered
      return root.querySelector<HTMLElement>(
        `[data-group="${CSS.escape(guide)}"] [data-focusable], [data-group="${CSS.escape(guide)}"][data-focusable]`,
      )
    }
    // re-entering a group restores where you left it, if that spot is in the pressed direction
    const g = groupOf(best)
    const remembered = g !== groupOf(from) ? memory.get(g) : undefined
    if (remembered?.isConnected && isAhead(dir, a, box(remembered))) return remembered
    return best
  }

  const scrollInto = (item: HTMLElement) => {
    for (
      let track = item.closest<HTMLElement>('[data-scroll]');
      track;
      track = track.parentElement?.closest<HTMLElement>('[data-scroll]') ?? null
    ) {
      const x = track.dataset.scroll === 'x'
      // a page's part lands as a whole: its outermost [data-kept] inside this track, else the item
      const el = keptFor(item, track) ?? item
      const rest = el !== item && el.dataset.kept === 'rest'
      const er = box(el)
      const tr = box(track)
      const parent = track.parentElement
      if (!parent) continue
      const itemCenter = x ? er.left + er.width / 2 - tr.left : er.top + er.height / 2 - tr.top
      const view = x ? parent.clientWidth : parent.clientHeight
      const total = x ? track.scrollWidth : track.scrollHeight
      const style = getComputedStyle(track)
      const pad = Number.parseFloat(x ? style.paddingLeft : style.paddingTop) || 0
      const stops = () =>
        Array.from(track.children, (c) => {
          const b = box(c as HTMLElement)
          return (x ? b.left - tr.left : b.top - tr.top) - pad
        })
      const offset = rest
        ? 0
        : track.dataset.keep === 'start'
          ? trackStart({
              itemCenter,
              width: x ? el.offsetWidth : el.offsetHeight,
              pad,
              view,
              total,
              stops: stops(),
            })
          : trackOffset({
              itemCenter,
              view,
              total,
              keep: Number(keepFor(el, track) ?? 0.5),
              clamp: !('center' in track.dataset),
            })
      // a row slides with spring.quick, snappier than the page's spring.base (the owner, 2026-10-30)
      track.style.transition = reduced()
        ? 'none'
        : options.transition
          ? options.transition(x ? 'x' : 'y')
          : x
            ? 'transform var(--duration-spring-quick) var(--ease-spring-quick)'
            : ''
      track.style.transform = x ? `translateX(${-offset}px)` : `translateY(${-offset}px)`
    }
  }

  const nudge = (el: HTMLElement, dir: Direction) => {
    if (reduced() || typeof el.animate !== 'function') return
    const d = nudgeDistance(root)
    const [x, y] = { right: [d, 0], left: [-d, 0], down: [0, d], up: [0, -d] }[dir]
    // `translate` composes with the focus scale on `scale`, so the two don't fight
    el.animate([{ translate: '0 0' }, { translate: `${x}px ${y}px` }, { translate: '0 0' }], {
      duration: 240,
      easing: 'ease-out',
    })
  }

  const move = (dir: Direction) => {
    const from = current()
    if (!from) {
      const first = root.querySelector<HTMLElement>('[data-initial]') ?? items()[0]
      first?.focus({ preventScroll: true })
      if (first) scrollInto(first)
      return first ?? null
    }
    const to = pick(from, dir)
    if (to === 'trapped') return null
    if (!to) {
      nudge(from, dir)
      options.onEdge?.(from, dir)
      return null
    }
    memory.set(groupOf(from), from)
    to.focus({ preventScroll: true })
    scrollInto(to)
    dropRing(from)
    options.onMove?.(to, from)
    return to
  }

  const onKeyDown = (e: KeyboardEvent) => {
    const dir = KEYS[e.key]
    if (!dir || e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return
    // text fields keep their arrow keys
    const target = e.target as HTMLElement
    if (target.closest('input, textarea, select, [contenteditable="true"]')) return
    e.preventDefault()
    move(dir)
  }
  const onFocusIn = (e: FocusEvent) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-focusable]')
    if (el) scrollInto(el)
  }

  root.addEventListener('keydown', onKeyDown)
  root.addEventListener('focusin', onFocusIn)
  return {
    move,
    refresh() {
      const el = current()
      if (el) scrollInto(el)
    },
    destroy() {
      root.removeEventListener('keydown', onKeyDown)
      root.removeEventListener('focusin', onFocusIn)
    },
  }
}

/** The outermost [data-kept] between the item and its track, the item's own included. */
function keptFor(el: HTMLElement, track: HTMLElement): HTMLElement | null {
  let kept: HTMLElement | null = null
  for (let at: HTMLElement | null = el; at && at !== track; at = at.parentElement)
    if (at.dataset.kept !== undefined) kept = at
  return kept
}

/**
 * The nearest [data-keep] from the item up to its track, the track's own included; a nested
 * track's keep is its own, so it's passed over.
 */
function keepFor(el: HTMLElement, track: HTMLElement): string | undefined {
  for (let at: HTMLElement | null = el; at && at !== track; at = at.parentElement)
    if (at.dataset.keep && !at.dataset.scroll) return at.dataset.keep
  return track.dataset.keep
}

/**
 * Ends the ring's fade on an item focus has left, so it goes at once. The ring is a box-shadow
 * (`--tv-focus-shadow`, `ring-focus`), on the item or inside it; reading its transitions
 * (`getAnimations`) flushes the blur's style change first, and finishing one jumps to its end.
 */
function dropRing(el: HTMLElement) {
  if (typeof el.getAnimations !== 'function') return
  for (const a of el.getAnimations({ subtree: true }))
    if (a instanceof CSSTransition && a.transitionProperty === 'box-shadow') a.finish()
}
