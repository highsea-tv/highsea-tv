// SPDX-License-Identifier: AGPL-3.0-only
// The client's Expo config (one-client-platform.md › A): one project for the phone, the TV and the
// web. `expo prebuild` generates the iPhone's native project from it, or with EXPO_TV=1 the Apple
// TV's, which react-native-tvos's config plugin retargets to tvOS
// (https://docs.expo.dev/guides/building-for-tv/); the two share ios/, which is never committed.
// The web is `expo export --platform web`: a single-page app with every resource under /web, where
// the server serves the web client (ADR 0053; https://docs.expo.dev/versions/latest/config/app/
// › web.output and experiments.baseUrl). The desktop app's export (`export:desktop`, with
// EXPO_PUBLIC_HIGHSEA_APP=desktop) is the same at the window's root, where Tauri serves its folder
// of static files (https://v2.tauri.app/start/frontend/).
//
// Since part C's C2 the client is the shipping app: it takes tv.highsea.mobile and tv.highsea.tv
// and the URL scheme `highsea` that connectivity.md's links use (`highsea://connect`, `link` and
// `oidc`), so it installs over the 4.5a app and keeps the servers it knew, since a keychain item
// belongs to the app's bundle identifier and access group
// (https://developer.apple.com/documentation/security/sharing-access-to-keychain-items-among-a-collection-of-apps).
import type { ExpoConfig } from 'expo/config'
import { nativeFontPaths } from '../../packages/brand/src/native-fonts.ts'
import { withAppleTVIcons, withReactNativeDir } from '../../packages/native/plugins/index.ts'
import { defaultTheme } from '../../packages/tokens/src/themes.ts'
import pkg from './package.json'

type Plugin = NonNullable<ExpoConfig['plugins']>[number]

const brand = '../../packages/brand/assets/icons'

/** As config-tv reads it (getenv's boolish): `1` or `true` builds for the TV. */
const tv = /^(1|true)$/i.test(process.env.EXPO_TV ?? '')

/** The desktop app's export, at the window's root rather than /web. */
const desktopApp = process.env.EXPO_PUBLIC_HIGHSEA_APP === 'desktop'

/** The default theme's page colour, behind the splash, the root view and the web's page. */
const background = defaultTheme.colors.bg

/** Geist, embedded at build time on the phone and the TV from the brand's manifest of the faces
 *  the apps carry (packages/brand/src/native-fonts.ts); the web loads the same files
 *  (src/fonts.web.ts). */
const fonts: Plugin = ['expo-font', { fonts: nativeFontPaths() }]

const splash = (imageWidth: number): Plugin => [
  'expo-splash-screen',
  { image: `${brand}/splash/mark.png`, imageWidth, backgroundColor: background },
]

const shared = {
  name: 'highsea',
  slug: 'highsea-client',
  version: pkg.version,
  // highsea://connect, link and oidc (connectivity.md)
  scheme: 'highsea',
  userInterfaceStyle: 'dark',
  backgroundColor: background,
  web: {
    output: 'single',
    // Expo makes favicon.ico's sizes from one image, which can't be an .ico itself
    favicon: `${brand}/web/icon-192.png`,
    backgroundColor: background,
    themeColor: background,
  },
  experiments: { baseUrl: desktopApp ? '' : '/web' },
} satisfies Partial<ExpoConfig>

const phone: ExpoConfig = {
  ...shared,
  orientation: 'portrait',
  icon: `${brand}/ios/icon.png`,
  ios: {
    bundleIdentifier: 'tv.highsea.mobile',
    supportsTablet: false,
    icon: {
      light: `${brand}/ios/icon.png`,
      dark: `${brand}/ios/icon-dark.png`,
      tinted: `${brand}/ios/icon-tinted.png`,
    },
    infoPlist: {
      // browsing a declared Bonjour type needs only these two (Apple TN3179)
      NSLocalNetworkUsageDescription:
        'highsea looks for your servers on this network, so you can connect without typing an address.',
      NSBonjourServices: ['_highsea._tcp'],
      // servers at home answer over plain HTTP by their LAN address or .local name
      // (https://developer.apple.com/documentation/bundleresources/information-property-list/nsapptransportsecurity/nsallowslocalnetworking)
      NSAppTransportSecurity: { NSAllowsLocalNetworking: true },
      ITSAppUsesNonExemptEncryption: false,
    },
  },
  plugins: [
    // with EXPO_TV unset it changes nothing on Apple's platforms
    '@react-native-tvos/config-tv',
    'expo-router',
    'expo-secure-store',
    'expo-web-browser',
    fonts,
    [
      'expo-camera',
      {
        cameraPermission: 'highsea uses the camera to scan the code a TV shows.',
        microphonePermission: false,
        recordAudioAndroid: false,
      },
    ],
    ['expo-video', { supportsBackgroundPlayback: true, supportsPictureInPicture: true }],
    splash(96),
  ],
}

const appleTV: ExpoConfig = {
  ...shared,
  ios: {
    bundleIdentifier: 'tv.highsea.tv',
    infoPlist: {
      // tvOS never asks for the local network, but browsing still declares the type (Apple TN3179)
      NSBonjourServices: ['_highsea._tcp'],
      NSAppTransportSecurity: { NSAllowsLocalNetworking: true },
      ITSAppUsesNonExemptEncryption: false,
    },
  },
  plugins: [
    ['@react-native-tvos/config-tv', { isTV: true, tvosDeploymentTarget: '16.4' }],
    'expo-router',
    'expo-secure-store',
    fonts,
    'expo-video',
    splash(160),
  ],
}

// plugins written here are applied directly, since ExpoConfig's `plugins` lists names only
// (https://docs.expo.dev/config-plugins/plugins/#apply-a-plugin); Bun's isolated store hides
// react-native from the Podfile's scripts (packages/native/plugins)
export default tv ? withAppleTVIcons(withReactNativeDir(appleTV)) : withReactNativeDir(phone)
