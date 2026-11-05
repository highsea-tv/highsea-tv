// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, test } from 'bun:test'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { hlsOffences, offences, pairs, read } from './bundles.ts'

describe('bundle check', () => {
  test('finds React Native or the native renderer in the web build', () => {
    expect(offences('web', 'import "react-native/Libraries/Pressability"')).toEqual([
      'react-native',
    ])
    expect(offences('web', '//# ../../packages/ui/src/native/button.tsx')).toEqual([
      'the native renderer',
    ])
    expect(offences('web', 'var a=1')).toEqual([])
  })

  test('finds the web renderer in the phone’s bundle', () => {
    expect(offences('client-phone', '"../../packages/ui/src/web/button.tsx"')).toEqual([
      'the web renderer',
    ])
    expect(offences('client-phone', 'twMerge(a,b)')).toEqual(['tailwind-merge'])
    expect(offences('client-phone', 'var a=1')).toEqual([])
  })

  test('holds the TV’s bundle to the phone’s rule', () => {
    expect(offences('client-tv', 'ReactDOMSharedInternals')).toEqual(['react-dom'])
    expect(offences('client-tv', 'var a=1')).toEqual([])
  })

  test('holds the client’s web bundle to react-native-web and its own side of each pair', () => {
    // the client's react-native is react-native-tvos under the alias, kept by Bun's store under
    // its own name, as the phone's source map lists it
    const rn =
      '/node_modules/.bun/react-native-tvos@0.88.0-0+13b25beea7e4ca94/node_modules/react-native-tvos/Libraries/Components/View/View.js'
    expect(offences('client-web', rn)).toEqual(['react-native'])
    expect(offences('client-web', '/node_modules/react-native/Libraries/x.js')).toEqual([
      'react-native',
    ])
    // react-native-web's own stubs of React Native's modules are what stands in for it
    const vendored =
      '/node_modules/react-native-web/dist/vendor/react-native/TurboModule/TurboModuleRegistry.js'
    expect(offences('client-web', vendored)).toEqual([])
    expect(offences('client-web', '"/packages/ui/src/native/button.tsx"')).toEqual([])
    expect(offences('client-web', '"/packages/ui/src/web/button.tsx"')).toEqual([
      'the web renderer',
    ])
    expect(offences('client-web', '"/packages/native/src/polyfills.ts"')).toEqual([
      'packages/native/src/polyfills.ts, a native side',
    ])
    expect(offences('client-web', '"/packages/native/src/polyfills.web.ts"')).toEqual([])
    expect(
      offences('client-web', 'node_modules/@formatjs/intl-pluralrules/polyfill-force.js'),
    ).toEqual(['the Hermes Intl polyfills'])
  })

  test('holds the client’s phone and TV bundles to the native side of each pair', () => {
    expect(offences('client-phone', '"/apps/client/src/fonts.ts"')).toEqual([])
    expect(offences('client-phone', '"/apps/client/src/fonts.web.ts"')).toEqual([
      'apps/client/src/fonts.web.ts, a web side',
    ])
    expect(offences('client-tv', 'ReactDOMSharedInternals')).toEqual(['react-dom'])
  })

  test('keeps the spatial focus engine to the web’s bundles', () => {
    const engine = '"/packages/ui/src/native/tv/spatial/navigator.ts"'
    for (const kind of ['client-phone', 'client-tv'] as const)
      expect(offences(kind, engine)).toEqual(['the spatial focus engine'])
    expect(offences('client-web', engine)).toEqual([])
    // the pure model beside it holds no DOM
    expect(offences('client-tv', '"/packages/ui/src/native/tv/spatial/spatial.ts"')).toEqual([])
  })

  test('keeps hls.js out of the phone’s and the TV’s bundles', () => {
    const hls = '/node_modules/.bun/hls.js@1.7.3/node_modules/hls.js/dist/hls.mjs'
    for (const kind of ['client-phone', 'client-tv'] as const)
      expect(offences(kind, hls)).toEqual(['hls.js'])
    expect(offences('client-web', hls)).toEqual([])
    expect(offences('web', 'e.MANIFEST_LOADING="hlsManifestLoading"')).toEqual([])
  })

  test('holds hls.js to a chunk of its own in the web’s builds', () => {
    const chunk = 'e.MANIFEST_LOADING="hlsManifestLoading"'
    expect(hlsOffences('entry', `entry\n${chunk}`, true)).toEqual([])
    expect(hlsOffences(chunk, chunk, true)).toEqual(['hls.js in the entry, not a chunk of its own'])
    expect(hlsOffences('entry', 'entry', true)).toEqual(['no hls.js chunk'])
    // the client's web export before any screen plays has no web engine, so no chunk either
    expect(hlsOffences('entry', 'entry', false)).toEqual([])
  })

  test('finds the mock in any bundle built without mock mode', () => {
    for (const kind of ['web', 'client-web', 'client-phone', 'client-tv'] as const)
      expect(offences(kind, '"/packages/mock/src/transport.ts"')).toEqual(['the mock server'])
    expect(offences('client-web', '"/design/prototypes/src/mock/hooks.tsx"')).toEqual([
      'the mock server',
    ])
  })

  test('finds the prototypes’ frame channel by its name, minified or not', () => {
    for (const kind of ['web', 'client-web', 'client-phone', 'client-tv'] as const)
      expect(offences(kind, 'n.channel==="highsea:frame"')).toEqual([
        'the prototypes’ frame channel',
      ])
    expect(offences('client-web', 'channel:"highsea:prototypes"')).toEqual([])
  })

  test('finds the platform pairs', () => {
    expect(pairs()).toContainEqual({
      native: 'packages/native/src/polyfills.ts',
      web: 'packages/native/src/polyfills.web.ts',
    })
  })

  // A real bundle, when one has been built (`bun scripts/bundles.ts client-phone` writes it to
  // .dev, which CI doesn't have): React Native is found by its modules' paths alone.
  const phone = join(import.meta.dir, '../.dev/bundles/client-phone')
  test.skipIf(!existsSync(phone))(
    'finds React Native in the client’s phone bundle by its paths',
    () => {
      const text = read(phone).replaceAll('__fbBatchedBridge', '')
      expect(text).not.toContain('__fbBatchedBridge')
      expect(offences('client-web', text)).toContain('react-native')
    },
  )
})
