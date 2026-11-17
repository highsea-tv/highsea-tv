// SPDX-License-Identifier: AGPL-3.0-only
// The scrollbar drawn over a page, once for both renderers: the web's PageScrollbar (over the
// document) and the native renderer's ScrollView on the web (over its own scroller). The browser's
// own bar takes a column of its own, so both hide it and draw this thin handle instead.
// Its measures are the `scrollbar` tokens (spacing-layout.md › The scrollbar), approved with 4.4a.
import { scrollbar } from '@highsea-tv/tokens'

export const SCROLLBAR = {
  ...scrollbar,
  /**
   * How much of the view a click on the track pages, as the browser's bar does: a behaviour, not
   * a measure, so it stays here.
   */
  page: 0.875,
} as const
