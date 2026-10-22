// SPDX-License-Identifier: AGPL-3.0-only
// The DOM side of the spatial model. Markup contract (same as the reference board):
//   [data-focusable]           an item D-pad focus can land on (it also needs a tabindex)
//   [data-group="id"]          a row or region; the last focused item is remembered per group
//   [data-isolate]             a region entered only through a focus guide (a nav rail)
//   [data-go-up|down|left|right="group"]  a focus guide on an ancestor
//   [data-scroll="x|y"]        a track that moves by transform to keep focus in view
//   [data-keep="0.3"]          where in the viewport the track keeps focus (default 0.5)
//   [data-center]              don't clamp the track at its ends
import { choreography, durations } from '@highsea-tv/tokens'
import { type Box, type Direction, isAhead, pickBest, trackOffset } from './spatial.ts'

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
      const offset = trackOffset({
        itemCenter: x ? er.left + er.width / 2 - tr.left : er.top + er.height / 2 - tr.top,
        view: x ? parent.clientWidth : parent.clientHeight,
        total: x ? track.scrollWidth : track.scrollHeight,
        keep: Number(track.dataset.keep ?? 0.5),
        clamp: !('center' in track.dataset),
      })
      track.style.transition = reduced() ? 'none' : ''
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

/** Plays the select pulse (brightness 1 → 1.35 → 1 over `duration.pulse`). */
export function pulse(el: HTMLElement, reducedMotion = false): void {
  if (reducedMotion || typeof el.animate !== 'function') return
  const peak = `brightness(${choreography.pulseBrightness})`
  el.animate([{ filter: 'brightness(1)' }, { filter: peak }, { filter: 'brightness(1)' }], {
    duration: durations.pulse,
    easing: 'ease-out',
  })
}
