// SPDX-License-Identifier: AGPL-3.0-only
// A show's page's sizes the tokens have no step for yet, as the TV's prototype drew them
// (tv/show.tsx), in the TV's unit (1u = 1cqw). One place for them, as Home's (../home/sizes.ts).
export const SHOW = {
  /** An episode's still in a season's row on the TV (the prototype's 24cqw). */
  tvEpisodeWidth: 24,
  /** A person's tile on the TV, as a film's page has it. */
  tvPersonWidth: 8,
} as const
