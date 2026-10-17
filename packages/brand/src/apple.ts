// SPDX-License-Identifier: AGPL-3.0-only
// Apple's source formats: an Icon Composer document (iOS, iPadOS, macOS) and the tvOS brand
// assets (layered image stacks and the top shelf) for an Xcode asset catalog.
// docs/brand/logo.md#app-icons
import { defaultTheme } from '@highsea/tokens'
import { backgroundSvg, bannerSvg, ICON_BG, ICON_MARK, type ImageSpec } from './icons.ts'
import { MARK_GRID } from './mark.ts'
import { markOutline } from './mark-outline.ts'

export const APPLE_ICON_DIR = 'apple/AppIcon.icon'
export const TVOS_BRAND_ASSETS = 'tvos/App Icon & Top Shelf Image.brandassets'

const XCODE_INFO = { author: 'xcode', version: 1 }
const json = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`

/** Icon Composer color strings: `srgb:r,g,b,a` with five decimals. */
function srgb(hex: string) {
  const n = Number.parseInt(hex.slice(1), 16)
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => (v / 255).toFixed(5))
  return `srgb:${c.join(',')},1.00000`
}

/**
 * The mark as an Icon Composer layer: outlined (no mask), Bone gradient, on a 1024pt canvas at
 * the tile's 58%.
 */
export function appleMarkSvg(): string {
  const side = MARK_GRID / ICON_MARK
  const o = -(side - MARK_GRID) / 2
  const v = (n: number) => String(Math.round(n * 1000) / 1000)
  const paths = markOutline()
    .map((d) => `<path fill="url(#g)" d="${d}"/>`)
    .join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="${v(o)} ${v(o)} ${v(side)} ${v(side)}"><defs><linearGradient id="g" x1="0" y1="3" x2="0" y2="45" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${defaultTheme.colors.accent}"/><stop offset="1" stop-color="${defaultTheme.colors['accent-2']}"/></linearGradient></defs>${paths}</svg>\n`
}

/**
 * `icon.json` for the Icon Composer document. The fill is the tile's gradient, top to bottom;
 * the mark is one glass layer. Tinted and clear appearances are derived by the system.
 */
export function appleIconJson(): string {
  return json({
    fill: {
      'linear-gradient': [srgb(ICON_BG.from), srgb(ICON_BG.to)],
      orientation: { start: { x: 0.5, y: 0 }, stop: { x: 0.5, y: 0.7 } },
    },
    groups: [
      {
        layers: [{ glass: true, 'image-name': 'mark.svg', name: 'mark' }],
        shadow: { kind: 'neutral', opacity: 0.5 },
        specular: true,
        translucency: { enabled: false, value: 0.5 },
      },
    ],
    'supported-platforms': { squares: 'shared' },
  })
}

/** The App Store icon is a single unscaled image, so its entries carry no `scale`. */
type Stack = { name: string; size: [number, number]; scales: number[]; unscaled?: boolean }

/** The two primary app icons: the Home screen one (1x and 2x) and the App Store one. */
export const TVOS_STACKS: Stack[] = [
  { name: 'App Icon', size: [400, 240], scales: [1, 2] },
  { name: 'App Icon - App Store', size: [1280, 768], scales: [1], unscaled: true },
]

/** Parallax layers, front to back. */
const LAYERS = [
  {
    name: 'Front',
    opaque: false,
    svg: (w: number, h: number) => bannerSvg(w, h, 0.56, { background: false }),
  },
  { name: 'Back', opaque: true, svg: (w: number, h: number) => backgroundSvg(w, h) },
]

const SHELVES = [
  { name: 'Top Shelf Image', role: 'top-shelf-image', size: [1920, 720] },
  { name: 'Top Shelf Image Wide', role: 'top-shelf-image-wide', size: [2320, 720] },
] as const

const suffix = (scale: number) => (scale === 1 ? '' : `@${scale}x`)

/** Every PNG inside the brand assets, under `assets/icons/`. */
export const TVOS_IMAGES: ImageSpec[] = [
  ...TVOS_STACKS.flatMap((stack) =>
    LAYERS.flatMap((layer) =>
      stack.scales.map((scale): ImageSpec => {
        const [w, h] = [stack.size[0] * scale, stack.size[1] * scale]
        return {
          file: `${TVOS_BRAND_ASSETS}/${stack.name}.imagestack/${layer.name}.imagestacklayer/Content.imageset/${layer.name.toLowerCase()}${suffix(scale)}.png`,
          width: w,
          height: h,
          opaque: layer.opaque,
          svg: () => layer.svg(w, h),
        }
      }),
    ),
  ),
  ...SHELVES.flatMap((shelf) =>
    [1, 2].map((scale): ImageSpec => {
      const [w, h] = [shelf.size[0] * scale, shelf.size[1] * scale]
      return {
        file: `${TVOS_BRAND_ASSETS}/${shelf.name}.imageset/${shelf.role}${suffix(scale)}.png`,
        width: w,
        height: h,
        opaque: true,
        // the lockup keeps one size relative to the shelf's height: 30% of the 1920 shelf
        svg: () => bannerSvg(w, h, (576 * (h / 720)) / w),
      }
    }),
  ),
]

/** Text files of both documents, under `assets/icons/`. */
export function appleTextFiles(): Record<string, string> {
  const out: Record<string, string> = {
    [`${APPLE_ICON_DIR}/icon.json`]: appleIconJson(),
    [`${APPLE_ICON_DIR}/Assets/mark.svg`]: appleMarkSvg(),
    [`${TVOS_BRAND_ASSETS}/Contents.json`]: json({
      assets: [
        ...TVOS_STACKS.map((s) => ({
          filename: `${s.name}.imagestack`,
          idiom: 'tv',
          role: 'primary-app-icon',
          size: s.size.join('x'),
        })),
        ...SHELVES.map((s) => ({
          filename: `${s.name}.imageset`,
          idiom: 'tv',
          role: s.role,
          size: s.size.join('x'),
        })),
      ],
      info: XCODE_INFO,
    }),
  }
  for (const stack of TVOS_STACKS) {
    const dir = `${TVOS_BRAND_ASSETS}/${stack.name}.imagestack`
    out[`${dir}/Contents.json`] = json({
      info: XCODE_INFO,
      layers: LAYERS.map((l) => ({ filename: `${l.name}.imagestacklayer` })),
    })
    for (const layer of LAYERS) {
      const ldir = `${dir}/${layer.name}.imagestacklayer`
      out[`${ldir}/Contents.json`] = json({ info: XCODE_INFO })
      out[`${ldir}/Content.imageset/Contents.json`] = json({
        images: stack.scales.map((scale) => ({
          filename: `${layer.name.toLowerCase()}${suffix(scale)}.png`,
          idiom: 'tv',
          ...(stack.unscaled ? {} : { scale: `${scale}x` }),
        })),
        info: XCODE_INFO,
      })
    }
  }
  for (const shelf of SHELVES)
    out[`${TVOS_BRAND_ASSETS}/${shelf.name}.imageset/Contents.json`] = json({
      images: [1, 2].map((scale) => ({
        filename: `${shelf.role}${suffix(scale)}.png`,
        idiom: 'tv',
        scale: `${scale}x`,
      })),
      info: XCODE_INFO,
    })
  return out
}
