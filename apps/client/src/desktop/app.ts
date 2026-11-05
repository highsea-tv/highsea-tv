// SPDX-License-Identifier: AGPL-3.0-only
// The desktop app's host, or nothing (one-client-platform-c.md › C2): `export:desktop` bundles the
// client with EXPO_PUBLIC_HIGHSEA_APP=desktop, which Expo inlines as it bundles
// (https://docs.expo.dev/guides/environment-variables/), and Metro folds the condition left behind
// in a production build before it collects dependencies, so /web's export and the phone's and TV's
// never carry ./tauri.tsx or @tauri-apps (scripts/bundles.ts checks it). The variable is written
// out as `process.env.EXPO_PUBLIC_…` for Expo to find it, and the require stays inside the branch,
// as ../transport.ts does for the mock.
import type * as Tauri from './tauri.tsx'

/** The desktop app's host in its own export; undefined everywhere else, the mock included. */
export const desktop: typeof Tauri | undefined =
  process.env.EXPO_PUBLIC_HIGHSEA_APP === 'desktop' ? require('./tauri.tsx') : undefined
