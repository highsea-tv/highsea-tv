// SPDX-License-Identifier: AGPL-3.0-only
// ScrollView's own scrollbar, drawn only on the web (./scrollbar.web.tsx), a platform pair
// imported as `./scrollbar`. The phone's and the TV's scrollers show the platform's own indicator,
// which draws over the content already, so nothing is drawn here.
import type { ReactNode, RefObject } from 'react'

export type ScrollbarProps = {
  /** The scroller the bar follows and moves. */
  target: RefObject<unknown>
  /** Set by the bar to its re-measure, which ScrollView calls when its layout changes. */
  remeasure: RefObject<(() => void) | null>
}

/** Whether ScrollView hides the platform's indicator and draws Scrollbar instead. */
export const OWN_SCROLLBAR: boolean = false

export function Scrollbar(_props: ScrollbarProps): ReactNode {
  return null
}
