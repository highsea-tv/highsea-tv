// SPDX-License-Identifier: AGPL-3.0-only
// The web's side of ./dom.ts, for what react-native-web leaves to the page:
// - the ring shows where the browser would show one, `:focus-visible` (a keyboard's focus, not a
//   click's: https://developer.mozilla.org/en-US/docs/Web/CSS/:focus-visible), since its
//   Pressable reports every focus, and the library draws it, as the browser draws none on a div;
// - Space presses a checkbox, a radio, a switch, a tab, an option and a menu's items, as
//   WAI-ARIA's patterns give those roles (https://www.w3.org/WAI/ARIA/apg/patterns/), where
//   react-native-web presses on Space only for a button (PressResponder.js, `isValidKeyPress`);
// - it drops `hitSlop`, so Press draws touch's hit area as a layer;
// - a pointer's row is one Tab stop whose arrows move along it, as ui-web's CarouselRow
//   (carousel.tsx): Left and Right move between items, Home and End to its ends, and at either
//   end focus stays put and nudges 0.2u (sound.md#event-taxonomy), through the page's elements,
//   which react-native-web's views are;
// - a floating panel's choice that leaves the screen holds back the focus react-native-web's
//   Modal gives back when it closes (holdFocusReturn).
import type {
  focusedElement as nativeFocusedElement,
  FOCUS_RING as nativeFocusRing,
  focusVisible as nativeFocusVisible,
  HIT_LAYER as nativeHitLayer,
  holdFocusReturn as nativeHoldFocusReturn,
  moveInRow as nativeMoveInRow,
  roveRow as nativeRoveRow,
  spaceActivates as nativeSpaceActivates,
} from './dom.ts'

export const FOCUS_RING: typeof nativeFocusRing = true

const SPACE_ROLES = new Set([
  'checkbox',
  'radio',
  'switch',
  'tab',
  'option',
  'menuitem',
  'menuitemcheckbox',
  'menuitemradio',
])

export const focusVisible: typeof nativeFocusVisible = (target) => {
  const element = target as { matches?: (selector: string) => boolean } | null
  try {
    return element?.matches?.(':focus-visible') ?? true
  } catch {
    // a browser without the selector shows the ring for every focus, as it did before it
    return true
  }
}

export const spaceActivates: typeof nativeSpaceActivates = (key, role) =>
  (key === ' ' || key === 'Spacebar') && SPACE_ROLES.has(role)

export const HIT_LAYER: typeof nativeHitLayer = true

/** A row item's first focus target, as CarouselRow's. */
const FOCUSABLE = 'a[href], button:not([disabled]), [tabindex]:not([data-row-skip])'

/** Each item's focus target, in order: the items are the row's elements marked `data-row-item`. */
const targets = (row: unknown) =>
  [...((row as HTMLElement | null)?.querySelectorAll<HTMLElement>('[data-row-item]') ?? [])].map(
    (item) => item.querySelector<HTMLElement>(FOCUSABLE),
  )

export const roveRow: typeof nativeRoveRow = (row, active) => {
  const all = targets(row)
  const element = active as HTMLElement | null
  const current =
    all.find((t) => t && element && t.contains(element)) ??
    all.find((t) => t?.tabIndex === 0) ??
    all[0]
  for (const t of all) if (t) t.tabIndex = t === current ? 0 : -1
}

export const moveInRow: typeof nativeMoveInRow = (row, step, reduced) => {
  const all = targets(row)
  const from = all.findIndex((t) => t?.contains(document.activeElement))
  if (from < 0) return 'none'
  const to = Math.max(
    0,
    Math.min(all.length - 1, Number.isFinite(step) ? from + step : step < 0 ? 0 : all.length - 1),
  )
  const next = all[to]
  const current = all[from]
  if (to === from || !next) {
    // the end: focus stays, nudged 0.2u that way and back, silently (CarouselRow's 240ms ease-out)
    if (current && !reduced && typeof current.animate === 'function') {
      const d = (window.innerWidth / 100) * 0.2 * Math.sign(step)
      current.animate([{ translate: '0 0' }, { translate: `${d}px 0` }, { translate: '0 0' }], {
        duration: 240,
        easing: 'ease-out',
      })
    }
    return 'end'
  }
  roveRow(row, next)
  next.focus({ preventScroll: true })
  if (typeof next.scrollIntoView === 'function')
    next.scrollIntoView({
      block: 'nearest',
      inline: 'nearest',
      behavior: reduced ? 'auto' : 'smooth',
    })
  return 'moved'
}

export const focusedElement: typeof nativeFocusedElement = () =>
  typeof document === 'undefined' ? null : document.activeElement

/**
 * react-native-web's Modal gives focus back, as it unmounts, to the element that had it when the
 * Modal opened, if that element is still in the page (exports/Modal/ModalFocusTrap.js: an
 * effect's cleanup calling UIManager.focus, which calls the element's `focus()`). A choice that
 * navigates leaves that element on a screen that's going, where focusing it would pull the page
 * back, so this holds it: its `focus()` does nothing until the function it gives back is called,
 * once the Modal has gone (its `onDismiss`, which ModalAnimation.js calls after the content
 * unmounts).
 */
export const holdFocusReturn: typeof nativeHoldFocusReturn = (opener) => {
  if (typeof HTMLElement === 'undefined' || !(opener instanceof HTMLElement)) return () => {}
  opener.focus = () => {}
  // the own property goes, and HTMLElement's focus() is the element's again
  return () => {
    delete (opener as { focus?: unknown }).focus
  }
}
