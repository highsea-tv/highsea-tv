// SPDX-License-Identifier: AGPL-3.0-only
// The TV's Alerts sizes that the tokens have no step for yet, in the TV's unit (1u = 1cqw), as the
// prototype draws them (design/prototypes/src/tv/alerts.tsx). The page's title and gaps are a
// library page's (../library/sizes.ts). One place for them, until docs/design-language/platforms/
// names them.
export const TV_ALERTS = {
  /** How wide the list goes (`max-w-[60cqw]`). */
  width: 60,
  /** Between the announcements (`gap-[1.2cqw]`). */
  gap: 1.2,
  /** With none: between the words and Home (`gap-[1.4cqw]`); its width is TV_LIBRARY.emptyWidth. */
  emptyGap: 1.4,
} as const
