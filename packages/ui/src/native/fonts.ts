// SPDX-License-Identifier: AGPL-3.0-only
// Geist, from @highsea-tv/brand, by weight. React Native picks a custom face by its PostScript
// name, not by fontWeight, so each weight is its own family, named once in the brand's manifest
// (NATIVE_FACES). The apps embed the files at build time with expo-font's config plugin
// (https://docs.expo.dev/develop/user-interface/fonts/), so nothing loads at runtime.
import { NATIVE_FACES } from '@highsea-tv/brand/native-fonts'
import { Platform, type TextStyle } from 'react-native'

/** The family for a weight from the type scale (400, 500 or 600). */
export const family = (weight: number, face: 'sans' | 'mono' = 'sans') =>
  NATIVE_FACES[face][weight as 400 | 500 | 600] ?? NATIVE_FACES.sans[400]

/**
 * How the web smooths a text's glyphs, as the web renderer's base style did on `html` until D3
 * (`-webkit-font-smoothing: antialiased` and `-moz-osx-font-smoothing: grayscale`), and the
 * admin's and the prototype's stylesheets still do. Without it a Mac's browsers draw light text on a dark ground with subpixel
 * smoothing, a weight heavier than the design. `auto` is for a label on an accent or danger fill,
 * which the web renderer's button.tsx gave `[-webkit-font-smoothing:auto]`. react-native-web
 * passes both properties to its Text (its Text's style types list `WebkitFontSmoothing` and
 * `MozOsxFontSmoothing`); React Native has neither, so the phone and the TV get nothing.
 */
export const smoothing = (auto = false): TextStyle | undefined =>
  Platform.OS === 'web'
    ? ({
        WebkitFontSmoothing: auto ? 'auto' : 'antialiased',
        MozOsxFontSmoothing: auto ? 'auto' : 'grayscale',
      } as TextStyle)
    : undefined
