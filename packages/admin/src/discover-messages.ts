// SPDX-License-Identifier: AGPL-3.0-only
// A4 Discover (ADR 0021): the prototype's copy (docs/product/movies.md › Copy), with the four
// lists as tabs (checkpoint 4 plan, decision 7).
import { defineMessages } from '@highsea-tv/i18n'

export const discover = defineMessages({
  title: 'Discover',
  description: 'Find a movie and add it. highsea searches your indexers and takes it from there.',
  search: 'Search for a movie',
  placeholder: 'Title, year or genre',
  lists: 'Lists',
  'list.trending': 'Trending',
  'list.popular': 'Popular',
  'list.now-playing': 'Now playing',
  'list.upcoming': 'Upcoming',
  results: 'Results for “{query}”',
  what: 'results',
  'empty.query': 'Nothing matches “{query}”',
  'empty.queryBody': 'Try the original title, or just the year.',
  'empty.list': 'Nothing here right now',
  'empty.listBody': 'TMDB didn’t return anything for this list. Search for a title instead.',
  inLibrary: 'In library',
  'inLibrary.label': 'In library: {title}',
  add: 'Add',
  'add.label': 'Add {title}',
  noKey: 'Add a TMDB key to find movies.',
  'noKey.link': 'Go to Settings › General',
  more: 'Show more',
})
