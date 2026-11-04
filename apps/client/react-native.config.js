// SPDX-License-Identifier: AGPL-3.0-only
// Autolinking's per-project overrides (https://github.com/react-native-community/cli/blob/main/docs/dependencies.md#platforms,
// which Expo's own autolinking reads: expo-modules-autolinking's reactNativeConfig.js merges the
// project's `dependencies` over each library's). The Apple TV's project is the iPhone's with its
// Podfile turned to `platform :tvos` (@react-native-tvos/config-tv's withTVPodfile), so its pods are
// resolved for `ios`: react-native-webview's podspec declares iOS, macOS and visionOS but not tvOS,
// where WKWebView doesn't exist, and CocoaPods refuses a pod its target's platform lacks. The TV
// shows no trailer (the owner's call of 2026-11-02), so its prebuild (EXPO_TV=1, as app.config.ts
// reads it) leaves the WebView unlinked.
const tv = /^(1|true)$/i.test(process.env.EXPO_TV ?? '')

module.exports = {
  dependencies: tv ? { 'react-native-webview': { platforms: { ios: null } } } : {},
}
