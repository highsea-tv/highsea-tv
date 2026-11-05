// SPDX-License-Identifier: AGPL-3.0-only
// Jest for the client's screens (ADR 0061), with Expo's preset, which mocks the native modules
// (https://docs.expo.dev/develop/unit-testing/). The preset is iOS's, so a platform pair's native
// side is the one tested (README.md › Platform files). Bun's runner can't run React Native, so these
// files end in .jest.tsx, which `bun test` leaves alone, and Bun keeps everything else. Bun's
// isolated installs put packages under node_modules/.bun/, so that folder is let through to
// Babel with the packages in it that ship untranspiled code; the workspace's own packages are
// raw TypeScript outside node_modules, which the preset transforms anyway. Packages that load as
// .mjs under React Native's export condition (lucide-react-native) go through the same Babel.
// `react-native` is react-native-tvos under an alias (ADR 0059), which Bun's shared fallback folder
// lists by its real name, so @react-native/jest-preset, which requires `react-native` without
// declaring it, wouldn't find it; `bun run test` sets NODE_PATH to this app's node_modules, where
// the alias is (https://nodejs.org/api/modules.html#loading-from-the-global-folders).
const path = require('node:path')
const preset = require('jest-expo/ios/jest-preset')

const babel = preset.transform['\\.[jt]sx?$']

/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo/ios',
  testMatch: ['<rootDir>/test/**/*.jest.tsx'],
  resolver: 'react-native-reanimated/jest/resolver',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  transform: { ...preset.transform, '\\.mjs$': babel },
  moduleNameMapper: {
    // Babel's helpers, for the workspace's packages too, which don't depend on them themselves
    '^@babel/runtime/(.*)$': `${path.dirname(require.resolve('@babel/runtime/package.json'))}/$1`,
    // one React, the app's: Expo's Metro does the same in a workspace (its autolinking resolver
    // keeps react "sticky" to the app, @expo/cli's createExpoAutolinkingResolver), but Jest
    // resolves from each file, and @highsea-tv/ui keeps the web's React for its own tests
    '^react$': require.resolve('react'),
    '^react/(.*)$': `${path.dirname(require.resolve('react/package.json'))}/$1`,
    // and one safe area context, the app's, for the same reason: @highsea-tv/ui's Sheet reads the
    // insets from the provider the app (or a test) puts around it
    '^react-native-safe-area-context$': require.resolve('react-native-safe-area-context'),
  },
  transformIgnorePatterns: [
    '/node_modules/(?!(\\.bun|(jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|expo-.*|react-navigation|@react-navigation/.*|lucide-react-native|react-native-svg|intl-messageformat|@formatjs/.*|standard-navigation))',
  ],
}
