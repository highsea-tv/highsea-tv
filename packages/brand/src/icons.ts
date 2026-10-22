// SPDX-License-Identifier: AGPL-3.0-only
// App icons, favicons, TV banners and social images: geometry and the full output list.
// docs/brand/logo.md#app-icons
import { defaultTheme } from '@highsea-tv/tokens'
import { lockupBox, lockupElements } from './logo.ts'
import { MARK_GRID, MARK_SMALL_BELOW, type MarkPaint, markElements } from './mark.ts'
import { taglineOutline } from './wordmark-data.ts'

/** The reference board's `--icon-bg`: `radial-gradient(circle at 50% 28%, #2c2c30, #0f0f11 72%)`. */
export const ICON_BG = { from: '#2c2c30', to: '#0f0f11', cx: 0.5, cy: 0.28, stop: 0.72 } as const
/** Mark size as a share of the icon's visible shape. */
export const ICON_MARK = 0.58
/** Corner radius of shaped icons, as a share of their side. */
export const ICON_RADIUS = 0.225
const HAIRLINE = 'rgb(255 255 255 / 0.07)'

const n4 = (n: number) => Math.round(n * 1e4) / 1e4

function background(w: number, h: number, id: string, x = 0, y = 0, rx = 0) {
  const cx = x + w * ICON_BG.cx
  const cy = y + h * ICON_BG.cy
  // CSS `circle` defaults to farthest-corner
  const r = Math.hypot(Math.max(cx - x, x + w - cx), Math.max(cy - y, y + h - cy))
  return {
    defs: `<radialGradient id="${id}" gradientUnits="userSpaceOnUse" cx="${n4(cx)}" cy="${n4(cy)}" r="${n4(r)}"><stop offset="0" stop-color="${ICON_BG.from}"/><stop offset="${ICON_BG.stop}" stop-color="${ICON_BG.to}"/></radialGradient>`,
    shape: `<rect x="${n4(x)}" y="${n4(y)}" width="${n4(w)}" height="${n4(h)}"${rx ? ` rx="${n4(rx)}"` : ''} fill="url(#${id})"/>`,
  }
}

/** The mark centered at (cx, cy) with box side `d`. Switches to the small cut below 24px. */
function mark(cx: number, cy: number, d: number, paint: MarkPaint = 'bone', id = 'm') {
  const small = d < MARK_SMALL_BELOW
  return `<g transform="translate(${n4(cx - d / 2)} ${n4(cy - d / 2)}) scale(${n4(d / MARK_GRID)})">${markElements({ paint, small, id })}</g>`
}

