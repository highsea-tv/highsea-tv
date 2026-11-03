// SPDX-License-Identifier: AGPL-3.0-only
// `@highsea-tv/native/playback` for Metro, on every platform: the player's engine is a platform
// pair, ./playback.ts (expo-video) on the phone and the TV and ./playback.web.ts (`<video>` with
// hls.js) on the web, which Metro picks only for an import without its extension (Module
// Resolution, https://metrobundler.dev/docs/resolution/), never for an exports target as written
// (apps/client/README.md › Platform files). Vite and Bun, which assert no `react-native`
// condition and don't read `.web` files, take the export's `default`, the web's file itself.
export * from './playback'
