// SPDX-License-Identifier: AGPL-3.0-only
// Config plugins the native apps use (ADR 0059), imported by apps/client's app.config.ts.
import { cpSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import {
  type ConfigPlugin,
  withDangerousMod,
  withPodfile,
  withXcodeProject,
} from 'expo/config-plugins'

/**
 * `react-native` is react-native-tvos under an alias, which Bun links into each app's node_modules
 * but lists by its real name in its store, so two podspecs miss it: react-native-tvos's own
 * ReactNativeDependencies resolves `react-native` from inside the store, and react-native-svg's
 * rnsvg_find_config looks for a folder named `react-native` beside it. NODE_PATH, the app's
 * node_modules, is searched by every resolve
 * (https://nodejs.org/api/modules.html#loading-from-the-global-folders), as the phone's Jest
 * config does; REACT_NATIVE_NODE_MODULES_DIR is the fix react-native-svg's own error names.
 */
export const withReactNativeDir: ConfigPlugin = (config) =>
  withPodfile(config, (c) => {
    const lines = [
      "ENV['NODE_PATH'] = File.expand_path('../node_modules', __dir__)",
      "ENV['REACT_NATIVE_NODE_MODULES_DIR'] ||= File.expand_path('../node_modules', __dir__)",
    ].join('\n')
    if (!c.modResults.contents.includes(lines))
      c.modResults.contents = `${lines}\n${c.modResults.contents}`
    return c
  })

/** The brand's icons, from an app's own folder (apps/<app>, the project root config plugins get). */
const BRAND_ICONS = '../../packages/brand/assets/icons'
const TV_ICONS = 'App Icon & Top Shelf Image'

/**
 * The brand's own Apple TV catalog (the layered icon at both sizes, the App Store icon and both top
 * shelf images) copied into the asset catalog whole and named as the app icon, as Xcode's tvOS
 * template does (https://developer.apple.com/design/human-interface-guidelines/app-icons#tvOS).
 * config-tv's appleTVImages wants each layer under a distinct file name, which the catalog doesn't
 * have, so it isn't used. apps/client's Apple TV build applies it.
 */
export const withAppleTVIcons: ConfigPlugin = (config) => {
  config = withDangerousMod(config, [
    'ios',
    (c) => {
      const catalog = join(
        c.modRequest.platformProjectRoot,
        c.modRequest.projectName ?? '',
        'Images.xcassets',
      )
      mkdirSync(catalog, { recursive: true })
      cpSync(
        join(c.modRequest.projectRoot, BRAND_ICONS, 'tvos', `${TV_ICONS}.brandassets`),
        join(catalog, `${TV_ICONS}.brandassets`),
        { recursive: true },
      )
      return c
    },
  ])
  return withXcodeProject(config, (c) => {
    const configurations = c.modResults.pbxXCBuildConfigurationSection()
    for (const entry of Object.values(configurations)) {
      const settings = (entry as { buildSettings?: Record<string, string> }).buildSettings
      if (settings?.PRODUCT_NAME === undefined) continue
      settings.ASSETCATALOG_COMPILER_APPICON_NAME = `"${TV_ICONS}"`
      settings.ASSETCATALOG_COMPILER_INCLUDE_ALL_APPICON_ASSETS = 'YES'
    }
    return c
  })
}
