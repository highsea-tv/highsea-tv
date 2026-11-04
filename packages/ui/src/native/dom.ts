// SPDX-License-Identifier: AGPL-3.0-only
// What Press asks of the platform, on the phone and the TV: the web's side is ./dom.web.ts, a
// platform pair (apps/client/README.md › Platform files) imported as `./dom`. Off the web a
// control takes focus only from a hardware keyboard, Switch Control or a remote, never from a
// touch, but the system draws its own focus (iOS's Full Keyboard Access halo, the TV's engine),
// so the library draws no ring; the platform presses on its own keys; and Pressable's `hitSlop`
// gives touch its hit area, so no layer is drawn; and a pointer's row (only the web has a
// pointer) has no keyboard model to keep.

/** Whether Press draws the keyboard's focus ring: only the web, where nothing else does. */
export const FOCUS_RING: boolean = false

/** Whether a focus should show the focus ring. */
export const focusVisible = (_target: unknown): boolean => true

/** Whether a key press on a control of this role presses it, beyond what the platform does. */
export const spaceActivates = (_key: string, _role: string): boolean => false

/** Whether Press draws its hit area as a layer rather than through `hitSlop`. */
export const HIT_LAYER: boolean = false

/** What a key along a pointer's row did: moved focus, met the row's end, or wasn't the row's. */
export type RowMove = 'moved' | 'end' | 'none'

/**
 * A pointer's row as one Tab stop: `active` (an element in it that took focus), or the item that
 * was the stop, takes the Tab order, the rest leave it.
 */
export const roveRow = (_row: unknown, _active: unknown): void => {}

/**
 * The row's focus moved `step` items (±Infinity for Home and End), scrolled into view, or, at its
 * end, nudged where it is.
 */
export const moveInRow = (_row: unknown, _step: number, _reduced: boolean): RowMove => 'none'

/** What has focus now: the web's element, to hold its focus back later; nothing off the web. */
export const focusedElement = (): unknown => null

/**
 * Keeps a floating panel's Modal from giving focus back to `opener`, what had focus when it
 * opened, for a choice that leaves the screen or takes its trigger away; gives back a function
 * that lets it again. Off the web the Modal gives no focus back, so there's nothing to hold.
 */
export const holdFocusReturn =
  (_opener: unknown): (() => void) =>
  () => {}
