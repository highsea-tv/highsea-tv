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

/**
 * An album's cover, square: a muted ground on the title's palette with one of a few abstract
 * motifs (rings, a disc over a band, stripes), so albums read as records rather than film posters.
 */
export function coverArt(title: string): string {
  const n = hash(`${title} cover`)
  const hue = n % 360
  const hue2 = (hue + 40 + ((n >> 7) % 80)) % 360
  const s = 600
  const ground =
    `<defs><linearGradient id="c" x1="0" y1="0" x2="1" y2="1">` +
    `<stop offset="0" stop-color="oklch(34% 0.06 ${hue})"/>` +
    `<stop offset="1" stop-color="oklch(20% 0.04 ${hue2})"/></linearGradient></defs>` +
    `<rect width="${s}" height="${s}" fill="url(#c)"/>`
  const ink = (light: number, o = 0.85) => `fill="oklch(${light}% 0.07 ${hue2})" opacity="${o}"`
  const cx = s * (0.35 + ((n >> 3) % 30) / 100)
  const cy = s * (0.35 + ((n >> 5) % 30) / 100)
  const motifs = [
    // rings
    [0.42, 0.32, 0.22, 0.12]
      .map(
        (r, i) =>
          `<circle cx="${cx}" cy="${cy}" r="${s * r}" fill="none" stroke="oklch(${78 - i * 8}% 0.06 ${hue2})" stroke-width="${s * 0.035}" opacity="0.7"/>`,
      )
      .join(''),
    // a disc over a band
    `<rect y="${s * 0.58}" width="${s}" height="${s * 0.16}" ${ink(48, 0.7)}/>` +
      `<circle cx="${cx}" cy="${s * 0.5}" r="${s * 0.24}" ${ink(84)}/>`,
    // stripes
    Array.from(
      { length: 6 },
      (_, i) =>
        `<rect x="${s * (0.1 + i * 0.14)}" y="${s * (0.18 + ((n >> i) % 4) * 0.05)}" width="${s * 0.07}" height="${s * 0.64}" rx="${s * 0.035}" ${ink(60 + i * 4, 0.75)}/>`,
    ).join(''),
  ]
  return svg(s, s, ground + motifs[n % motifs.length])
}

const xml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/**
 * A title's logo, as TMDB's logos are: the name as a wordmark on a transparent ground, in one of a
 * few treatments picked by the title (a wide uppercase sans, a serif, a condensed heavy face). Long
 * names break onto two lines, set left as the hero sets them. Each line is set to a width
 * estimated from its length, with its spacing adjusted to fit, so the box always fits the type.
 */
export function logoArt(title: string): string {
  const n = hash(`${title} logo`)
  const styles = [
    {
      family: 'Helvetica Neue, Arial, sans-serif',
      weight: 800,
      upper: true,
      track: 0.12,
      em: 0.72,
    },
    { family: 'Georgia, Times New Roman, serif', weight: 700, upper: false, track: 0, em: 0.6 },
    {
      family: 'Avenir Next Condensed, Arial Narrow, sans-serif',
      weight: 800,
      upper: true,
      track: 0.04,
      em: 0.56,
    },
  ] as const
  const st = styles[n % styles.length] as (typeof styles)[number]
  const text = st.upper ? title.toUpperCase() : title
  const words = text.split(' ')
  // two lines past 14 characters, split near the middle
  let lines = [text]
  if (text.length > 14 && words.length > 1) {
    let best = 1
    for (let i = 1; i < words.length; i++) {
      const a = words.slice(0, i).join(' ').length
      const b = words.slice(0, best).join(' ').length
      if (Math.abs(a - text.length / 2) < Math.abs(b - text.length / 2)) best = i
    }
    lines = [words.slice(0, best).join(' '), words.slice(best).join(' ')]
  }
  const size = 100
  const width = (l: string) => Math.round(l.length * size * (st.em + st.track))
  const w = Math.max(...lines.map(width))
  const h = Math.round(size * (lines.length * 1.05 + 0.15))
  const body = lines
    .map(
      (l, i) =>
        `<text x="0" y="${Math.round(size * (0.9 + i * 1.05))}" textLength="${width(l)}" lengthAdjust="spacing" font-family="${st.family}" font-weight="${st.weight}" font-size="${size}" fill="#f4f1ea">${xml(l)}</text>`,
    )
    .join('')
  return `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}">${body}</svg>`,
  )}`
}

/** A person's photo: a head-and-shoulders silhouette on the name's palette. */
export function portraitArt(name: string): string {
  const n = hash(name)
  const hue = n % 360
  const w = 400
  const h = 600
  return svg(
    w,
    h,
    `<defs><linearGradient id="p" x1="0" y1="0" x2="0" y2="1">` +
      `<stop offset="0" stop-color="oklch(42% 0.05 ${hue})"/>` +
      `<stop offset="1" stop-color="oklch(24% 0.04 ${hue})"/></linearGradient></defs>` +
      `<rect width="${w}" height="${h}" fill="url(#p)"/>` +
      `<circle cx="${w / 2}" cy="${h * 0.4}" r="${w * 0.2}" fill="oklch(70% 0.03 ${hue})" opacity="0.55"/>` +
      `<path d="M${w * 0.12} ${h} C${w * 0.12} ${h * 0.72} ${w * 0.3} ${h * 0.64} ${w / 2} ${h * 0.64} S${w * 0.88} ${h * 0.72} ${w * 0.88} ${h} Z" fill="oklch(70% 0.03 ${hue})" opacity="0.55"/>`,
  )
}
