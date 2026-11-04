// SPDX-License-Identifier: AGPL-3.0-only
// Home's own words (client-home.md, connectivity.md › Announcements). The rows' names,
// New, Play and Resume and the continue menu's words are the shared ones in @highsea-tv/client
// (filmsMessages and createLibraryText); Try again and the destinations' names are shellMessages'.
import { defineMessages } from '@highsea-tv/i18n'

export const homeMessages = defineMessages({
  featured: 'Featured',
  moreInfo: 'More info',
  previous: 'Previous featured title',
  next: 'Next featured title',
  show: 'Show {title}',
  cardMenu: 'More for {title}',
  failed: 'Couldn’t load the home screen',
  emptyTitle: 'Nothing to watch yet',
  emptyBody: 'When the server’s owner adds films, shows or music, they show up here.',
  changeFailed: 'That didn’t work: {message}',
  refreshFailed: 'Couldn’t refresh: {message}',
})
