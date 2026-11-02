// SPDX-License-Identifier: AGPL-3.0-only
// Geist, from @highsea-tv/brand, by weight. React Native picks a custom face by its PostScript
// name, not by fontWeight, so each weight is its own family. The apps embed the files at build
// time with expo-font's config plugin (https://docs.expo.dev/develop/user-interface/fonts/), so
// nothing loads at runtime.

const sans = { 400: 'Geist-Regular', 500: 'Geist-Medium', 600: 'Geist-SemiBold' } as const
const mono = { 400: 'GeistMono-Regular', 500: 'GeistMono-Medium', 600: 'GeistMono-Medium' } as const

/** The family for a weight from the type scale (400, 500 or 600). */
export const family = (weight: number, face: 'sans' | 'mono' = 'sans') =>
  (face === 'mono' ? mono : sans)[weight as 400 | 500 | 600] ?? sans[400]
