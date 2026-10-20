// SPDX-License-Identifier: AGPL-3.0-only
// A collection's page (media-pages.md § Copy; ADR 0021). The prototype shows a collection as a
// row on its parts' pages; this page gives it the media page's summary and that row.
import { defineMessages } from '@highsea/i18n'

export const collection = defineMessages({
  collection: 'Collection',
  summary: 'Summary',
  parts: 'Parts',
  noOverview: 'TMDB has no overview for this collection yet.',
  'unknown.title': 'TMDB doesn’t know that collection',
  'unknown.body': 'It may have been merged or removed.',
})
