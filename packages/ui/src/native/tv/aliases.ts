// SPDX-License-Identifier: AGPL-3.0-only
// The TV parts' old names, until B2 (one-client-platform-b.md): each is now one part with a form
// per form factor, drawn by its own name from the library's root, and apps/tv, which is frozen
// until B2 removes it, still imports these from `@highsea-tv/ui/tv`. Nothing new imports them;
// parity.ts lists each with "until B2".
import { FeaturedCard } from '../featured-card.tsx'
import { FilmRow } from '../film-row.tsx'
import { LetterIndex } from '../letter-index.tsx'
import { NoticeCard } from '../notice-card.tsx'
import { FactsCard, NamedAction, PersonTile } from '../page-parts.tsx'
import { Row } from '../row.tsx'
import { TitleBackdrop } from '../title-backdrop.tsx'

export type { RowFilm } from '../film-row.tsx'
/** InlineRun's old name, until B2. */
export type { InlineRun as TvInlineRun } from '../inline-text.tsx'
export { RAIL_WIDTH } from '../letter-index.tsx'
export { ROUND_ACTION_ROOM } from '../page-parts.tsx'
export { BACKDROP_HEIGHT } from '../title-backdrop.tsx'

/** FilmRow's old name, until B2. */
export const TvFilmRow = FilmRow
/** Row's old name, until B2. */
export const TvRow = Row
/** NamedAction's old name, until B2. */
export const TvRoundAction = NamedAction
/** PersonTile's old name, until B2. */
export const TvPersonTile = PersonTile
/** FactsCard's old name, until B2. */
export const TvInfoCard = FactsCard
/** LetterIndex's old name, until B2. */
export const TvLetterRail = LetterIndex
/** NoticeCard's old name, until B2. */
export const TvNoticeCard = NoticeCard
/** FeaturedCard's old name, until B2. */
export const TvFeaturedCard = FeaturedCard
/** TitleBackdrop's old name, until B2. */
export const TvBackdrop = TitleBackdrop
