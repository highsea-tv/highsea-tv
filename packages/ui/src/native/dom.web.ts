// SPDX-License-Identifier: AGPL-3.0-only
// The web's side of ./dom.ts, for what react-native-web leaves to the page:
// - the ring shows where the browser would show one, `:focus-visible` (a keyboard's focus, not a
//   click's: https://developer.mozilla.org/en-US/docs/Web/CSS/:focus-visible), since its
//   Pressable reports every focus, and the library draws it, as the browser draws none on a div;
// - Space presses a checkbox, a radio, a switch, a tab and an option, as WAI-ARIA's patterns give
//   those roles (https://www.w3.org/WAI/ARIA/apg/patterns/), where react-native-web presses on
//   Space only for a button (PressResponder.js, `isValidKeyPress`);
// - it drops `hitSlop`, so Press draws touch's hit area as a layer.
import type {
  FOCUS_RING as nativeFocusRing,
  focusVisible as nativeFocusVisible,
  HIT_LAYER as nativeHitLayer,
  spaceActivates as nativeSpaceActivates,
} from './dom.ts'

export const FOCUS_RING: typeof nativeFocusRing = true

const SPACE_ROLES = new Set([
  'checkbox',
  'radio',
  'switch',
  'tab',
  'option',
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
