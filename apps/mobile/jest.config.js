// SPDX-License-Identifier: AGPL-3.0-only
// Jest for the phone's components (ADR 0059), with Expo's preset, which mocks the native modules
// (https://docs.expo.dev/develop/unit-testing/). Bun's runner can't run React Native, so these
// files end in .jest.tsx, which `bun test` leaves alone, and Bun keeps everything else. Bun's
// isolated installs put packages under node_modules/.bun/, so that folder is let through to
// Babel with the packages in it that ship untranspiled code; the workspace's own packages are
// raw TypeScript outside node_modules, which the preset transforms anyway. Packages that load as
// .mjs under React Native's export condition (lucide-react-native) go through the same Babel.
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
  // Babel's helpers, for the workspace's packages too, which don't depend on them themselves
  moduleNameMapper: {
    '^@babel/runtime/(.*)$': `${path.dirname(require.resolve('@babel/runtime/package.json'))}/$1`,
  },
  transformIgnorePatterns: [
    '/node_modules/(?!(\\.bun|(jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|expo-.*|react-navigation|@react-navigation/.*|lucide-react-native|react-native-svg|intl-messageformat|@formatjs/.*|standard-navigation))',
  ],
}
