// SPDX-License-Identifier: AGPL-3.0-only
// Expo's Metro config (https://docs.expo.dev/guides/customizing-metro/), with one React Native in
// the bundle. Bun's isolated installs make a copy of a package for each set of peers it's resolved
// with, and @highsea-tv/ui carries React 19.3.1 for its web renderer, so the react-native under it
// is a second copy of this app's. Two in one bundle register every native view twice ("Tried to
// register two views with the same name RCTText"), and Expo says duplicate React Native copies
// aren't supported (https://docs.expo.dev/guides/monorepos/#duplicate-native-packages-within-monorepos).
// So `react-native` resolves from this app wherever it's imported, as Metro's resolveRequest allows
// (https://metrobundler.dev/docs/resolution/#resolverequest-customresolver).
const path = require('node:path')
const { getDefaultConfig } = require('expo/metro-config')

const config = getDefaultConfig(__dirname)
const fromApp = path.join(__dirname, 'package.json')
const resolve = config.resolver.resolveRequest

config.resolver.resolveRequest = (context, name, platform) => {
  const next = resolve ?? context.resolveRequest
  if (name === 'react-native' || name.startsWith('react-native/'))
    return next({ ...context, originModulePath: fromApp }, name, platform)
  return next(context, name, platform)
}

module.exports = config
