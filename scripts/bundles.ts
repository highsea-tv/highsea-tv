// SPDX-License-Identifier: AGPL-3.0-only
// The bundle check for design system 1.1 (ADR 0060): @highsea-tv/ui's root export picks its
// renderer by the `react-native` condition, so each app's bundle carries only its own.
// - The web client's build (apps/web/dist, after `bun run --filter @highsea-tv/web build`) has no
//   React Native and none of the library's native renderer.
// - The phone's bundle (Metro, through `expo export:embed`) has none of the web renderer: no
//   tailwind-merge, no react-dom and no `ui/src/web`.
// `bun scripts/bundles.ts [web] [phone]` checks both, or the ones named. CI runs it after the builds.
import { spawnSync } from 'node:child_process'
import { mkdirSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dir, '..')

/** What a bundle must not contain, with why. */
export const FORBIDDEN = {
  web: [
    [
      'react-native',
      /\breact-native(?:-web)?\/(?:Libraries|src)\b|__fbBatchedBridge|TurboModuleRegistry/,
    ],
    ['the native renderer', /packages\/ui\/src\/native\//],
  ],
  phone: [
    ['the web renderer', /packages\/ui\/src\/web\//],
    ['tailwind-merge', /tailwind-merge|twMerge/],
    ['react-dom', /react-dom\.production|ReactDOMSharedInternals/],
  ],
} as const satisfies Record<string, readonly (readonly [string, RegExp])[]>

/** What `text`, one bundle's files joined, has that it mustn't. */
export function offences(kind: keyof typeof FORBIDDEN, text: string) {
  return FORBIDDEN[kind].filter(([, re]) => re.test(text)).map(([what]) => what)
}

type SourceMap = { sources?: string[]; sections?: { map: SourceMap }[] }
const sourcesOf = (map: SourceMap): string[] =>
  (map.sources ?? []).concat(...(map.sections ?? []).map((s) => sourcesOf(s.map)))

/** A build's code, and from its source maps only the modules' paths: their `sourcesContent`
 *  carries comments, which may name what the bundle never imports. */
function read(dir: string): string {
  let out = ''
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) out += read(path)
    else if (/\.map$/.test(name))
      out += `\n${sourcesOf(JSON.parse(readFileSync(path, 'utf8'))).join('\n')}`
    else if (/\.(js|mjs|jsbundle)$/.test(name)) out += readFileSync(path, 'utf8')
  }
  return out
}

function web() {
  const dist = join(ROOT, 'apps/web/dist')
  return offences('web', read(dist))
}

/** The phone check on a bundle already built into `out`. */
export function phoneFrom(out: string) {
  return offences('phone', read(out))
}

function phone() {
  const out = join(ROOT, '.dev/bundles/phone')
  mkdirSync(out, { recursive: true })
  const run = spawnSync(
    'bunx',
    [
      'expo',
      'export:embed',
      '--platform',
      'ios',
      '--dev',
      'false',
      '--entry-file',
      'node_modules/expo-router/entry.js',
      '--bundle-output',
      join(out, 'main.jsbundle'),
      '--sourcemap-output',
      join(out, 'main.jsbundle.map'),
      '--assets-dest',
      out,
    ],
    { cwd: join(ROOT, 'apps/mobile'), stdio: 'inherit' },
  )
  if (run.status !== 0) throw new Error('the phone’s bundle did not build')
  return phoneFrom(out)
}

if (import.meta.main) {
  const asked = process.argv.slice(2)
  const kinds = asked.length ? asked : ['web', 'phone']
  let failed = false
  for (const kind of kinds) {
    const found = kind === 'web' ? web() : kind === 'phone' ? phone() : [`no bundle named ${kind}`]
    console.log(found.length ? `${kind}: carries ${found.join(', ')}` : `${kind}: clean`)
    failed ||= found.length > 0
  }
  process.exit(failed ? 1 : 0)
}
