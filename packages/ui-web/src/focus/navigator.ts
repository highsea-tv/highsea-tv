// SPDX-License-Identifier: AGPL-3.0-only
// The DOM side of the spatial model. Markup contract (same as the reference board):
//   [data-focusable]           an item D-pad focus can land on (it also needs a tabindex)
//   [data-group="id"]          a row or region; the last focused item is remembered per group
//   [data-isolate]             a region entered only through a focus guide (a nav rail)
//   [data-go-up|down|left|right="group"]  a focus guide on an ancestor
//   [data-scroll="x|y"]        a track that moves by transform to keep focus in view
//   [data-keep="0.3"]          where in the viewport the track keeps focus (default 0.5); "start"
//                              keeps it in the track's first slot, an item always flush there
//   [data-center]              don't clamp the track at its ends
// While a row slides to bring focus into place, the focused item carries [data-settling], which
// holds back its focus styles (styles.css's focus-visible variant) until the slide ends.
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

  // the item whose focus styles wait for its row to finish sliding (the owner, 2026-10-30)
  let settling: { el: HTMLElement; timer: ReturnType<typeof setTimeout> } | null = null
  const settle = () => {
    if (!settling) return
    clearTimeout(settling.timer)
    delete settling.el.dataset.settling
    settling = null
  }
  const holdFocusStyles = (el: HTMLElement, track: HTMLElement) => {
    settle()
    const style = getComputedStyle(track)
    const props = style.transitionProperty.split(',').map((p) => p.trim())
    const durations = style.transitionDuration.split(',').map((d) => d.trim())
    const i = props.findIndex((p) => p === 'transform' || p === 'all')
    const ms = i < 0 ? 0 : parseTime(durations[i % durations.length] ?? '0s')
    if (ms <= 0) return
    el.dataset.settling = ''
    settling = { el, timer: setTimeout(settle, ms) }
  }

  // where each track was last put, and whether focus is moving along a row (only then does it wait)
  const offsets = new WeakMap<HTMLElement, number>()
  let sideways = false

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
              keep: Number(track.dataset.keep ?? 0.5),
              clamp: !('center' in track.dataset),
            })
      track.style.transition = reduced() ? 'none' : ''
      // Left or Right that slides the row holds the item's focus styles back until it stops; a row
      // already at its end, and moving between rows, show focus at once
      const moved = Math.abs(offset - (offsets.get(track) ?? 0)) >= 1
      if (x && sideways && moved && !reduced()) holdFocusStyles(el, track)
      offsets.set(track, offset)
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
    settle()
    // focus() runs focusin's scrollInto before this returns
    sideways = dir === 'left' || dir === 'right'
    to.focus({ preventScroll: true })
    scrollInto(to)
    sideways = false
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
      settle()
      root.removeEventListener('keydown', onKeyDown)
      root.removeEventListener('focusin', onFocusIn)
    },
  }
}

/** A CSS time (`0.3s`, `300ms`) in milliseconds. */
const parseTime = (t: string) =>
  (t.endsWith('ms') ? Number.parseFloat(t) : Number.parseFloat(t) * 1000) || 0

/** Plays the select pulse (brightness 1 → 1.35 → 1 over `duration.pulse`). */
export function pulse(el: HTMLElement, reducedMotion = false): void {
  if (reducedMotion || typeof el.animate !== 'function') return
  const peak = `brightness(${choreography.pulseBrightness})`
  el.animate([{ filter: 'brightness(1)' }, { filter: peak }, { filter: 'brightness(1)' }], {
    duration: durations.pulse,
    easing: 'ease-out',
  })
}
