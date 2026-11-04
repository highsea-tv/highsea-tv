// SPDX-License-Identifier: AGPL-3.0-only
// Search's words (client-search.md › States), once for every client: the apps' own copies
// (apps/web's and the old phone and TV apps' `search`) gathered here. The field's words and the
// kinds' names are every app's, in @highsea-tv/client/films (createFilmsText().search).
import { defineMessages } from '@highsea-tv/i18n'

export const searchMessages = defineMessages({
  title: 'Search',
  clear: 'Clear search',
  try: 'Try',
  searching: 'Searching…',
  failed: 'Search didn’t work. {message}',
  // the phone's and the TV's line, and the web's with its hint (each prototype's own)
  nothing: 'Nothing on {name} matches “{query}”.',
  nothingHint: 'Nothing on {name} matches “{query}”. Try part of a title, a genre or a name.',
  footer: 'Searches what’s on {name}. Asking for something new comes with requests, later.',
  // a person as read out: what they're in, and that it's what this server has (web/search.tsx's)
  person: '{name}, {credits} on this server',
  // what VoiceOver says as new results come (iOS has no live regions)
  found: '{count, plural, one {# result} other {# results}}',
  // the TV's on-screen keyboard
  symbols: 'Numbers and symbols',
  letters: 'Letters',
  symbolsKey: '&123',
  lettersKey: 'abc',
  space: 'Space',
  delete: 'Delete',
  clearKey: 'Clear',
})
