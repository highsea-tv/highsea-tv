// SPDX-License-Identifier: AGPL-3.0-only
// The scrollbar drawn over a page, once for both renderers: the web's PageScrollbar (over the
// document) and the native renderer's ScrollView on the web (over its own scroller). The browser's
// own bar takes a column of its own, so both hide it and draw this thin handle instead.
// These are PageScrollbar's measures as approved with 4.4a; they aren't tokens yet.
export const SCROLLBAR = {
  /** The gap between the handle and the scroller's edges, on every side. */
  inset: 6,
  /** The handle's width at rest, and while hovered or dragged (growing away from the edge). */
  handle: 6,
  handleActive: 8,
  /** How far past the handle, towards the page, the strip takes the pointer. */
  reach: 8,
  /** The shortest the handle gets. */
  minThumb: 32,
  /** How much of the view a click on the track pages, as the browser's bar does. */
  page: 0.875,
  /** The handle's colour, `text-3` at this alpha at rest and while active. */
  alpha: 0.45,
  alphaActive: 0.7,
} as const
