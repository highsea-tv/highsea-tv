// SPDX-License-Identifier: AGPL-3.0-only
// The bundle check for design system 1.1 (ADR 0060): @highsea-tv/ui's root export picks its
// renderer by the `react-native` condition, so each app's bundle carries only its own.
// - The web client's build (apps/web/dist, after `bun run --filter @highsea-tv/web build`) has no
//   React Native and none of the library's native renderer.
// - The phone's and the TV's bundles (Metro, through `expo export:embed`; the TV's with EXPO_TV=1
//   on react-native-tvos) have none of the web renderer: no tailwind-merge, no react-dom and no
//   `ui/src/web`, nor the spatial focus engine, which only a browser's TV focus uses.
// - The one client (apps/client, one-client-platform.md › A) in its three bundles: the web's
//   export (`export:web`, with source maps) draws with the native renderer through
//   react-native-web, so it has no React Native itself and none of the DOM renderer; its iPhone
//   and Apple TV bundles hold the phone's rule. Each takes its own side of a platform pair
//   (apps/client/README.md › Platform files): the web no native side, the others no `.web` file.
// - hls.js (the web's player engine, @highsea-tv/native/playback.web.ts) is in the web's builds as
//   a chunk of its own, loaded only when a stream needs it, and never in the entry the page loads
//   first; in apps/web always, in the client's web export once the web engine is in it. The
//   phone's and the TV's bundles never carry it.
// No bundle built without mock mode (EXPO_PUBLIC_HIGHSEA_MOCK) carries the prototypes' mock.
// `bun scripts/bundles.ts [web] [phone] [tv] [client-web] [client-phone] [client-tv]` checks the
// ones named, or the first three. CI runs it after the builds for web, phone and tv; the client's
// three run locally until one-client-platform.md's part C puts them in CI.
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dir, '..')

/**
 * What no bundle built without mock mode may contain: the mock, and the prototypes' frame channel
 * (@highsea-tv/mock/frame) by its name, which survives minifying where paths may not.
 */
