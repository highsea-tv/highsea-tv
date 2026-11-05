// SPDX-License-Identifier: AGPL-3.0-only
// The brand's faces on the phone and the TV. expo-font's config plugin embeds them at build time
// (app.config.ts; https://docs.expo.dev/develop/user-interface/fonts/), so they're there before
// the first frame. The web loads them instead: ./fonts.web.ts.

/** Whether Geist is ready, under the family names @highsea-tv/ui gives each weight. */
export const useBrandFonts = (): boolean => true
