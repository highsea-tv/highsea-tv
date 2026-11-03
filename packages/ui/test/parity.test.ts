// SPDX-License-Identifier: AGPL-3.0-only
// The renderers' exceptions (src/shared/parity.ts) against what's drawn: a component both
// renderers export, or one drawn per platform in a pair of platform files, is in BOTH with its
// reason, and BOTH lists nothing else; a component only one renderer has is listed with its reason.
// Read from the sources, as test/native/icons.test.ts does, since importing the native renderer
// needs React Native, which Bun doesn't run. Only components (PascalCase) count: types, hooks and
// helpers may differ. scripts/one-place.ts reads BOTH from its syntax for the same rule.
import { describe, expect, test } from 'bun:test'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { BOTH, NATIVE_ONLY, WEB_ONLY } from '../src/shared/parity.ts'

const SRC = join(import.meta.dirname, '../src')

const isComponent = (name: string) => /^[A-Z]/.test(name) && name !== name.toUpperCase()

/** PascalCase names a file declares as exported. */
function declared(text: string): string[] {
  const names: string[] = []
  for (const m of text.matchAll(/^export (?:async )?(?:function|const|class) ([A-Z]\w*)/gm))
    if (isComponent(m[1] as string)) names.push(m[1] as string)
  return names
}

/** The component names an index exports, through `export *` and `export { … } from`. */
function exportsOf(index: string, seen = new Set<string>()): Set<string> {
  const names = new Set<string>()
  if (seen.has(index) || !existsSync(index)) return names
  seen.add(index)
  const text = readFileSync(index, 'utf8')
  for (const name of declared(text)) names.add(name)
  for (const m of text.matchAll(/^export \* from '(\.[^']+)'/gm))
    for (const name of exportsOf(resolve(dirname(index), m[1] as string), seen)) names.add(name)
  for (const m of text.matchAll(/^export \{([^}]*)\} from '\.[^']+'/gm))
    for (const part of (m[1] as string).split(',')) {
      const name =
        part
          .trim()
          .split(/\s+as\s+/)
          .pop() ?? ''
      if (!part.trim().startsWith('type ') && isComponent(name)) names.add(name)
    }
  return names
}

/** Components drawn per platform: declared in `name.web.tsx` and its sibling `name.tsx`. */
function platformPairs(dir: string): Set<string> {
  const names = new Set<string>()
  for (const entry of readdirSync(dir, { withFileTypes: true, recursive: true })) {
    const match = entry.isFile() && /^(.*)\.web\.(tsx?)$/.exec(entry.name)
    if (!match) continue
    const folder = entry.parentPath
    const sibling = join(folder, `${match[1]}.${match[2]}`)
    if (!existsSync(sibling)) continue
    const native = new Set(declared(readFileSync(sibling, 'utf8')))
    for (const name of declared(readFileSync(join(folder, entry.name), 'utf8')))
      if (native.has(name)) names.add(name)
  }
  return names
}

const web = exportsOf(join(SRC, 'web/index.ts'))
const native = new Set([
  ...exportsOf(join(SRC, 'native/index.ts')),
  ...exportsOf(join(SRC, 'native/tv/index.ts')),
])
const pairs = platformPairs(join(SRC, 'native'))
const twice = new Set([...[...web].filter((name) => native.has(name)), ...pairs])

describe('parity', () => {
  test('the sources are read', () => {
    expect(web.size).toBeGreaterThan(40)
    expect(native.size).toBeGreaterThan(10)
    expect(pairs.size).toBeGreaterThan(0)
  })

  test('everything drawn twice is in BOTH, with its reason', () => {
    expect([...twice].filter((name) => !BOTH[name]?.trim()).sort()).toEqual([])
  })

  test('BOTH lists only what is drawn twice', () => {
    expect(Object.keys(BOTH).filter((name) => !twice.has(name))).toEqual([])
  })

  test('a component only the web has is listed with its reason', () => {
    const unlisted = [...web].filter((name) => !native.has(name) && !WEB_ONLY[name]?.trim())
    expect(unlisted).toEqual([])
  })

  test('a component only React Native has is listed with its reason', () => {
    const unlisted = [...native].filter((name) => !web.has(name) && !NATIVE_ONLY[name]?.trim())
    expect(unlisted).toEqual([])
  })

  test('nothing is listed as one platform’s that both have, or that neither has', () => {
    expect(
      Object.keys(WEB_ONLY)
        .filter(isComponent)
        .filter((n) => native.has(n) || !web.has(n) || n in BOTH),
    ).toEqual([])
    expect(
      Object.keys(NATIVE_ONLY)
        .filter(isComponent)
        .filter((n) => web.has(n) || !native.has(n) || n in BOTH),
    ).toEqual([])
  })
})
