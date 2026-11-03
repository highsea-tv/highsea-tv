// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, test } from 'bun:test'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { NATIVE_FACES, NATIVE_FONT_FILES, nativeFontPaths } from '../src/native-fonts.ts'

const root = join(import.meta.dir, '..')

describe('the native font manifest', () => {
  test('every family a weight picks has a file, and every file is in fonts/', () => {
    const picked = new Set(
      Object.values(NATIVE_FACES).flatMap((face): string[] => Object.values(face)),
    )
    expect([...picked].sort()).toEqual(Object.keys(NATIVE_FONT_FILES).sort())
    for (const file of Object.values(NATIVE_FONT_FILES))
      expect(existsSync(join(root, 'fonts', file))).toBe(true)
  })

  test('an app names the files from its own folder', () => {
    expect(nativeFontPaths()).toContain('../../packages/brand/fonts/Geist-Regular.ttf')
    for (const path of nativeFontPaths())
      expect(existsSync(join(root, '../../apps/client', path))).toBe(true)
  })

  test('Metro’s requires are the manifest’s files, family by family', () => {
    // read as text: Bun doesn't load a .ttf as a module, and Metro needs the literal requires
    const source = readFileSync(join(root, 'src/native-font-assets.ts'), 'utf8')
    const required = Object.fromEntries(
      [...source.matchAll(/'([\w-]+)': require\('\.\.\/fonts\/([\w.-]+)'\)/g)].map((m) => [
        m[1],
        m[2],
      ]),
    )
    expect(required).toEqual({ ...NATIVE_FONT_FILES })
  })
})
