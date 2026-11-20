// SPDX-License-Identifier: AGPL-3.0-only
// A screen under the one on view keeps its scroll place by itself on iOS, tvOS and Android: the
// native stack leaves its views as they were (react-native-screens). The browser's side,
// ./keep-scroll.web.tsx, has to put it back.
import type { RefObject } from 'react'

/** What a stack screen's layout is handed: its navigation's focus and blur events. */
export type ScreenNavigation = {
  addListener: (type: 'focus' | 'blur', listener: () => void) => () => void
}

/**
 * The element a screen's scrollers are found in, where a platform needs to put their places back;
 * null where it keeps them itself, and the screen is then drawn as it is.
 */
export function useKeepScroll(_navigation: ScreenNavigation): RefObject<unknown> | null {
  return null
}
