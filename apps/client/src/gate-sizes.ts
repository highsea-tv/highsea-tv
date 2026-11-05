// SPDX-License-Identifier: AGPL-3.0-only
// The TV's sizes for the gate that the tokens have no step for yet, in the TV's unit (1u = 1cqw), as
// library/sizes.ts keeps the library's. One place for them, until docs/design-language/platforms/
// names them.
/**
 * Choose a server and its sign-in on the TV, in screen units: the prototype's tv/connect.tsx
 * (2f51779). The words' column is `gap-[1.6cqw]`; the code's title `text-[3.6cqw]`, the others'
 * `text-[3cqw]`, each `leading-[1]`; the steps `gap-[0.8cqw]`; a row of buttons `gap-[1cqw]`; the
 * servers a `w-[44cqw]` list at `gap-[0.6cqw]`, each row `px-[1.2cqw] py-[0.8cqw]` with
 * `gap-[1cqw]` between the mark and the words.
 */
export const TV_GATE = {
  gap: 1.6,
  codeTitle: 3.6,
  title: 3,
  stepsGap: 0.8,
  actionsGap: 1,
  listWidth: 44,
  listGap: 0.6,
  rowPadX: 1.2,
  rowPadY: 0.8,
  rowGap: 1,
} as const
