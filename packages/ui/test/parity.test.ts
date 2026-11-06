// SPDX-License-Identifier: AGPL-3.0-only
// The library's per-platform exceptions (src/shared/parity.ts) against what's drawn: a component
// declared in a pair of platform files (`name.web.tsx` beside `name.tsx`) is in BOTH with its
// reason, and BOTH lists nothing else. Read from the sources, since importing the native renderer
// needs React Native, which Bun doesn't run. scripts/one-place.ts reads BOTH from its syntax for
// the same rule.
import { describe, expect, test } from 'bun:test'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { BOTH } from '../src/shared/parity.ts'

const SRC = join(import.meta.dirname, '../src')

const isComponent = (name: string) => /^[A-Z]/.test(name) && name !== name.toUpperCase()

/** The components a file declares as exported. */
function declared(text: string): string[] {
  const names: string[] = []
  for (const m of text.matchAll(/^export (?:async )?(?:function|const|class) ([A-Z]\w*)/gm))
    if (isComponent(m[1] as string)) names.push(m[1] as string)
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

const pairs = platformPairs(join(SRC, 'native'))

describe('parity', () => {
  test('the sources are read', () => {
    expect(pairs.size).toBeGreaterThan(0)
  })

  test('the web renderer is gone (one-client-platform-d.md, D3)', () => {
    expect(existsSync(join(SRC, 'web'))).toBe(false)
  })

  test('everything drawn per platform is in BOTH, with its reason', () => {
    expect([...pairs].filter((name) => !BOTH[name]?.trim()).sort()).toEqual([])
  })

  test('BOTH lists only what is drawn per platform', () => {
    expect(Object.keys(BOTH).filter((name) => !pairs.has(name))).toEqual([])
  })
})
