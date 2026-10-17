// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, test } from 'bun:test'
import { defaultSoundPack, measure, renderEvent, SOUND_EVENTS } from '@highsea/tokens'
import { Resvg } from '@resvg/resvg-js'
import { binaryOutputs, textOutputs } from '../scripts/build.ts'
import {
  APPLE_ICON_DIR,
  CONTAINERS,
  type ContainerSpec,
  FONT_FILES,
  IMAGES,
  iconSvg,
  lockupSvg,
  markGeometry,
  markOutline,
  markSvg,
  SOUND_FILES,
  SOUND_SAMPLE_RATE,
  TVOS_BRAND_ASSETS,
  TVOS_IMAGES,
} from '../src/index.ts'

const file = (path: string) => Bun.file(new URL(`../${path}`, import.meta.url))
const bytes = async (path: string) => new Uint8Array(await file(path).arrayBuffer())
const view = (b: Uint8Array) => new DataView(b.buffer, b.byteOffset, b.byteLength)
const ascii = (b: Uint8Array, at: number, n: number) =>
  new TextDecoder().decode(b.subarray(at, at + n))

test('generated text files are up to date', async () => {
  for (const [path, content] of Object.entries(textOutputs())) {
    expect(content).not.toContain('NaN')
    expect(await file(path).text(), path).toBe(content)
  }
})

test('every binary output exists', async () => {
  for (const path of Object.keys(binaryOutputs()))
    expect(await file(path).exists(), path).toBe(true)
})

describe('icons', () => {
  test.each([...IMAGES, ...TVOS_IMAGES].map((s) => [s.file, s]))(
    '%s has its size and alpha',
    async (_, spec) => {
      const png = await bytes(`assets/icons/${spec.file}`)
      expect(ascii(png, 12, 4)).toBe('IHDR')
      expect(view(png).getUint32(16)).toBe(spec.width)
      expect(view(png).getUint32(20)).toBe(spec.height)
      // color type 2 is RGB, 6 is RGBA
      expect(png[25]).toBe(spec.opaque ? 2 : 6)
    },
  )

  test('ICO files list their sizes', async () => {
    for (const spec of CONTAINERS.filter((c) => c.format === 'ico')) {
      const ico = await bytes(`assets/icons/${spec.file}`)
      expect(view(ico).getUint16(4, true)).toBe(spec.entries.length)
      const sizes = spec.entries.map((_, i) => ico[6 + 16 * i] || 256)
      expect(sizes).toEqual(spec.entries as number[])
    }
  })

  test('the ICNS file holds every entry', async () => {
    const spec = CONTAINERS.find((c) => c.format === 'icns') as ContainerSpec
    const icns = await bytes(`assets/icons/${spec.file}`)
    expect(ascii(icns, 0, 4)).toBe('icns')
    expect(view(icns).getUint32(4)).toBe(icns.length)
    const types: string[] = []
    for (let at = 8; at < icns.length; at += view(icns).getUint32(at + 4))
      types.push(ascii(icns, at, 4))
    expect(types).toEqual((spec.entries as [string, number][]).map(([t]) => t))
  })

  test('icons switch to the small mark below 24px', () => {
    // a 32px favicon draws an 18.6px mark
    expect(iconSvg('shaped', 32)).toContain(`stroke-width="${markGeometry.cutSmall}"`)
    expect(iconSvg('shaped', 48)).toContain(`stroke-width="${markGeometry.cut}"`)
  })
})

test('the lockup is cropped to its ink', () => {
  const [, , w, h] = (lockupSvg().match(/viewBox="([^"]+)"/)?.[1] ?? '').split(' ').map(Number)
  // mark box 1.15em + gap 0.42em + "highsea tv", about 6em wide and 1em tall
  expect(w).toBeCloseTo(603.7, 0)
  expect(h).toBeCloseTo(102, 0)
})

test('fonts.css only references shipped files', async () => {
  const css = await file('fonts/fonts.css').text()
  const urls = [...css.matchAll(/url\('\.\/([^']+)'\)/g)].map((m) => m[1] as string)
  expect(urls.length).toBe(2)
  for (const url of urls) expect(FONT_FILES).toContain(url)
  expect(await file('fonts/OFL.txt').text()).toContain('SIL Open Font License')
})

describe('sounds', () => {
  test.each([...SOUND_EVENTS])('%s is a 48 kHz mono 16-bit WAV of the full sound', async (e) => {
    const wav = await bytes(`sounds/${SOUND_FILES[e]}`)
    expect(ascii(wav, 0, 4)).toBe('RIFF')
    expect(ascii(wav, 8, 4)).toBe('WAVE')
    expect(view(wav).getUint16(22, true)).toBe(1)
    expect(view(wav).getUint32(24, true)).toBe(SOUND_SAMPLE_RATE)
    expect(view(wav).getUint16(34, true)).toBe(16)
    const ms = ((view(wav).getUint32(40, true) / 2) * 1000) / SOUND_SAMPLE_RATE
    const { audibleMs } = measure(renderEvent(defaultSoundPack, e))
    expect(ms).toBeGreaterThanOrEqual(audibleMs)
  })
})

describe('Apple documents', () => {
  test('every catalog entry names a file that exists', async () => {
    const texts = Object.keys(textOutputs()).filter(
      (p) => p.includes(TVOS_BRAND_ASSETS) && p.endsWith('Contents.json'),
    )
    expect(texts.length).toBe(13)
    for (const path of texts) {
      const dir = path.slice(0, -'Contents.json'.length)
      const doc = await file(path).json()
      const names = [...(doc.assets ?? []), ...(doc.layers ?? []), ...(doc.images ?? [])].map(
        (e: { filename: string }) => e.filename,
      )
      for (const name of names) {
        const target = `${dir}${name}`
        const exists = name.endsWith('.png')
          ? await file(target).exists()
          : await file(`${target}/Contents.json`).exists()
        expect(exists, target).toBe(true)
      }
    }
  })

  test('the Icon Composer document uses the outlined mark', async () => {
    const icon = await file(`assets/icons/${APPLE_ICON_DIR}/icon.json`).json()
    const layer = icon.groups[0].layers[0]
    expect(layer['image-name']).toBe('mark.svg')
    const svg = await file(`assets/icons/${APPLE_ICON_DIR}/Assets/mark.svg`).text()
    expect(svg).not.toContain('<mask')
    expect(svg).toContain(markOutline()[0] as string)
  })

  test.each([false, true])('the outlined mark matches the masked one (small: %p)', (small) => {
    const alpha = (svg: string) => {
      const px = new Resvg(svg, { fitTo: { mode: 'width', value: 512 } }).render().pixels
      return px.filter((_, i) => i % 4 === 3)
    }
    const masked = alpha(markSvg({ paint: { solid: '#fff' }, small }))
    const outlined = alpha(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">${markOutline({ small })
        .map((d) => `<path fill="#fff" d="${d}"/>`)
        .join('')}</svg>`,
    )
    let diff = 0
    masked.forEach((a, i) => {
      diff += Math.abs(a - (outlined[i] as number))
    })
    expect(diff / masked.length).toBeLessThan(0.5)
  })
})
