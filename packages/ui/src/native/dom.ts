// SPDX-License-Identifier: AGPL-3.0-only
// What Press asks of the platform, on the phone and the TV: the web's side is ./dom.web.ts, a
// platform pair (apps/client/README.md › Platform files) imported as `./dom`. Off the web a
// control takes focus only from a hardware keyboard, Switch Control or a remote, never from a
// touch, but the system draws its own focus (iOS's Full Keyboard Access halo, the TV's engine),
// so the library draws no ring; the platform presses on its own keys; and Pressable's `hitSlop`
// gives touch its hit area, so no layer is drawn.

/** Whether Press draws the keyboard's focus ring: only the web, where nothing else does. */
export const FOCUS_RING: boolean = false

/** Whether a focus should show the focus ring. */
export const focusVisible = (_target: unknown): boolean => true

/** Whether a key press on a control of this role presses it, beyond what the platform does. */
export const spaceActivates = (_key: string, _role: string): boolean => false

/** Whether Press draws its hit area as a layer rather than through `hitSlop`. */
export const HIT_LAYER: boolean = false
