// SPDX-License-Identifier: AGPL-3.0-only
// The library's one exception to drawing each component once (one-client-platform.md › Part A,
// one-client-platform-d.md › D3): since D3 removed the web renderer, the native renderer
// (src/native) is the only drawing, on the phone, the TV and, through react-native-web, the web.
// A component is drawn twice only in a pair of platform files (`name.web.tsx` beside `name.tsx`),
// where the web needs other code, and only when BOTH gives the reason. test/parity.test.ts and
// scripts/one-place.ts hold the pairs to this list, and fail when it drifts from what's drawn.

/** Drawn per platform, by name, with the reason. */
export const BOTH: Record<string, string> = {
  DateTimeInput:
    "A pair of platform files since D2: the browser's datetime-local in the field's look on the web, a mono Input elsewhere (Curation's schedule)",
  PageFrame:
    'A pair of platform files since D2: an inert, scaled iframe on the web (Curation’s preview), an empty View elsewhere, where the admin is never drawn',
  ColorWell:
    "A pair of platform files since D3: the browser's colour input in the field's look on the web (Settings › Appearance's accent and a theme's colours), the colour shown elsewhere, where the admin is never drawn",
  WidgetEditor:
    "A pair of platform files since D2: dnd-kit's drag, keyboard and resize on the web, the grid alone elsewhere, where a dashboard is never edited",
  Scrollbar:
    'ScrollView’s own bar, drawn only on the web (scrollbar.web.tsx) where the browser’s takes a column; the phone and the TV keep the platform’s indicator',
  Embed:
    'StillFrame’s player, an embedded page: an <iframe> on the web and in the desktop app (embed.web.tsx), and a react-native-webview WebView on the phone, which has no iframe (embed.tsx)',
  FocusGuide:
    'A region that steers TV focus: react-native-tvos’s TVFocusGuideView on the TVs, and on the web, which has none, marks the spatial focus engine reads (one-client-platform.md › A, question 5)',
  TvScroll:
    'A TV scroller that follows focus: a ScrollView landing each stop by its scrollSnapOffset on the TVs, and on the web a track the spatial focus engine moves, since react-native-web has neither prop. The track moves by transform behind a clipped view, so on the web a pointer’s wheel or drag doesn’t scroll a TvPage or a Row on the TV’s rule: only focus moves them, as on the TVs, which have no pointer',
}
