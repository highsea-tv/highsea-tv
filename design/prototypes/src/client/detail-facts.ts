// SPDX-License-Identifier: AGPL-3.0-only
// The show page's people row (client-detail.md), the one part of what a title's page says that
// is still the prototype's own: the server has no shows yet. Everything a film's page says, its
// people, trailer, Information and Languages, comes from @highsea-tv/client/library, as the apps
// have it (apps-catch-up.md › A.1).
import type { ClientShowDetail, Credit } from '../mock/types.ts'

/** A show's cast and crew in one row: the cast in billing order, its creators, then who scored it. */
export const showPeopleOf = (d: Pick<ClientShowDetail, 'cast' | 'creators' | 'crew'>): Credit[] => [
  ...d.cast,
  ...d.creators,
  ...d.crew,
]
