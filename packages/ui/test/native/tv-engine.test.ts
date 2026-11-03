// SPDX-License-Identifier: AGPL-3.0-only
// The TV's focus engine pair (src/native/tv/engine.tsx and engine.web.tsx): Focusable and the TV's
// parts are written once against one set of names, which tvOS's engine answers on the TVs and the
// spatial focus engine in a browser. These fail when the two sides drift: a name one side has and
// the other doesn't, a web export not typed by its native sibling (so tsc checks it against the
// props the parts pass), or a part importing the pair with its extension, which Metro would take
// as written on every platform (apps/client/README.md › Platform files). Read from the sources,
// since importing either side needs React Native, which Bun doesn't run.
import { describe, expect, test } from 'bun:test'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type * as native from '../../src/native/tv/engine.tsx'
import type * as web from '../../src/native/tv/engine.web.tsx'

const TV = join(import.meta.dirname, '../../src/native/tv')
const NATIVE = readFileSync(join(TV, 'engine.tsx'), 'utf8')
const WEB = readFileSync(join(TV, 'engine.web.tsx'), 'utf8')

/** The values a file exports: its exported functions and consts. */
const values = (text: string) =>
  [...text.matchAll(/^export (?:function|const) (\w+)/gm)].map((m) => m[1] as string).sort()

/** The types a file exports by name. */
const types = (text: string) =>
  [...text.matchAll(/^export type (\w+)/gm)].map((m) => m[1] as string).sort()

// the same names with the same types, or this file doesn't compile (tsc -p tsconfig.native.json)
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false
const sameValues: Same<keyof typeof native, keyof typeof web> = true
const sameStop: Same<native.StopOptions, web.StopOptions> = true
const sameGuide: Same<native.FocusGuideProps, web.FocusGuideProps> = true
const sameScroll: Same<native.TvScrollProps, web.TvScrollProps> = true

describe('the TV focus engine pair', () => {
  test('both sides export the same values', () => {
    expect(sameValues && sameStop && sameGuide && sameScroll).toBe(true)
    expect(values(NATIVE).length).toBeGreaterThan(4)
    expect(values(WEB)).toEqual(values(NATIVE))
  })

  test('every web export is typed by its native sibling', () => {
    for (const name of values(NATIVE))
      expect(WEB).toMatch(new RegExp(`^export const ${name}: typeof native\\w+ =`, 'm'))
  })

  test('the web side takes its props’ types from the native side', () => {
    const reexported = /^export type \{([^}]*)\} from '\.\/engine\.tsx'/m.exec(WEB)?.[1] ?? ''
    const names = reexported.split(',').map((n) => n.trim())
    expect(types(NATIVE).filter((n) => !names.includes(n))).toEqual([])
  })

  test('the parts import the pair without its extension', () => {
    const files = readdirSync(TV).filter((f) => /\.tsx?$/.test(f) && !f.startsWith('engine'))
    const users = files.filter((f) => /from '\.\/engine'/.test(readFileSync(join(TV, f), 'utf8')))
    expect(users).toContain('focusable.tsx')
    for (const f of files) {
      const text = readFileSync(join(TV, f), 'utf8')
      // a value import with the extension would take the native side in a browser too
      expect(text).not.toMatch(/^import \{[^}]*\} from '\.\/engine\.tsx'/m)
    }
  })

  test('no part reaches past the pair for the TVs’ own focus APIs', () => {
    const files = readdirSync(TV).filter((f) => /\.tsx?$/.test(f) && !f.startsWith('engine'))
    for (const f of files) {
      const code = readFileSync(join(TV, f), 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '')
      expect({
        f,
        uses: /\b(TVFocusGuideView|useTVEventHandler|requestTVFocus)\b/.test(code),
      }).toEqual({ f, uses: false })
    }
  })
})
