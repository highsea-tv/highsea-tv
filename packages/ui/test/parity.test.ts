// SPDX-License-Identifier: AGPL-3.0-only
// One library, two renderers (design system 1.1, part B): every component in `BOTH` is exported by
// the web and the React Native renderer by the same name, and a component only one has is listed
// with its reason. Read from the sources, as test/native/icons.test.ts does, since importing the
// native renderer needs React Native, which Bun doesn't run. Only components (PascalCase) count:
// types, hooks and helpers may differ.
import { describe, expect, test } from 'bun:test'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { BOTH, NATIVE_ONLY, WEB_ONLY } from '../src/shared/parity.ts'

const SRC = join(import.meta.dirname, '../src')

/** PascalCase `export function|const|class` names in an index and every file it re-exports. */
function exportsOf(index: string, seen = new Set<string>()): Set<string> {
  const names = new Set<string>()
  if (seen.has(index) || !existsSync(index)) return names
  seen.add(index)
  const text = readFileSync(index, 'utf8')
  // constants in capitals (`KEEP`, `WIDE_WIDTH`) aren't components
  for (const m of text.matchAll(/^export (?:async )?(?:function|const|class) ([A-Z]\w*)/gm))
    if (m[1] !== m[1]?.toUpperCase()) names.add(m[1] as string)
  for (const m of text.matchAll(/^export \* from '(\.[^']+)'/gm))
    for (const name of exportsOf(resolve(dirname(index), m[1] as string), seen)) names.add(name)
  return names
}

const web = exportsOf(join(SRC, 'web/index.ts'))
const native = new Set([
  ...exportsOf(join(SRC, 'native/index.ts')),
  ...exportsOf(join(SRC, 'native/tv/index.ts')),
])

describe('parity', () => {
  test('the sources are read', () => {
    expect(web.size).toBeGreaterThan(40)
    expect(native.size).toBeGreaterThan(10)
  })

  test('the web renderer has every component in BOTH', () => {
    expect(BOTH.filter((name) => !web.has(name))).toEqual([])
  })

  test('the native renderer has every component in BOTH', () => {
    expect(BOTH.filter((name) => !native.has(name))).toEqual([])
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
    const both = new Set<string>(BOTH)
    // constants a renderer lists for clarity are allowed; they aren't components either way
    const component = (n: string) => n !== n.toUpperCase()
    expect(
      Object.keys(WEB_ONLY)
        .filter(component)
        .filter((n) => native.has(n) || !web.has(n) || both.has(n)),
    ).toEqual([])
    expect(
      Object.keys(NATIVE_ONLY)
        .filter(component)
        .filter((n) => web.has(n) || !native.has(n) || both.has(n)),
    ).toEqual([])
  })
})
