// SPDX-License-Identifier: AGPL-3.0-only
// NATIVE_FONT_FILES (./native-fonts.ts) as Metro's assets, for useFonts where the files aren't
// embedded at build time (the client's web build). Metro only bundles a `require` whose argument is
// a literal string (https://metrobundler.dev/docs/module-api/#require), so each file is required by
// name here; the type below holds this list to the manifest's families, and a test holds the files
// to its names.
import type { NativeFamily } from './native-fonts.ts'

/** Each family's file, as the bundler's asset reference. */
export const NATIVE_FONT_ASSETS: Readonly<Record<NativeFamily, number | string>> = {
  'Geist-Regular': require('../fonts/Geist-Regular.ttf'),
  'Geist-Medium': require('../fonts/Geist-Medium.ttf'),
  'Geist-SemiBold': require('../fonts/Geist-SemiBold.ttf'),
  'GeistMono-Regular': require('../fonts/GeistMono-Regular.ttf'),
  'GeistMono-Medium': require('../fonts/GeistMono-Medium.ttf'),
}
