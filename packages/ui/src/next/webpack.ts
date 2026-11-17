// SPDX-License-Identifier: AGPL-3.0-only
// The library's React Native drawing on a Next.js host, on webpack (one-client-platform-d.md › D1,
// D3): the admin's server and the guides both take it from here, so it's set up once. react-native
// resolves to react-native-web (through ./react-native.ts) and `.web` files come first, as
// react-native-web's setup asks of a bundler (https://necolas.github.io/react-native-web/docs/setup/),
// with `__DEV__`, `EXPO_OS` and the browser's `global` defined as Metro defines them. Turbopack
// applies `resolveExtensions` only to the app's own files, not inside dependencies
// (vercel/next.js#97567, open), so react-native-svg, safe-area-context, expo-image and Reanimated
// would take their native files there; the hosts build with `--webpack`
// (https://nextjs.org/docs/app/api-reference/cli/next#next-build-options).
import { fileURLToPath } from 'node:url'

const here = (file: string) => fileURLToPath(new URL(file, import.meta.url))

/** The part of webpack's config the library changes (Next's `webpack` option hands it over). */
type Config = {
  resolve: { alias?: unknown; extensions: string[] }
  plugins: unknown[]
}

/** What Next passes a `webpack` function besides the config, as far as the library reads it. */
type Context = {
  dev: boolean
  isServer: boolean
  webpack: { DefinePlugin: new (definitions: Record<string, string>) => unknown }
}

/** Next's `webpack` option for a host that draws the library: call it from the host's own. */
export function libraryWebpack<C extends Config>(
  config: C,
  { dev, isServer, webpack }: Context,
): C {
  config.resolve.alias = {
    ...(config.resolve.alias as object),
    // absolute, since the dependencies that import react-native don't depend on the library
    'react-native$': here('./react-native.ts'),
    'react-native/Libraries/Utilities/codegenNativeComponent$': here(
      './codegen-native-component.ts',
    ),
    // react-native-svg's web files read React Native's asset registry, which on the web is
    // react-native-web's (as Expo's web build has it)
    '@react-native/assets-registry/registry$': here('./asset-registry.ts'),
  }
  config.resolve.extensions = ['.web.tsx', '.web.ts', '.web.js', ...config.resolve.extensions]
  config.plugins.push(
    new webpack.DefinePlugin({
      __DEV__: JSON.stringify(dev),
      'process.env.EXPO_OS': JSON.stringify('web'),
      // React Native's `global`, which Reanimated reads; Node has it, the browser has globalThis
      ...(isServer ? {} : { global: 'globalThis' }),
    }),
  )
  return config
}
