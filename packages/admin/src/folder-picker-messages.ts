// SPDX-License-Identifier: AGPL-3.0-only
// The folder picker (HT-91), setup's picker's copy with its states: a folder that isn't there any
// more, one highsea can't read, one outside what it may browse, and one it can only read.
import { defineMessages } from '@highsea-tv/i18n'

export const folderPicker = defineMessages({
  browse: 'Browse',
  detail: 'Folders on the server, not on this device.',
  cancel: 'Cancel',
  use: 'Use this folder',
  path: 'Folder path',
  loading: 'Loading folders',
  up: 'Up one level',
  empty: 'No folders inside. Use this one, or go up a level.',
  filter: 'Filter folders',
  clear: 'Clear',
  noMatch: 'No folder here matches.',
  cut: 'Showing {shown, number} of {count, number}. Filter to find the rest.',
  more: '{count, plural, one {# more folder} other {# more folders}} not listed. Type the path to reach them.',
  gone: '{path} isn’t there, so the picker opened where browsing starts.',
  'problem.missing': 'This folder isn’t there any more',
  'problem.missing.body': 'It was moved or deleted. Go up a level and pick another.',
  'problem.unreadable': 'highsea can’t read this folder',
  'problem.unreadable.body':
    'Its permissions keep highsea out. Go up a level, or let highsea read it on the server.',
  'problem.outside': 'highsea can’t browse here',
  'problem.outside.body':
    'Folders can be picked inside the data folder, the library folders and the downloads folder.',
  'problem.other': 'Can’t open this folder',
  readOnly: 'highsea can only read this folder',
  readOnlyBody: 'It can’t save files here. Pick another, or let highsea write to it on the server.',
  // each field's picker title
  'title.movies': 'Choose a movies folder',
  'title.shows': 'Choose a shows folder',
  'title.music': 'Choose a music folder',
  'title.category': 'Choose the category’s folder',
  'title.watch': 'Choose the watch folder',
  'title.import': 'Choose a folder to import from',
  'title.backups': 'Choose the backups folder',
  'title.transcodes': 'Choose the transcode cache folder',
  'title.mapping': 'Choose the folder in highsea',
})
