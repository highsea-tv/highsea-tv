// SPDX-License-Identifier: AGPL-3.0-only
// Metro's environment for TypeScript: `require` for assets, and `process.env` for the EXPO_PUBLIC_
// variables Expo inlines when it bundles (https://docs.expo.dev/guides/environment-variables/).
// Expo's own expo-env.d.ts comes and goes with typed routes, which the client doesn't use, so it
// keeps this one.
/// <reference types="expo/types" />
