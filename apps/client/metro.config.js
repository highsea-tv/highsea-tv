// SPDX-License-Identifier: AGPL-3.0-only
// Metro for the client, on the phone, the TV and the web (one-client-platform.md › A). Expo's
// defaults find the workspace (https://docs.expo.dev/guides/monorepos/); three rules go in
// resolveRequest, which Metro calls for every import and which chains to Expo's own resolver
// (https://metrobundler.dev/docs/resolution/#resolverequest-customresolver).
//
// 1. react-native from the app, on every platform. @highsea-tv/ui keeps its own react-native for its
//    tests, and Bun's isolated installs give each peer set its own copy, so ui's components and the
//    app would load two (https://docs.expo.dev/guides/monorepos/#duplicate-native-packages-within-monorepos):
//    "Tried to register two views with the same name RCTText". apps/mobile and apps/tv have the
//    same rule. On the web, Expo then aliases it to react-native-web, from the app too.
//
// 2. On the web, one React. The monorepo guide's "duplicate React versions in a single app will
//    cause runtime errors" holds there as well, and @highsea-tv/ui keeps React 19.3.1 for its own
//    tests while the app has 19.3.0. On the phone and the TV, Expo's autolinking resolver keeps
//    react and every native module to the app's copy (experiments.autolinkingModuleResolution, on
//    in a monorepo since SDK 55, https://docs.expo.dev/versions/latest/config/app/), but it leaves
//    the web out (@expo/cli's createExpoAutolinkingResolver). So on the web react, react-dom and
//    react-native-web resolve from the app wherever they're imported, and so does anything the
//    app depends on when one of our own packages imports it: a context (the safe area's, the
//    theme's) works only when the provider and its readers share one copy.
//
// 3. On the web, our own packages under the `react-native` condition. Expo asserts it on iOS and
//    Android and `browser` on the web (unstable_conditionsByPlatform), which would give the web
//    @highsea-tv/ui's DOM renderer (src/web); asserting `react-native` for @highsea-tv/* alone, as
//    Metro's own custom resolver does for one package
//    (https://metrobundler.dev/docs/package-exports/#example-custom-resolver), draws the library
//    with react-native-web (src/native). A third-party package's `react-native` target can be
//    native-only code, so the rule stops at ours. Vite, Next and Bun never read this file: the
//    admin, apps/web and the prototypes keep `default`.
//
// ADR 0061: one drawing for every client, the library's React Native renderer, on the web too.
const path = require('node:path')
const { getDefaultConfig } = require('expo/metro-config')
const pkg = require('./package.json')

const config = getDefaultConfig(__dirname)
const fromApp = path.join(__dirname, 'package.json')

/** `@scope/name/sub` or `name/sub` to the package's name; '.' for a relative path. */
const packageOf = (name) =>
  name
    .split('/')
    .slice(0, name.startsWith('@') ? 2 : 1)
    .join('/')
const ONE_COPY = new Set(['react', 'react-dom', 'react-native-web'])
const dependencies = new Set(Object.keys(pkg.dependencies))
/** A module of the workspace's own: Metro passes real paths, so a package's are under packages/. */
const ours = (file) => !file.split(path.sep).includes('node_modules')

const resolve = config.resolver.resolveRequest
config.resolver.resolveRequest = (context, name, platform) => {
  const next = resolve ?? context.resolveRequest
  let ctx = context
  if (name === 'react-native' || name.startsWith('react-native/'))
    ctx = { ...ctx, originModulePath: fromApp }
  if (platform === 'web') {
    const dependency = packageOf(name)
    if (
      ONE_COPY.has(dependency) ||
      (dependencies.has(dependency) && ours(context.originModulePath))
    )
      ctx = { ...ctx, originModulePath: fromApp }
    if (name.startsWith('@highsea-tv/'))
      ctx = {
        ...ctx,
        unstable_conditionNames: [...(ctx.unstable_conditionNames ?? []), 'react-native'],
      }
  }
  return next(ctx, name, platform)
}

module.exports = config