function doc(w: number, h: number, body: string) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>`
}

export type IconKind =
  /** Full-bleed square; the platform applies its own mask (iOS, Android, maskable PWA). */
  | 'tile'
  /** Rounded square with transparent corners and a hairline (favicons, PWA, webOS). */
  | 'shaped'
  /** Shaped, inset by 1/16 so it sits beside other desktop icons (Windows, Linux). */
  | 'desktop'
  /** Apple's macOS template: an 824/1024 rounded square with a drop shadow. */
  | 'macos'

/** A square app icon at `size` px. */
export function iconSvg(kind: IconKind, size: number): string {
  const s = size
  if (kind === 'tile') {
    const bg = background(s, s, 'bg')
    return doc(s, s, `<defs>${bg.defs}</defs>${bg.shape}${mark(s / 2, s / 2, s * ICON_MARK)}`)
  }
  if (kind === 'macos') {
    const k = s / 1024
    const x = 100 * k
    const side = 824 * k
    const rx = 185.4 * k
    const bg = background(side, side, 'bg', x, x, rx)
    // the shadow is its own layer: filtering the tile itself would band its gradient
    const shadow = `<filter id="sh" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="${n4(10 * k)}"/></filter>`
    const under = `<rect x="${n4(x)}" y="${n4(x + 10 * k)}" width="${n4(side)}" height="${n4(side)}" rx="${n4(rx)}" fill="#000" fill-opacity="0.3" filter="url(#sh)"/>`
    return doc(
      s,
      s,
      `<defs>${bg.defs}${shadow}</defs>${under}${bg.shape}${mark(s / 2, s / 2, side * ICON_MARK)}`,
    )
  }
  const inset = kind === 'desktop' ? s / 16 : 0
  const side = s - inset * 2
  const bg = background(side, side, 'bg', inset, inset, side * ICON_RADIUS)
  const sw = Math.max(1, s / 128)
  const line = `<rect x="${n4(inset + sw / 2)}" y="${n4(inset + sw / 2)}" width="${n4(side - sw)}" height="${n4(side - sw)}" rx="${n4(side * ICON_RADIUS - sw / 2)}" fill="none" stroke="${HAIRLINE}" stroke-width="${n4(sw)}"/>`
  return doc(
    s,
    s,
    `<defs>${bg.defs}</defs>${bg.shape}${line}${mark(s / 2, s / 2, side * ICON_MARK)}`,
  )
}

/** The mark alone on a transparent square, at `scale` of the canvas. */
export function markOnlySvg(size: number, scale: number, paint: MarkPaint = 'bone'): string {
  return doc(size, size, mark(size / 2, size / 2, size * scale, paint))
}

/** Background only, for layered icons. */
export function backgroundSvg(w: number, h: number): string {
  const bg = background(w, h, 'bg')
  return doc(w, h, `<defs>${bg.defs}</defs>${bg.shape}`)
}

/** The lockup centered on a canvas, `width` as a share of the canvas width. */
export function bannerSvg(
  w: number,
  h: number,
  width: number,
  { background: withBg = true, tagline = false } = {},
): string {
  const box = lockupBox()
  const em = (w * width) / ((box.x1 - box.x0) / 100)
  const k = em / 100
  const lockH = (box.y1 - box.y0) * k
  const tagSize = em * 0.36
  const tagGap = em * 0.5
  const t = taglineOutline
  const tagH = (t.ink.y1 - t.ink.y0) * (tagSize / 100)
  const total = lockH + (tagline ? tagGap + tagH : 0)
  const top = (h - total) / 2
  const lx = (w - (box.x1 - box.x0) * k) / 2 - box.x0 * k
  const ly = top - box.y0 * k
  const lockup = `<g transform="translate(${n4(lx)} ${n4(ly)}) scale(${n4(k)})">${lockupElements({ id: 'l', small: em * 1.15 < MARK_SMALL_BELOW })}</g>`
  let tag = ''
  if (tagline) {
    const tk = tagSize / 100
    const tx = (w - (t.ink.x1 - t.ink.x0) * tk) / 2 - t.ink.x0 * tk
    const ty = top + lockH + tagGap - t.ink.y0 * tk
    tag = `<path transform="translate(${n4(tx)} ${n4(ty)}) scale(${n4(tk)})" fill="${defaultTheme.colors['text-2']}" d="${t.paths[0]}"/>`
  }
  const bg = withBg ? background(w, h, 'bg') : null
  return doc(w, h, `${bg ? `<defs>${bg.defs}</defs>${bg.shape}` : ''}${lockup}${tag}`)
}

export type ImageSpec = {
  file: string
  width: number
  height: number
  /** Opaque images are written without an alpha channel (App Store icons must not have one). */
  opaque: boolean
  svg: () => string
}

export type ContainerSpec = {
  file: string
  format: 'ico' | 'icns'
  /** ICO: pixel sizes. ICNS: [type, pixel size]. */
  entries: (number | [string, number])[]
  svg: (size: number) => string
}

const img = (
  file: string,
  width: number,
  height: number,
  opaque: boolean,
  svg: () => string,
): ImageSpec => ({ file, width, height, opaque, svg })

const sq = (file: string, size: number, opaque: boolean, svg: (s: number) => string) =>
  img(file, size, size, opaque, () => svg(size))

/** Adaptive icons show the middle 72 of 108 dp; the mark keeps the board's 58% of that. */
const ADAPTIVE_MARK = (ICON_MARK * 72) / 108

/** Every raster the build writes, under `assets/icons/`. */
export const IMAGES: ImageSpec[] = [
  // iOS / iPadOS (Expo `ios.icon`): one 1024 image per appearance
  sq('ios/icon.png', 1024, true, (s) => iconSvg('tile', s)),
  sq('ios/icon-dark.png', 1024, false, (s) => markOnlySvg(s, ICON_MARK)),
  img('ios/icon-tinted.png', 1024, 1024, true, () =>
    doc(
      1024,
      1024,
      `<rect width="1024" height="1024"/>${mark(512, 512, 1024 * ICON_MARK, { solid: '#fff' })}`,
    ),
  ),
  // Android (Expo `android.adaptiveIcon`)
  sq('android/adaptive-foreground.png', 1024, false, (s) => markOnlySvg(s, ADAPTIVE_MARK)),
  sq('android/adaptive-background.png', 1024, true, (s) => backgroundSvg(s, s)),
  sq('android/adaptive-monochrome.png', 1024, false, (s) =>
    markOnlySvg(s, ADAPTIVE_MARK, { solid: '#fff' }),
  ),
  sq('android/play-store.png', 512, true, (s) => iconSvg('tile', s)),
  // macOS
  sq('macos/icon-1024.png', 1024, false, (s) => iconSvg('macos', s)),
  // Desktop (Tauri bundle icons; macOS uses icon.icns)
  sq('desktop/32x32.png', 32, false, (s) => iconSvg('desktop', s)),
  sq('desktop/128x128.png', 128, false, (s) => iconSvg('desktop', s)),
  sq('desktop/128x128@2x.png', 256, false, (s) => iconSvg('desktop', s)),
  sq('desktop/icon.png', 512, false, (s) => iconSvg('desktop', s)),
  // Web
  sq('web/apple-touch-icon.png', 180, true, (s) => iconSvg('tile', s)),
  sq('web/icon-192.png', 192, false, (s) => iconSvg('shaped', s)),
  sq('web/icon-512.png', 512, false, (s) => iconSvg('shaped', s)),
  sq('web/icon-maskable-512.png', 512, true, (s) => iconSvg('tile', s)),
  // tvOS lives in the asset catalog: see apple.ts
  // Android TV / Google TV launcher banner
  img('android-tv/banner.png', 320, 180, true, () => bannerSvg(320, 180, 0.64)),
  img('android-tv/banner-xhdpi.png', 1280, 720, true, () => bannerSvg(1280, 720, 0.64)),
  // LG webOS (appinfo.json icon / largeIcon)
  sq('webos/icon-80.png', 80, false, (s) => iconSvg('shaped', s)),
  sq('webos/icon-130.png', 130, false, (s) => iconSvg('shaped', s)),
  // Samsung Tizen
  img('tizen/icon.png', 512, 423, true, () => {
    const bg = background(512, 423, 'bg')
    return doc(512, 423, `<defs>${bg.defs}</defs>${bg.shape}${mark(256, 211.5, 423 * ICON_MARK)}`)
  }),
  // Link previews
  img('social/og.png', 1200, 630, true, () => bannerSvg(1200, 630, 0.42, { tagline: true })),
  // Splash (Expo `splash.image` on `bg`)
  sq('splash/mark.png', 1024, false, (s) => markOnlySvg(s, 1)),
]

export const CONTAINERS: ContainerSpec[] = [
  {
    file: 'web/favicon.ico',
    format: 'ico',
    entries: [16, 32, 48],
    svg: (s) => iconSvg('shaped', s),
  },
  {
    file: 'desktop/icon.ico',
    format: 'ico',
    entries: [16, 24, 32, 48, 64, 256],
    svg: (s) => iconSvg('desktop', s),
  },
  {
    file: 'desktop/icon.icns',
    format: 'icns',
    entries: [
      ['icp4', 16],
      ['icp5', 32],
      ['icp6', 64],
      ['ic07', 128],
      ['ic08', 256],
      ['ic09', 512],
      ['ic10', 1024],
      ['ic11', 32],
      ['ic12', 64],
      ['ic13', 256],
      ['ic14', 512],
    ],
    svg: (s) => iconSvg('macos', s),
  },
]

/** SVG files written under `assets/icons/`. */
export const ICON_SVGS: Record<string, () => string> = {
  'web/favicon.svg': () => iconSvg('shaped', 32),
}

export const SPLASH_BACKGROUND = defaultTheme.colors.bg

/** `assets/icons/web/manifest.webmanifest`. */
export function webManifest(): string {
  return `${JSON.stringify(
    {
      name: 'highsea',
      short_name: 'highsea',
      background_color: defaultTheme.colors.bg,
      theme_color: defaultTheme.colors.bg,
      display: 'standalone',
      icons: [
        { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
        { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
        { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        { src: 'favicon.svg', sizes: 'any', type: 'image/svg+xml' },
      ],
    },
    null,
    2,
  )}\n`
}
