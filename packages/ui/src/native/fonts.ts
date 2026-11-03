// SPDX-License-Identifier: AGPL-3.0-only
// Geist, from @highsea-tv/brand, by weight. React Native picks a custom face by its PostScript
// name, not by fontWeight, so each weight is its own family, named once in the brand's manifest
// (NATIVE_FACES). The apps embed the files at build time with expo-font's config plugin
// (https://docs.expo.dev/develop/user-interface/fonts/), so nothing loads at runtime.
import { NATIVE_FACES } from '@highsea-tv/brand/native-fonts'

/** The family for a weight from the type scale (400, 500 or 600). */
export const family = (weight: number, face: 'sans' | 'mono' = 'sans') =>
  NATIVE_FACES[face][weight as 400 | 500 | 600] ?? NATIVE_FACES.sans[400]
