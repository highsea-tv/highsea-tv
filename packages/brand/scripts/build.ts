// SPDX-License-Identifier: AGPL-3.0-only
// Writes every brand file: wordmark outlines, logo SVGs, icon rasters, fonts and sounds.
// `--check` fails instead of writing when text outputs are stale or a binary is missing (CI).
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { SOUND_EVENTS } from '@highsea/tokens'
import { Resvg } from '@resvg/resvg-js'
import { FONT_FILES, fontsCss } from '../src/fonts.ts'
import { CONTAINERS, ICON_SVGS, IMAGES, webManifest } from '../src/icons.ts'
import { type LogoPaint, lockupSvg, wordmarkSvg } from '../src/logo.ts'
import { markSvg } from '../src/mark.ts'
import { renderSoundFile, SOUND_FILES, SOUND_SAMPLE_RATE } from '../src/sounds.ts'
import { encodeIcns, encodeIco, encodePng, encodeWav } from './encode.ts'
import { wordmarkDataTs } from './outline.ts'

const require = createRequire(import.meta.url)
const GEIST = require.resolve('geist/package.json').replace('package.json', 'dist/fonts/')

export function rasterize(svg: string, width: number, height: number, opaque: boolean) {
  const rendered = new Resvg(svg, { fitTo: { mode: 'width', value: width } }).render()
  if (rendered.width !== width || rendered.height !== height)
    throw new Error(`rendered ${rendered.width}×${rendered.height}, expected ${width}×${height}`)
  return encodePng(new Uint8Array(rendered.pixels), width, height, opaque)
}

const LOGO_PAINTS: [LogoPaint, string][] = [
  ['brand', ''],
  ['mono', '-mono'],
  ['ink', '-ink'],
]

/** Text outputs, compared byte for byte by `--check`. Paths are relative to the package. */
export function textOutputs(): Record<string, string> {
  const out: Record<string, string> = {
    'src/wordmark-data.ts': wordmarkDataTs(),
    'fonts/fonts.css': fontsCss(),
    'assets/icons/web/manifest.webmanifest': webManifest(),
  }
  const title = 'highsea'
  for (const [paint, suffix] of LOGO_PAINTS) {
    const mark = paint === 'brand' ? 'bone' : paint === 'mono' ? 'mono' : { solid: '#0b0b0c' }
    out[`assets/logo/mark${suffix}.svg`] = `${markSvg({ paint: mark, title })}\n`
    out[`assets/logo/mark-small${suffix}.svg`] = `${markSvg({ paint: mark, title, small: true })}\n`
    out[`assets/logo/wordmark${suffix}.svg`] = `${wordmarkSvg({ paint, title })}\n`
    out[`assets/logo/lockup${suffix}.svg`] = `${lockupSvg({ paint, title })}\n`
  }
  for (const [file, svg] of Object.entries(ICON_SVGS)) out[`assets/icons/${file}`] = `${svg()}\n`
  return out
}

/** Binary outputs, built lazily. `--check` only confirms they exist. */
export function binaryOutputs(): Record<string, () => Uint8Array> {
  const out: Record<string, () => Uint8Array> = {}
  for (const spec of IMAGES)
    out[`assets/icons/${spec.file}`] = () =>
      rasterize(spec.svg(), spec.width, spec.height, spec.opaque)
  for (const spec of CONTAINERS)
    out[`assets/icons/${spec.file}`] = () => {
      const png = (size: number) => rasterize(spec.svg(size), size, size, false)
      return spec.format === 'ico'
        ? encodeIco((spec.entries as number[]).map((size) => ({ size, png: png(size) })))
        : encodeIcns(
            (spec.entries as [string, number][]).map(([type, size]) => ({ type, png: png(size) })),
          )
    }
  for (const file of FONT_FILES) {
    const dir = file.startsWith('GeistMono') ? 'geist-mono/' : 'geist-sans/'
    out[`fonts/${file}`] = () => new Uint8Array(readFileSync(GEIST + dir + file))
  }
  out['fonts/OFL.txt'] = () => new Uint8Array(readFileSync(`${GEIST}../../LICENSE.txt`))
  for (const event of SOUND_EVENTS)
    out[`sounds/${SOUND_FILES[event]}`] = () => encodeWav(renderSoundFile(event), SOUND_SAMPLE_RATE)
  return out
}

if (import.meta.main) {
  const check = process.argv.includes('--check')
  const root = new URL('../', import.meta.url)
  // the logo modules import the outlines, so new outlines need a fresh process to take effect
  const data = Bun.file(new URL('src/wordmark-data.ts', root))
  const outlines = wordmarkDataTs()
  if (!check && (await data.text()) !== outlines) {
    await Bun.write(data, outlines)
    console.log('wrote src/wordmark-data.ts')
    const rerun = Bun.spawnSync([process.execPath, import.meta.path], { stdout: 'inherit' })
    process.exit(rerun.exitCode)
  }
  let stale = 0
  for (const [path, content] of Object.entries(textOutputs())) {
    const file = Bun.file(new URL(path, root))
    const current = (await file.exists()) ? await file.text() : ''
    if (current === content) continue
    if (check) {
      console.error(`${path} is out of date; run \`bun run build\` in packages/brand`)
      stale++
    } else {
      await Bun.write(file, content)
      console.log(`wrote ${path}`)
    }
  }
  for (const [path, build] of Object.entries(binaryOutputs())) {
    const file = Bun.file(new URL(path, root))
    if (check) {
      if (!(await file.exists())) {
        console.error(`${path} is missing; run \`bun run build\` in packages/brand`)
        stale++
      }
      continue
    }
    const bytes = build()
    const current = (await file.exists()) ? new Uint8Array(await file.arrayBuffer()) : null
    if (current && Buffer.compare(current, bytes) === 0) continue
    await Bun.write(file, bytes)
    console.log(`wrote ${path}`)
  }
  if (stale) process.exit(1)
}
