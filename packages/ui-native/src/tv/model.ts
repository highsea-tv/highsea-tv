// SPDX-License-Identifier: AGPL-3.0-only
// The TV's layout and remote rules without React Native (tv.md), so Bun tests them as it tests the
// web's: screen units, tracks kept by transform, Home's lift, the remote's keys and their sounds,
// and Back at the home root. tvOS's own focus engine moves focus (ADR 0059); what it can't do is
// here. The track maths is the web's own (ui-web's focus/spatial.ts), so the two can't drift.
import { nativeTokens, tvUnit } from '@highsea-tv/tokens/native'
import { trackOffset } from '@highsea-tv/ui-web/focus'

export { trackOffset }

const { durations, springs, tv } = nativeTokens

/** 1u for a window of this width: 1% of it (tv.md#units). */
export const unit = tvUnit

/** The scaled value of a token in screen units (`tv.poster.width` and so on) at this width. */
export const inUnits = (value: number, width: number) => value * tvUnit(width)

/** Rows keep focus 30% in from the left; the row stack keeps its row 32% from the top. */
export const KEEP = { row: 0.3, stack: 0.32 } as const

/** How long focus rests on the featured row before the hero shows that title (ADR 0015). */
export const HERO_DWELL_MS = durations.dwell

/** The spring tracks and the focus scale move with (`spring.base`). */
export const TRACK_SPRING = springs.base

/**
 * Where a horizontal row sits to keep the focused item at 30% from its left, clamped at both ends,
 * measured from the item's centre in the row's own coordinates.
 */
export function rowOffset(itemCenter: number, view: number, total: number) {
  return trackOffset({ itemCenter, view, total, keep: KEEP.row })
}

/**
 * How far Home lifts (tv.md#scrolling): it rests at the top while focus is on the hero or the
 * featured row, and on a row below them lifts so that row's title sits at the safe area's top.
 * `row` is the focused row's index, -1 for the hero's actions, and `featured` is the featured row's
 * index (0 when Home has one, -1 when it hasn't); `rowTop` is the focused row's top on the page.
 */
export function homeLift({
  row,
  featured,
  rowTop,
  width,
}: {
  row: number
  featured: number
  rowTop: number
  width: number
}) {
  if (row <= featured) return 0
  return Math.max(0, rowTop - inUnits(tv.safe.y, width))
}

/** The Siri Remote's events from react-native-tvos's `useTVEventHandler` that highsea answers. */
export type RemoteEvent =
  | 'up'
  | 'down'
  | 'left'
  | 'right'
  | 'select'
  | 'longSelect'
  | 'playPause'
  | 'menu'

export type RemoteSound = 'navigate' | 'select' | 'back'

/**
 * What each key does beyond tvOS's own focus moves (tv.md#remote-keys), and the sound it plays:
 * arrows navigate, OK selects, a long OK opens the item's actions, Play/Pause plays the focused
 * title, Menu goes back. A long OK and Play/Pause sound as a select, since each acts on the item.
 */
export function remoteKey(event: string): { action: string; sound: RemoteSound } | null {
  switch (event) {
    case 'up':
    case 'down':
    case 'left':
    case 'right':
      return { action: 'move', sound: 'navigate' }
    case 'select':
      return { action: 'select', sound: 'select' }
    case 'longSelect':
      return { action: 'actions', sound: 'select' }
    case 'playPause':
      return { action: 'play', sound: 'select' }
    case 'menu':
      return { action: 'back', sound: 'back' }
    default:
      return null
  }
}

/**
 * Back at the home root (tv.md#remote-keys): the first returns focus to the first item of the top
 * row, and a second, with focus already there, leaves highsea for the TV's home screen.
 */
export function homeBack(focusOnFirst: boolean): 'focus-first' | 'exit' {
  return focusOnFirst ? 'exit' : 'focus-first'
}