const NO_MOCK = [
  ['the mock server', /design\/prototypes\/|packages\/mock\/src\//],
  ['the prototypes’ frame channel', /highsea:frame/],
] as const

/** hls.js: its events' names in the code (`hlsManifestLoading`), or its path in a source map. */
const HLS = /hlsManifestLoading|node_modules\/hls\.js\//

/** What a React Native app's bundle must not contain. */
const NATIVE = [
  ['hls.js', HLS],
  ['the web renderer', /packages\/ui\/src\/web\//],
  ['tailwind-merge', /tailwind-merge|twMerge/],
  ['react-dom', /react-dom\.production|ReactDOMSharedInternals/],
  // the TV's focus in a browser (engine.web.tsx); the TVs move focus with their own engines
  ['the spatial focus engine', /packages\/ui\/src\/native\/tv\/spatial\/navigator\.ts/],
  ...NO_MOCK,
] as const

/** React Native, or react-native-web, which apps/web (on the DOM renderer) carries neither of. */
const REACT_NATIVE = [
  'react-native',
  /\breact-native(?:-web)?\/(?:Libraries|src)\b|__fbBatchedBridge|TurboModuleRegistry/,
] as const

/** React Native itself, which the client's web export draws without: react-native-web stands in
 *  for it, and vendors stubs of some of its modules (`react-native-web/dist/vendor/react-native/
 *  TurboModule/TurboModuleRegistry.js` among them), so only the package's own folder and its
 *  native bridge count. The client's `react-native` is react-native-tvos under that alias, which
 *  Bun's store keeps under its own name (`node_modules/.bun/react-native-tvos@…/node_modules/
 *  react-native-tvos/Libraries/…`), so both names are matched. */
const REACT_NATIVE_ITSELF = [
  'react-native',
  /(?:^|\/)node_modules\/react-native(?:-tvos)?\/|__fbBatchedBridge/m,
] as const

const literal = (path: string) => path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const exactly = (path: string) => new RegExp(`\\b${literal(path)}(?![\\w.])`)

/** The platform pairs Metro bundles (`name.ts` and `name.web.ts`), as paths from the root. */
export function pairs(root = ROOT): { native: string; web: string }[] {
  const dirs = [
    'apps/client/src',
    ...readdirSync(join(root, 'packages')).map((name) => `packages/${name}/src`),
  ].filter((dir) => existsSync(join(root, dir)))
  return dirs.flatMap((dir) =>
    readdirSync(join(root, dir), { recursive: true, encoding: 'utf8' })
      .filter((name) => /\.web\.tsx?$/.test(name) && !name.includes('node_modules'))
      .map((name) => {
        const web = `${dir}/${name}`
        return { native: web.replace(/\.web(\.tsx?)$/, '$1'), web }
      }),
  )
}
const PAIRS = pairs()

/** What a bundle must not contain, with why. */
export const FORBIDDEN = {
  web: [REACT_NATIVE, ['the native renderer', /packages\/ui\/src\/native\//], ...NO_MOCK],
  phone: NATIVE,
  tv: NATIVE,
  'client-web': [
    REACT_NATIVE_ITSELF,
    ['the web renderer', /packages\/ui\/src\/web\//],
    ['tailwind-merge', /tailwind-merge|twMerge/],
    ['the Hermes Intl polyfills', /@formatjs\/intl-(?:locale|pluralrules|numberformat)\//],
    ...PAIRS.map(({ native }) => [`${native}, a native side`, exactly(native)] as const),
    ...NO_MOCK,
  ],
  'client-phone': [
    ...NATIVE,
    ...PAIRS.map(({ web }) => [`${web}, a web side`, exactly(web)] as const),
  ],
  'client-tv': [
    ...NATIVE,
    ...PAIRS.map(({ web }) => [`${web}, a web side`, exactly(web)] as const),
  ],
} as const satisfies Record<string, readonly (readonly [string, RegExp])[]>

/** What `text`, one bundle's files joined, has that it mustn't. */
export function offences(kind: keyof typeof FORBIDDEN, text: string) {
  const rules: readonly (readonly [string, RegExp])[] = FORBIDDEN[kind]
  return rules.filter(([, re]) => re.test(text)).map(([what]) => what)
}

type SourceMap = { sources?: string[]; sections?: { map: SourceMap }[] }
const sourcesOf = (map: SourceMap): string[] =>
  (map.sources ?? []).concat(...(map.sections ?? []).map((s) => sourcesOf(s.map)))

/** A build's code, and from its source maps only the modules' paths: their `sourcesContent`
 *  carries comments, which may name what the bundle never imports. */
export function read(dir: string): string {
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

/** The scripts a web build's page loads first, from its index.html. */
function entries(dir: string): string[] {
  const html = readFileSync(join(dir, 'index.html'), 'utf8')
  // the entry's scripts, and the chunks it preloads, which load with it
  // (https://vite.dev/guide/features.html#preload-directives-generation)
  const paths = [
    ...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g),
    ...html.matchAll(/<link\b(?=[^>]*\brel="modulepreload")[^>]*\bhref="([^"]+)"/g),
  ].map((m) => m[1] ?? '')
  return paths.map((path) => {
    const file = join(dir, path.replace(/^\/web\//, '').replace(/^\//, ''))
    return existsSync(`${file}.map`) ? `${file}.map` : file
  })
}

/** One file's code, or a source map's modules' paths, as `read` takes them. */
function readFile(path: string): string {
  if (/\.map$/.test(path)) {
    const js = path.replace(/\.map$/, '')
    return `${readFileSync(js, 'utf8')}\n${sourcesOf(JSON.parse(readFileSync(path, 'utf8'))).join('\n')}`
  }
  return readFileSync(path, 'utf8')
}

/**
 * hls.js in a web build: never in the scripts the page loads first, and, when `needed`, in a
 * chunk of its own, which `import('hls.js')` loads (https://vite.dev/guide/features.html#dynamic-import,
 * https://docs.expo.dev/guides/tree-shaking/).
 */
export function hlsOffences(entryText: string, allText: string, needed: boolean) {
  const found: string[] = []
  if (HLS.test(entryText)) found.push('hls.js in the entry, not a chunk of its own')
  else if (needed && !HLS.test(allText)) found.push('no hls.js chunk')
  return found
}

function web() {
  const dist = join(ROOT, 'apps/web/dist')
  const all = read(dist)
  const entry = entries(dist).map(readFile).join('\n')
  return [...offences('web', all), ...hlsOffences(entry, all, true)]
}

/** The client's web export with its source maps, built into .dev/bundles/client-web and checked,
 *  through the app's own `export:web` (its last --output-dir wins). */
function clientWeb() {
  const out = join(ROOT, '.dev/bundles/client-web')
  const run = spawnSync('bun', ['run', 'export:web', '--output-dir', out, '--source-maps'], {
    cwd: join(ROOT, 'apps/client'),
    stdio: 'inherit',
    env: { ...process.env, EXPO_PUBLIC_HIGHSEA_MOCK: '' },
  })
  if (run.status !== 0) throw new Error('the client’s web export did not build')
  const all = read(out)
  const entry = entries(out).map(readFile).join('\n')
  // the web engine is in once a screen plays; from then on it brings hls.js's chunk
  const engine = exactly('packages/native/src/playback.web.ts').test(all)
  return [...offences('client-web', all), ...hlsOffences(entry, all, engine)]
}

type NativeKind = 'phone' | 'tv' | 'client-phone' | 'client-tv'

/** A React Native app's iOS bundle, built into .dev/bundles/<kind> and checked. */
function native(kind: NativeKind, app: string, env: Record<string, string> = {}) {
  const out = join(ROOT, `.dev/bundles/${kind}`)
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
    {
      cwd: join(ROOT, app),
      stdio: 'inherit',
      env: { ...process.env, EXPO_PUBLIC_HIGHSEA_MOCK: '', ...env },
    },
  )
  if (run.status !== 0) throw new Error(`the ${kind}’s bundle did not build`)
  return offences(kind, read(out))
}

const BUILDS: Record<string, () => string[]> = {
  web,
  phone: () => native('phone', 'apps/mobile'),
  tv: () => native('tv', 'apps/tv', { EXPO_TV: '1' }),
  'client-web': clientWeb,
  'client-phone': () => native('client-phone', 'apps/client'),
  'client-tv': () => native('client-tv', 'apps/client', { EXPO_TV: '1' }),
}

if (import.meta.main) {
  const asked = process.argv.slice(2)
  const kinds = asked.length ? asked : ['web', 'phone', 'tv']
  let failed = false
  for (const kind of kinds) {
    const found = BUILDS[kind]?.() ?? [`no bundle named ${kind}`]
    console.log(found.length ? `${kind}: carries ${found.join(', ')}` : `${kind}: clean`)
    failed ||= found.length > 0
  }
  process.exit(failed ? 1 : 0)
}
