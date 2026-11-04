// SPDX-License-Identifier: AGPL-3.0-only
// Profiles' sizes that the tokens have no step for yet, as the prototypes draw them (tv/who.tsx,
// tv/settings.tsx at 2f51779^, client/who.tsx and mobile/who-sheet.tsx). The TV's are in its unit
// (1u = 1cqw); the pointer's and the phone's in points. One place for them, until
// docs/design-language/platforms/ names them (one-client-platform.md › E).

/** Who's watching on the TV (`/who`): the 9.5 circles 2.8 apart under a 3.2 title, 3.6 below it. */
export const TV_WHO = { title: 3.2, size: 9.5, gap: 2.8, stack: 3.6 } as const

/** The TV's opening: larger, 11 circles 3 apart under a 3.6 title, 4 below it. */
export const TV_LAUNCH = { title: 3.6, size: 11, gap: 3, stack: 4 } as const

/** A profile's tile on the TV: the gap under the circle, the lock's 0.95 beside the name. */
export const TV_TILE = {
  stack: 0.8,
  nameGap: 0.4,
  lock: 0.95,
  /** The line under the name tucks up to it (`-mt-[0.6cqw]`). */
  noteLift: 0.6,
  /** Add a profile's dashed circle. */
  dash: 0.2,
} as const

/** The TV's number pad: its 5.6 circle, 2.4 title, 1.2 dots, 17 wide with 0.8 between keys. */
export const TV_PIN = {
  avatar: 5.6,
  title: 2.4,
  dot: 1.2,
  dotEdge: 0.15,
  pad: 17,
  key: 0.8,
  stack: 1.6,
  titleGap: 0.5,
  /** The error line keeps its height when empty, so the pad doesn't move. */
  error: 1.5,
  /** Between the pad and the line under it, and how wide that line goes. */
  below: 2,
  forgotWidth: 40,
} as const

/** Add a profile on the TV (`/who/new`): its columns, the field, the keys and the swatches. */
export const TV_NEW = {
  inset: 8,
  gap: 5,
  avatar: 13,
  avatarGap: 1.2,
  name: 1.6,
  nameHeight: 2,
  stack: 1.6,
  title: 2.6,
  titleGap: 0.5,
  field: 3.4,
  fieldPad: 1.2,
  fieldRadius: 0.5,
  caret: { gap: 0.1, height: 1.6, width: 0.12 },
  key: 0.5,
  swatch: 2.6,
  swatchGap: 1,
  swatchLabel: 0.6,
  /** The screen's width in units: the keys share what the columns leave. */
  screen: 100,
} as const

/** The TV's Settings for profiles: Who's watching's 5.6 circles 2.4 apart; the list's 2.4 ones. */
export const TV_PROFILE_SETTINGS = {
  rowSize: 5.6,
  rowGap: 2.4,
  headGap: 1,
  listAvatar: 2.4,
  listWidth: 44,
  listGap: 0.6,
  itemGap: 1,
  itemHeight: 3,
  hintGap: 0.6,
} as const

/** Who's watching with a pointer and in the phone's sheet (points). */
export const WHO = {
  /** A profile's circle grows by this under the pointer (`hover:scale-105`). */
  hover: 1.05,
  /** The lock beside a name on the page, and in the sheet's rows. */
  lock: 14,
  sheetLock: 18,
  /** The PIN field's digits, spread as the prototype's `tracking-[0.6em]`. */
  pinSpacing: 9,
} as const
