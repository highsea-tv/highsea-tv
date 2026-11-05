// SPDX-License-Identifier: AGPL-3.0-only
// The platform-file pattern (README.md › Platform files), held wherever Metro bundles our code: the
// client and the workspace's packages. Each `name.web.ts(x)` has a native side `name.ts(x)` beside
// it, the two export the same values, the web's are typed by the native's, nothing imports either
// side with its extension written (Metro then takes the file named, on every platform), and
// neither is a package's exports target Metro reads (Metro takes a target exactly as written).
import { describe, expect, test } from 'bun:test'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { basename, dirname, join, relative, resolve } from 'node:path'

const ROOT = join(import.meta.dir, '../../..')
const DIRS = [
  'apps/client/src',
  ...readdirSync(join(ROOT, 'packages')).map((name) => `packages/${name}/src`),
].filter((dir) => existsSync(join(ROOT, dir)))

const files = (dir: string): string[] =>
  readdirSync(join(ROOT, dir), { recursive: true, encoding: 'utf8' })
    .filter((name) => /\.tsx?$/.test(name) && !name.split('/').includes('node_modules'))
    .map((name) => join(ROOT, dir, name))

const sources = DIRS.flatMap(files)
const webSides = sources.filter((file) => /\.web\.tsx?$/.test(file))
const nativeOf = (web: string) => web.replace(/\.web(\.tsx?)$/, '$1')
const split = new Set(webSides.flatMap((web) => [web, nativeOf(web)]))

// Each file is read with its own loader: in a `.ts` file `<const T>(…)` is a const type parameter,
// which the `tsx` loader takes for a JSX element and refuses ("Unexpected const"), as TypeScript
// does (https://www.typescriptlang.org/docs/handbook/jsx.html#the-as-operator)
const transpilers = {
  ts: new Bun.Transpiler({ loader: 'ts' }),
  tsx: new Bun.Transpiler({ loader: 'tsx' }),
}
const transpiler = (file: string) => transpilers[file.endsWith('.tsx') ? 'tsx' : 'ts']
const exportsOf = (file: string) => transpiler(file).scan(readFileSync(file, 'utf8')).exports.sort()

/**
 * The targets a package.json's `exports` names that Metro can take, its own conditions included.
 * Metro asserts `react-native` for our packages on every platform (metro.config.js), and takes the
 * first condition it asserts in the order written
 * (https://nodejs.org/api/packages.html#conditional-exports), so a pair's web file as a `default`
 * after `react-native` is only ever read by Vite and Bun: `@highsea-tv/native/playback`'s web
 * engine for apps/web (README.md › Platform files, rule 3). Any other `default` still counts.
 */
const metroTargetsOf = (exports: unknown): string[] => {
  if (typeof exports === 'string') return [exports]
  if (!exports || typeof exports !== 'object') return []
  const entries = Object.entries(exports)
  const native = entries.findIndex(([key]) => key === 'react-native')
  const webOnly = (key: string, target: unknown, i: number) =>
    native >= 0 &&
    i > native &&
    key === 'default' &&
    typeof target === 'string' &&
    /\.web\.tsx?$/.test(target)
  return entries
    .filter(([key, target], i) => !webOnly(key, target, i))
    .flatMap(([, target]) => metroTargetsOf(target))
}

describe('platform files', () => {
  test('the pattern is in use, so this test checks something', () => {
    expect(webSides.length).toBeGreaterThan(0)
  })

  test.each(webSides.map((web) => [relative(ROOT, web), web]))(
    '%s has a native side with the same exports, which types them',
    (_, web) => {
      const native = nativeOf(web)
      expect(existsSync(native)).toBe(true)
      const names = exportsOf(web)
      expect(names).toEqual(exportsOf(native))
      if (names.length) {
        const sibling = basename(native).replace(/[.]/g, '\\.')
        expect(readFileSync(web, 'utf8')).toMatch(
          new RegExp(`import type [^;]+ from '\\./${sibling}'`),
        )
      }
    },
  )

  test('nothing imports a platform pair’s file by its full name', () => {
    const offences: string[] = []
    const names = [...split].map((file) => basename(file).replace(/(\.web)?\.tsx?$/, ''))
    for (const file of sources) {
      const code = readFileSync(file, 'utf8')
      if (!names.some((name) => code.includes(name))) continue
      for (const { path } of transpiler(file).scanImports(code)) {
        if (!path.startsWith('.') || !/\.tsx?$/.test(path)) continue
        if (split.has(resolve(dirname(file), path)))
          offences.push(`${relative(ROOT, file)} imports ${path}`)
      }
    }
    expect(offences).toEqual([])
  })

  test('no package names a platform pair’s file as an exports target', () => {
    const offences: string[] = []
    const packages = readdirSync(join(ROOT, 'packages')).map((name) => `packages/${name}`)
    for (const dir of ['apps/client', ...packages]) {
      const manifest = join(ROOT, dir, 'package.json')
      if (!existsSync(manifest)) continue
      const { exports } = JSON.parse(readFileSync(manifest, 'utf8')) as { exports?: unknown }
      for (const target of metroTargetsOf(exports)) {
        // a subpath pattern's `*` stands for any path (https://nodejs.org/api/packages.html#subpath-patterns)
        const escaped = resolve(ROOT, dir, target).replace(/[.+?^${}()|[\]\\]/g, '\\$&')
        const pattern = new RegExp(`^${escaped.replaceAll('*', '.*')}$`)
        for (const file of split)
          if (pattern.test(file))
            offences.push(`${dir} exports ${target} (${relative(ROOT, file)})`)
      }
    }
    expect(offences).toEqual([])
  })
})
