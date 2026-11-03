// SPDX-License-Identifier: AGPL-3.0-only
// Jest for the client's screens, set up as apps/mobile's (its jest.config.js has the reasons):
// Expo's preset, which mocks the native modules (https://docs.expo.dev/develop/unit-testing/);
// test files ending in .jest.tsx, which `bun test` leaves alone; Bun's isolated store let through
// to Babel; and one React and one safe area context, the app's. `bun run test` sets NODE_PATH to
// this app's node_modules, where `react-native` is react-native-tvos under its alias. The preset is
// iOS's, so a platform pair's native side is the one tested (README.md › Platform files).
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
    '^@babel/runtime/(.*)$': `${path.dirname(require.resolve('@babel/runtime/package.json'))}/$1`,
    '^react$': require.resolve('react'),
    '^react/(.*)$': `${path.dirname(require.resolve('react/package.json'))}/$1`,
    '^react-native-safe-area-context$': require.resolve('react-native-safe-area-context'),
  },
  transformIgnorePatterns: [
    '/node_modules/(?!(\\.bun|(jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|expo-.*|react-navigation|@react-navigation/.*|lucide-react-native|react-native-svg|intl-messageformat|@formatjs/.*|standard-navigation))',
  ],
}
