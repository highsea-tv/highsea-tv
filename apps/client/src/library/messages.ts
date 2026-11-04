// SPDX-License-Identifier: AGPL-3.0-only
// The words of Library, Movies, Collections and a collection's page (client-library.md,
// collections.md#in-the-apps), as the prototypes word them at each form factor. The sorts' and
// Show's own names are @highsea-tv/client/library's (createLibraryText); the counts and captions
// are @highsea-tv/client/format's.
import { defineMessages } from '@highsea-tv/i18n'

export const libraryScreenMessages = defineMessages({
  library: 'Library',
  views: 'Library',
  movies: 'Movies',
  collections: 'Collections',
  // the web's selects and the phone's sheet
  show: 'Show',
  genre: 'Genre',
  sort: 'Sort',
  sortBy: 'Sort by',
  all: 'All',
  allGenres: 'All genres',
  genreIs: 'Genre: {genre}',
  sortFilter: 'Sort and filter',
  sorted: 'Sorted and filtered',
  shown: '{shown} of {total} movies',
  reset: 'Reset',
  showCount: 'Show {count, plural, one {# movie} other {# movies}}',
  letters: 'Jump to a letter',
  pull: 'Pull to refresh',
  refreshing: 'Refreshing',
  refreshFailed: 'Couldn’t refresh',
  refreshFailedBody: 'What’s here may be out of date. {reason}',
  // the TV's sorts: the prototype's three, worded short
  'tvSort.title': 'A–Z',
  'tvSort.added': 'Recently added',
  'tvSort.year': 'Newest',
  unwatched: 'Unwatched',
  // the library's states
  failed: 'Couldn’t load the library',
  tryAgain: 'Try again',
  emptyTitle: 'No movies yet',
  emptyBody: 'When the server’s owner adds movies, they show up here.',
  nothingTitle: 'Nothing matches',
  noMatchTitle: 'No movies match',
  noMatch: 'Try another genre.',
  noMatchUnwatched: 'You’ve watched everything here. Try another genre, or show all movies.',
  noUnwatched: 'You’ve watched everything here.',
  watchedAllIn: 'You’ve watched everything in {genre}.',
  nothingIn: 'There’s nothing in {genre} here.',
  showEverything: 'Show everything',
  // Collections
  collectionsFailed: 'Couldn’t load the collections',
  noCollectionsTitle: 'No collections yet',
  noCollections:
    'When the server’s owner makes collections, or films here belong to one, they show up here.',
  'family.all': 'All',
  'family.video': 'Video',
  'family.audio': 'Audio',
  noVideo: 'No video collections yet. When the server’s owner makes them, they show up here.',
  noAudio: 'No audio collections yet. When the server’s owner makes them, they show up here.',
  // a collection's page
  here: '{titles} · {years}',
  notHere: 'That collection isn’t on this server.',
  gone: 'It may have been removed.',
  search: 'Search',
  back: 'Back',
})
