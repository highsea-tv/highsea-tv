// SPDX-License-Identifier: AGPL-3.0-only
// The web's side of ./announce.ts. react-native-web's announceForAccessibility does nothing
// (exports/AccessibilityInfo/index.js), and a live region drawn with a note is read by some
// readers only, as a region must be in the page before its words change
// (https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Guides/Live_regions). So one
// `role="status"` region stays in the page from the first note on, out of sight, and each note is
// written into it a moment after it's emptied: the region is in the page before its words change,
// even the first time, and the same words twice are read twice (as React Aria's LiveAnnouncer
// does).
import type { announce as nativeAnnounce } from './announce.ts'

/** How long the region stays empty before a note is written into it, in milliseconds. */
const WRITE_DELAY = 100

/** The region's id, so a second copy of the library finds the first's. */
const REGION = 'highsea-announcer'

let pending: ReturnType<typeof setTimeout> | undefined

function region(): HTMLElement | null {
  if (typeof document === 'undefined') return null
  const found = document.getElementById(REGION)
  if (found) return found
  const el = document.createElement('div')
  el.id = REGION
  el.setAttribute('role', 'status')
  el.setAttribute('aria-live', 'polite')
  el.setAttribute('aria-atomic', 'true')
  // out of sight and still read (the usual visually-hidden clip)
  Object.assign(el.style, {
    position: 'absolute',
    width: '1px',
    height: '1px',
    margin: '-1px',
    padding: '0',
    overflow: 'hidden',
    clip: 'rect(0 0 0 0)',
    whiteSpace: 'nowrap',
    border: '0',
  })
  document.body.appendChild(el)
  return el
}

export const announce: typeof nativeAnnounce = (words) => {
  const el = region()
  if (!el) return
  el.textContent = ''
  clearTimeout(pending)
  pending = setTimeout(() => {
    el.textContent = words
  }, WRITE_DELAY)
}
