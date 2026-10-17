// SPDX-License-Identifier: AGPL-3.0-only
// The spatial focus model for TV and arrow-key navigation:
// docs/design-language/platforms/tv.md#spatial-focus-model. The reference implementation is the
// focus engine in design/explorations/shared/board.js; this file must behave identically.

export type Direction = 'up' | 'down' | 'left' | 'right'

export type Box = { left: number; top: number; width: number; height: number }

const center = (r: Box): [number, number] => [r.left + r.width / 2, r.top + r.height / 2]
const right = (r: Box) => r.left + r.width
const bottom = (r: Box) => r.top + r.height
const horizontal = (dir: Direction) => dir === 'left' || dir === 'right'

/** `b`'s center is more than 2px past `a`'s center in the pressed direction. */
export function isAhead(dir: Direction, a: Box, b: Box): boolean {
  const [ax, ay] = center(a)
  const [bx, by] = center(b)
  if (dir === 'right') return bx > ax + 2
  if (dir === 'left') return bx < ax - 2
  if (dir === 'down') return by > ay + 2
  return by < ay - 2
}

/**
 * A valid candidate is ahead and lines up: left/right need a shared vertical band, so focus never
 * slides diagonally into another region; up/down accept horizontal overlap or a 45° cone.
 */
export function isCandidate(dir: Direction, a: Box, b: Box): boolean {
  if (!isAhead(dir, a, b)) return false
  if (horizontal(dir)) return b.top < bottom(a) && bottom(b) > a.top
  if (b.left < right(a) && right(b) > a.left) return true
  const [ax, ay] = center(a)
  const [bx, by] = center(b)
  return Math.abs(by - ay) >= Math.abs(bx - ax)
}

/** Edge gap along the axis plus the orthogonal center offset (×3 for left/right). Lower wins. */
export function score(dir: Direction, a: Box, b: Box): number {
  const gap = horizontal(dir)
    ? Math.max(0, dir === 'right' ? b.left - right(a) : a.left - right(b))
    : Math.max(0, dir === 'down' ? b.top - bottom(a) : a.top - bottom(b))
  const [ax, ay] = center(a)
  const [bx, by] = center(b)
  const orth = horizontal(dir) ? Math.abs(by - ay) : Math.abs(bx - ax)
  return gap + orth * (horizontal(dir) ? 3 : 1)
}

/** Index of the best candidate, or -1 when nothing qualifies. */
export function pickBest(dir: Direction, from: Box, boxes: readonly Box[]): number {
  let best = -1
  let bestScore = Number.POSITIVE_INFINITY
  boxes.forEach((b, i) => {
    if (!isCandidate(dir, from, b)) return
    const s = score(dir, from, b)
    if (s < bestScore) {
      best = i
      bestScore = s
    }
  })
  return best
}

/**
 * Where a track should sit to keep an item at `keep` of the viewport (0.3 for rows, 0.32 for the
 * row stack). Positions are item centers relative to the track, so in-flight transforms and focus
 * scaling don't drift. Tracks clamp at both ends unless `clamp` is false (centered carousels).
 */
export function trackOffset({
  itemCenter,
  view,
  total,
  keep,
  clamp = true,
}: {
  itemCenter: number
  view: number
  total: number
  keep: number
  clamp?: boolean
}): number {
  const target = itemCenter - view * keep
  return clamp ? Math.min(Math.max(0, target), Math.max(0, total - view)) : target
}
