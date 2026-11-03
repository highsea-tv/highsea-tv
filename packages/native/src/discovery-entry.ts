// SPDX-License-Identifier: AGPL-3.0-only
// `@highsea-tv/native/discovery` for Metro, on every platform: discovery is a platform pair,
// ./discovery.ts (the Bonjour module) on the phone and the TV and ./discovery.web.ts (nothing to
// browse) in a browser, which Metro picks only for an import without its extension, never for an
// exports target as written (apps/client/README.md › Platform files, as ./playback-entry.ts).
// Vite and Bun take the export's `default`, the web's file itself.
export * from './discovery'
