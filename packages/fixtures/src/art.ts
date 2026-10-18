// SPDX-License-Identifier: AGPL-3.0-only
// Placeholder artwork drawn as SVG, so the workbench needs no network and no licensed images.
// Each title gets a stable, muted palette: a sky gradient, a low sun and layered hills.

function hash(s: string): number {
  let h = 2166136261
  for (const c of s) h = Math.imul(h ^ (c.codePointAt(0) ?? 0), 16777619)
  return h >>> 0
}

const svg = (w: number, h: number, body: string) =>
  `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid slice">${body}</svg>`,
  )}`

function scene(seed: string, w: number, h: number): string {
  const n = hash(seed)
  const hue = n % 360
  const hue2 = (hue + 30 + ((n >> 9) % 60)) % 360
  const sunX = 0.2 + ((n >> 3) % 60) / 100
  const sunY = 0.3 + ((n >> 5) % 20) / 100
  const hill = (k: number, y: number, light: number) => {
    const a = h * y
    const b = h * (y - 0.06 - ((n >> (k * 3)) % 8) / 100)
    return `<path d="M0 ${a} C${w * 0.3} ${b} ${w * 0.6} ${a + h * 0.05} ${w} ${b} V${h} H0Z" fill="oklch(${light}% 0.04 ${hue2})"/>`
  }
  return svg(
    w,
    h,
    `<defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1">` +
      `<stop offset="0" stop-color="oklch(30% 0.05 ${hue})"/>` +
      `<stop offset="1" stop-color="oklch(62% 0.08 ${hue2})"/></linearGradient></defs>` +
      `<rect width="${w}" height="${h}" fill="url(#s)"/>` +
      `<circle cx="${w * sunX}" cy="${h * sunY}" r="${Math.min(w, h) * 0.14}" fill="oklch(90% 0.05 ${hue2})" opacity="0.85"/>` +
      hill(1, 0.62, 34) +
      hill(2, 0.74, 24) +
      hill(3, 0.86, 15),
  )
}

export const posterArt = (title: string) => scene(title, 400, 600)
export const stillArt = (title: string) => scene(`${title} still`, 640, 360)
export const backdropArt = (title: string) => scene(`${title} backdrop`, 1920, 1080)
