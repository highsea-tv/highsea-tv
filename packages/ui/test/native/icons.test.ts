// SPDX-License-Identifier: AGPL-3.0-only
// The apps' icons go by ui-web's names and draw the same Lucide glyphs (src/icons.ts). Read from
// the sources, since importing lucide-react-native needs React Native, which Bun doesn't run.
import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/** `name: Glyph` pairs from a file's `export const icons = { … }`. */
function iconMap(path: string) {
  const text = readFileSync(join(import.meta.dirname, path), 'utf8')
  const body = text.match(/export const icons = \{([\s\S]*?)\n\}/)?.[1]
  if (!body) throw new Error(`no icons in ${path}`)
  const map = new Map<string, string>()
  for (const m of body.matchAll(/^\s+'?([a-z-]+)'?: (\w+),/gm))
    map.set(m[1] as string, m[2] as string)
  return map
}

const native = iconMap('../../src/native/icons.ts')
const web = iconMap('../../src/web/icons/icon.tsx')

describe('icons', () => {
  test('every app icon is one of ui-web’s names', () => {
    expect(native.size).toBeGreaterThan(40)
    expect([...native.keys()].filter((name) => !web.has(name))).toEqual([])
  })

  test('each draws the same Lucide glyph as on the web', () => {
    const differ = [...native].filter(([name, glyph]) => web.get(name) !== glyph)
    expect(differ).toEqual([])
  })
})
