// SPDX-License-Identifier: AGPL-3.0-only

/** A color with 0–255 channels (unrounded) and 0–1 alpha. */
export type Rgba = { r: number; g: number; b: number; a: number }

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))
const clamp255 = (v: number) => Math.min(255, Math.max(0, v))

/**
 * Parses the color syntaxes tokens are written in: `#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa`,
 * `rgb(r g b / a)` and the legacy comma form. Throws on anything else.
 */
export function parseColor(input: string): Rgba {
  const s = input.trim().toLowerCase()
  const hex = /^#([0-9a-f]{3,8})$/.exec(s)?.[1]
  if (hex && [3, 4, 6, 8].includes(hex.length)) {
    const full = hex.length <= 4 ? [...hex].map((c) => c + c).join('') : hex
    const n = (i: number) => Number.parseInt(full.slice(i, i + 2), 16)
    return { r: n(0), g: n(2), b: n(4), a: full.length === 8 ? n(6) / 255 : 1 }
  }
  const fn = /^rgba?\((.*)\)$/.exec(s)?.[1]
  if (fn) {
    const parts = fn
      .replace(/\s*\/\s*/, ' / ')
      .split(/[\s,]+/)
      .filter(Boolean)
    const slash = parts.indexOf('/')
    const chans = slash === -1 ? parts.slice(0, 3) : parts.slice(0, slash)
    const alpha = slash === -1 ? parts[3] : parts[slash + 1]
    if (chans.length === 3) {
      const num = (v: string, max: number) =>
        v.endsWith('%') ? (Number(v.slice(0, -1)) / 100) * max : Number(v)
      const [r, g, b] = chans.map((c) => num(c, 255)) as [number, number, number]
      const a = alpha === undefined ? 1 : num(alpha, 1)
      if ([r, g, b, a].every(Number.isFinite)) return { r, g, b, a: clamp01(a) }
    }
  }
  throw new Error(`Unsupported color: ${input}`)
}

const hex2 = (v: number) => Math.round(clamp255(v)).toString(16).padStart(2, '0')

/** `#rrggbb`, or `#rrggbbaa` when translucent. */
export function formatHex(c: Rgba): string {
  const base = `#${hex2(c.r)}${hex2(c.g)}${hex2(c.b)}`
  return c.a >= 1 ? base : `${base}${hex2(c.a * 255)}`
}

/** Hex when opaque; `rgb(r g b / a)` when translucent, which reads better in CSS. */
export function formatCss(c: Rgba): string {
  if (c.a >= 1) return formatHex(c)
  const ch = (v: number) => Math.round(clamp255(v))
  return `rgb(${ch(c.r)} ${ch(c.g)} ${ch(c.b)} / ${Number(c.a.toFixed(3))})`
}

export const withAlpha = (c: Rgba, a: number): Rgba => ({ ...c, a })

// ---- OKLab (Björn Ottosson), the space CSS color-mix() uses for `in oklab`

const toLinear = (v: number) => {
  const c = v / 255
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}
const fromLinear = (v: number) =>
  255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * Math.max(0, v) ** (1 / 2.4) - 0.055)

export type Oklab = { l: number; a: number; b: number; alpha: number }

export function toOklab(c: Rgba): Oklab {
  const r = toLinear(c.r)
  const g = toLinear(c.g)
  const b = toLinear(c.b)
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  return {
    l: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
    alpha: c.a,
  }
}

export function fromOklab(o: Oklab): Rgba {
  const l = (o.l + 0.3963377774 * o.a + 0.2158037573 * o.b) ** 3
  const m = (o.l - 0.1055613458 * o.a - 0.0638541728 * o.b) ** 3
  const s = (o.l - 0.0894841775 * o.a - 1.291485548 * o.b) ** 3
  return {
    r: clamp255(fromLinear(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s)),
    g: clamp255(fromLinear(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s)),
    b: clamp255(fromLinear(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s)),
    a: o.alpha,
  }
}

/** Perceptual lightness (OKLab L, 0–1). */
export const lightness = (c: Rgba) => toOklab(c).l

/** Returns `c` with its OKLab lightness set to `l`, keeping hue and chroma. */
export function withLightness(c: Rgba, l: number): Rgba {
  return fromOklab({ ...toOklab(c), l: clamp01(l) })
}

/**
 * `color-mix(in oklab, a p, b)`: `p` is the share of `a` (0–1). Alpha is premultiplied, as in
 * CSS, so mixing with transparent keeps the hue and only lowers alpha.
 */
export function mix(a: Rgba, b: Rgba, p: number): Rgba {
  const A = toOklab(a)
  const B = toOklab(b)
  const alpha = A.alpha * p + B.alpha * (1 - p)
  if (alpha === 0) return { r: 0, g: 0, b: 0, a: 0 }
  const ch = (x: number, y: number) => (x * A.alpha * p + y * B.alpha * (1 - p)) / alpha
  return fromOklab({ l: ch(A.l, B.l), a: ch(A.a, B.a), b: ch(A.b, B.b), alpha })
}

export const TRANSPARENT: Rgba = { r: 0, g: 0, b: 0, a: 0 }

/**
 * Paints `layers` in order over an opaque `base`, the way a browser composites them, and rounds
 * to 8-bit channels. This is what the reference board measured with its 1×1 canvas probe.
 */
export function composite(base: Rgba, ...layers: Rgba[]): Rgba {
  let { r, g, b } = base
  for (const c of layers) {
    r = c.r * c.a + r * (1 - c.a)
    g = c.g * c.a + g * (1 - c.a)
    b = c.b * c.a + b * (1 - c.a)
  }
  return { r: Math.round(r), g: Math.round(g), b: Math.round(b), a: 1 }
}
