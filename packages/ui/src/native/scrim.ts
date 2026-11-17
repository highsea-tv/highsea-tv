// SPDX-License-Identifier: AGPL-3.0-only
// The scrim behind a modal: the command palette's, a dialog's and a pointer's side sheet's, drawn
// once here (elevation.md › Blur: `bg` at about 60% + `blur(6px)`, the token `blur.scrim`). Kept out
// of the library's exports: parts draw it, screens don't.
//
// On the web it's CSS's backdrop-filter (https://developer.mozilla.org/en-US/docs/Web/CSS/backdrop-filter),
// which react-native-web passes through as a style, as the admin's and the client's bars already
// draw theirs. React Native has no backdrop blur on iOS, tvOS or Android and the library has no
// blur view, so there the scrim is the solid fallback, as the bars' is. So is it on the web when
// the person asks for less transparency (`prefers-reduced-transparency`,
// https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-transparency):
// elevation.md's "the same color at 96% opacity", the token `blur.fallbackOpacity`.

import { blur } from '@highsea-tv/tokens'
import { useSyncExternalStore } from 'react'
import { Platform, type ViewStyle } from 'react-native'
import { alpha } from './alpha.ts'
import { useTheme } from './theme.tsx'

const REDUCED_TRANSPARENCY = '(prefers-reduced-transparency: reduce)'

/** The DOM's `matchMedia`, which React Native's types leave out: only the web has it. */
type MatchMedia = (query: string) => {
  readonly matches: boolean
  addEventListener(type: 'change', listener: () => void): void
  removeEventListener(type: 'change', listener: () => void): void
}

const matchMedia = () => (globalThis as { matchMedia?: MatchMedia }).matchMedia

function subscribe(change: () => void) {
  const query = matchMedia()?.(REDUCED_TRANSPARENCY)
  query?.addEventListener('change', change)
  return () => query?.removeEventListener('change', change)
}

const reduced = () => matchMedia()?.(REDUCED_TRANSPARENCY).matches ?? false

/** The blur the web draws behind the scrim's tint. */
const SCRIM_BLUR = { backdropFilter: `blur(${blur.scrim.radius}px)` } as ViewStyle

/**
 * The scrim's style, for the view that fills the window behind a modal: the `bg` tint at 60% over
 * a 6px blur on the web, the tint at 96% where there's no blur or transparency is reduced.
 */
export function useScrimStyle(): ViewStyle {
  const theme = useTheme()
  // subscribed everywhere, so the hooks run in one order; a page rendered ahead of time blurs, and
  // the browser corrects it as it hydrates
  const less = useSyncExternalStore(subscribe, reduced, () => false)
  const blurs = Platform.OS === 'web' && !less
  return blurs
    ? { backgroundColor: alpha(theme.colors.bg, blur.scrim.opacity), ...SCRIM_BLUR }
    : { backgroundColor: alpha(theme.colors.bg, blur.fallbackOpacity) }
}
