// SPDX-License-Identifier: AGPL-3.0-only
// The phone app's Expo config (ADR 0059): the native project is generated from this by
// `expo prebuild` (https://docs.expo.dev/workflow/continuous-native-generation/), so ios/ is never
// committed and anything native goes in here, in a config plugin, or in @highsea-tv/native.
import type { ExpoConfig } from 'expo/config'
import { withReactNativeDir } from '../../packages/native/plugins/index.ts'
import pkg from './package.json'

const brand = '../../packages/brand/assets/icons'

const config: ExpoConfig = {
  name: 'highsea',
  slug: 'highsea',
  version: pkg.version,
  // highsea://connect, highsea://link and highsea://oidc (connectivity.md, ADR 0024)
  scheme: 'highsea',
  orientation: 'portrait',
  userInterfaceStyle: 'dark',
  backgroundColor: '#0b0b0c',
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
    'expo-router',
    'expo-secure-store',
    'expo-web-browser',
    [
      'expo-font',
      {
        fonts: [
          '../../packages/brand/fonts/Geist-Regular.ttf',
          '../../packages/brand/fonts/Geist-Medium.ttf',
          '../../packages/brand/fonts/Geist-SemiBold.ttf',
          '../../packages/brand/fonts/GeistMono-Regular.ttf',
          '../../packages/brand/fonts/GeistMono-Medium.ttf',
        ],
      },
    ],
    [
      'expo-camera',
      {
        cameraPermission: 'highsea uses the camera to scan the code a TV shows.',
        microphonePermission: false,
        recordAudioAndroid: false,
      },
    ],
    ['expo-video', { supportsBackgroundPlayback: true, supportsPictureInPicture: true }],
    [
      'expo-splash-screen',
      { image: `${brand}/splash/mark.png`, imageWidth: 96, backgroundColor: '#0b0b0c' },
    ],
  ],
}

// Bun's isolated store hides react-native from the Podfile's scripts (packages/native/plugins)
export default withReactNativeDir(config)
