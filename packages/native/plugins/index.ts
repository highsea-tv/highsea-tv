// SPDX-License-Identifier: AGPL-3.0-only
// Config plugins both native apps use (ADR 0059), imported by each app.config.ts.
import { type ConfigPlugin, withPodfile } from 'expo/config-plugins'

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
