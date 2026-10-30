// SPDX-License-Identifier: AGPL-3.0-only
// A picture's most vibrant colour, for a bloom behind its card (the owner, 2026-10-30): the
// picture drawn small on a canvas, its pixels grouped by hue, leaving out the near-black, the
// near-white and the grey; the group with the most colourful weight wins, averaged, then lifted
// to a colour that reads as a glow on the dark background. Same-origin pictures only (a canvas
// can't read a cross-origin one without CORS), which the apps' artwork is, served by highsea.
// In the apps the server should work the colour out once, when it caches the artwork, and send it
// with the item (as art.palette or the like), so every client shows the same colour without
// reading the image (the owner, 2026-10-30); this reading in the page is the prototype's stand-in.
import { useEffect, useState } from 'react'

const W = 48
const H = 27
const BINS = 24

const cache = new Map<string, Promise<string | null>>()

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return [0, 0, l]
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  const h =
    max === r
      ? ((g - b) / d + (g < b ? 6 : 0)) / 6
      : max === g
        ? ((b - r) / d + 2) / 6
        : ((r - g) / d + 4) / 6
  return [h, s, l]
}

/** The most vibrant hue in an image's pixels, as `h s l` in 0–1, or null when it's all grey. */
export function pickVibrant(data: Uint8ClampedArray): [number, number, number] | null {
  const bins = Array.from({ length: BINS }, () => ({ w: 0, h: 0, s: 0, l: 0 }))
  for (let i = 0; i < data.length; i += 4) {
    if ((data[i + 3] ?? 0) < 128) continue
    const [h, s, l] = rgbToHsl(
      (data[i] ?? 0) / 255,
      (data[i + 1] ?? 0) / 255,
      (data[i + 2] ?? 0) / 255,
    )
    // not black, not white, not grey
    if (l < 0.12 || l > 0.9 || s < 0.08) continue
    // colourful and mid-light count most
    const w = s * (1 - Math.abs(l - 0.5) * 2)
    const bin = bins[Math.floor(h * BINS) % BINS]
    if (!bin) continue
    bin.w += w
    bin.h += h * w
    bin.s += s * w
    bin.l += l * w
  }
  const best = bins.reduce((a, b) => (b.w > a.w ? b : a))
  if (best.w <= 0) return null
  return [best.h / best.w, best.s / best.w, best.l / best.w]
}

/** A picked colour lifted to glow on the dark background: saturated, and neither dim nor pale. */
export function glow([h, s, l]: [number, number, number]): string {
  const sat = Math.max(s, 0.5) * 100
  const light = Math.min(Math.max(l, 0.4), 0.55) * 100
  return `hsl(${Math.round(h * 360)} ${Math.round(sat)}% ${Math.round(light)}%)`
}

export function vibrantColor(src: string): Promise<string | null> {
  const known = cache.get(src)
  if (known) return known
  const p = new Promise<string | null>((resolve) => {
    const img = new Image()
    img.decoding = 'async'
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas')
        canvas.width = W
        canvas.height = H
        const ctx = canvas.getContext('2d', { willReadFrequently: true })
        if (!ctx) return resolve(null)
        ctx.drawImage(img, 0, 0, W, H)
        const picked = pickVibrant(ctx.getImageData(0, 0, W, H).data)
        resolve(picked ? glow(picked) : null)
      } catch {
        // a tainted canvas (a cross-origin picture) can't be read
        resolve(null)
      }
    }
    img.onerror = () => resolve(null)
    img.src = src
  })
  cache.set(src, p)
  return p
}

/** Each picture's glow colour, by its source, filled in as they're read. */
export function useVibrant(srcs: string[]): Record<string, string | null> {
  const [colors, setColors] = useState<Record<string, string | null>>({})
  const key = srcs.join('\n')
  useEffect(() => {
    let live = true
    for (const src of key.split('\n')) {
      if (!src) continue
      vibrantColor(src).then((c) => {
        if (live) setColors((all) => (src in all ? all : { ...all, [src]: c }))
      })
    }
    return () => {
      live = false
    }
  }, [key])
  return colors
}
