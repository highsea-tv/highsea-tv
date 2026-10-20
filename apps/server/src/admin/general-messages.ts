// SPDX-License-Identifier: AGPL-3.0-only
// Settings › General (ADR 0021): the Metadata group (checkpoint 4, decision 1). The prototype
// doesn't show the group, so its copy follows the plan's (TMDB › The key) and the brand brief.
import { defineMessages } from '@highsea/i18n'

export const general = defineMessages({
  what: 'these settings',
  'metadata.title': 'Metadata',
  'metadata.description': 'Where movie details come from, and the language and region they’re in.',
  'key.label': 'TMDB key',
  'key.set': 'Set',
  'key.notSet': 'Not set',
  'key.masked': 'Ending in {last4}',
  'key.notSetBody': 'Discover, adding movies and refreshing their details need a key.',
  'key.replace': 'Replace',
  'key.remove': 'Remove',
  'key.cancel': 'Keep the current key',
  'key.new': 'New TMDB key',
  'key.hint':
    'The API key or the API Read Access Token: either works. It’s checked with TMDB when you save.',
  'key.open': 'Open TMDB’s API page',
  'key.rejected': 'TMDB didn’t accept that key. Copy it again from your TMDB account.',
  'key.unavailable':
    'Can’t reach TMDB right now, so the key wasn’t checked or saved. Check the server’s internet connection and try again.',
  'key.removeTitle': 'Remove the TMDB key?',
  'key.removeBody':
    'Discover, adding movies and refreshing their details stop until you add a key. The library and its pages keep working.',
  'key.removeConfirm': 'Remove key',
  'key.keep': 'Keep it',
  'key.removed': 'TMDB key removed',
  'key.removeFailed': 'Couldn’t remove the key',
  language: 'Metadata language',
  languageHint: 'Titles, overviews and taglines, where TMDB has them in this language.',
  region: 'Region',
  regionHint: 'For certifications, release dates and Discover’s lists.',
  ownerOnly: 'Only the owner can change the TMDB key, the language and the region.',
  later: 'Language, time zone, updates and diagnostics arrive in a later checkpoint.',
  saved: 'Settings saved',
  saveError: 'Couldn’t save',
})
