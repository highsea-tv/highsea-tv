// SPDX-License-Identifier: AGPL-3.0-only
// What the server is doing to a library item, in plain words (HT-106): on its page, and on its card
// or row on hover or focus. Each job type the server queues on an item has its words; one the admin
// doesn't know yet reads as work in hand.
import { defineMessages } from '@highsea-tv/i18n'

export const itemWork = defineMessages({
  'type.metadata.refresh': 'Refreshing metadata',
  'type.metadata.fanart': 'Fetching artwork',
  'type.movies.search': 'Searching for releases',
  'type.subtitles.search': 'Searching for subtitles',
  'type.subtitles.download': 'Downloading subtitles',
  'type.subtitles.sync': 'Syncing subtitles',
  'type.subtitles.resync': 'Syncing subtitles',
  'type.subtitles.wanted.refresh': 'Checking subtitles',
  'type.downloads.import': 'Importing',
  'type.music.metadata': 'Reading tags',
  'type.music.loudness': 'Measuring loudness',
  other: 'Working on it',
  several: '{count, plural, one {# task running} other {# tasks running}}',
  /** One job, waiting its turn. */
  waiting: '{what}, waiting to start',
  /** One job, part way. */
  progress: '{what}, {percent}%',
  /** One job whose last try failed, waiting to try again. */
  retry: '{what}: trying again {when}',
  /** A job on one of a show's episodes or seasons, in the list under the show's line. */
  'subject.episode': 'an episode',
  'subject.season': 'a season',
  part: '{what}, for {subject}',
  /** A job that ended badly: the toast's title, the reason under it. */
  failed: '{what} didn’t finish',
  'done.metadata.refresh': 'Metadata refreshed for {title}',
  'done.movies.search': 'The search for {title} finished',
  'done.music.metadata': 'Tags read again for {title}',
  'done.other': 'Finished work on {title}',
})
