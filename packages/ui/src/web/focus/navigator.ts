// SPDX-License-Identifier: AGPL-3.0-only
// The DOM side of the spatial model. Markup contract (same as the reference board):
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
// The item focus leaves drops its ring at once rather than easing it out, while its scale and
// colours ease back as before and the item gaining focus eases in (the owner, 2026-10-30).
import { choreography, durations } from '@highsea-tv/tokens'
import { type Box, type Direction, isAhead, pickBest, trackOffset, trackStart } from './spatial.ts'

export type NavigatorOptions = {
  /** Focus moved by an arrow key. Play `navigate` here. */
  onMove?: (to: HTMLElement, from: HTMLElement) => void
  /** Nothing qualified in that direction. Focus stayed put and nudged. */
  onEdge?: (at: HTMLElement, dir: Direction) => void
  /** Turns off the edge nudge and makes tracks jump. */
  reducedMotion?: () => boolean
}

const KEYS: Record<string, Direction> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
}

const box = (el: Element): Box => el.getBoundingClientRect()
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

  const pick = (from: HTMLElement, dir: Direction): HTMLElement | null => {
    const candidates = items().filter((el) => {
      if (el === from) return false
      const isolated = el.closest('[data-isolate]')
      return !isolated || isolated.contains(from)
    })
    const a = box(from)
    const best = candidates[pickBest(dir, a, candidates.map(box))]
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

  const scrollInto = (el: HTMLElement) => {
    for (
      let track = el.closest<HTMLElement>('[data-scroll]');
      track;
      track = track.parentElement?.closest<HTMLElement>('[data-scroll]') ?? null
    ) {
      const x = track.dataset.scroll === 'x'
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
      const offset =
        track.dataset.keep === 'start'
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

/** Plays the select pulse (brightness 1 → 1.35 → 1 over `duration.pulse`). */
export function pulse(el: HTMLElement, reducedMotion = false): void {
  if (reducedMotion || typeof el.animate !== 'function') return
  const peak = `brightness(${choreography.pulseBrightness})`
  el.animate([{ filter: 'brightness(1)' }, { filter: peak }, { filter: 'brightness(1)' }], {
    duration: durations.pulse,
    easing: 'ease-out',
  })
}
