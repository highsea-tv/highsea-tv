// SPDX-License-Identifier: AGPL-3.0-only
// The mark as plain filled shapes, with the swells as real gaps instead of a mask. For tools that
// don't support SVG masks (Icon Composer) and for layered artwork where the cuts must be see-through.
import { markGeometry } from './mark.ts'

type Point = [number, number]

/** Samples one swell's centerline with its unit normal (pointing down). */
function swell(y: number, samples: number): { p: Point; n: Point }[] {
  // the two cubics of `swellPath`, the second reflected by `s`
  const curves: [Point, Point, Point, Point][] = [
    [
      [1, y],
      [8.7, y - 4.4],
      [16.3, y - 4.4],
      [24, y],
    ],
    [
      [24, y],
      [31.7, y + 4.4],
      [39.3, y + 4.4],
      [47, y],
    ],
  ]
  const out: { p: Point; n: Point }[] = []
  curves.forEach(([a, b, c, d], k) => {
    for (let i = k === 0 ? 0 : 1; i <= samples; i++) {
      const t = i / samples
      const u = 1 - t
      const p: Point = [
        u * u * u * a[0] + 3 * u * u * t * b[0] + 3 * u * t * t * c[0] + t * t * t * d[0],
        u * u * u * a[1] + 3 * u * u * t * b[1] + 3 * u * t * t * c[1] + t * t * t * d[1],
      ]
      const dx = 3 * u * u * (b[0] - a[0]) + 6 * u * t * (c[0] - b[0]) + 3 * t * t * (d[0] - c[0])
      const dy = 3 * u * u * (b[1] - a[1]) + 6 * u * t * (c[1] - b[1]) + 3 * t * t * (d[1] - c[1])
      const len = Math.hypot(dx, dy)
      out.push({ p, n: [-dy / len, dx / len] })
    }
  })
  return out
}

/** One edge of a stroked swell, extended flat past the disc on both sides. */
function edge(y: number, offset: number, samples: number): Point[] {
  const pts = swell(y, samples).map(
    ({ p, n }): Point => [p[0] + n[0] * offset, p[1] + n[1] * offset],
  )
  const first = pts[0] as Point
  const last = pts[pts.length - 1] as Point
  return [[-8, first[1]], ...pts, [56, last[1]]]
}

/** Sutherland–Hodgman against a convex polygon (the disc). */
function clip(subject: Point[], convex: Point[], center: Point): Point[] {
  let out = subject
  for (let i = 0; i < convex.length; i++) {
    const a = convex[i] as Point
    const b = convex[(i + 1) % convex.length] as Point
    const side = (p: Point) => (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0])
    const inside = Math.sign(side(center))
    const input = out
    out = []
    for (let j = 0; j < input.length; j++) {
      const p = input[j] as Point
      const q = input[(j + 1) % input.length] as Point
      const sp = side(p) * inside
      const sq = side(q) * inside
      if (sp >= 0) out.push(p)
      if (sp >= 0 !== sq >= 0) {
        const t = sp / (sp - sq)
        out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t])
      }
    }
  }
  return out
}

/**
 * The mark's three pieces (cap, band, base) as path data on the 48-unit grid. Curves are
 * flattened finely enough for 1024px artwork.
 */
export function markOutline({ small = false, samples = 96, segments = 360 } = {}): string[] {
  const { disc, swellY } = markGeometry
  const h = (small ? markGeometry.cutSmall : markGeometry.cut) / 2
  const circle = Array.from({ length: segments }, (_, i): Point => {
    const a = (i / segments) * Math.PI * 2
    return [disc.cx + disc.r * Math.cos(a), disc.cy + disc.r * Math.sin(a)]
  })
  const [y1, y2] = swellY
  const top1 = edge(y1, -h, samples)
  const bottom1 = edge(y1, h, samples)
  const top2 = edge(y2, -h, samples)
  const bottom2 = edge(y2, h, samples)
  const pieces: Point[][] = [
    [...top1, [56, -8], [-8, -8]],
    [...bottom1, ...top2.toReversed()],
    [...bottom2, [56, 56], [-8, 56]],
  ]
  const f = (n: number) => String(Math.round(n * 1000) / 1000)
  return pieces.map((piece) => {
    const pts = clip(piece, circle, [disc.cx, disc.cy])
    return `M${pts.map(([x, y]) => `${f(x)} ${f(y)}`).join('L')}Z`
  })
}
