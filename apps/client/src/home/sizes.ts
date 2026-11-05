// SPDX-License-Identifier: AGPL-3.0-only
// Home's sizes that the tokens have no step for yet, as the prototypes draw them
// (design/prototypes/src/mobile/home.tsx, tv/home.tsx). Shares are of the row; the TV's are in its
// unit (1u = 1cqw). One place for them, until docs/design-language/platforms/ names them.
export const HOME = {
  /** The phone's Continue watching cards, of the row (the prototype's w-[62%]). */
  continueShare: 0.62,
  /** The phone's still rows, of the row: two and a peek (the prototype's w-[46%]). */
  stillShare: 0.46,
  /** The TV's Continue watching cards, larger than a poster row's (the owner, 2026-10-30; 22cqw). */
  tvContinueWidth: 22,
  /** The TV's featured card's room above and below (`py-[1cqw]`). */
  tvFeaturedPad: 1,
} as const
