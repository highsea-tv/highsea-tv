// SPDX-License-Identifier: AGPL-3.0-only
// The web's side of ./fonts.ts. Config plugins run only on native platforms, so the web loads the
// brand's faces with useFonts (https://docs.expo.dev/develop/user-interface/fonts/): the same files
// the phone and the TV embed, from the brand's manifest (packages/brand/src/native-fonts.ts), one
// family per weight under the names @highsea-tv/ui's `family` picks. A face that fails to load
// leaves the browser's own in its place rather than keeping the client from opening.
import { NATIVE_FONT_ASSETS } from '@highsea-tv/brand/native-font-assets'
import { useFonts } from 'expo-font'
import type { useBrandFonts as native } from './fonts.ts'

export const useBrandFonts: typeof native = () => {
  const [loaded, error] = useFonts({ ...NATIVE_FONT_ASSETS })
  return loaded || error !== null
}
