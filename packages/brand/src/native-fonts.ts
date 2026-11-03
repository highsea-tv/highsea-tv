// SPDX-License-Identifier: AGPL-3.0-only
// The faces the React Native apps carry, in one place: which family each weight draws with, and
// the file in `fonts/` behind each family. React Native picks a custom face by its PostScript name,
// not by fontWeight, so each weight is its own family
// (https://docs.expo.dev/develop/user-interface/fonts/). The phone and the TV embed the files at
// build time with expo-font's config plugin (each app.config.ts reads `nativeFontPaths`), and the
// web loads the same files with useFonts (`@highsea-tv/brand/native-font-assets`). Geist Mono has
// no SemiBold here: 600 draws with Medium, so the apps don't carry a face nothing picks.
// No imports, so an app.config.ts, Metro and the library can all read it.

/** The family for each weight of the type scale, by face. */
export const NATIVE_FACES = {
  sans: { 400: 'Geist-Regular', 500: 'Geist-Medium', 600: 'Geist-SemiBold' },
  mono: { 400: 'GeistMono-Regular', 500: 'GeistMono-Medium', 600: 'GeistMono-Medium' },
} as const

/** A family the apps carry. */
export type NativeFamily = (typeof NATIVE_FACES)[keyof typeof NATIVE_FACES][400 | 500 | 600]

/** Each family the apps carry, once, with its file in `fonts/`. */
export const NATIVE_FONT_FILES: Readonly<Record<NativeFamily, string>> = {
  'Geist-Regular': 'Geist-Regular.ttf',
  'Geist-Medium': 'Geist-Medium.ttf',
  'Geist-SemiBold': 'Geist-SemiBold.ttf',
  'GeistMono-Regular': 'GeistMono-Regular.ttf',
  'GeistMono-Medium': 'GeistMono-Medium.ttf',
}

/** The files as an app's config names them, from its own folder (`apps/<app>`) to the brand's. */
export const nativeFontPaths = (fromApp = '../../packages/brand'): string[] =>
  Object.values(NATIVE_FONT_FILES).map((file) => `${fromApp}/fonts/${file}`)
